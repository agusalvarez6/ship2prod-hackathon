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
}

export function createTinyFishClient(_config: TinyFishClientConfig): TinyFishClient {
  return {
    async fetch(_url: string): Promise<TinyFishFetchResult> {
      throw new Error('not implemented in Phase 0')
    },
    async search(_query: string): Promise<Array<TinyFishSearchResult>> {
      throw new Error('not implemented in Phase 0')
    },
  }
}
