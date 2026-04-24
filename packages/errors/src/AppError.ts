export type AppError =
  | { kind: 'validation'; field: string; reason: string }
  | { kind: 'not_found'; entity: string; id: string }
  | {
      kind: 'upstream'
      service: 'vapi' | 'tinyfish' | 'insforge' | 'wundergraph' | 'notion' | 'gcal' | 'openai'
      status: number
      retryAfterMs?: number
    }
  | { kind: 'conflict'; reason: string }
  | { kind: 'internal'; cause?: unknown }
