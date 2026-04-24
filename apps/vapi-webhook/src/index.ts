import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { captureRawBody, verifyVapiSignature } from './middleware/hmac.js'
import { claimIdempotency } from './middleware/idem.js'
import { handleWebhook } from './routes/webhook.js'

export function createApp(): Hono {
  const app = new Hono()

  app.get('/health', (c) => c.json({ ok: true }, 200))

  app.post('/webhooks/vapi', captureRawBody, verifyVapiSignature(), claimIdempotency(), handleWebhook)

  return app
}

export const app = createApp()

const port = Number(process.env['PORT'] ?? 8787)

if (process.env['NODE_ENV'] !== 'test') {
  serve({ fetch: app.fetch, port })
  console.warn(`vapi-webhook listening on :${port}`)
}
