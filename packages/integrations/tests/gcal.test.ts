import { describe, expect, it } from 'vitest'
import { UserId } from '@ship2prod/schema'
import { createGCalClient } from '../src/gcal.js'

describe('createGCalClient', () => {
  const client = createGCalClient({
    refreshTokenResolver: async () => 'refresh',
    clientId: 'cid',
    clientSecret: 'csecret',
  })
  const userId = UserId.parse('11111111-2222-3333-4444-555555555555')

  it('returns a non-null client', () => {
    expect(client).not.toBeNull()
    expect(typeof client).toBe('object')
  })

  it('listUpcoming throws not-implemented in Phase 0', async () => {
    await expect(client.listUpcoming({ userId, limit: 10 })).rejects.toThrow(
      'not implemented in Phase 0',
    )
  })
})
