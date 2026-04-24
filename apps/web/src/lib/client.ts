import { createPrecallClient, type PrecallClient } from '@ship2prod/sdk'

export function createClient(): PrecallClient {
  const endpoint = process.env['NEXT_PUBLIC_GRAPH_ENDPOINT'] ?? ''
  return createPrecallClient({
    endpoint,
    getToken: async () => 'phase-0-stub-token',
  })
}
