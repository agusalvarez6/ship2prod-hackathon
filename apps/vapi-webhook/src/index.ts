import { DEMO_USER_ID, createPostgresNextMeetingRepository } from './precallbot/nextMeeting.js'
import { createAppServer } from './server.js'

const port = Number.parseInt(process.env.PORT ?? '8787', 10)
const databaseUrl = process.env.DATABASE_URL
const repository = databaseUrl ? createPostgresNextMeetingRepository({ databaseUrl }) : null

const server = createAppServer({
  repository,
  internalApiKey: process.env.PRECALL_INTERNAL_API_KEY ?? null,
  defaultUserId: process.env.PRECALL_DEFAULT_USER_ID ?? DEMO_USER_ID,
})

server.listen(port, () => {
  process.stdout.write(`vapi-webhook listening on :${port}\n`)
})

const shutdown = async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
  await repository?.close?.()
}

process.on('SIGINT', () => {
  void shutdown().then(() => process.exit(0))
})

process.on('SIGTERM', () => {
  void shutdown().then(() => process.exit(0))
})
