import { describe, expect, it } from 'vitest'
import {
  BriefingListItemSchema,
  BriefingSchema,
  BriefingSectionKeySchema,
  BriefingSectionsSchema,
} from '../src/briefing.js'

const validSections = {
  summary60s: '60 second summary',
  whoYouAreMeeting: { name: 'Sarah', company: 'Ramp' },
  companyContext: { whatTheyDo: 'Finance automation', recentUpdates: ['Series D'] },
  internalContext: { notionExcerpts: [{ pageTitle: 'Ramp notes', excerpt: '...' }] },
  bestConversationAngle: 'lead with pricing',
  suggestedOpeningLine: 'Hey Sarah',
  questionsToAsk: ['q1', 'q2', 'q3', 'q4', 'q5'] as [string, string, string, string, string],
  likelyPainPoints: ['billing'],
  risks: ['procurement delay'],
  followUpEmail: 'Hi Sarah, thanks...',
  citedSources: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Ramp home',
      url: 'https://ramp.com',
      kind: 'company_site' as const,
    },
  ],
}

describe('BriefingSectionsSchema', () => {
  it('round-trips a valid BriefingSections with exactly 5 questions', () => {
    const parsed = BriefingSectionsSchema.parse(validSections)
    expect(parsed.questionsToAsk).toHaveLength(5)
  })

  it('rejects 4 questions (must be exactly 5)', () => {
    const bad = { ...validSections, questionsToAsk: ['q1', 'q2', 'q3', 'q4'] }
    expect(BriefingSectionsSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects 6 questions (must be exactly 5)', () => {
    const bad = {
      ...validSections,
      questionsToAsk: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'],
    }
    expect(BriefingSectionsSchema.safeParse(bad).success).toBe(false)
  })
})

describe('BriefingSchema', () => {
  const validBriefing = {
    id: '11111111-2222-3333-4444-555555555555',
    userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    meetingId: null,
    contactName: 'Sarah',
    contactEmail: 'sarah@ramp.com',
    contactRole: 'AE',
    companyName: 'Ramp',
    companyDomain: 'ramp.com',
    companySummary: 'Finance automation platform',
    status: 'ready' as const,
    summary60s: '60 second summary',
    sections: validSections,
    sourcesCount: 3,
    errorMessage: null,
    researchStartedAt: '2026-04-24T18:00:00.000Z',
    researchFinishedAt: '2026-04-24T18:01:00.000Z',
    researchError: null,
    createdAt: '2026-04-24T17:59:00.000Z',
    updatedAt: '2026-04-24T18:01:00.000Z',
  }

  it('round-trips a ready briefing with sections', () => {
    const parsed = BriefingSchema.parse(validBriefing)
    expect(parsed.status).toBe('ready')
    expect(parsed.sections).not.toBeNull()
  })

  it('accepts pending briefing with null sections', () => {
    const pending = {
      ...validBriefing,
      status: 'pending' as const,
      sections: null,
      summary60s: null,
      sourcesCount: 0,
      researchStartedAt: null,
      researchFinishedAt: null,
    }
    expect(BriefingSchema.parse(pending).sections).toBeNull()
  })

  it('rejects an unknown status', () => {
    const bad = { ...validBriefing, status: 'queued' }
    expect(BriefingSchema.safeParse(bad).success).toBe(false)
  })
})

describe('BriefingListItemSchema', () => {
  it('round-trips a list item', () => {
    const parsed = BriefingListItemSchema.parse({
      id: '11111111-2222-3333-4444-555555555555',
      title: 'Intro with Sarah from Ramp',
      companyName: 'Ramp',
      status: 'ready',
      createdAt: '2026-04-24T17:59:00.000Z',
    })
    expect(parsed.companyName).toBe('Ramp')
  })

  it('rejects missing title', () => {
    expect(
      BriefingListItemSchema.safeParse({
        id: '11111111-2222-3333-4444-555555555555',
        companyName: null,
        status: 'ready',
        createdAt: '2026-04-24T17:59:00.000Z',
      }).success,
    ).toBe(false)
  })
})

describe('BriefingSectionKeySchema', () => {
  it('accepts all 7 wire keys', () => {
    const keys = [
      'summary',
      'questions',
      'opening_line',
      'pain_points',
      'notion_context',
      'follow_up_email',
      'risks',
    ]
    for (const k of keys) {
      expect(BriefingSectionKeySchema.safeParse(k).success).toBe(true)
    }
  })

  it('rejects unknown section key', () => {
    expect(BriefingSectionKeySchema.safeParse('summary_120s').success).toBe(false)
  })
})
