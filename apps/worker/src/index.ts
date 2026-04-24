import { Redis } from 'ioredis'
import { REDIS_KEYS, type ResearchJobPayload } from '@ship2prod/schema'
import { runPipeline } from './pipeline.js'

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
const BLMOVE_TIMEOUT_SECONDS = 5

async function main(): Promise<void> {
  const redis = new Redis(REDIS_URL)
  let shuttingDown = false
  let inFlight = 0

  const shutdown = (): void => {
    shuttingDown = true
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  while (!shuttingDown) {
    const raw = await redis.blmove(
      REDIS_KEYS.jobs.pending,
      REDIS_KEYS.jobs.processing,
      'RIGHT',
      'LEFT',
      BLMOVE_TIMEOUT_SECONDS,
    )
    if (!raw) continue
    inFlight += 1
    try {
      const job = JSON.parse(raw) as ResearchJobPayload
      await runPipeline(job)
    } catch (err) {
      console.error('pipeline error', err)
    } finally {
      inFlight -= 1
    }
  }

  while (inFlight > 0) {
    await new Promise((r) => setTimeout(r, 100))
  }
  await redis.quit()
}

main().catch((err) => {
  console.error('worker fatal', err)
  process.exit(1)
})
