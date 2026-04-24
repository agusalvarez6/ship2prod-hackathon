import type { Pool } from "pg";
import { getPool } from "./db.js";

export interface UserRow {
  id: string;
  email: string;
  google_sub: string | null;
  google_refresh_token: string | null;
  google_access_token: string | null;
  google_access_token_expires_at: string | null;
  display_name: string | null;
  picture_url: string | null;
}

export interface UpsertGoogleUserInput {
  googleSub: string;
  email: string;
  displayName: string | null;
  pictureUrl: string | null;
  refreshToken: string | null;
  accessToken: string;
  accessTokenExpiresAt: Date;
}

/**
 * Insert or update a user by `google_sub`. Refresh tokens are COALESCEd so
 * a re-consent that omits a new refresh token (Google's default) preserves
 * whichever token we had last time.
 */
export async function upsertUserByGoogleSub(
  input: UpsertGoogleUserInput,
  pool: Pool = getPool(),
): Promise<UserRow> {
  const sql = `
    INSERT INTO users (
      email,
      google_sub,
      google_refresh_token,
      google_access_token,
      google_access_token_expires_at,
      display_name,
      picture_url
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (google_sub) WHERE google_sub IS NOT NULL DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      picture_url = EXCLUDED.picture_url,
      google_refresh_token = COALESCE(EXCLUDED.google_refresh_token, users.google_refresh_token),
      google_access_token = EXCLUDED.google_access_token,
      google_access_token_expires_at = EXCLUDED.google_access_token_expires_at
    RETURNING
      id,
      email,
      google_sub,
      google_refresh_token,
      google_access_token,
      google_access_token_expires_at,
      display_name,
      picture_url
  `;
  const values = [
    input.email,
    input.googleSub,
    input.refreshToken,
    input.accessToken,
    input.accessTokenExpiresAt.toISOString(),
    input.displayName,
    input.pictureUrl,
  ];
  const result = await pool.query<UserRow>(sql, values);
  const row = result.rows[0];
  if (!row) throw new Error("upsert returned no row");
  return toUserRow(row);
}

/** Returns the user row or `null` if no row matches. */
export async function getUserById(userId: string, pool: Pool = getPool()): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, email, google_sub, google_refresh_token, google_access_token,
            google_access_token_expires_at, display_name, picture_url
       FROM users WHERE id = $1`,
    [userId],
  );
  const row = result.rows[0];
  return row ? toUserRow(row) : null;
}

/** Writes the fresh access token + new expiry without touching the refresh token. */
export async function updateAccessToken(
  userId: string,
  accessToken: string,
  expiresAt: Date,
  pool: Pool = getPool(),
): Promise<void> {
  await pool.query(
    `UPDATE users
        SET google_access_token = $2,
            google_access_token_expires_at = $3
      WHERE id = $1`,
    [userId, accessToken, expiresAt.toISOString()],
  );
}

/** Nulls all Google OAuth columns. Used on disconnect and on `invalid_grant`. */
export async function clearUserTokens(userId: string, pool: Pool = getPool()): Promise<void> {
  await pool.query(
    `UPDATE users
        SET google_sub = NULL,
            google_refresh_token = NULL,
            google_access_token = NULL,
            google_access_token_expires_at = NULL
      WHERE id = $1`,
    [userId],
  );
}

function toUserRow(raw: UserRow & { google_access_token_expires_at: unknown }): UserRow {
  // `pg` returns TIMESTAMPTZ as a JS Date; normalise to ISO string for consistency.
  const expires = raw.google_access_token_expires_at as unknown;
  let normalised: string | null = null;
  if (expires instanceof Date) {
    normalised = expires.toISOString();
  } else if (typeof expires === "string") {
    normalised = expires;
  }
  return {
    ...raw,
    google_access_token_expires_at: normalised,
  };
}
