import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { handleRequest, extractVapiToolCalls } from '../src/server.js'
import {
  DEMO_USER_ID,
  createPostgresNextMeetingRepository,
  type NextMeeting,
  type NextMeetingRepository,
} from '../src/precallbot/nextMeeting.js'
import {
  buildGetNextMeetingToolConfig,
  buildPreCallBotAssistantConfig,
} from '../src/precallbot/vapiConfig.js'

const NOW = new Date('2026-04-24T21:00:00.000Z')
const POSTGRES_TEST_URL =
  process.env.POSTGRES_TEST_URL ?? 'postgres://postgres:postgres@localhost:5433/postgres'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..')
const MIGRATION_PATH = join(REPO_ROOT, 'infra/seed/migrations/001_init.sql')
const SEED_DIR = join(REPO_ROOT, 'infra/seed/seed')
const schemaName = `vapi_webhook_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`

const SAMPLE_MEETING: NextMeeting = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  title: 'Intro with Sarah from Ramp',
  startsAt: '2026-04-24T21:30:00.000Z',
  startsInMinutes: 30,
  description: 'Intro call to discuss Ramp card program and spend controls.',
  attendees: [
    { email: 'sarah@ramp.com', displayName: 'Sarah Chen', organizer: false },
    { email: 'demo@precall.app', displayName: 'You', organizer: true },
  ],
  contact: {
    name: 'Sarah Chen',
    email: 'sarah@ramp.com',
    role: 'Account Executive',
  },
  company: {
    name: 'Ramp',
    domain: 'ramp.com',
    summary: 'Corporate card and spend management platform.',
  },
  briefing: {
    id: '11111111-2222-3333-4444-555555555555',
    status: 'ready',
    summary60s: 'Sarah is focused on spend controls and QuickBooks sync.',
    suggestedOpeningLine: 'Sarah, can we pressure-test the QuickBooks sync first?',
    questionsToAsk: ['How does QuickBooks sync handle class tags?'],
    likelyPainPoints: ['Policy migration'],
    risks: ['Pricing may stay vague until late-stage.'],
    followUpEmail: 'Thanks for the intro call.',
  },
}

describe('PreCallBot meeting endpoint', () => {
  it('requires the internal bearer token when configured', async () => {
    const response = await handleRequest(new Request('http://local/api/meetings/next'), {
      repository: fakeRepository(SAMPLE_MEETING),
      internalApiKey: 'secret',
      now: () => NOW,
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'unauthorized' })
  })

  it('returns the next meeting and voice summary', async () => {
    let seenUserId: string | null = null
    const response = await handleRequest(
      new Request(`http://local/api/meetings/next?userId=${DEMO_USER_ID}`, {
        headers: { authorization: 'Bearer secret' },
      }),
      {
        repository: {
          async findNextMeeting(lookup) {
            seenUserId = lookup.userId
            return SAMPLE_MEETING
          },
        },
        internalApiKey: 'secret',
        now: () => NOW,
      },
    )

    expect(response.status).toBe(200)
    expect(seenUserId).toBe(DEMO_USER_ID)
    await expect(response.json()).resolves.toMatchObject({
      meeting: {
        title: 'Intro with Sarah from Ramp',
        contact: { name: 'Sarah Chen' },
        company: { name: 'Ramp' },
        briefing: { status: 'ready' },
      },
      voiceSummary: expect.stringContaining('Next meeting: Intro with Sarah from Ramp'),
    })
  })

  it('responds to Vapi tool-call envelopes', async () => {
    const response = await handleRequest(
      new Request('http://local/vapi/tools/get-next-meeting', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            type: 'tool-calls',
            toolCallList: [
              {
                id: 'tool-call-1',
                name: 'getNextMeeting',
                arguments: { userId: DEMO_USER_ID },
              },
            ],
          },
        }),
      }),
      {
        repository: fakeRepository(SAMPLE_MEETING),
        internalApiKey: 'secret',
        now: () => NOW,
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      results: [
        {
          toolCallId: 'tool-call-1',
          result: {
            meeting: { title: 'Intro with Sarah from Ramp' },
            voiceSummary: expect.stringContaining('Suggested opener'),
          },
        },
      ],
    })
  })

  it('extracts current and legacy Vapi tool-call shapes', () => {
    expect(
      extractVapiToolCalls({
        message: {
          toolWithToolCallList: [
            {
              name: 'getNextMeeting',
              toolCall: {
                id: 'abc',
                function: { parameters: { email: 'demo@precall.app' } },
              },
            },
          ],
        },
      }),
    ).toEqual([{ id: 'abc', name: 'getNextMeeting', parameters: { email: 'demo@precall.app' } }])
  })

  it('extracts OpenAI-style Vapi tool calls with JSON-string arguments', () => {
    expect(
      extractVapiToolCalls({
        message: {
          type: 'tool-calls',
          toolCallList: [
            {
              id: 'call_123',
              type: 'function',
              function: {
                name: 'getNextMeeting',
                arguments: JSON.stringify({ userId: DEMO_USER_ID }),
              },
            },
          ],
        },
      }),
    ).toEqual([{ id: 'call_123', name: 'getNextMeeting', parameters: { userId: DEMO_USER_ID } }])
  })
})

