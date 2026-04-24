import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Redis } from 'ioredis'
import type { Pool } from 'pg'
import { REDIS_KEYS } from '@ship2prod/schema/redis'
import type { ResearchJobPayload } from '@ship2prod/schema/jobs'

const SARAH_BRIEFING_ID = '11111111-2222-3333-4444-555555555555'

const here = dirname(fileURLToPath(import.meta.url))
const fixturePath = resolve(here, '../../../../infra/seed/briefings.seed.json')
const sarahBriefing = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, unknown>

interface BriefingRow {
  id: string
  user_id: string
  meeting_id: string | null
  contact_name: string | null
  contact_email: string | null
  contact_role: string | null
  company_name: string | null
  company_domain: string | null
  company_summary: string | null
  status: string
  summary_60s: string | null
  sections: Record<string, unknown> | null
  sources_count: number
  error_message: string | null
  research_started_at: Date | null
  research_finished_at: Date | null
  created_at: Date
  updated_at: Date
}

function rowToBriefing(row: BriefingRow): Record<string, unknown> {
  return {
    id: row.id,
    userId: row.user_id,
    meetingId: row.meeting_id,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactRole: row.contact_role,
    companyName: row.company_name,
    companyDomain: row.company_domain,
    companySummary: row.company_summary,
    status: row.status,
    summary60s: row.summary_60s,
    sections: row.sections,
    sourcesCount: row.sources_count,
    errorMessage: row.error_message,
    researchStartedAt: row.research_started_at,
    researchFinishedAt: row.research_finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const briefingResolvers = {
  getBriefing: async (
    _parent: unknown,
    args: { id: string },
    ctx: { db: Pool },
  ): Promise<Record<string, unknown> | null> => {
    const result = await ctx.db.query<BriefingRow>(
      `SELECT id, user_id, meeting_id, contact_name, contact_email, contact_role,
              company_name, company_domain, company_summary, status, summary_60s,
              sections, sources_count, error_message, research_started_at,
              research_finished_at, created_at, updated_at
         FROM briefings WHERE id = $1`,
      [args.id],
    )
    const row = result.rows[0]
    if (row) return rowToBriefing(row)
    if (args.id === SARAH_BRIEFING_ID) return sarahBriefing
    return null
  },

  listBriefings: async (
    _parent: unknown,
    args: { userId?: string; limit?: number },
    ctx: { db: Pool },
  ): Promise<Array<Record<string, unknown>>> => {
    if (!args.userId) throw new Error('userId required')
    const limit = args.limit ?? 20
    const result = await ctx.db.query<BriefingRow>(
      `SELECT id, user_id, meeting_id, contact_name, contact_email, contact_role,
              company_name, company_domain, company_summary, status, summary_60s,
              sections, sources_count, error_message, research_started_at,
              research_finished_at, created_at, updated_at
         FROM briefings WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [args.userId, limit],
    )
    return result.rows.map(rowToBriefing)
  },

  createBriefingFromMeeting: async (
    _parent: unknown,
    args: { meetingId: string },
    ctx: { db: Pool; redis: Redis },
  ): Promise<Record<string, unknown>> => {
    const meeting = await ctx.db.query<{ user_id: string }>(
      `SELECT user_id FROM meetings WHERE id = $1`,
      [args.meetingId],
    )
    const row = meeting.rows[0]
    if (!row) throw new Error('meeting not found')

    const briefingId = randomUUID()
    const inserted = await ctx.db.query<BriefingRow>(
      `INSERT INTO briefings (id, user_id, meeting_id, status, sections, sources_count, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', '{}'::jsonb, 0, now(), now())
       RETURNING id, user_id, meeting_id, contact_name, contact_email, contact_role,
                 company_name, company_domain, company_summary, status, summary_60s,
                 sections, sources_count, error_message, research_started_at,
                 research_finished_at, created_at, updated_at`,
      [briefingId, row.user_id, args.meetingId],
    )

    const payload: ResearchJobPayload = {
      jobId: randomUUID() as ResearchJobPayload['jobId'],
      briefingId: briefingId as ResearchJobPayload['briefingId'],
      userId: row.user_id as ResearchJobPayload['userId'],
      meetingId: args.meetingId as ResearchJobPayload['meetingId'],
      notionPageIds: [],
      requestedAt: Date.now(),
    }
    await ctx.redis.lpush(REDIS_KEYS.jobs.pending, JSON.stringify(payload))

    const briefingRow = inserted.rows[0]
    if (!briefingRow) throw new Error('insert returned no row')
    return rowToBriefing(briefingRow)
  },

  getBriefingProgress: async (
    _parent: unknown,
    args: { briefingId: string },
    ctx: { redis: Redis },
  ): Promise<Array<{ id: string; step: string; message?: string; at: string }>> => {
    const key = REDIS_KEYS.progress(args.briefingId as Parameters<typeof REDIS_KEYS.progress>[0])
    const entries = await ctx.redis.xrange(key, '-', '+')
    return entries.map(([id, fields]) => {
      const map = new Map<string, string>()
      for (let i = 0; i + 1 < fields.length; i += 2) {
        const k = fields[i]
        const v = fields[i + 1]
        if (k !== undefined && v !== undefined) map.set(k, v)
      }
      const step = map.get('step') ?? ''
      const at = map.get('at') ?? ''
      const message = map.get('detail')
      return message !== undefined ? { id, step, message, at } : { id, step, at }
    })
  },

  draftFollowUpEmail: (): never => {
    throw new Error('not implemented in Phase 0')
  },
}
