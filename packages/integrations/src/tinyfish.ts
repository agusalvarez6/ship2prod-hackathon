import { err, ok, withRetry, type AppError, type Result } from '@ship2prod/errors'

export interface TinyFishFetchResult {
  url: string
  text: string
  blocked: boolean
}

export interface TinyFishSearchResult {
  url: string
  snippet: string
}

export interface TinyFishClient {
  fetch(url: string): Promise<TinyFishFetchResult>
  search(query: string): Promise<Array<TinyFishSearchResult>>
}

export interface TinyFishClientConfig {
  apiKey: string
  baseUrl?: string
}

const DEFAULT_BASE_URL = 'https://api.tinyfish.io/v1'

function resolveBaseUrl(config: TinyFishClientConfig): string {
  return config.baseUrl ?? process.env.TINYFISH_API_URL ?? DEFAULT_BASE_URL
}

async function postJson<T>(
  url: string,
  apiKey: string,
  body: unknown,
): Promise<Result<T, AppError>> {
  const response = await globalThis.fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const retryAfter = response.headers.get('retry-after')
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined
    return err<AppError>({
      kind: 'upstream',
      service: 'tinyfish',
      status: response.status,
      ...(retryAfterMs !== undefined && !Number.isNaN(retryAfterMs) ? { retryAfterMs } : {}),
    })
  }
  const data = (await response.json()) as T
  return ok(data)
}

function unwrap<T>(result: Result<T, AppError>): T {
  if (result.ok) return result.value
  if (result.error.kind === 'upstream') {
    throw new Error(`tinyfish upstream ${result.error.status}`)
  }
  throw new Error(`tinyfish ${result.error.kind}`)
}

export function createTinyFishClient(config: TinyFishClientConfig): TinyFishClient {
  const baseUrl = resolveBaseUrl(config)

  return {
    async fetch(url: string): Promise<TinyFishFetchResult> {
      const result = await withRetry<TinyFishFetchResult>(() =>
        postJson<TinyFishFetchResult>(`${baseUrl}/extract`, config.apiKey, { url }),
      )
      return unwrap(result)
    },

    async search(query: string): Promise<Array<TinyFishSearchResult>> {
      const result = await withRetry<{ items: Array<TinyFishSearchResult> }>(() =>
        postJson<{ items: Array<TinyFishSearchResult> }>(
          `${baseUrl}/search`,
          config.apiKey,
          { query },
        ),
      )
      return unwrap(result).items
    },
  }
}
