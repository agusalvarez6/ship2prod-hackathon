import type { Redis } from 'ioredis'
import type { Pool } from 'pg'
import { createPool } from './db.js'
import { createRedis } from './redis.js'

export interface GraphContext {
  db: Pool
  redis: Redis
  user?: unknown
}

export type BuildContext = (req: Request) => Promise<GraphContext>

export function createBuildContext(): BuildContext {
  const db = createPool()
  const redis = createRedis()
  return async (_req: Request): Promise<GraphContext> => ({ db, redis })
}
