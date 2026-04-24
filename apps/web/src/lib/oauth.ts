import crypto from "node:crypto";
import { classifyGoogleError, TransientError } from "./errors.js";
import { getRedis } from "./redis.js";
import { getUserById, updateAccessToken, clearUserTokens } from "./users.js";
import { getEnv } from "./env.js";

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export const CALENDAR_RW_SCOPE = "https://www.googleapis.com/auth/calendar";
export const OAUTH_SCOPES = ["openid", "email", "profile", CALENDAR_RW_SCOPE].join(" ");

const STATE_TTL_SECONDS = 600;
const REFRESH_LOCK_TTL_MS = 30_000;
const ACCESS_TOKEN_SAFETY_MARGIN_MS = 60_000;
const REFRESH_POLL_INTERVAL_MS = 200;
const REFRESH_POLL_MAX_MS = 5_000;

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

/** State key shape used both during mint and during GETDEL on callback. */
export function stateKey(nonce: string): string {
  return `oauth:state:${nonce}`;
}

/** Refresh lock key. Uses a UUID as the fencing token, TTL 30 s. */
export function refreshLockKey(userId: string): string {
  return `lock:google:refresh:${userId}`;
}

/** Mints a 32-byte base64url nonce, stores a JSON blob in Redis with TTL. */
export async function mintState(
  redis = getRedis(),
): Promise<string> {
  const nonce = crypto.randomBytes(32).toString("base64url");
  const payload = JSON.stringify({ createdAt: Date.now() });
  await redis.set(stateKey(nonce), payload, "EX", STATE_TTL_SECONDS);
  return nonce;
}

/**
 * Atomically fetch and delete a stored state nonce. Returns `null` if the
 * nonce is unknown or already consumed. ioredis 5+ supports `GETDEL`
 * directly against Redis 7.
 */
export async function consumeState(
  nonce: string,
  redis = getRedis(),
): Promise<{ createdAt: number } | null> {
  const raw = await redis.getdel(stateKey(nonce));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { createdAt?: number };
    if (typeof parsed.createdAt !== "number") return { createdAt: Date.now() };
    return { createdAt: parsed.createdAt };
  } catch {
    return { createdAt: Date.now() };
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
 * Refresh the access token for a user. Serialised via a Redis lock; losers
 * poll the users row and exit when they observe a fresh expiry.
 *
 * Returns the new access token on success. Throws a classified error when
 * Google rejects the refresh or the poll times out.
 */
export async function refreshAccessToken(
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const env = getEnv();
  const redis = getRedis();
  const lockKey = refreshLockKey(userId);
  const fenceToken = crypto.randomUUID();

  const acquired = await redis.set(lockKey, fenceToken, "PX", REFRESH_LOCK_TTL_MS, "NX");
  if (acquired === "OK") {
    try {
      const token = await doRefresh(userId, env, fetchImpl);
      return token;
    } finally {
      // Only delete if we still own the lock.
      const current = await redis.get(lockKey);
      if (current === fenceToken) {
        await redis.del(lockKey);
      }
    }
  }

  // Loser branch: poll the users row until the winner has written a fresh expiry.
  const start = Date.now();
  while (Date.now() - start < REFRESH_POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, REFRESH_POLL_INTERVAL_MS));
    const user = await getUserById(userId);
    if (!user) throw new Error("user disappeared during refresh poll");
    if (isAccessTokenFresh(user.google_access_token, user.google_access_token_expires_at)) {
      return user.google_access_token!;
    }
  }

  // Timeout: one retry outside the lock.
  try {
    return await doRefresh(userId, env, fetchImpl);
  } catch (err) {
    if (err instanceof TransientError) throw err;
    throw new TransientError("refresh lock contention timed out", 503);
  }
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
