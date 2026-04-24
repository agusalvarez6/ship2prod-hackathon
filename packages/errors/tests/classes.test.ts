import { describe, expect, it } from 'vitest'

import { PermanentError, TransientError, UserInputError } from '../src/classes.js'

describe('error classes', () => {
  it('TransientError carries message and maps to upstream AppError', () => {
    const e = new TransientError('vapi 503', { service: 'vapi', status: 503 })
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe('vapi 503')
    expect(e.name).toBe('TransientError')

    const app = e.toAppError()
    expect(app).toEqual({ kind: 'upstream', service: 'vapi', status: 503 })
  })

  it('TransientError honors retryAfterMs when provided', () => {
    const e = new TransientError('tinyfish 429', {
      service: 'tinyfish',
      status: 429,
      retryAfterMs: 1500,
    })
    const app = e.toAppError()
    expect(app).toEqual({
      kind: 'upstream',
      service: 'tinyfish',
      status: 429,
      retryAfterMs: 1500,
    })
  })

  it('PermanentError maps to internal AppError with optional cause', () => {
    const cause = new Error('root cause')
    const e = new PermanentError('bad state', { cause })
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('PermanentError')

    const app = e.toAppError()
    expect(app.kind).toBe('internal')
    if (app.kind === 'internal') {
      expect(app.cause).toBe(cause)
    }
  })

  it('PermanentError without cause still round-trips', () => {
    const e = new PermanentError('no cause')
    const app = e.toAppError()
    expect(app).toEqual({ kind: 'internal' })
  })

  it('UserInputError maps to validation AppError', () => {
    const e = new UserInputError('email required', { field: 'email', reason: 'required' })
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('UserInputError')

    const app = e.toAppError()
    expect(app).toEqual({ kind: 'validation', field: 'email', reason: 'required' })
  })

  it('each class has a code that lines up with an AppError kind', () => {
    expect(new TransientError('x', { service: 'vapi', status: 500 }).code).toBe('upstream')
    expect(new PermanentError('y').code).toBe('internal')
    expect(new UserInputError('z', { field: 'a', reason: 'b' }).code).toBe('validation')
  })
})
