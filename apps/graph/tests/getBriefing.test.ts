process.env['GRAPH_NO_LISTEN'] = '1'

import { describe, it, expect } from 'vitest'
import { app } from '../src/index.js'

describe('getBriefing fixture', () => {
  it('returns the seeded briefing by id', async () => {
    const res = await app.fetch(
      new Request('http://local.test/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: 'query($id: ID!) { getBriefing(id: $id) { id } }',
          variables: { id: '11111111-2222-3333-4444-555555555555' },
        }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data?: { getBriefing?: { id?: string } }
      errors?: unknown
    }
    expect(body.errors).toBeUndefined()
    expect(body.data?.getBriefing?.id).toBe('11111111-2222-3333-4444-555555555555')
  })
})
