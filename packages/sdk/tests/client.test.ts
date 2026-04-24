import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../../test/msw/server.js'
import { createPrecallClient } from '../src/client.js'

const ENDPOINT = 'https://precall.test'
const FIXTURE_ID = '11111111-2222-3333-4444-555555555555'

describe('createPrecallClient', () => {
  it('posts operationName + variables with bearer auth and returns data', async () => {
    type CapturedBody = { operationName?: string; variables?: Record<string, unknown> }
    const captured: { body: CapturedBody | null; auth: string | null } = { body: null, auth: null }

    server.use(
      http.post(`${ENDPOINT}/graphql`, async ({ request }) => {
        captured.auth = request.headers.get('authorization')
        captured.body = (await request.json()) as CapturedBody
        return HttpResponse.json({ data: { briefing: { id: FIXTURE_ID } } })
      }),
    )

    const precall = createPrecallClient({
      endpoint: ENDPOINT,
      getToken: async () => 'test-token',
    })

    const data = (await precall.getBriefing({ id: FIXTURE_ID })) as {
      briefing: { id: string }
    }

    expect(captured.body?.operationName).toBe('getBriefing')
    expect(captured.body?.variables?.['id']).toBe(FIXTURE_ID)
    expect(captured.auth).toBe('Bearer test-token')
    expect(data.briefing.id).toBe(FIXTURE_ID)
  })
})
