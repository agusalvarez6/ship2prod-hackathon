import { describe, expect, it } from 'vitest'
import { app } from '../src/index.js'

const SARAH_BRIEFING_ID = '11111111-2222-3333-4444-555555555555'

describe('getBriefing resolver', () => {
  it('returns the Sarah fixture for the seeded briefing id', async () => {
    const res = await app.fetch(
      new Request('http://local/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: 'query($id: ID!) { getBriefing(id: $id) { id status } }',
          variables: { id: SARAH_BRIEFING_ID },
        }),
      }),
    )

    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      data?: { getBriefing?: { id?: string; status?: string } }
      errors?: unknown
    }
    expect(json.errors).toBeUndefined()
    expect(json.data?.getBriefing?.id).toBe(SARAH_BRIEFING_ID)
    expect(json.data?.getBriefing?.status).toBe('ready')
  })
})
