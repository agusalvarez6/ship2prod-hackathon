import { describe, expect, expectTypeOf, it } from 'vitest'

import type { AppError } from '../src/AppError.js'

describe('AppError discriminated union', () => {
  it('narrows validation variant by kind', () => {
    const e: AppError = { kind: 'validation', field: 'amount', reason: 'must be positive' }
    if (e.kind === 'validation') {
      expectTypeOf(e.field).toEqualTypeOf<string>()
      expectTypeOf(e.reason).toEqualTypeOf<string>()
    }
    expect(e.kind).toBe('validation')
  })

  it('narrows not_found variant by kind', () => {
    const e: AppError = { kind: 'not_found', entity: 'briefing', id: 'b_42' }
    if (e.kind === 'not_found') {
      expect(e.entity).toBe('briefing')
      expect(e.id).toBe('b_42')
    }
  })

  it('narrows upstream variant and exposes service + status', () => {
    const e: AppError = { kind: 'upstream', service: 'tinyfish', status: 503, retryAfterMs: 1000 }
    if (e.kind === 'upstream') {
      expectTypeOf(e.service).toEqualTypeOf<
        'vapi' | 'tinyfish' | 'insforge' | 'wundergraph' | 'redis'
      >()
      expectTypeOf(e.status).toEqualTypeOf<number>()
      expect(e.retryAfterMs).toBe(1000)
    }
  })

  it('allows upstream without retryAfterMs', () => {
    const e: AppError = { kind: 'upstream', service: 'vapi', status: 500 }
    if (e.kind === 'upstream') {
      expect(e.retryAfterMs).toBeUndefined()
    }
  })

  it('narrows conflict variant', () => {
    const e: AppError = { kind: 'conflict', reason: 'duplicate idempotency key' }
    if (e.kind === 'conflict') {
      expect(e.reason).toBe('duplicate idempotency key')
    }
  })

  it('narrows internal variant with optional cause', () => {
    const bare: AppError = { kind: 'internal' }
    const withCause: AppError = { kind: 'internal', cause: new Error('boom') }
    expect(bare.kind).toBe('internal')
    if (withCause.kind === 'internal') {
      expect(withCause.cause).toBeInstanceOf(Error)
    }
  })

  it('exhaustiveness check: switch over all kinds compiles', () => {
    const describe_ = (e: AppError): string => {
      switch (e.kind) {
        case 'validation':
          return `validation:${e.field}`
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
    expect(describe_({ kind: 'validation', field: 'x', reason: 'y' })).toBe('validation:x')
  })
})
