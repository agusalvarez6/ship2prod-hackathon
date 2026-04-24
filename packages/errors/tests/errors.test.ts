import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppError } from '../src/AppError.js'
import { err, ok, type Result } from '../src/Result.js'
import { isTransient } from '../src/isTransient.js'
import { withRetry } from '../src/withRetry.js'

const upstream = (status: number, retryAfterMs?: number): AppError =>
  retryAfterMs === undefined
    ? { kind: 'upstream', service: 'tinyfish', status }
    : { kind: 'upstream', service: 'tinyfish', status, retryAfterMs }

describe('AppError discriminants', () => {
  it('every variant is constructible and narrows on kind', () => {
    const cases: AppError[] = [
      { kind: 'validation', field: 'email', reason: 'required' },
      { kind: 'not_found', entity: 'briefing', id: 'b_1' },
      { kind: 'upstream', service: 'vapi', status: 500 },
      { kind: 'upstream', service: 'tinyfish', status: 429, retryAfterMs: 1500 },
      { kind: 'upstream', service: 'insforge', status: 503 },
      { kind: 'upstream', service: 'wundergraph', status: 408 },
      { kind: 'upstream', service: 'notion', status: 502 },
      { kind: 'upstream', service: 'gcal', status: 504 },
      { kind: 'upstream', service: 'openai', status: 429, retryAfterMs: 2000 },
      { kind: 'conflict', reason: 'duplicate' },
      { kind: 'internal' },
      { kind: 'internal', cause: new Error('boom') },
    ]

    const label = (e: AppError): string => {
      switch (e.kind) {
        case 'validation':
          return `validation:${e.field}:${e.reason}`
        case 'not_found':
          return `not_found:${e.entity}:${e.id}`
        case 'upstream':
          return `upstream:${e.service}:${e.status}`
        case 'conflict':
          return `conflict:${e.reason}`
        case 'internal':
          return 'internal'
      }
    }

    const labels = cases.map(label)
    expect(labels).toEqual([
      'validation:email:required',
      'not_found:briefing:b_1',
      'upstream:vapi:500',
      'upstream:tinyfish:429',
      'upstream:insforge:503',
      'upstream:wundergraph:408',
      'upstream:notion:502',
      'upstream:gcal:504',
      'upstream:openai:429',
      'conflict:duplicate',
      'internal',
      'internal',
    ])
  })
})

describe('Result helpers', () => {
  it('ok wraps a value with ok: true', () => {
    expect(ok(5)).toEqual({ ok: true, value: 5 })
  })

  it('err wraps an error with ok: false', () => {
    const e: AppError = { kind: 'not_found', entity: 'briefing', id: 'b1' }
    expect(err(e)).toEqual({ ok: false, error: e })
  })

  it('narrows value after checking ok', () => {
    const r: Result<string, AppError> = ok('hello')
    if (!r.ok) throw new Error('expected ok')
    expect(r.value.toUpperCase()).toBe('HELLO')
  })

  it('narrows error after checking !ok', () => {
    const e: AppError = { kind: 'conflict', reason: 'duplicate' }
    const r: Result<string, AppError> = err(e)
    if (r.ok) throw new Error('expected err')
    expect(r.error.kind).toBe('conflict')
  })
})

describe('isTransient', () => {
  it('returns true for upstream 408, 429, and 5xx', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      const e: AppError = { kind: 'upstream', service: 'vapi', status }
      expect(isTransient(e)).toBe(true)
    }
  })

  it('returns false for upstream 4xx other than 408/429', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      const e: AppError = { kind: 'upstream', service: 'wundergraph', status }
      expect(isTransient(e)).toBe(false)
    }
  })

  it('returns false for non-upstream kinds', () => {
    const cases: AppError[] = [
      { kind: 'validation', field: 'email', reason: 'required' },
      { kind: 'not_found', entity: 'briefing', id: 'b1' },
      { kind: 'conflict', reason: 'duplicate' },
      { kind: 'internal' },
    ]
    for (const e of cases) expect(isTransient(e)).toBe(false)
  })
})

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns ok on first success without retrying', async () => {
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

  it('stops after maxAttempts and surfaces the last error', async () => {
    const op = vi.fn(async (): Promise<Result<number, AppError>> => err(upstream(502)))

    const promise = withRetry(op, { maxAttempts: 3, baseMs: 10 })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error).toEqual(upstream(502))
    expect(op).toHaveBeenCalledTimes(3)
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

  it('never retries a permanent error', async () => {
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

  it('never retries an internal error', async () => {
    const op = vi.fn(async (): Promise<Result<number, AppError>> => err({ kind: 'internal' }))

    const promise = withRetry(op, { maxAttempts: 5 })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.ok).toBe(false)
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('never retries upstream 4xx other than 408/429', async () => {
    const op = vi.fn(async (): Promise<Result<number, AppError>> => err(upstream(404)))

    const promise = withRetry(op, { maxAttempts: 5, baseMs: 10 })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.ok).toBe(false)
    expect(op).toHaveBeenCalledTimes(1)
  })
})
