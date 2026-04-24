import { createPrecallClient, type PrecallClient } from '@ship2prod/sdk'

let cached: PrecallClient | null = null

export function precall(): PrecallClient {
  if (cached) return cached
  const endpoint = process.env['COSMO_ROUTER_URL'] ?? 'http://localhost:3002'
  const token = process.env['PRECALL_SERVICE_TOKEN'] ?? ''
  cached = createPrecallClient({
    endpoint,
    getToken: async () => token,
  })
  return cached
}
