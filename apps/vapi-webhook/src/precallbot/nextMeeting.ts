import pg from 'pg'

const { Pool } = pg

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
  close?(): Promise<void>
}

export type LookupParseResult =
  | { ok: true; lookup: NextMeetingLookup }
  | { ok: false; status: 400; message: string }

export interface NextMeetingRepositoryOptions {
  databaseUrl: string
  schema?: string
}

interface LookupOptions {
  defaultUserId: string | null
  now: Date
}

interface NextMeetingRow extends pg.QueryResultRow {
  meeting_id: string
  meeting_title: string
  starts_at: string | Date
  description: string | null
  attendees: unknown
  user_email: string
  briefing_id: string | null
  briefing_status: string | null
  summary_60s: string | null
  sections: unknown | null
  contact_name: string | null
  contact_email: string | null
  contact_role: string | null
  company_name: string | null
  company_domain: string | null
  company_summary: string | null
}

const NEXT_MEETING_SQL = `
SELECT
  m.id AS meeting_id,
  m.title AS meeting_title,
  m.starts_at,
  m.description,
  m.attendees,
  u.email AS user_email,
  b.id AS briefing_id,
  b.status AS briefing_status,
  b.summary_60s,
  b.sections,
  b.contact_name,
  b.contact_email,
  b.contact_role,
  b.company_name,
  b.company_domain,
  b.company_summary
FROM meetings m
JOIN users u ON u.id = m.user_id
LEFT JOIN LATERAL (
  SELECT *
  FROM briefings b
  WHERE b.meeting_id = m.id
  ORDER BY b.created_at DESC
  LIMIT 1
) b ON TRUE
WHERE
  (
    ($1::uuid IS NOT NULL AND m.user_id = $1::uuid)
    OR ($1::uuid IS NULL AND $2::text IS NOT NULL AND lower(u.email) = lower($2::text))
  )
  AND m.starts_at >= $3::timestamptz
ORDER BY m.starts_at ASC
LIMIT 1
`

export function createPostgresNextMeetingRepository(
  options: NextMeetingRepositoryOptions,
): NextMeetingRepository {
  const pool = new Pool({
    connectionString: options.databaseUrl,
    max: 4,
    idleTimeoutMillis: 10_000,
  })
  const searchPath = options.schema ? quoteIdentifier(options.schema) : null

  return {
    async findNextMeeting(lookup) {
      const client = await pool.connect()
      try {
        if (searchPath) {
          await client.query(`SET search_path TO ${searchPath}`)
        }
        const result = await client.query<NextMeetingRow>(NEXT_MEETING_SQL, [
          lookup.userId,
          lookup.email,
          lookup.now.toISOString(),
        ])
        const row = result.rows[0]
        return row ? rowToNextMeeting(row, lookup.now) : null
      } finally {
        client.release()
      }
    },
    async close() {
      await pool.end()
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

function rowToNextMeeting(row: NextMeetingRow, now: Date): NextMeeting {
  const attendees = normalizeAttendees(row.attendees)
  const external = firstExternalAttendee(attendees, row.user_email)
  const contactEmail = row.contact_email ?? external?.email ?? null
  const contactName = row.contact_name ?? inferPersonName(external) ?? null
  const companyDomain = row.company_domain ?? inferCompanyDomain(contactEmail)
  const startsAt = toIsoString(row.starts_at)

  return {
    id: row.meeting_id,
    title: row.meeting_title,
    startsAt,
    startsInMinutes: minutesUntil(startsAt, now),
    description: row.description,
    attendees,
    contact: {
      name: contactName,
      email: contactEmail,
      role: row.contact_role,
    },
    company: {
      name: row.company_name ?? inferCompanyName(companyDomain),
      domain: companyDomain,
      summary: row.company_summary,
    },
    briefing: rowToBriefing(row),
  }
}

function rowToBriefing(row: NextMeetingRow): MeetingBriefing | null {
  if (!row.briefing_id) return null

  const sections = parseBriefingSections(row.sections)

  return {
    id: row.briefing_id,
    status: parseBriefingStatus(row.briefing_status),
    summary60s: row.summary_60s ?? sections?.summary60s ?? null,
    suggestedOpeningLine: sections?.suggestedOpeningLine ?? null,
    questionsToAsk: sections ? [...sections.questionsToAsk] : [],
    likelyPainPoints: sections ? [...sections.likelyPainPoints] : [],
    risks: sections ? [...sections.risks] : [],
    followUpEmail: sections?.followUpEmail ?? null,
  }
}

interface BriefingSectionsSubset {
  summary60s: string | null
  suggestedOpeningLine: string | null
  questionsToAsk: string[]
  likelyPainPoints: string[]
  risks: string[]
  followUpEmail: string | null
}

function parseBriefingStatus(value: string | null): BriefingStatus {
  return isBriefingStatus(value) ? value : 'pending'
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

function parseBriefingSections(value: unknown): BriefingSectionsSubset | null {
  if (!isRecord(value)) return null

  return {
    summary60s: typeof value.summary60s === 'string' ? value.summary60s : null,
    suggestedOpeningLine:
      typeof value.suggestedOpeningLine === 'string' ? value.suggestedOpeningLine : null,
    questionsToAsk: stringArray(value.questionsToAsk),
    likelyPainPoints: stringArray(value.likelyPainPoints),
    risks: stringArray(value.risks),
    followUpEmail: typeof value.followUpEmail === 'string' ? value.followUpEmail : null,
  }
}

function normalizeAttendees(value: unknown): MeetingAttendee[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.email !== 'string') return []

    return [
      {
        email: item.email,
        displayName: typeof item.displayName === 'string' ? item.displayName : null,
        organizer: typeof item.organizer === 'boolean' ? item.organizer : null,
      },
    ]
  })
}

function firstExternalAttendee(
  attendees: MeetingAttendee[],
  userEmail: string,
): MeetingAttendee | null {
  const userDomain = inferCompanyDomain(userEmail)
  return (
    attendees.find((attendee) => {
      if (attendee.email.toLowerCase() === userEmail.toLowerCase()) return false
      const attendeeDomain = inferCompanyDomain(attendee.email)
      return attendeeDomain !== userDomain
    }) ??
    attendees.find((attendee) => attendee.email.toLowerCase() !== userEmail.toLowerCase()) ??
    null
  )
}

function inferPersonName(attendee: MeetingAttendee | null | undefined): string | null {
  if (!attendee) return null
  if (attendee.displayName) return attendee.displayName
  const localPart = attendee.email.split('@')[0]
  if (!localPart) return null
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function inferCompanyDomain(email: string | null): string | null {
  if (!email) return null
  const domain = email.split('@')[1]?.toLowerCase() ?? null
  if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain)) return null
  return domain
}

function inferCompanyName(domain: string | null): string | null {
  const label = domain?.split('.')[0]
  if (!label) return null
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error('schema must be a safe Postgres identifier')
  }
  return `"${value.replace(/"/g, '""')}"`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
