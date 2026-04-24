import { describe, expect, it } from 'vitest'
import { NotionPageId, UserId } from '@ship2prod/schema'
import { createNotionClient } from '../src/notion.js'

describe('createNotionClient', () => {
  const client = createNotionClient({
    tokenResolver: async () => 'token',
  })
  const userId = UserId.parse('11111111-2222-3333-4444-555555555555')
  const pageId = NotionPageId.parse('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')

  it('returns a non-null client', () => {
    expect(client).not.toBeNull()
    expect(typeof client).toBe('object')
  })

  it('search throws not-implemented in Phase 0', async () => {
    await expect(client.search({ userId, query: 'ramp' })).rejects.toThrow(
      'not implemented in Phase 0',
    )
  })

  it('readPage throws not-implemented in Phase 0', async () => {
    await expect(client.readPage({ userId, pageId })).rejects.toThrow('not implemented in Phase 0')
  })
})
