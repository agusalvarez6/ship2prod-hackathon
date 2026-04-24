import { readFileSync } from 'node:fs'

export const DEMO_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

export type BriefingStatus = 'pending' | 'researching' | 'drafting' | 'ready' | 'failed'

export interface MeetingAttendee {
  email: string
  displayName: string | null
  organizer: boolean | null
}

export interface MeetingContact {
  name: string | null
  email: string | null
  role: string | null
}

export interface MeetingCompany {
  name: string | null
  domain: string | null
  summary: string | null
}

export interface MeetingBriefing {
  id: string
  status: BriefingStatus
  summary60s: string | null
  suggestedOpeningLine: string | null
  questionsToAsk: string[]
  likelyPainPoints: string[]
  risks: string[]
  followUpEmail: string | null
}

export interface NextMeeting {
  id: string
  title: string
  startsAt: string
  startsInMinutes: number
  description: string | null
  attendees: MeetingAttendee[]
  contact: MeetingContact
  company: MeetingCompany
  briefing: MeetingBriefing | null
}

export interface NextMeetingLookup {
  userId: string | null
  email: string | null
  now: Date
}

export interface NextMeetingLookupInput {
  userId?: string
  email?: string
}

export interface NextMeetingRepository {
  findNextMeeting(lookup: NextMeetingLookup): Promise<NextMeeting | null>
}

export type LookupParseResult =
  | { ok: true; lookup: NextMeetingLookup }
  | { ok: false; status: 400; message: string }

interface LookupOptions {
  defaultUserId: string | null
  now: Date
}

interface MockMeetingStore {
  meetings: MockMeetingEntry[]
}

interface MockMeetingEntry {
  userId: string
  accountEmail: string
  meeting: MockMeeting
}

type MockMeeting = Omit<NextMeeting, 'startsInMinutes'> & {
  startsInMinutes?: number
}

const DEFAULT_MOCK_MEETING_URL = new URL('./mockMeeting.json', import.meta.url)

export function createMockNextMeetingRepository(
  mockMeetingUrl: URL = DEFAULT_MOCK_MEETING_URL,
): NextMeetingRepository {
  const store = parseMockMeetingStore(JSON.parse(readFileSync(mockMeetingUrl, 'utf8')))

  return {
    async findNextMeeting(lookup) {
      const nowMs = lookup.now.getTime()

      return (
        store.meetings
          .filter((entry) => matchesLookup(entry, lookup))
          .map((entry) => withComputedTiming(entry.meeting, lookup.now))
          .filter((meeting) => new Date(meeting.startsAt).getTime() >= nowMs)
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0] ??
        null
      )
    },
  }
}

export function parseNextMeetingLookup(
  input: NextMeetingLookupInput,
  options: LookupOptions,
): LookupParseResult {
  const userIdInput = cleanString(input.userId)
  const emailInput = cleanString(input.email)

  if (userIdInput) {
    if (!isUuid(userIdInput)) {
      return { ok: false, status: 400, message: 'userId must be a valid UUID' }
    }
    return { ok: true, lookup: { userId: userIdInput, email: null, now: options.now } }
  }

  if (emailInput) {
    if (!isEmailLike(emailInput)) {
      return { ok: false, status: 400, message: 'email must be a valid email address' }
    }
    return { ok: true, lookup: { userId: null, email: emailInput, now: options.now } }
  }

  if (!options.defaultUserId) {
    return { ok: false, status: 400, message: 'userId or email is required' }
  }

  if (!isUuid(options.defaultUserId)) {
    return { ok: false, status: 400, message: 'default user id is not a valid UUID' }
  }

  return { ok: true, lookup: { userId: options.defaultUserId, email: null, now: options.now } }
}

