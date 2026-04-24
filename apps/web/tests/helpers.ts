import { Pool } from 'pg'
import Redis from 'ioredis'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..', '..')

export const REDIS_TEST_URL = process.env.REDIS_TEST_URL ?? 'redis://localhost:6380'
export const POSTGRES_TEST_URL =
  process.env.POSTGRES_TEST_URL ?? 'postgres://postgres:postgres@localhost:5433/postgres'

export const TEST_SESSION_SECRET = 'test-test-test-test-test-test-test-test-0123456789'

/** Set the env that `getEnv()` reads. Call before importing anything that reads env. */
export function primeTestEnv(): void {
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'test-client-id'
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'test-client-secret'
  process.env.GOOGLE_REDIRECT_URI =
    process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/auth/google/callback'
  process.env.SESSION_JWT_SECRET = process.env.SESSION_JWT_SECRET ?? TEST_SESSION_SECRET
  process.env.DATABASE_URL = POSTGRES_TEST_URL
  process.env.REDIS_URL = REDIS_TEST_URL
  process.env.APP_URL = process.env.APP_URL ?? 'http://localhost:3000'
  // NODE_ENV is typed as readonly on the global process.env; cast through unknown to write it.
  ;(process.env as unknown as Record<string, string>).NODE_ENV = 'test'
}

export function openRedis(): Redis {
  return new Redis(REDIS_TEST_URL, { maxRetriesPerRequest: 2, lazyConnect: false })
}

export async function openDb(): Promise<Pool> {
  const pool = new Pool({ connectionString: POSTGRES_TEST_URL, max: 4 })
  return pool
}

export async function applyMigrations(pool: Pool): Promise<void> {
  // Serialise migrations across test files via a pg advisory lock. Multiple
  // vitest workers can race on `CREATE EXTENSION IF NOT EXISTS` otherwise
  // (Postgres serialises the catalog write but still raises 23505 on the loser).
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(93120401)')
    const migrationsDir = path.join(REPO_ROOT, 'infra', 'seed', 'migrations')
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      await client.query(sql)
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(93120401)')
    client.release()
  }
}

export async function truncateUsers(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE users CASCADE')
}

/** Insert a user row with the given Google identity columns. Returns the row id. */
export async function seedUser(
  pool: Pool,
  opts: {
    email: string
    googleSub: string
    refreshToken?: string | null
    accessToken?: string | null
    accessTokenExpiresAt?: Date | null
    displayName?: string | null
    pictureUrl?: string | null
    phoneNumber?: string | null
  },
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, google_sub, google_refresh_token, google_access_token,
                        google_access_token_expires_at, display_name, picture_url, phone_number_e164)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      opts.email,
      opts.googleSub,
      opts.refreshToken ?? null,
      opts.accessToken ?? null,
      opts.accessTokenExpiresAt ? opts.accessTokenExpiresAt.toISOString() : null,
      opts.displayName ?? null,
      opts.pictureUrl ?? null,
      opts.phoneNumber ?? null,
    ],
  )
  return result.rows[0]!.id
}

/** Build a fake Google `id_token` (JWT with base64url payload; not cryptographically signed). */
export function fakeIdToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const sig = Buffer.from('fake-signature').toString('base64url')
  return `${header}.${body}.${sig}`
}
