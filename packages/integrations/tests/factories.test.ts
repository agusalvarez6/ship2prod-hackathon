import { describe, expect, it } from 'vitest'
import { createNotionClient } from '../src/notion.js'
import { createGCalClient } from '../src/gcal.js'

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
