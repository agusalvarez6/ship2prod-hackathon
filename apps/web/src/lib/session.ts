import { SignJWT, jwtVerify } from "jose";
import { getEnv, isProduction } from "./env.js";

export const SESSION_COOKIE = "s2p_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionClaims {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export interface VerifiedSession extends SessionClaims {
  iat: number;
  exp: number;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Signs a 7-day HS256 session JWT with the given claims. The secret comes
 * from `SESSION_JWT_SECRET` unless overridden (tests only).
 */
export async function signSession(
  claims: SessionClaims,
  opts: { secret?: string; expiresInSec?: number } = {},
): Promise<string> {
  const secret = opts.secret ?? getEnv().SESSION_JWT_SECRET;
  const expiresIn = opts.expiresInSec ?? SESSION_MAX_AGE_SECONDS;
  const nowSec = Math.floor(Date.now() / 1000);

  return await new SignJWT({
    email: claims.email,
    name: claims.name,
    picture: claims.picture,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + expiresIn)
    .sign(secretKey(secret));
}

/**
 * Verifies a session JWT. Throws on bad signature, tampered payload, or
 * expired token. Returns the decoded claims on success.
 */
export async function verifySession(
  token: string,
  opts: { secret?: string } = {},
): Promise<VerifiedSession> {
  const secret = opts.secret ?? getEnv().SESSION_JWT_SECRET;
  const { payload } = await jwtVerify(token, secretKey(secret), {
    algorithms: ["HS256"],
  });

  const sub = payload.sub;
  const email = payload["email"];
  const iat = payload.iat;
  const exp = payload.exp;

  if (typeof sub !== "string" || typeof email !== "string" || typeof iat !== "number" || typeof exp !== "number") {
    throw new Error("invalid session payload");
  }

  const name = payload["name"];
  const picture = payload["picture"];

  return {
    sub,
    email,
    name: typeof name === "string" ? name : null,
    picture: typeof picture === "string" ? picture : null,
    iat,
    exp,
  };
}

/** Builds the `Set-Cookie` header value for a signed session JWT. */
export function buildSessionCookie(token: string): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isProduction()) parts.push("Secure");
  return parts.join("; ");
}

/** Builds the `Set-Cookie` header value that clears the session cookie. */
export function buildClearSessionCookie(): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (isProduction()) parts.push("Secure");
  return parts.join("; ");
}
