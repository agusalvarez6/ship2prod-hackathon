/* global Deno */

const INSFORGE_BASE_URL = 'https://z5bpjses.us-west.insforge.app'
const DEMO_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const EXPECTED_TOKEN_SHA256 = 'b0ec7dbff82bb504edf7d096ebb434adcb571585c5b617665911467e78da284c'
const MAX_BODY_BYTES = 64 * 1024

module.exports = async function (request) {
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, X-PreCall-Api-Key',
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  if (!(await isAuthorized(request))) {
    return json({ error: 'unauthorized', message: 'Unauthorized' }, 401, headers)
  }

  try {
    if (request.method === 'GET') {
      const url = new URL(request.url)
      return json(
        await loadNextMeeting({
          userId: url.searchParams.get('userId') ?? undefined,
          phoneNumber: url.searchParams.get('phoneNumber') ?? undefined,
          email: url.searchParams.get('email') ?? undefined,
        }),
        200,
        headers,
      )
    }

    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed', message: 'Method not allowed' }, 405, headers)
    }

    const parsedBody = await readJsonObject(request)
    if (!parsedBody.ok) {
      return json(
        { error: parsedBody.error, message: parsedBody.message },
        parsedBody.status,
        headers,
      )
    }

    const body = parsedBody.value
    const calls = extractVapiToolCalls(body).filter((call) => call.name === 'getNextMeeting')
    const callerPhoneNumber = extractVapiCallerNumber(body)

    if (calls.length === 0) {
      return json(
        await loadNextMeeting({
          userId: typeof body.userId === 'string' ? body.userId : undefined,
          phoneNumber: typeof body.phoneNumber === 'string' ? body.phoneNumber : undefined,
          email: typeof body.email === 'string' ? body.email : undefined,
        }),
        200,
        headers,
      )
    }

    const results = []
    for (const call of calls) {
      results.push({
        toolCallId: call.id,
        result: await loadNextMeeting(
          {
            phoneNumber: callerPhoneNumber ?? undefined,
          },
          { allowDefaultUser: false },
        ),
      })
    }

    return json({ results }, 200, headers)
  } catch (error) {
    return json(
      {
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
      500,
      headers,
    )
  }
}

async function loadNextMeeting(input, options = {}) {
  const { createClient } = await import('npm:@insforge/sdk')
  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL') || INSFORGE_BASE_URL,
    anonKey: Deno.env.get('ANON_KEY'),
  })

  const now = new Date()
  const user = await resolveUser(client, input, options)
  if (!user) {
    return { meeting: null, voiceSummary: 'I do not see an upcoming meeting for this caller.' }
  }

  const { data: meetings, error: meetingError } = await client.database
    .from('meetings')
    .select('*')
    .eq('user_id', user.id)
    .gte('starts_at', now.toISOString())
    .order('starts_at', { ascending: true })
    .limit(1)

  if (meetingError) throw new Error(`meeting lookup failed: ${meetingError.message}`)

  const meetingRow = Array.isArray(meetings) ? meetings[0] : null
  if (!meetingRow) {
    return { meeting: null, voiceSummary: 'I do not see an upcoming meeting for this caller.' }
  }

  const { data: briefings, error: briefingError } = await client.database
    .from('briefings')
    .select('*')
    .eq('meeting_id', meetingRow.id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (briefingError) throw new Error(`briefing lookup failed: ${briefingError.message}`)

  const meeting = rowToNextMeeting(
    meetingRow,
    Array.isArray(briefings) ? (briefings[0] ?? null) : null,
    user.email,
    now,
  )

  return { meeting, voiceSummary: summarizeForVoice(meeting) }
}

