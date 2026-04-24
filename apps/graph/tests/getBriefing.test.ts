import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/index.js'

const POSTGRES_TEST_URL =
  process.env['POSTGRES_TEST_URL'] ?? 'postgres://postgres:postgres@localhost:5433/postgres'

const SARAH_BRIEFING_ID = '11111111-2222-3333-4444-555555555555'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATION_SQL = readFileSync(
  resolve(here, '../../../infra/seed/migrations/001_init.sql'),
  'utf8',
)

async function applySchema(): Promise<void> {
  const client = new pg.Client({ connectionString: POSTGRES_TEST_URL })
  await client.connect()
  try {
    await client.query(MIGRATION_SQL)
  } finally {
    await client.end()
  }
}

describe('getBriefing resolver', () => {
  beforeAll(async () => {
    process.env['POSTGRES_TEST_URL'] ??= POSTGRES_TEST_URL
    await applySchema()
  })

  it('returns the Sarah fixture for the seeded briefing id', async () => {
    const res = await app.fetch(
      new Request('http://local/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: 'query($id: ID!) { getBriefing(id: $id) { id status } }',
          variables: { id: SARAH_BRIEFING_ID },
        }),
      }),
    )

    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      data?: { getBriefing?: { id?: string; status?: string } }
      errors?: unknown
    }
    expect(json.errors).toBeUndefined()
    expect(json.data?.getBriefing?.id).toBe(SARAH_BRIEFING_ID)
    expect(json.data?.getBriefing?.status).toBe('ready')
  })
})
