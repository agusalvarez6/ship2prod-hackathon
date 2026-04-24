import { describe, expect, it } from 'vitest'

import type { AppError } from '../src/AppError.js'
import { err, ok, type Result } from '../src/Result.js'

const double = (r: Result<number, AppError>): Result<number, AppError> =>
  r.ok ? ok(r.value * 2) : r

describe('Result helpers', () => {
  it('ok wraps a value with ok: true', () => {
    const r = ok(5)
    expect(r).toEqual({ ok: true, value: 5 })
  })

  it('err wraps an error with ok: false', () => {
    const e: AppError = { kind: 'not_found', entity: 'briefing', id: 'b1' }
    const r = err(e)
    expect(r).toEqual({ ok: false, error: e })
  })

  it('narrows value side after checking ok', () => {
    const r: Result<string, AppError> = ok('hello')
    if (r.ok) {
      expect(r.value.toUpperCase()).toBe('HELLO')
    } else {
      throw new Error('expected ok')
    }
  })

  it('narrows error side after checking !ok', () => {
    const e: AppError = { kind: 'conflict', reason: 'duplicate' }
    const r: Result<string, AppError> = err(e)
    if (!r.ok) {
      expect(r.error.kind).toBe('conflict')
    } else {
      throw new Error('expected err')
    }
  })

  it('composes through a map-like helper', () => {
    const a = double(ok(3))
    expect(a).toEqual({ ok: true, value: 6 })

    const e: AppError = { kind: 'internal' }
    const b = double(err(e))
    expect(b).toEqual({ ok: false, error: e })
  })

  it('supports custom error types via Result<T, E>', () => {
    type Mine = { code: 'X' }
    const r: Result<number, Mine> = err({ code: 'X' })
    if (!r.ok) {
      expect(r.error.code).toBe('X')
    }
  })
})