describe('PreCallBot Postgres meeting repository', () => {
  let client: pg.Client | null = null
  let repository: NextMeetingRepository | null = null
  let dbAvailable = false

  beforeAll(async () => {
    client = await tryConnect(POSTGRES_TEST_URL)
    if (!client) return

    dbAvailable = true
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)
    await client.query(`SET search_path TO "${schemaName}"`)
    await applySeedSql(client)
    repository = createPostgresNextMeetingRepository({
      databaseUrl: POSTGRES_TEST_URL,
      schema: schemaName,
    })
  })

  afterAll(async () => {
    await repository?.close?.()
    if (client) {
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
      } finally {
        await client.end()
      }
    }
  })

  it('loads the demo meeting from the seeded database', async () => {
    if (!dbAvailable) return

    const meeting = await repository!.findNextMeeting({
      userId: DEMO_USER_ID,
      email: null,
      now: NOW,
    })

    expect(meeting).toMatchObject({
      title: 'Intro with Sarah from Ramp',
      contact: {
        name: 'Sarah Chen',
        email: 'sarah@ramp.com',
      },
      company: {
        name: 'Ramp',
        domain: 'ramp.com',
      },
      briefing: {
        status: 'ready',
        questionsToAsk: expect.arrayContaining([
          "How does Ramp's QuickBooks sync handle class and location tags on card transactions?",
        ]),
      },
    })
    expect(meeting!.startsInMinutes).toBeGreaterThan(0)
  })
})

describe('PreCallBot Vapi config', () => {
  it('points the function tool at the local Vapi tool endpoint', () => {
    const config = buildGetNextMeetingToolConfig({
      publicBaseUrl: 'https://api.precall.dev/vapi/webhook',
      internalApiKey: 'secret',
    })

    expect(config).toMatchObject({
      type: 'function',
      function: { name: 'getNextMeeting' },
      server: {
        url: 'https://api.precall.dev/vapi/tools/get-next-meeting',
        headers: { Authorization: 'Bearer secret' },
      },
    })
  })

  it('can point the function tool directly at a hosted endpoint', () => {
    const config = buildGetNextMeetingToolConfig({
      toolUrl: 'https://z5bpjses.functions.insforge.app/precall-next-meeting',
      internalApiKey: 'secret',
    })

    expect(config).toMatchObject({
      server: {
        url: 'https://z5bpjses.functions.insforge.app/precall-next-meeting',
        headers: { Authorization: 'Bearer secret' },
      },
    })
  })

  it('attaches the system prompt and tool id to the assistant config', () => {
    const config = buildPreCallBotAssistantConfig({ toolId: 'tool_123' })

    expect(config).toMatchObject({
      name: 'PreCallBot',
      firstMessage: '',
      firstMessageMode: 'assistant-speaks-first-with-model-generated-message',
      model: {
        provider: 'openai',
        toolIds: ['tool_123'],
        messages: [
          {
            role: 'system',
            content: expect.stringContaining('On the first assistant turn, call getNextMeeting'),
          },
        ],
      },
    })
  })
})

function fakeRepository(meeting: NextMeeting | null): NextMeetingRepository {
  return {
    async findNextMeeting() {
      return meeting
    },
  }
}

async function tryConnect(url: string): Promise<pg.Client | null> {
  const client = new pg.Client({ connectionString: url })
  try {
    await client.connect()
    return client
  } catch {
    return null
  }
}

async function applySeedSql(client: pg.Client): Promise<void> {
  // pgcrypto is global to the database, so skip it here to avoid racing the
  // infra seed suite when Vitest runs files in parallel.
  const migrationSql = (await readFile(MIGRATION_PATH, 'utf8')).replace(
    /^\s*CREATE EXTENSION IF NOT EXISTS pgcrypto;\s*$/im,
    '',
  )
  await client.query(migrationSql)
  const seedFiles = (await readdir(SEED_DIR)).filter((file) => file.endsWith('.sql')).sort()

  for (const file of seedFiles) {
    await client.query(await readFile(join(SEED_DIR, file), 'utf8'))
  }
}
