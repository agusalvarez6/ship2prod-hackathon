import type { MiddlewareHandler } from 'hono'

export function claimIdempotency(): MiddlewareHandler {
  return async (c, next) => {
    // Phase 0: stub. Redis SETNX with TTL lands later.
    c.set('fresh', true)
    await next()
  }
}
