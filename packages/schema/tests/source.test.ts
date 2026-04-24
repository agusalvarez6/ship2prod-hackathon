import { describe, expect, it } from 'vitest'
import {
  CitedSourceSchema,
  SourceKindSchema,
  SourceSchema,
  SourceStatusSchema,
} from '../src/source.js'

const validSource = {
  id: '11111111-1111-1111-1111-111111111111',
  briefingId: '22222222-2222-2222-2222-222222222222',
  kind: 'company_site' as const,
  url: 'https://ramp.com',
  finalUrl: 'https://ramp.com/',
  externalId: null,
  title: 'Ramp',
  excerpt: 'Finance automation platform',
  raw: { latency_ms: 420 },
  status: 'ok' as const,
  fetchedAt: '2026-04-24T18:00:00.000Z',
}

describe('SourceSchema', () => {
  it('round-trips a valid Source', () => {
    const parsed = SourceSchema.parse(validSource)
    expect(parsed.kind).toBe('company_site')
    expect(parsed.status).toBe('ok')
  })

  it('rejects an unknown SourceKind', () => {
    const bad = { ...validSource, kind: 'tweet' }
    expect(SourceSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an unknown SourceStatus', () => {
    const bad = { ...validSource, status: 'stale' }
    expect(SourceSchema.safeParse(bad).success).toBe(false)
  })

  it('accepts all 9 SourceKind values from the DDL check constraint', () => {
    const kinds: ReadonlyArray<string> = [
      'notion_page',
      'company_site',
      'product_page',
      'pricing_page',
      'blog_post',
      'news',
      'linkedin',
      'filing',
      'other',
    ]
    for (const kind of kinds) {
      expect(SourceKindSchema.safeParse(kind).success).toBe(true)
    }
  })

  it('accepts all 6 SourceStatus values from the DDL check constraint', () => {
    const statuses: ReadonlyArray<string> = [
      'ok',
      'blocked',
      'captcha',
      'timeout',
      'dead',
      'skipped',
    ]
    for (const s of statuses) {
      expect(SourceStatusSchema.safeParse(s).success).toBe(true)
    }
  })
})

describe('CitedSourceSchema', () => {
  it('round-trips with optional url', () => {
    const cited = {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Ramp blog post',
      kind: 'blog_post' as const,
    }
    expect(CitedSourceSchema.parse(cited).title).toBe('Ramp blog post')
  })

  it('rejects missing title', () => {
    const bad = {
      id: '11111111-1111-1111-1111-111111111111',
      kind: 'news' as const,
    }
    expect(CitedSourceSchema.safeParse(bad).success).toBe(false)
  })
})
