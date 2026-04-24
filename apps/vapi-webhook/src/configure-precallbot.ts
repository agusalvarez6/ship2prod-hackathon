import {
  buildGetNextMeetingToolConfig,
  buildPreCallBotAssistantConfig,
  normalizeBaseUrl,
} from './precallbot/vapiConfig.js'

const VAPI_API_BASE_URL = 'https://api.vapi.ai'

interface VapiObject {
  id?: string
}

async function main(): Promise<void> {
  const privateKey = requiredEnv('VAPI_PRIVATE_KEY')
  const toolUrl = process.env.PRECALL_TOOL_URL ?? null
  const publicBaseUrl = toolUrl ? null : resolvePublicBaseUrl()
  const internalApiKey = requiredEnv('PRECALL_INTERNAL_API_KEY')
  const toolConfig = buildGetNextMeetingToolConfig({ publicBaseUrl, toolUrl, internalApiKey })
  const existingToolId = process.env.VAPI_PRECALLBOT_TOOL_ID

  const toolId =
    existingToolId ??
    (await createVapiResource(privateKey, '/tool', {
      body: toolConfig,
      label: 'getNextMeeting tool',
    }))

  if (existingToolId) {
    await updateVapiResource(privateKey, `/tool/${existingToolId}`, toToolUpdateConfig(toolConfig))
  }

  const assistantConfig = buildPreCallBotAssistantConfig({ toolId })
  const assistantId = process.env.VAPI_ASSISTANT_ID

  if (assistantId) {
    await updateVapiResource(privateKey, `/assistant/${assistantId}`, assistantConfig)
    process.stdout.write(
      `Updated PreCallBot assistant ${assistantId} with getNextMeeting tool ${toolId}\n`,
    )
    return
  }

  const createdAssistantId = await createVapiResource(privateKey, '/assistant', {
    body: assistantConfig,
    label: 'PreCallBot assistant',
  })
  process.stdout.write(
    `Created PreCallBot assistant ${createdAssistantId} with getNextMeeting tool ${toolId}\n`,
  )
}

async function createVapiResource(
  privateKey: string,
  path: string,
  options: { body: Record<string, unknown>; label: string },
): Promise<string> {
  const response = await vapiRequest(privateKey, path, 'POST', options.body)
  const id = response.id
  if (!id) throw new Error(`Vapi did not return an id for ${options.label}`)
  return id
}

async function updateVapiResource(
  privateKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  await vapiRequest(privateKey, path, 'PATCH', body)
}

async function vapiRequest(
  privateKey: string,
  path: string,
  method: 'POST' | 'PATCH',
  body: Record<string, unknown>,
): Promise<VapiObject> {
  const response = await fetch(`${VAPI_API_BASE_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${privateKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await response.text()
  const parsed: unknown = text ? JSON.parse(text) : {}

  if (!response.ok) {
    const message = isRecord(parsed) ? JSON.stringify(parsed) : text
    throw new Error(`Vapi ${method} ${path} failed with ${response.status}: ${message}`)
  }

  return isRecord(parsed) ? parsed : {}
}

function resolvePublicBaseUrl(): string {
  const explicit = process.env.PRECALL_PUBLIC_BASE_URL
  if (explicit) return normalizeBaseUrl(explicit)

  const webhookUrl = process.env.VAPI_WEBHOOK_URL
  if (webhookUrl) return normalizeBaseUrl(webhookUrl)

  throw new Error('PRECALL_PUBLIC_BASE_URL or VAPI_WEBHOOK_URL is required')
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function toToolUpdateConfig(toolConfig: Record<string, unknown>): Record<string, unknown> {
  const { type: _type, ...updateConfig } = toolConfig
  return updateConfig
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
