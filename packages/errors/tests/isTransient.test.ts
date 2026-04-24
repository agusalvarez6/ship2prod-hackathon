import { describe, expect, it } from 'vitest'

import type { AppError } from '../src/AppError.js'
import { isTransient } from '../src/isTransient.js'

describe('isTransient', () => {
  it('returns true for upstream 408', () => {
    const e: AppError = { kind: 'upstream', service: 'vapi', status: 408 }
    expect(isTransient(e)).toBe(true)
  })

  it('returns true for upstream 429', () => {
    const e: AppError = { kind: 'upstream', service: 'tinyfish', status: 429 }
    expect(isTransient(e)).toBe(true)
  })

  it('returns true for every 5xx upstream status', () => {
    for (const status of [500, 502, 503, 504, 599]) {
      const e: AppError = { kind: 'upstream', service: 'insforge', status }
      expect(isTransient(e)).toBe(true)
    }
  })

  it('returns false for 4xx upstream other than 408 and 429', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      const e: AppError = { kind: 'upstream', service: 'wundergraph', status }
      expect(isTransient(e)).toBe(false)
    }
  })

  it('returns false for 2xx and 3xx upstream', () => {
    for (const status of [200, 201, 204, 301, 302]) {
      const e: AppError = { kind: 'upstream', service: 'redis', status }
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
    for (const e of cases) {
      expect(isTransient(e)).toBe(false)
    }
  })
})
