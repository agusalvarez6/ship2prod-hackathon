import type { MiddlewareHandler } from 'hono'

export interface HmacMiddlewareConfig {
  secret: string
  headerName: string
  timestampHeaderName: string
  maxSkewMs: number
}

export function verifyVapiSignature(_config?: HmacMiddlewareConfig): MiddlewareHandler {
  return async (_c, next) => {
    // Phase 0: stub. Real HMAC-SHA256 + 5-minute replay window lands later.
    await next()
  }
}

export async function captureRawBody(c: Parameters<MiddlewareHandler>[0], next: () => Promise<void>) {
  const raw = await c.req.raw.clone().text()
  c.set('rawBody', raw)
  await next()
}
