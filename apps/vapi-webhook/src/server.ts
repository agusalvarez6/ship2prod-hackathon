import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { Buffer } from 'node:buffer'

import {
  DEMO_USER_ID,
  parseNextMeetingLookup,
  summarizeForVoice,
  type NextMeetingLookupInput,
  type NextMeetingRepository,
} from './precallbot/nextMeeting.js'

const MAX_BODY_BYTES = 64 * 1024

class PayloadTooLargeError extends Error {}

export interface AppOptions {
  repository: NextMeetingRepository | null
  internalApiKey: string | null
  defaultUserId?: string | null
  now?: () => Date
}

interface VapiToolCall {
  id: string
  name: string
  parameters: Record<string, unknown>
}

export function createAppServer(options: AppOptions) {
  return createHttpServer(async (req, res) => {
    try {
      const request = await nodeRequestToWebRequest(req)
      const response = await handleRequest(request, options)
      await writeWebResponse(res, response)
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        await writeWebResponse(
          res,
          jsonResponse({ error: 'payload_too_large', message: 'Request body is too large' }, 413),
        )
        return
      }

      await writeWebResponse(
        res,
        jsonResponse({ error: 'internal_error', message: 'Internal server error' }, 500),
      )
    }
  })
}

export async function handleRequest(request: Request, options: AppOptions): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/health') {
    return jsonResponse({ status: 'ok' })
  }

  if (url.pathname === '/api/meetings/next') {
    if (!isAuthorized(request, options.internalApiKey)) {
      return jsonResponse({ error: 'unauthorized', message: 'Unauthorized' }, 401)
    }
    if (request.method === 'GET') return handleNextMeetingGet(url, options)
    if (request.method === 'POST') return handleNextMeetingPost(request, options)
    return jsonResponse({ error: 'method_not_allowed', message: 'Method not allowed' }, 405)
  }

  if (url.pathname === '/vapi/tools/get-next-meeting') {
    if (!isAuthorized(request, options.internalApiKey)) {
      return jsonResponse({ error: 'unauthorized', message: 'Unauthorized' }, 401)
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed', message: 'Method not allowed' }, 405)
    }
    return handleVapiGetNextMeetingTool(request, options)
  }

  return jsonResponse({ error: 'not_found', message: 'Not found' }, 404)
}

async function handleNextMeetingGet(url: URL, options: AppOptions): Promise<Response> {
  return loadNextMeeting(
    buildLookupInput(url.searchParams.get('userId'), url.searchParams.get('email')),
    options,
  )
}

async function handleNextMeetingPost(request: Request, options: AppOptions): Promise<Response> {
  const body = await readJsonObject(request)
  if (!body.ok) return jsonResponse({ error: body.error, message: body.message }, body.status)

  return loadNextMeeting(
    buildLookupInput(getString(body.value, 'userId'), getString(body.value, 'email')),
    options,
  )
}

async function loadNextMeeting(
  input: NextMeetingLookupInput,
  options: AppOptions,
): Promise<Response> {
  if (!options.repository) {
    return jsonResponse(
      {
        error: 'meeting_repository_unavailable',
        message: 'Meeting lookup is not configured.',
      },
      503,
    )
  }

  const parsed = parseNextMeetingLookup(input, {
    defaultUserId: options.defaultUserId ?? DEMO_USER_ID,
    now: options.now?.() ?? new Date(),
  })

  if (!parsed.ok) {
    return jsonResponse({ error: 'invalid_request', message: parsed.message }, parsed.status)
  }

  const meeting = await options.repository.findNextMeeting(parsed.lookup)
  return jsonResponse({
    meeting,
    voiceSummary: summarizeForVoice(meeting),
  })
}

async function handleVapiGetNextMeetingTool(
  request: Request,
  options: AppOptions,
): Promise<Response> {
  const body = await readJsonObject(request)
  if (!body.ok) return jsonResponse({ results: [] }, 200)

  const calls = extractVapiToolCalls(body.value).filter((call) => call.name === 'getNextMeeting')

  const results = await Promise.all(
    calls.map(async (call) => {
      const response = await loadNextMeeting(
        buildLookupInput(getString(call.parameters, 'userId'), getString(call.parameters, 'email')),
        options,
      )

      return {
        toolCallId: call.id,
        result: await response.json(),
      }
    }),
  )

  return jsonResponse({ results })
}

export function extractVapiToolCalls(value: unknown): VapiToolCall[] {
  if (!isRecord(value)) return []

  const message = isRecord(value.message) ? value.message : value
  const directCalls = Array.isArray(message.toolCallList) ? message.toolCallList : []

  if (directCalls.length > 0) {
    return directCalls.flatMap((item) => {
      if (!isRecord(item)) return []
      const id = getString(item, 'id')
      const name = getString(item, 'name')
      if (!id || !name) return []
      const parameters = getRecord(item, 'arguments') ?? getRecord(item, 'parameters') ?? {}
      return [{ id, name, parameters }]
    })
  }

  const toolWithCalls = Array.isArray(message.toolWithToolCallList)
    ? message.toolWithToolCallList
    : []

  return toolWithCalls.flatMap((item) => {
    if (!isRecord(item)) return []
    const toolCall = getRecord(item, 'toolCall')
    if (!toolCall) return []

    const functionCall = getRecord(toolCall, 'function')
    const id = getString(toolCall, 'id')
    const name = getString(item, 'name') ?? getString(functionCall ?? {}, 'name')
    if (!id || !name) return []

    const parameters =
      getRecord(toolCall, 'parameters') ?? getRecord(functionCall ?? {}, 'parameters') ?? {}

    return [{ id, name, parameters }]
  })
}

function isAuthorized(request: Request, internalApiKey: string | null): boolean {
  if (!internalApiKey) return false

  const authorization = request.headers.get('authorization')
  if (authorization === `Bearer ${internalApiKey}`) return true

  return request.headers.get('x-precall-api-key') === internalApiKey
}

async function readJsonObject(
  request: Request,
): Promise<
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: 400 | 413; error: string; message: string }
> {
  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    return {
      ok: false,
      status: 413,
      error: 'payload_too_large',
      message: 'Request body is too large',
    }
  }

  try {
    const parsed: unknown = text ? JSON.parse(text) : {}
    if (!isRecord(parsed)) {
      return {
        ok: false,
        status: 400,
        error: 'invalid_json',
        message: 'Request body must be a JSON object',
      }
    }
    return { ok: true, value: parsed }
  } catch {
    return { ok: false, status: 400, error: 'invalid_json', message: 'Request body is not JSON' }
  }
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

async function nodeRequestToWebRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `http://${host}`)
  const headers = new Headers()

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else if (typeof value === 'string') {
      headers.set(key, value)
    }
  }

  const method = req.method ?? 'GET'
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readIncomingBody(req)
  const init: RequestInit = {
    method,
    headers,
  }

  if (body && body.length > 0) {
    init.body = body
  }

  return new Request(url, init)
}

async function readIncomingBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let bytes = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > MAX_BODY_BYTES) {
      req.destroy()
      throw new PayloadTooLargeError('payload_too_large')
    }
    chunks.push(buffer)
  }

  return Buffer.concat(chunks)
}

async function writeWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  const body = Buffer.from(await response.arrayBuffer())
  res.end(body)
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function getRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key]
  return isRecord(value) ? value : null
}

function buildLookupInput(userId: string | null | undefined, email: string | null | undefined) {
  const input: NextMeetingLookupInput = {}
  if (userId) input.userId = userId
  if (email) input.email = email
  return input
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
