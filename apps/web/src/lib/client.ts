import { createPrecallClient, type PrecallClient } from '@ship2prod/sdk'

export function precall(endpoint: string, getToken: () => Promise<string>): PrecallClient {
  return createPrecallClient({ endpoint, getToken })
}
