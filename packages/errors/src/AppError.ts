export type UpstreamService = 'vapi' | 'tinyfish' | 'insforge' | 'wundergraph' | 'redis'

export type AppError =
  | { kind: 'validation'; field: string; reason: string }
  | { kind: 'not_found'; entity: string; id: string }
  | {
      kind: 'upstream'
      service: UpstreamService
      status: number
      retryAfterMs?: number
    }
  | { kind: 'conflict'; reason: string }
  | { kind: 'internal'; cause?: unknown }
