import { describe, expect, it } from 'vitest'
import { createTinyFishClient } from '../src/tinyfish.js'

describe('createTinyFishClient', () => {
  const client = createTinyFishClient({ apiKey: 'test' })

  it('returns a non-null client', () => {
    expect(client).not.toBeNull()
    expect(typeof client).toBe('object')
  })

  it('fetch throws not-implemented in Phase 0', async () => {
    await expect(
      client.fetch({ urls: ['https://example.com'], format: 'markdown' }),
    ).rejects.toThrow('not implemented in Phase 0')
  })

  it('search throws not-implemented in Phase 0', async () => {
    await expect(client.search({ query: 'ramp' })).rejects.toThrow('not implemented in Phase 0')
  })
})
