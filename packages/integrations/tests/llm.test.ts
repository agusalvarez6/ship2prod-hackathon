import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createLLMClient } from '../src/llm.js'

const GEMINI_MODEL = 'gemini-2.0-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('createLLMClient.synthesize', () => {
  it('posts to Gemini generateContent and returns the first part text', async () => {
    let capturedKey = ''
    type CapturedBody = {
      systemInstruction?: { parts?: Array<{ text?: string }> }
      contents?: Array<{ role?: string; parts?: Array<{ text?: string }> }>
      generationConfig?: { maxOutputTokens?: number; temperature?: number }
    }
    let capturedBody: CapturedBody = {}

    server.use(
      http.post(GEMINI_URL, async ({ request }) => {
        const url = new URL(request.url)
        capturedKey = url.searchParams.get('key') ?? ''
        capturedBody = (await request.clone().json()) as CapturedBody
        return HttpResponse.json({
          candidates: [
            { content: { parts: [{ text: 'Acme sells widgets.' }] } },
          ],
        })
      }),
    )

    const client = createLLMClient({ apiKey: 'gemini-key' })
    const answer = await client.synthesize({
      system: 'You are helpful.',
      context: 'Acme is a widget maker.',
      question: 'What does Acme sell?',
    })

    expect(answer).toBe('Acme sells widgets.')
    expect(capturedKey).toBe('gemini-key')
    expect(capturedBody.systemInstruction?.parts?.[0]?.text).toBe('You are helpful.')
    expect(capturedBody.contents).toEqual([
      {
        role: 'user',
        parts: [
          {
            text: 'Context:\nAcme is a widget maker.\n\nQuestion: What does Acme sell?',
          },
        ],
      },
    ])
    expect(capturedBody.generationConfig?.maxOutputTokens).toBe(2048)
    expect(capturedBody.generationConfig?.temperature).toBe(0)
  })
})
