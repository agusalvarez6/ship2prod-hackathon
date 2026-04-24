import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createTinyFishClient } from '../src/tinyfish.js'

const BASE_URL = 'https://api.tinyfish.io/v1'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('createTinyFishClient.fetch', () => {
  it('posts to /extract with bearer auth and returns the parsed body', async () => {
    let capturedAuth: string | null = null
    let capturedBody: unknown = null

    server.use(
      http.post(`${BASE_URL}/extract`, async ({ request }) => {
        capturedAuth = request.headers.get('authorization')
        capturedBody = await request.clone().json()
        return HttpResponse.json({
          url: 'https://acme.com',
          text: 'Acme makes widgets.',
          blocked: false,
        })
      }),
    )

    const client = createTinyFishClient({ apiKey: 'secret-key' })
    const result = await client.fetch('https://acme.com')

    expect(capturedAuth).toBe('Bearer secret-key')
    expect(capturedBody).toEqual({ url: 'https://acme.com' })
    expect(result).toEqual({
      url: 'https://acme.com',
      text: 'Acme makes widgets.',
      blocked: false,
    })
  })
})

describe('createTinyFishClient.search', () => {
  it('posts to /search with the query and maps items to results', async () => {
    let capturedBody: unknown = null

    server.use(
      http.post(`${BASE_URL}/search`, async ({ request }) => {
        capturedBody = await request.clone().json()
        return HttpResponse.json({
          items: [
            { url: 'https://acme.com/about', snippet: 'About Acme' },
            { url: 'https://news.example/acme', snippet: 'Acme raises Series B' },
          ],
        })
      }),
    )

    const client = createTinyFishClient({ apiKey: 'secret-key' })
    const results = await client.search('Acme')

    expect(capturedBody).toEqual({ query: 'Acme' })
    expect(results).toEqual([
      { url: 'https://acme.com/about', snippet: 'About Acme' },
      { url: 'https://news.example/acme', snippet: 'Acme raises Series B' },
    ])
  })
})
