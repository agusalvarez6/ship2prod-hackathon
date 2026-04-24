import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppError } from '../src/AppError.js'
import { err, ok, type Result } from '../src/Result.js'
import { withRetry } from '../src/withRetry.js'

const upstream = (status: number, retryAfterMs?: number): AppError =>
  retryAfterMs === undefined
    ? { kind: 'upstream', service: 'tinyfish', status }
    : { kind: 'upstream', service: 'tinyfish', status, retryAfterMs }

const internal = (): AppError => ({ kind: 'internal' })

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns ok on first attempt when op succeeds', async () => {
    const op = vi.fn(async (): Promise<Result<number, AppError>> => ok(42))
    const promise = withRetry(op)
    await vi.advanceTimersByTimeAsync(0)
    const result = await promise

    expect(result).toEqual({ ok: true, value: 42 })
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('retries transient upstream errors then resolves to ok', async () => {
    let calls = 0
    const op = vi.fn(async (): Promise<Result<string, AppError>> => {
      calls++
      if (calls < 3) return err(upstream(503))
      return ok('done')
    })

    const promise = withRetry(op, { baseMs: 100, capMs: 10_000 })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual({ ok: true, value: 'done' })
    expect(op).toHaveBeenCalledTimes(3)
  })

  it('stops after maxAttempts and returns the last error', async () => {
    const op = vi.fn(async (): Promise<Result<number, AppError>> => err(upstream(502)))

    const promise = withRetry(op, { maxAttempts: 3, baseMs: 10 })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error).toEqual(upstream(502))
    expect(op).toHaveBeenCalledTimes(3)
  })

  it('fails fast on permanent error without retrying', async () => {
    const op = vi.fn(
      async (): Promise<Result<number, AppError>> =>
        err({ kind: 'validation', field: 'amount', reason: 'negative' }),
    )

    const promise = withRetry(op, { maxAttempts: 5, baseMs: 10 })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.ok).toBe(false)
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('does not retry internal errors', async () => {
    const op = vi.fn(async (): Promise<Result<number, AppError>> => err(internal()))

    const promise = withRetry(op, { maxAttempts: 5 })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.ok).toBe(false)
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('honors retryAfterMs when it exceeds the computed backoff', async () => {
    let calls = 0
    const op = vi.fn(async (): Promise<Result<number, AppError>> => {
      calls++
      if (calls === 1) return err(upstream(429, 5_000))
      return ok(1)
    })

    const promise = withRetry(op, { baseMs: 100, capMs: 10_000 })

    await vi.advanceTimersByTimeAsync(0)
    expect(op).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(4_999)
    expect(op).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await vi.runAllTimersAsync()

    const result = await promise
    expect(result).toEqual({ ok: true, value: 1 })
    expect(op).toHaveBeenCalledTimes(2)
  })

  it('caps backoff delay at capMs', async () => {
    const op = vi.fn(async (): Promise<Result<number, AppError>> => err(upstream(500)))
    const promise = withRetry(op, { maxAttempts: 10, baseMs: 1_000, capMs: 2_000 })

    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.ok).toBe(false)
    expect(op).toHaveBeenCalledTimes(10)
  })

  it('treats 408 and 429 as transient', async () => {
    let calls = 0
    const op = vi.fn(async (): Promise<Result<number, AppError>> => {
      calls++
      if (calls === 1) return err(upstream(408))
      if (calls === 2) return err(upstream(429))
      return ok(7)
    })

    const promise = withRetry(op, { baseMs: 10, capMs: 100 })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual({ ok: true, value: 7 })
    expect(op).toHaveBeenCalledTimes(3)
  })
})
