import { Redis } from 'ioredis'
import type { ProgressEvent } from '@ship2prod/schema/jobs'
import type { BriefingId } from '@ship2prod/schema/ids'
import { REDIS_KEYS, REDIS_STREAM, REDIS_TTL } from '@ship2prod/schema/redis'

const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379')

export async function emitProgress(briefingId: BriefingId, event: ProgressEvent): Promise<void> {
  const key = REDIS_KEYS.progress(briefingId)
  await redis.xadd(
    key,
    'MAXLEN',
    '~',
    String(REDIS_STREAM.progress.maxLen),
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
