import { describe, expect, it } from 'vitest'
import { createLLMClient } from '../src/llm.js'
import { createTinyFishClient } from '../src/tinyfish.js'
import { createNotionClient } from '../src/notion.js'
import { createGCalClient } from '../src/gcal.js'

describe('createLLMClient', () => {
  it('returns a non-null client', () => {
    const client = createLLMClient({ apiKey: 'test-key' })
    expect(client).not.toBeNull()
    expect(client).toBeDefined()
  })

  it('synthesize rejects with "not implemented in Phase 0"', async () => {
    const client = createLLMClient({ apiKey: 'test-key' })
    await expect(
      client.synthesize({ system: 's', context: 'c', question: 'q' }),
    ).rejects.toThrow('not implemented in Phase 0')
  })
})

describe('createTinyFishClient', () => {
  it('returns a non-null client', () => {
    const client = createTinyFishClient({ apiKey: 'test-key' })
    expect(client).not.toBeNull()
    expect(client).toBeDefined()
  })

  it('fetch rejects with "not implemented in Phase 0"', async () => {
    const client = createTinyFishClient({ apiKey: 'test-key' })
    await expect(client.fetch('https://example.com')).rejects.toThrow(
      'not implemented in Phase 0',
    )
  })

  it('search rejects with "not implemented in Phase 0"', async () => {
    const client = createTinyFishClient({ apiKey: 'test-key' })
    await expect(client.search('query')).rejects.toThrow('not implemented in Phase 0')
  })
})

describe('createNotionClient', () => {
  it('returns a non-null client', () => {
    const client = createNotionClient({ accessToken: 'test-token' })
    expect(client).not.toBeNull()
    expect(client).toBeDefined()
  })

  it('getPage rejects with "not implemented in Phase 0"', async () => {
    const client = createNotionClient({ accessToken: 'test-token' })
    await expect(client.getPage('page-id')).rejects.toThrow('not implemented in Phase 0')
  })

  it('searchPages rejects with "not implemented in Phase 0"', async () => {
    const client = createNotionClient({ accessToken: 'test-token' })
    await expect(client.searchPages('query')).rejects.toThrow(
      'not implemented in Phase 0',
    )
  })
})

describe('createGCalClient', () => {
  it('returns a non-null client', () => {
    const client = createGCalClient({ accessToken: 'test-token' })
    expect(client).not.toBeNull()
    expect(client).toBeDefined()
  })

  it('listUpcoming rejects with "not implemented in Phase 0"', async () => {
    const client = createGCalClient({ accessToken: 'test-token' })
    await expect(client.listUpcoming('user-id')).rejects.toThrow(
      'not implemented in Phase 0',
    )
  })
})
