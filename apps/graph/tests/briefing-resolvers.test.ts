import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/index.js'

const POSTGRES_TEST_URL =
  process.env['POSTGRES_TEST_URL'] ?? 'postgres://postgres:postgres@localhost:5433/postgres'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATION_SQL = readFileSync(
  resolve(here, '../../../infra/seed/migrations/001_init.sql'),
  'utf8',
)

const TEST_USER_ID = '99999999-8888-7777-6666-555555555555'
const TEST_BRIEFING_ID = '77777777-6666-5555-4444-333333333333'

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: POSTGRES_TEST_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

describe('briefing resolvers (postgres)', () => {
  beforeAll(async () => {
    process.env['POSTGRES_TEST_URL'] ??= POSTGRES_TEST_URL
    await withClient(async (c) => {
      await c.query(MIGRATION_SQL)
      await c.query(`DELETE FROM briefings WHERE id = $1`, [TEST_BRIEFING_ID])
      await c.query(`DELETE FROM users WHERE id = $1`, [TEST_USER_ID])
      await c.query(
        `INSERT INTO users (id, email) VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [TEST_USER_ID, 'track-d-test@example.com'],
      )
      await c.query(
        `INSERT INTO briefings (id, user_id, status, sections)
         VALUES ($1, $2, 'ready', '{"summary60s":"hello"}'::jsonb)`,
        [TEST_BRIEFING_ID, TEST_USER_ID],
      )
    })
  })

  afterAll(async () => {
    await withClient(async (c) => {
      await c.query(`DELETE FROM briefings WHERE id = $1`, [TEST_BRIEFING_ID])
      await c.query(`DELETE FROM users WHERE id = $1`, [TEST_USER_ID])
    })
  })

  it('getBriefing returns the inserted row from postgres', async () => {
    const res = await app.fetch(
      new Request('http://local/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: 'query($id: ID!) { getBriefing(id: $id) { id status } }',
          variables: { id: TEST_BRIEFING_ID },
        }),
      }),
    )

    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      data?: { getBriefing?: { id?: string; status?: string } }
      errors?: unknown
    }
    expect(json.errors).toBeUndefined()
    expect(json.data?.getBriefing?.id).toBe(TEST_BRIEFING_ID)
    expect(json.data?.getBriefing?.status).toBe('ready')
  })
})
