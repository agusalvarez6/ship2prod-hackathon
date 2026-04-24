import type { AppError } from './AppError.js'
import { isTransient } from './isTransient.js'
import type { Result } from './Result.js'

export interface WithRetryOptions {
  maxAttempts?: number
  baseMs?: number
  capMs?: number
}

export async function withRetry<T>(
  op: () => Promise<Result<T, AppError>>,
  opts: WithRetryOptions = {},
): Promise<Result<T, AppError>> {
  const maxAttempts = opts.maxAttempts ?? 5
  const baseMs = opts.baseMs ?? 200
  const capMs = opts.capMs ?? 10_000

  let attempt = 0
  while (true) {
    const r = await op()
    if (r.ok) return r
    attempt++
    if (attempt >= maxAttempts || !isTransient(r.error)) return r

    const hinted = r.error.kind === 'upstream' ? (r.error.retryAfterMs ?? 0) : 0
    const expo = Math.min(capMs, baseMs * 2 ** (attempt - 1))
    const jitter = Math.random() * expo
    const delay = Math.max(hinted, jitter)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}
