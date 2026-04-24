import type { Redis } from 'ioredis'
import {
  REDIS_KEYS,
  REDIS_STREAM,
  REDIS_TTL,
  type BriefingId,
  type ProgressEvent,
} from '@ship2prod/schema'

export async function emitProgress(
  redis: Redis,
  briefingId: BriefingId,
  event: ProgressEvent,
): Promise<void> {
  const key = REDIS_KEYS.progress(briefingId)
  await redis.xadd(
    key,
    'MAXLEN',
    '~',
    REDIS_STREAM.progress.maxLen,
    '*',
    REDIS_STREAM.progress.field.step,
    event.step,
    REDIS_STREAM.progress.field.pct,
    String(event.pct),
    REDIS_STREAM.progress.field.detail,
    event.detail ?? '',
    REDIS_STREAM.progress.field.at,
    String(event.at),
  )
  await redis.expire(key, REDIS_TTL.progress)
}
