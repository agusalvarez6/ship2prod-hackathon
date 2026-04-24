export interface TinyFishFetchResult {
  url: string
  final_url: string
  title?: string
  description?: string
  text?: string
  latency_ms: number
  error?: string
}

export interface TinyFishSearchResult {
  position: number
  site_name: string
  title: string
  url: string
  snippet: string
}

export interface TinyFishClient {
  fetch(input: { urls: string[]; format: 'markdown' | 'html' }): Promise<TinyFishFetchResult[]>
  search(input: {
    query: string
    location?: string
    language?: string
  }): Promise<TinyFishSearchResult[]>
}

export interface TinyFishClientConfig {
  apiKey: string
}

export function createTinyFishClient(_config: TinyFishClientConfig): TinyFishClient {
  return {
    async fetch() {
      throw new Error('not implemented in Phase 0')
    },
    async search() {
      throw new Error('not implemented in Phase 0')
    },
  }
}
