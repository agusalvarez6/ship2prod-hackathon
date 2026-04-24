import { Pool } from "pg";
import { getEnv } from "./env.js";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const env = getEnv();
  pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
  return pool;
}

/** Test-only. Closes the pool so tests can reset between runs. */
export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}