async function resolveUser(client, input, options = {}) {
  const userId = typeof input.userId === 'string' && input.userId ? input.userId : null
  if (userId) {
    const { data, error } = await client.database
      .from('users')
      .select('id,email')
      .eq('id', userId)
      .limit(1)
    if (error) throw new Error(`user lookup failed: ${error.message}`)
    if (Array.isArray(data) && data[0]) return data[0]
  }

  const phoneNumber = normalizePhoneNumberE164(
    typeof input.phoneNumber === 'string' ? input.phoneNumber : '',
  )
  if (phoneNumber) {
    const { data, error } = await client.database
      .from('users')
      .select('id,email')
      .eq('phone_number_e164', phoneNumber)
      .limit(1)
    if (error) throw new Error(`user lookup failed: ${error.message}`)
    if (Array.isArray(data) && data[0]) return data[0]
  }

  if (typeof input.email === 'string' && input.email) {
    const { data, error } = await client.database
      .from('users')
      .select('id,email')
      .eq('email', input.email)
      .limit(1)
    if (error) throw new Error(`user lookup failed: ${error.message}`)
    if (Array.isArray(data) && data[0]) return data[0]
  }

  if (options.allowDefaultUser === false) return null

  const defaultUserId = Deno.env.get('PRECALL_DEFAULT_USER_ID') || DEMO_USER_ID
  if (defaultUserId) {
    const { data, error } = await client.database
      .from('users')
      .select('id,email')
      .eq('id', defaultUserId)
      .limit(1)
    if (error) throw new Error(`user lookup failed: ${error.message}`)
    if (Array.isArray(data) && data[0]) return data[0]
  }

  return null
}

function rowToNextMeeting(meetingRow, briefingRow, userEmail, now) {
  const attendees = Array.isArray(meetingRow.attendees) ? meetingRow.attendees : []
  const external = firstExternalAttendee(attendees, userEmail)
  const contactEmail = briefingRow?.contact_email || external?.email || null
  const contactName =
    briefingRow?.contact_name || external?.displayName || inferPersonName(contactEmail)
  const companyDomain = briefingRow?.company_domain || inferCompanyDomain(contactEmail)
  const sections = isRecord(briefingRow?.sections) ? briefingRow.sections : null
  const startsAt = new Date(meetingRow.starts_at).toISOString()

  return {
    id: meetingRow.id,
    title: meetingRow.title,
    startsAt,
    startsInMinutes: minutesUntil(startsAt, now),
    description: meetingRow.description || null,
    attendees: attendees.map((attendee) => ({
      email: attendee.email,
      displayName: attendee.displayName || null,
      organizer: typeof attendee.organizer === 'boolean' ? attendee.organizer : null,
    })),
    contact: {
      name: contactName || null,
      email: contactEmail || null,
      role: briefingRow?.contact_role || null,
    },
    company: {
      name: briefingRow?.company_name || inferCompanyName(companyDomain),
      domain: companyDomain || null,
      summary: briefingRow?.company_summary || null,
    },
    briefing: briefingRow
      ? {
          id: briefingRow.id,
          status: briefingRow.status || 'pending',
          summary60s: briefingRow.summary_60s || sections?.summary60s || null,
          suggestedOpeningLine: sections?.suggestedOpeningLine || null,
          questionsToAsk: stringArray(sections?.questionsToAsk),
          likelyPainPoints: stringArray(sections?.likelyPainPoints),
          risks: stringArray(sections?.risks),
          followUpEmail: sections?.followUpEmail || null,
        }
      : null,
  }
}

function extractVapiToolCalls(value) {
  if (!isRecord(value)) return []
  const message = isRecord(value.message) ? value.message : value
  const directCalls = Array.isArray(message.toolCallList) ? message.toolCallList : []

  if (directCalls.length > 0) {
    return directCalls.flatMap((item) => {
      if (!isRecord(item)) return []
      const functionCall = isRecord(item.function) ? item.function : {}
      const id = item.id
      const name = item.name || functionCall.name
      if (typeof id !== 'string' || typeof name !== 'string') return []
      return [
        {
          id,
          name,
          parameters:
            parseParameters(item.arguments) ||
            parseParameters(item.parameters) ||
            parseParameters(functionCall.arguments) ||
            parseParameters(functionCall.parameters) ||
            {},
        },
      ]
    })
  }

  const toolWithCalls = Array.isArray(message.toolWithToolCallList)
    ? message.toolWithToolCallList
    : []

  return toolWithCalls.flatMap((item) => {
    if (!isRecord(item) || !isRecord(item.toolCall)) return []
    const functionCall = isRecord(item.toolCall.function) ? item.toolCall.function : {}
    const id = item.toolCall.id
    const name = item.name || functionCall.name
    if (typeof id !== 'string' || typeof name !== 'string') return []
    return [
      {
        id,
        name,
        parameters:
          parseParameters(item.toolCall.parameters) ||
          parseParameters(functionCall.arguments) ||
          parseParameters(functionCall.parameters) ||
          {},
      },
    ]
  })
}