export function summarizeForVoice(meeting: NextMeeting | null): string {
  if (!meeting) {
    return 'I do not see an upcoming meeting for this caller.'
  }

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

function matchesLookup(entry: MockMeetingEntry, lookup: NextMeetingLookup): boolean {
  if (lookup.userId) return entry.userId === lookup.userId
  if (lookup.email) return entry.accountEmail.toLowerCase() === lookup.email.toLowerCase()
  return false
}

function withComputedTiming(meeting: MockMeeting, now: Date): NextMeeting {
  return {
    ...meeting,
    startsInMinutes: minutesUntil(meeting.startsAt, now),
  }
}

function parseMockMeetingStore(value: unknown): MockMeetingStore {
  if (!isRecord(value) || !Array.isArray(value.meetings)) {
    throw new Error('mockMeeting.json must contain a meetings array')
  }

  return {
    meetings: value.meetings.map(parseMockMeetingEntry),
  }
}

function parseMockMeetingEntry(value: unknown): MockMeetingEntry {
  if (!isRecord(value)) throw new Error('mock meeting entry must be an object')

  const userId = requiredString(value, 'userId')
  const accountEmail = requiredString(value, 'accountEmail')
  const meeting = parseMockMeeting(value.meeting)

  if (!isUuid(userId)) throw new Error('mock meeting userId must be a UUID')
  if (!isEmailLike(accountEmail)) throw new Error('mock meeting accountEmail must be an email')

  return { userId, accountEmail, meeting }
}

function parseMockMeeting(value: unknown): MockMeeting {
  if (!isRecord(value)) throw new Error('mock meeting must be an object')

  return {
    id: requiredString(value, 'id'),
    title: requiredString(value, 'title'),
    startsAt: parseIsoDate(requiredString(value, 'startsAt')),
    description: nullableString(value.description),
    attendees: parseAttendees(value.attendees),
    contact: parseContact(value.contact),
    company: parseCompany(value.company),
    briefing: parseBriefing(value.briefing),
  }
}

function parseAttendees(value: unknown): MeetingAttendee[] {
  if (!Array.isArray(value)) throw new Error('mock meeting attendees must be an array')

  return value.map((item) => {
    if (!isRecord(item)) throw new Error('mock meeting attendee must be an object')
    return {
      email: requiredString(item, 'email'),
      displayName: nullableString(item.displayName),
      organizer: nullableBoolean(item.organizer),
    }
  })
}

function parseContact(value: unknown): MeetingContact {
  if (!isRecord(value)) throw new Error('mock meeting contact must be an object')
  return {
    name: nullableString(value.name),
    email: nullableString(value.email),
    role: nullableString(value.role),
  }
}

function parseCompany(value: unknown): MeetingCompany {
  if (!isRecord(value)) throw new Error('mock meeting company must be an object')
  return {
    name: nullableString(value.name),
    domain: nullableString(value.domain),
    summary: nullableString(value.summary),
  }
}

function parseBriefing(value: unknown): MeetingBriefing | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) throw new Error('mock meeting briefing must be an object')

  const status = requiredString(value, 'status')
  if (!isBriefingStatus(status)) {
    throw new Error('mock meeting briefing status is invalid')
  }

  return {
    id: requiredString(value, 'id'),
    status,
    summary60s: nullableString(value.summary60s),
    suggestedOpeningLine: nullableString(value.suggestedOpeningLine),
    questionsToAsk: stringArray(value.questionsToAsk),
    likelyPainPoints: stringArray(value.likelyPainPoints),
    risks: stringArray(value.risks),
    followUpEmail: nullableString(value.followUpEmail),
  }
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`mock meeting ${key} must be a non-empty string`)
  }
  return value
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function parseIsoDate(value: string): string {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) throw new Error('mock meeting startsAt must be an ISO date')
  return new Date(timestamp).toISOString()
}

function minutesUntil(startsAt: string, now: Date): number {
  const deltaMs = new Date(startsAt).getTime() - now.getTime()
  return Math.max(0, Math.round(deltaMs / 60_000))
}

function cleanString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function isBriefingStatus(value: unknown): value is BriefingStatus {
  return (
    value === 'pending' ||
    value === 'researching' ||
    value === 'drafting' ||
    value === 'ready' ||
    value === 'failed'
  )
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
