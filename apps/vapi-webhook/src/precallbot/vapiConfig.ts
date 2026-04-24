import { PRECALLBOT_FIRST_MESSAGE, PRECALLBOT_NAME, PRECALLBOT_SYSTEM_PROMPT } from './prompt.js'

export interface ToolConfigOptions {
  publicBaseUrl?: string | null
  toolUrl?: string | null
  internalApiKey: string | null
}

export interface AssistantConfigOptions {
  toolId: string
}

type JsonObject = Record<string, unknown>

export function buildGetNextMeetingToolConfig(options: ToolConfigOptions): JsonObject {
  const server: JsonObject = {
    url: resolveToolUrl(options),
  }

  if (options.internalApiKey) {
    server.headers = {
      Authorization: `Bearer ${options.internalApiKey}`,
    }
  }

  return {
    type: 'function',
    function: {
      name: 'getNextMeeting',
      description:
        "Retrieves the caller's next upcoming meeting, inferred attendee and company, and any generated PreCall briefing.",
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    server,
    messages: [
      {
        type: 'request-start',
        content: 'One moment while I check your next meeting.',
      },
      {
        type: 'request-failed',
        content: "I couldn't reach the meeting service right now.",
      },
    ],
  }
}

export function buildPreCallBotAssistantConfig(options: AssistantConfigOptions): JsonObject {
  return {
    name: PRECALLBOT_NAME,
    firstMessage: PRECALLBOT_FIRST_MESSAGE,
    firstMessageMode: 'assistant-speaks-first-with-model-generated-message',
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: PRECALLBOT_SYSTEM_PROMPT,
        },
      ],
      toolIds: [options.toolId],
    },
    voice: {
      provider: '11labs',
      voiceId: '21m00Tcm4TlvDq8ikWAM',
    },
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en',
    },
    serverMessages: ['tool-calls', 'end-of-call-report', 'status-update'],
    metadata: {
      app: 'precall',
      agent: PRECALLBOT_NAME,
      tool: 'getNextMeeting',
    },
  }
}

export function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  if (url.pathname === '/vapi/webhook') {
    url.pathname = '/'
  }
  return url.toString()
}

function resolveToolUrl(options: ToolConfigOptions): string {
  if (options.toolUrl) return new URL(options.toolUrl).toString()
  if (!options.publicBaseUrl) {
    throw new Error('PRECALL_TOOL_URL or PRECALL_PUBLIC_BASE_URL is required')
  }
  return new URL('/vapi/tools/get-next-meeting', normalizeBaseUrl(options.publicBaseUrl)).toString()
}
