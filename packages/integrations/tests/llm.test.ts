import { describe, expect, it } from 'vitest'
import { createLLMClient } from '../src/llm.js'

describe('createLLMClient', () => {
  const client = createLLMClient({ apiKey: 'test' })

  it('returns a non-null client', () => {
    expect(client).not.toBeNull()
    expect(typeof client).toBe('object')
  })

  it('synthesizeBriefing throws not-implemented in Phase 0', async () => {
    await expect(
      client.synthesizeBriefing({
        meeting: {} as never,
        contact: null,
        company: null,
        notionContext: [],
        sources: [],
      }),
    ).rejects.toThrow('not implemented in Phase 0')
  })

  it('answerQuestion throws not-implemented in Phase 0', async () => {
    await expect(
      client.answerQuestion({
        briefing: {} as never,
        question: 'why',
        recentTurns: [],
      }),
    ).rejects.toThrow('not implemented in Phase 0')
  })

  it('draftFollowUpEmail throws not-implemented in Phase 0', async () => {
    await expect(client.draftFollowUpEmail({ briefing: {} as never })).rejects.toThrow(
      'not implemented in Phase 0',
    )
  })
})
