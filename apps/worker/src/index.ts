import { Redis } from 'ioredis'
import { createLLMClient, createTinyFishClient } from '@ship2prod/integrations'
import { REDIS_KEYS } from '@ship2prod/schema/redis'
import { ResearchJobPayloadSchema } from '@ship2prod/schema/jobs'
import { createPool } from './db.js'
import { runPipeline } from './pipeline.js'
import { emitProgress } from './progress.js'

const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379')
const pool = createPool()
const tinyfish = createTinyFishClient({ apiKey: process.env['TINYFISH_API_KEY'] ?? '' })
const llm = createLLMClient({ apiKey: process.env['GEMINI_API_KEY'] ?? '' })

let shuttingDown = false
let inflight = 0

async function main(): Promise<void> {
  while (!shuttingDown) {
    const raw = await redis.blmove(
      REDIS_KEYS.jobs.pending,
      REDIS_KEYS.jobs.processing,
      'RIGHT',
      'LEFT',
      5,
    )
    if (!raw) continue
    inflight++
    try {
      const job = ResearchJobPayloadSchema.parse(JSON.parse(raw))
      // eslint-disable-next-line no-console
      console.log(`worker: received job ${job.jobId} for briefing ${job.briefingId}`)
      await runPipeline(job, { tinyfish, llm, pool, redis, emitProgress })
    } finally {
      inflight--
    }
  }
}

function shutdown(signal: string): void {
  // eslint-disable-next-line no-console
  console.log(`worker: ${signal} received, draining ${inflight} inflight`)
  shuttingDown = true
  const check = setInterval(() => {
    if (inflight === 0) {
      clearInterval(check)
      void redis.quit().finally(() => process.exit(0))
    }
  }, 100)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

main().catch((err) => {
  console.error('worker: fatal', err)
  process.exit(1)
})
