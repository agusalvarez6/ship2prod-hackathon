import pg from 'pg'

const { Pool } = pg

export function createPool(
  url: string | undefined = process.env['DATABASE_URL'] ?? process.env['POSTGRES_TEST_URL'],
): pg.Pool {
  if (!url) throw new Error('DATABASE_URL or POSTGRES_TEST_URL must be set')
  return new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 10_000,
  })
}
