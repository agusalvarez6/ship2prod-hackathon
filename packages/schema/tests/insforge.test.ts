import { describe, expect, it } from 'vitest'
import type { BriefingsRow, CallTranscriptsRow, SourcesRow } from '../src/insforge.js'
import {
  AttendeeSchema,
  BriefingStatusDbSchema,
  MeetingsRowSchema,
  SourceKindDbSchema,
  SourceStatusDbSchema,
  UsersRowSchema,
} from '../src/insforge.js'

describe('UsersRowSchema', () => {
  it('round-trips a users row', () => {
    const row = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      email: 'demo@precall.app',
      google_sub: null,
      google_refresh_token: null,
      google_access_token: null,
      google_access_token_expires_at: null,
      display_name: null,
      picture_url: null,
      notion_token: null,
      created_at: '2026-04-24T10:00:00.000Z',
    }
    expect(UsersRowSchema.parse(row).email).toBe('demo@precall.app')
  })

  it('rejects a non-email email', () => {
    const bad = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      email: 'not-an-email',
      google_sub: null,
      google_refresh_token: null,
      google_access_token: null,
      google_access_token_expires_at: null,
      display_name: null,
      picture_url: null,
      notion_token: null,
      created_at: '2026-04-24T10:00:00.000Z',
    }
    expect(UsersRowSchema.safeParse(bad).success).toBe(false)
  })

  it('accepts a row with all new Google OAuth columns null', () => {
    const row = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      email: 'demo@precall.app',
      google_sub: null,
      google_refresh_token: null,
      google_access_token: null,
      google_access_token_expires_at: null,
      display_name: null,
      picture_url: null,
      notion_token: null,
      created_at: '2026-04-24T10:00:00.000Z',
    }
    expect(UsersRowSchema.safeParse(row).success).toBe(true)
  })

  it('accepts a row with all new Google OAuth columns populated', () => {
    const row = {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      email: 'user@example.com',
      google_sub: '106839928463728910573',
      google_refresh_token: '1//0gRefreshTokenExample',
      google_access_token: 'ya29.AccessTokenExample',
      google_access_token_expires_at: '2026-04-24T11:00:00.000Z',
      display_name: 'Ada Lovelace',
      picture_url: 'https://lh3.googleusercontent.com/a/example',
      notion_token: null,
      created_at: '2026-04-24T10:00:00.000Z',
    }
    expect(UsersRowSchema.safeParse(row).success).toBe(true)
  })
})

describe('MeetingsRowSchema', () => {
  it('round-trips with attendees', () => {
    const row = {
      id: '44444444-4444-4444-4444-444444444444',
      user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      calendar_event_id: 'gcal_evt_1',
      title: 'Intro with Sarah from Ramp',
      starts_at: '2026-04-24T19:00:00.000Z',
      attendees: [{ email: 'sarah@ramp.com', displayName: 'Sarah' }],
      description: null,
      created_at: '2026-04-24T10:00:00.000Z',
    }
    expect(MeetingsRowSchema.parse(row).title).toContain('Ramp')
  })

  it('rejects attendee with bad email', () => {
    const bad = { email: 'not-an-email' }
    expect(AttendeeSchema.safeParse(bad).success).toBe(false)
  })
})

describe('BriefingStatusDbSchema', () => {
  it('matches the DDL CHECK constraint values', () => {
    for (const s of ['pending', 'researching', 'drafting', 'ready', 'failed']) {
      expect(BriefingStatusDbSchema.safeParse(s).success).toBe(true)
    }
  })

  it('rejects an unknown status', () => {
    expect(BriefingStatusDbSchema.safeParse('queued').success).toBe(false)
  })
})

describe('Source DB enums', () => {
  it('SourceKindDb matches the 9-kind DDL CHECK', () => {
    const ok = ['notion_page', 'company_site', 'other']
    for (const k of ok) {
      expect(SourceKindDbSchema.safeParse(k).success).toBe(true)
    }
    expect(SourceKindDbSchema.safeParse('tweet').success).toBe(false)
  })

  it('SourceStatusDb matches the 6-status DDL CHECK', () => {
    const ok = ['ok', 'blocked', 'captcha', 'timeout', 'dead', 'skipped']
    for (const s of ok) {
      expect(SourceStatusDbSchema.safeParse(s).success).toBe(true)
    }
    expect(SourceStatusDbSchema.safeParse('stale').success).toBe(false)
  })
})

describe('BriefingsRow / SourcesRow / CallTranscriptsRow types', () => {
  it('BriefingsRow compiles with a fully-populated ready row', () => {
    const row: BriefingsRow = {
      id: '11111111-2222-3333-4444-555555555555',
      user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      meeting_id: null,
      contact_name: 'Sarah',
      contact_email: 'sarah@ramp.com',
      contact_role: 'AE',
      company_name: 'Ramp',
      company_domain: 'ramp.com',
      company_summary: 'Finance automation',
      status: 'ready',
      summary_60s: '60s',
      sections: null,
      sources_count: 0,
      error_message: null,
      research_started_at: null,
      research_finished_at: null,
      research_error: null,
      created_at: '2026-04-24T10:00:00.000Z',
      updated_at: '2026-04-24T10:00:00.000Z',
    }
    expect(row.status).toBe('ready')
  })

  it('SourcesRow compiles with a skipped row', () => {
    const row: SourcesRow = {
      id: '99999999-9999-9999-9999-999999999999',
      briefing_id: '11111111-2222-3333-4444-555555555555',
      kind: 'linkedin',
      url: null,
      final_url: null,
      external_id: null,
      title: null,
      excerpt: null,
      raw: null,
      status: 'skipped',
      fetched_at: '2026-04-24T10:00:00.000Z',
    }
    expect(row.status).toBe('skipped')
  })

  it('CallTranscriptsRow compiles', () => {
    const row: CallTranscriptsRow = {
      id: '88888888-8888-8888-8888-888888888888',
      user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      briefing_id: null,
      vapi_call_id: 'vapi_call_1',
      recording_url: null,
      transcript: [],
      started_at: null,
      ended_at: null,
      created_at: '2026-04-24T10:00:00.000Z',
    }
    expect(row.vapi_call_id).toBe('vapi_call_1')
  })
})
