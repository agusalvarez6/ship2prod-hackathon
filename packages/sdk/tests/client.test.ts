import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { BriefingId } from '@ship2prod/schema'
import { createPrecallClient } from '../src/client.js'

const ENDPOINT = 'https://precall.test'

describe('PrecallClient', () => {
  let capturedBody: { operationName?: string; variables?: Record<string, unknown> } | null = null
  let capturedAuth: string | null = null

  const server = setupServer(
    http.post(`${ENDPOINT}/graphql`, async ({ request }) => {
      capturedBody = (await request.clone().json()) as {
        operationName?: string
        variables?: Record<string, unknown>
      }
      capturedAuth = request.headers.get('authorization')
      return HttpResponse.json({ data: { id: 'briefing-1' } })
    }),
  )

  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
  afterEach(() => {
    server.resetHandlers()
    capturedBody = null
    capturedAuth = null
  })
  afterAll(() => server.close())

  it('getBriefing posts operationName, variables, and bearer token', async () => {
    const client = createPrecallClient({
      endpoint: ENDPOINT,
      getToken: async () => 'test-token',
    })

    const id = BriefingId.parse('11111111-2222-3333-4444-555555555555')
    await client.getBriefing({ id })

    expect(capturedBody).toEqual({
      operationName: 'getBriefing',
      variables: { id: '11111111-2222-3333-4444-555555555555' },
    })
    expect(capturedAuth).toBe('Bearer test-token')
  })
})
