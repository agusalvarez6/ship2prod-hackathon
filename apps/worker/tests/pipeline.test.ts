import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { Redis } from 'ioredis'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLLMClient, createTinyFishClient } from '@ship2prod/integrations'
import type { ResearchJobPayload } from '@ship2prod/schema/jobs'
import { REDIS_KEYS } from '@ship2prod/schema/redis'
import type { BriefingId, JobId, MeetingId, UserId } from '@ship2prod/schema/ids'
import { runPipeline } from '../src/pipeline.js'
import { emitProgress } from '../src/progress.js'

// Inlined to avoid cross-package imports under rootDir. Matches test/env.ts.
const POSTGRES_TEST_URL =
  process.env['POSTGRES_TEST_URL'] ?? 'postgres://postgres:postgres@localhost:5433/postgres'
const REDIS_TEST_URL = process.env['REDIS_TEST_URL'] ?? 'redis://localhost:6380'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATION_SQL = readFileSync(
  resolve(here, '../../../infra/seed/migrations/001_init.sql'),
  'utf8',
)

async function applySchema(pool: pg.Pool): Promise<void> {
  await pool.query(MIGRATION_SQL)
}

const SAMPLE_SECTIONS = {
  summary60s: 'Acme builds widgets and recently raised Series B.',
  whoYouAreMeeting: { name: 'Jane Doe', role: 'VP Sales', company: 'Acme' },
  companyContext: {
    whatTheyDo: 'Acme sells industrial widgets.',
    recentUpdates: ['Closed Series B.'],
  },
  internalContext: { notionExcerpts: [] },
  bestConversationAngle: 'Open on growth plans.',
  suggestedOpeningLine: 'Congrats on the Series B.',
  questionsToAsk: [
    'How are you scaling the sales org?',
    'What slows new account ramp?',
    'How do you forecast renewals?',
    'Where does ops break first?',
    'What would make this a great quarter?',
  ],
  likelyPainPoints: ['Hiring ramp time.'],
  risks: ['Budget freeze.'],
  followUpEmail: 'Thanks for the time. Attaching the one-pager.',
}

const localServer = setupServer(
  http.post('https://api.tinyfish.io/v1/extract', async ({ request }) => {
    const body = (await request.clone().json()) as { url: string }
    return HttpResponse.json({
      url: body.url,
      text: `Acme is a widget company. See ${body.url} for details.`,
      blocked: false,
    })
  }),
  http.post('https://api.tinyfish.io/v1/search', async ({ request }) => {
    const body = (await request.clone().json()) as { query: string }
    return HttpResponse.json({
      items: [
        {
          url: 'https://news.example.com/acme-series-b',
          snippet: `Acme raised a Series B round. Query was: ${body.query}.`,
        },
      ],
    })
  }),
  http.post(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    () =>
      HttpResponse.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify(SAMPLE_SECTIONS) }] } }],
      }),
  ),
)

describe('runPipeline integration', () => {
  let pool: pg.Pool
  let redis: Redis

  const userId = randomUUID() as UserId
  const meetingId = randomUUID() as MeetingId
  const briefingId = randomUUID() as BriefingId
  const jobId = randomUUID() as JobId

  beforeAll(async () => {
    localServer.listen({ onUnhandledRequest: 'bypass' })

    pool = new pg.Pool({ connectionString: POSTGRES_TEST_URL, max: 5 })
    redis = new Redis(REDIS_TEST_URL, { lazyConnect: true })
    await redis.connect()

    await applySchema(pool)

    await pool.query(`INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [
      userId,
      `test-${userId}@example.com`,
    ])
    await pool.query(
      `INSERT INTO meetings (id, user_id, calendar_event_id, title, starts_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (id) DO NOTHING`,
      [meetingId, userId, `evt-${meetingId}`, 'Intro call with Acme'],
    )
    await pool.query(
      `INSERT INTO briefings (
         id, user_id, meeting_id,
         contact_name, contact_role, company_name, company_domain,
         status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [briefingId, userId, meetingId, 'Jane Doe', 'VP Sales', 'Acme', 'acme.com'],
    )
  })

  afterAll(async () => {
    try {
      await pool.query(`DELETE FROM sources WHERE briefing_id = $1`, [briefingId])
      await pool.query(`DELETE FROM briefings WHERE id = $1`, [briefingId])
      await pool.query(`DELETE FROM meetings WHERE id = $1`, [meetingId])
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId])
      await redis.del(REDIS_KEYS.progress(briefingId))
    } finally {
      await pool.end()
      redis.disconnect()
      localServer.close()
    }
  })

  it('runs end-to-end: plans, fetches, synthesizes, persists, emits progress', async () => {
    const job: ResearchJobPayload = {
      jobId,
      briefingId,
      userId,
      meetingId,
      notionPageIds: [],
      requestedAt: Date.now(),
    }

    const tinyfish = createTinyFishClient({ apiKey: 'test' })
    const llm = createLLMClient({ apiKey: 'test' })

    await runPipeline(job, { tinyfish, llm, pool, redis, emitProgress })

    const { rows: briefingRows } = await pool.query<{
      status: string
      sections: unknown
      sources_count: number
    }>(`SELECT status, sections, sources_count FROM briefings WHERE id = $1`, [briefingId])
    expect(briefingRows[0]?.status).toBe('ready')
    expect(briefingRows[0]?.sections).toBeTruthy()
    expect(briefingRows[0]?.sources_count ?? 0).toBeGreaterThan(0)

    const { rows: sourceRows } = await pool.query<{ kind: string; url: string; excerpt: string }>(
      `SELECT kind, url, excerpt FROM sources WHERE briefing_id = $1`,
      [briefingId],
    )
    expect(sourceRows.length).toBeGreaterThan(0)

    const events = await redis.xrange(REDIS_KEYS.progress(briefingId), '-', '+')
    const steps = events.map(([, fields]) => {
      const i = fields.indexOf('step')
      return i >= 0 ? fields[i + 1] : undefined
    })
    expect(steps.length).toBeGreaterThan(0)
    expect(steps[steps.length - 1]).toBe('ready')
  })
})
