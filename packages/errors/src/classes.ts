import type { AppError, UpstreamService } from './AppError.js'

export interface TransientInit {
  service: UpstreamService
  status: number
  retryAfterMs?: number
}

export class TransientError extends Error {
  readonly code = 'upstream' as const
  readonly service: UpstreamService
  readonly status: number
  readonly retryAfterMs: number | undefined

  constructor(message: string, init: TransientInit) {
    super(message)
    this.name = 'TransientError'
    this.service = init.service
    this.status = init.status
    this.retryAfterMs = init.retryAfterMs
  }

  toAppError(): AppError {
    if (this.retryAfterMs !== undefined) {
      return {
        kind: 'upstream',
        service: this.service,
        status: this.status,
        retryAfterMs: this.retryAfterMs,
      }
    }
    return { kind: 'upstream', service: this.service, status: this.status }
  }
}

export interface PermanentInit {
  cause?: unknown
}

export class PermanentError extends Error {
  readonly code = 'internal' as const
  override readonly cause: unknown

  constructor(message: string, init: PermanentInit = {}) {
    super(message)
    this.name = 'PermanentError'
    this.cause = init.cause
  }

  toAppError(): AppError {
    if (this.cause !== undefined) {
      return { kind: 'internal', cause: this.cause }
    }
    return { kind: 'internal' }
  }
}

export interface UserInputInit {
  field: string
  reason: string
}

export class UserInputError extends Error {
  readonly code = 'validation' as const
  readonly field: string
  readonly reason: string

  constructor(message: string, init: UserInputInit) {
    super(message)
    this.name = 'UserInputError'
    this.field = init.field
    this.reason = init.reason
  }

  toAppError(): AppError {
    return { kind: 'validation', field: this.field, reason: this.reason }
  }
}
