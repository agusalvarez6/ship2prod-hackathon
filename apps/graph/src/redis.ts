import { Redis } from 'ioredis'

export function createRedis(
  url: string | undefined = process.env['REDIS_URL'] ?? process.env['REDIS_TEST_URL'],
): Redis {
  return url ? new Redis(url) : new Redis()
}
