import pg from 'pg'

const { Pool } = pg

export function createPool(
  url: string | undefined = process.env['DATABASE_URL'] ?? process.env['POSTGRES_TEST_URL'],
): pg.Pool {
  return new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 10_000,
    ssl: url && !/^postgres(ql)?:\/\/[^/]*(localhost|127\.0\.0\.1)/.test(url)
      ? { rejectUnauthorized: false }
      : false,
  })
}
