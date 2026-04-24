import { describe, expect, it } from 'vitest'
import { BriefingId, MeetingId, NotionPageId, UserId } from '../src/ids.js'
import { REDIS_KEYS, REDIS_STREAM, REDIS_TTL } from '../src/redis.js'

describe('REDIS_KEYS', () => {
  it('produces the master §4 queue list names verbatim', () => {
    expect(REDIS_KEYS.jobs.pending).toBe('research_jobs:pending')
    expect(REDIS_KEYS.jobs.processing).toBe('research_jobs:processing')
  })

  it('builds progress + claim keys from a briefingId', () => {
    const id = BriefingId.parse('11111111-2222-3333-4444-555555555555')
    expect(REDIS_KEYS.progress(id)).toBe('job:11111111-2222-3333-4444-555555555555:progress')
    expect(REDIS_KEYS.claim(id)).toBe('job:11111111-2222-3333-4444-555555555555:claim')
  })

  it('builds call session key from a callId', () => {
    expect(REDIS_KEYS.callSession('abc')).toBe('call:session:abc')
  })

  it('builds idem keys', () => {
    const u = UserId.parse('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    const m = MeetingId.parse('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
    expect(REDIS_KEYS.idem.vapi('ev-1')).toBe('idem:vapi:ev-1')
    expect(REDIS_KEYS.idem.vapiResult('ev-1')).toBe('idem:vapi:ev-1:result')
    expect(REDIS_KEYS.idem.createBriefing(u, m)).toBe(
      'idem:briefings:create:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    )
  })

  it('builds cache keys', () => {
    const b = BriefingId.parse('11111111-2222-3333-4444-555555555555')
    const p = NotionPageId.parse('77777777-7777-7777-7777-777777777777')
    expect(REDIS_KEYS.cache.briefing(b)).toBe('cache:briefing:11111111-2222-3333-4444-555555555555')
    expect(REDIS_KEYS.cache.tinyfish('deadbeef')).toBe('cache:tinyfish:deadbeef')
    expect(REDIS_KEYS.cache.notionPage(p)).toBe(
      'cache:notion:page:77777777-7777-7777-7777-777777777777',
    )
    expect(REDIS_KEYS.cache.notionSearch('abc123')).toBe('cache:notion:search:abc123')
  })
})

describe('REDIS_TTL', () => {
  it('matches the master §4 inventory table verbatim', () => {
    expect(REDIS_TTL.progress).toBe(3600)
    expect(REDIS_TTL.claim).toBe(600)
    expect(REDIS_TTL.callSession).toBe(900)
    expect(REDIS_TTL.idemVapi).toBe(600)
    expect(REDIS_TTL.idemCreate).toBe(3600)
    expect(REDIS_TTL.cacheBriefing).toBe(900)
    expect(REDIS_TTL.cacheTinyfish).toBe(86400)
    expect(REDIS_TTL.cacheNotionPage).toBe(3600)
    expect(REDIS_TTL.cacheNotionSearch).toBe(600)
  })
})

describe('REDIS_STREAM', () => {
  it('caps progress stream at 100 entries (master §4)', () => {
    expect(REDIS_STREAM.progress.maxLen).toBe(100)
  })

  it('names XADD field keys', () => {
    expect(REDIS_STREAM.progress.field.step).toBe('step')
    expect(REDIS_STREAM.progress.field.pct).toBe('pct')
    expect(REDIS_STREAM.progress.field.detail).toBe('detail')
    expect(REDIS_STREAM.progress.field.at).toBe('at')
  })
})
