import { describe, expect, it } from 'vitest'
import { createApp } from '../src/index.js'

describe('POST /webhooks/vapi', () => {
  it('returns 200 for a tool-calls envelope', async () => {
    const app = createApp()
    const res = await app.fetch(
      new Request('http://localhost/webhooks/vapi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: { type: 'tool-calls', toolCalls: [] } }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('returns 200 for an unknown envelope type', async () => {
    const app = createApp()
    const res = await app.fetch(
      new Request('http://localhost/webhooks/vapi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: { type: 'some-future-type' } }),
      }),
    )

    expect(res.status).toBe(200)
  })

  it('GET /health returns 200', async () => {
    const app = createApp()
    const res = await app.fetch(new Request('http://localhost/health'))
    expect(res.status).toBe(200)
  })
})