function extractVapiCallerNumber(value) {
  if (!isRecord(value)) return null
  const message = isRecord(value.message) ? value.message : value
  const candidates = [
    nestedString(message, ['call', 'customer', 'number']),
    nestedString(value, ['call', 'customer', 'number']),
    nestedString(message, ['customer', 'number']),
    nestedString(value, ['customer', 'number']),
    nestedString(message, ['call', 'phoneCallProviderDetails', 'from']),
    nestedString(value, ['call', 'phoneCallProviderDetails', 'from']),
  ]
  return candidates.find((candidate) => candidate && candidate.trim()) || null
}

function nestedString(value, path) {
  let current = value
  for (const key of path) {
    if (!isRecord(current)) return null
    current = current[key]
  }
  return typeof current === 'string' ? current : null
}

function normalizePhoneNumberE164(input) {
  const trimmed = input.trim()
  if (!trimmed || /[A-Za-z]/.test(trimmed)) return null
  const digits = trimmed.replace(/\D/g, '')
  const normalized = trimmed.startsWith('+')
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : digits.length === 11 && digits.startsWith('1')
        ? `+${digits}`
        : null
  return normalized && /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null
}

function parseParameters(value) {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function isAuthorized(request) {
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : request.headers.get('x-precall-api-key') || ''
  const expectedHash = Deno.env.get('PRECALL_INTERNAL_API_KEY_SHA256') || EXPECTED_TOKEN_SHA256
  return constantTimeEqual(await sha256Hex(token), expectedHash)
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function readJsonObject(request) {
  const text = await request.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return {
      ok: false,
      status: 413,
      error: 'payload_too_large',
      message: 'Request body is too large',
    }
  }

  try {
    const parsed = text ? JSON.parse(text) : {}
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

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}

function summarizeForVoice(meeting) {
  if (!meeting) return 'I do not see an upcoming meeting for this caller.'
  const contact = meeting.contact.name ? ` with ${meeting.contact.name}` : ''
  const company = meeting.company.name ? ` from ${meeting.company.name}` : ''
  const minutes =
    meeting.startsInMinutes <= 1
      ? 'starting now'
      : `starting in about ${meeting.startsInMinutes} minutes`
  const summary = meeting.briefing?.summary60s
    ? ` Briefing: ${meeting.briefing.summary60s}`
    : ' I do not see a generated briefing yet, so use the calendar details only.'
  const opener = meeting.briefing?.suggestedOpeningLine
    ? ` Suggested opener: ${meeting.briefing.suggestedOpeningLine}`
    : ''
  return `Next meeting: ${meeting.title}${contact}${company}, ${minutes}.${summary}${opener}`
}

function firstExternalAttendee(attendees, userEmail) {
  const userDomain = inferCompanyDomain(userEmail)
  return (
    attendees.find((attendee) => {
      if (!attendee.email || attendee.email.toLowerCase() === userEmail.toLowerCase()) return false
      return inferCompanyDomain(attendee.email) !== userDomain
    }) ||
    attendees.find(
      (attendee) => attendee.email && attendee.email.toLowerCase() !== userEmail.toLowerCase(),
    ) ||
    null
  )
}

function inferPersonName(email) {
  const localPart = email?.split('@')[0]
  if (!localPart) return null
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function inferCompanyDomain(email) {
  const domain = email?.split('@')[1]?.toLowerCase()
  if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain)) return null
  return domain
}

function inferCompanyName(domain) {
  const label = domain?.split('.')[0]
  if (!label) return null
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function minutesUntil(startsAt, now) {
  return Math.max(0, Math.round((new Date(startsAt).getTime() - now.getTime()) / 60_000))
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function json(value, status, headers) {
  return new Response(JSON.stringify(value), { status, headers })
}

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'icloud.com',
  'me.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'proton.me',
  'protonmail.com',
])
