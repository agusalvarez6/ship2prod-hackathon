import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createLLMClient } from '../src/llm.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('createLLMClient.synthesize', () => {
  it('posts to Anthropic messages API and returns the first text block', async () => {
    let capturedHeaders: Record<string, string> = {}
    type CapturedBody = {
      model?: string
      max_tokens?: number
      system?: string
      messages?: Array<{ role: string; content: string }>
    }
    let capturedBody: CapturedBody = {}

    server.use(
      http.post(ANTHROPIC_URL, async ({ request }) => {
        capturedHeaders = {
          apiKey: request.headers.get('x-api-key') ?? '',
          version: request.headers.get('anthropic-version') ?? '',
          contentType: request.headers.get('content-type') ?? '',
        }
        capturedBody = (await request.clone().json()) as CapturedBody
        return HttpResponse.json({
          content: [{ type: 'text', text: 'Acme sells widgets.' }],
        })
      }),
    )

    const client = createLLMClient({ apiKey: 'anthropic-key' })
    const answer = await client.synthesize({
      system: 'You are helpful.',
      context: 'Acme is a widget maker.',
      question: 'What does Acme sell?',
    })

    expect(answer).toBe('Acme sells widgets.')
    expect(capturedHeaders.apiKey).toBe('anthropic-key')
    expect(capturedHeaders.version).toBe('2023-06-01')
    expect(capturedHeaders.contentType).toContain('application/json')
    expect(capturedBody.model).toBe('claude-sonnet-4-6')
    expect(capturedBody.max_tokens).toBe(2048)
    expect(capturedBody.system).toBe('You are helpful.')
    expect(capturedBody.messages).toEqual([
      {
        role: 'user',
        content: 'Context:\nAcme is a widget maker.\n\nQuestion: What does Acme sell?',
      },
    ])
  })
})
