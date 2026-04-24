import type { Context } from 'hono'

type VapiEnvelope = {
  message?: {
    type?: string
    [k: string]: unknown
  }
}

export async function handleWebhook(c: Context): Promise<Response> {
  const body = (await c.req.json().catch(() => ({}))) as VapiEnvelope
  const type = body.message?.type

  switch (type) {
    case 'tool-calls':
    case 'status-update':
    case 'end-of-call-report':
    case 'transcript':
    case 'hang':
    case 'speech-update':
    case 'conversation-update':
    case 'user-interrupted':
    case 'assistant-request':
      return c.json({ ok: true }, 200)
    default:
      return c.json({ ok: true }, 200)
  }
}
