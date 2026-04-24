import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { classifyGoogleError } from "./errors.js";
import { getUserById, updateAccessToken, clearUserTokens } from "./users.js";
import { getEnv } from "./env.js";

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export const CALENDAR_RW_SCOPE = "https://www.googleapis.com/auth/calendar";
export const OAUTH_SCOPES = ["openid", "email", "profile", CALENDAR_RW_SCOPE].join(" ");

const STATE_TTL_SECONDS = 600;
const ACCESS_TOKEN_SAFETY_MARGIN_MS = 60_000;
const STATE_AUDIENCE = "oauth:state:google";

function stateSecret(): Uint8Array {
  return new TextEncoder().encode(getEnv().SESSION_JWT_SECRET);
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export interface GoogleIdTokenClaims {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

/**
 * Mints an HS256-signed JWT carrying a 32-byte nonce and creation timestamp.
 * The JWT is the OAuth `state` value; integrity + TTL come from the signature
 * and `exp` claim, so no server-side store is needed.
 */
export async function mintState(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(32).toString("base64url");
  return await new SignJWT({ nonce, createdAt: Date.now() })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + STATE_TTL_SECONDS)
    .setAudience(STATE_AUDIENCE)
    .sign(stateSecret());
}

/**
 * Verifies the state JWT signature + expiry. Returns `{createdAt}` on
 * success, `null` on tampering, expiry, or audience mismatch.
 */
export async function consumeState(
  state: string,
): Promise<{ createdAt: number } | null> {
  try {
    const { payload } = await jwtVerify(state, stateSecret(), {
      audience: STATE_AUDIENCE,
    });
    const createdAt =
      typeof payload.createdAt === "number" ? payload.createdAt : Date.now();
    return { createdAt };
  } catch {
    return null;
  }
}

/**
 * Builds the Google consent URL. `state` must already be stored in Redis
 * via `mintState`.
 */
export function buildAuthUrl(state: string, env = getEnv()): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: OAUTH_SCOPES,
    state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/** Scope check for the calendar read-write grant. */
export function hasCalendarScope(scope: string | undefined): boolean {
  if (!scope) return false;
  return scope.split(/\s+/).includes(CALENDAR_RW_SCOPE);
}

/** Decodes and returns the claims from a Google-issued `id_token`. */
export function decodeIdToken(idToken: string): GoogleIdTokenClaims {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("malformed id_token");
  const body = parts[1];
  if (!body) throw new Error("malformed id_token");
  const normalised = body.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
  const json = Buffer.from(padded, "base64").toString("utf8");
  const claims = JSON.parse(json) as GoogleIdTokenClaims;
  if (!claims.sub || !claims.email) {
    throw new Error("id_token missing sub or email");
  }
  return claims;
}

/**
 * Exchange an authorization code for tokens. Throws a classified error on
 * non-2xx.
 */
export async function exchangeCode(
  code: string,
  env = getEnv(),
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
  });
  const res = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw classifyGoogleError(res.status, text);
  }
  const parsed = JSON.parse(text) as GoogleTokenResponse;
  if (!parsed.access_token) {
    throw new Error("token_exchange_missing_access_token");
  }
  return parsed;
}

/** Revoke a refresh (or access) token at Google. Best-effort; errors are swallowed. */
export async function revokeToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    await fetchImpl(GOOGLE_REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    // Revoke is best-effort. Local token teardown is authoritative.
  }
}

/**
 * Refresh the access token for a user. Concurrent callers may both fire the
 * refresh; Google's refresh endpoint accepts repeated requests on the same
 * refresh_token, and `updateAccessToken` is last-writer-wins. The previous
 * Redis-based fencing was removed when web's runtime stopped having Redis
 * access; if duplicate refreshes ever become a load problem, move this
 * codepath behind a backend service.
 */
export async function refreshAccessToken(
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  return await doRefresh(userId, getEnv(), fetchImpl);
}

function isAccessTokenFresh(token: string | null, expiresAtIso: string | null): boolean {
  if (!token || !expiresAtIso) return false;
  const expiresAt = new Date(expiresAtIso).getTime();
  return expiresAt > Date.now() + ACCESS_TOKEN_SAFETY_MARGIN_MS;
}

async function doRefresh(
  userId: string,
  env: ReturnType<typeof getEnv>,
  fetchImpl: typeof fetch,
): Promise<string> {
  const user = await getUserById(userId);
  if (!user) throw new Error(`user not found: ${userId}`);
  if (!user.google_refresh_token) {
    await clearUserTokens(userId);
    throw new Error("no_refresh_token");
  }

  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: user.google_refresh_token,
  });
  const res = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    if (text.toLowerCase().includes("invalid_grant")) {
      await clearUserTokens(userId);
    }
    throw classifyGoogleError(res.status, text);
  }
  const parsed = JSON.parse(text) as GoogleTokenResponse;
  if (!parsed.access_token) throw new Error("refresh_missing_access_token");

  const expiresInSec = parsed.expires_in ?? 3600;
  const expiresAt = new Date(Date.now() + expiresInSec * 1000 - ACCESS_TOKEN_SAFETY_MARGIN_MS);
  await updateAccessToken(userId, parsed.access_token, expiresAt);
  return parsed.access_token;
}

/**
 * Return a usable access token for the user. Refreshes on demand if the
 * stored token is within the safety margin of expiry.
 */
export async function ensureAccessToken(
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const user = await getUserById(userId);
  if (!user) throw new Error(`user not found: ${userId}`);
  if (isAccessTokenFresh(user.google_access_token, user.google_access_token_expires_at)) {
    return user.google_access_token!;
  }
  return await refreshAccessToken(userId, fetchImpl);
}
