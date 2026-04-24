import type { Pool } from "pg";
import { getPool } from "./db.js";

/**
 * Persist the Notion access token on the user row. We only write the
 * `notion_token` column that already exists in `001_init.sql`; workspace
 * and bot identity are kept in Redis-backed session state if needed later.
 */
export async function saveNotionToken(
  userId: string,
  accessToken: string,
  pool: Pool = getPool(),
): Promise<void> {
  const result = await pool.query(
    `UPDATE users SET notion_token = $2 WHERE id = $1`,
    [userId, accessToken],
  );
  if (result.rowCount === 0) {
    throw new Error(`saveNotionToken: no user with id ${userId}`);
  }
}

/** Returns the user's Notion access token, or `null` if not connected. */
export async function getNotionToken(
  userId: string,
  pool: Pool = getPool(),
): Promise<string | null> {
  const result = await pool.query<{ notion_token: string | null }>(
    `SELECT notion_token FROM users WHERE id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return row.notion_token;
}

/** Clears the Notion access token. Notion offers no server-side revoke. */
export async function clearNotionToken(
  userId: string,
  pool: Pool = getPool(),
): Promise<void> {
  await pool.query(`UPDATE users SET notion_token = NULL WHERE id = $1`, [userId]);
}
