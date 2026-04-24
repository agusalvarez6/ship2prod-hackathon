import type { ResearchJobPayload } from '@ship2prod/schema/jobs'

export type ResearchTask =
  | { kind: 'fetch'; url: string }
  | { kind: 'search'; query: string }

// ResearchJobPayload only carries ids plus notionPageIds; meeting-level context
// (company domain, attendee name, company name) lives on the briefing row.
// The pipeline loads that context from Postgres and passes it here.
export interface PlannerContext {
  companyDomain?: string | null
  companyName?: string | null
  contactName?: string | null
}

export function plan(_job: ResearchJobPayload, context: PlannerContext = {}): ResearchTask[] {
  const tasks: ResearchTask[] = []

  const domain = context.companyDomain?.trim()
  if (domain) {
    const url = domain.startsWith('http') ? domain : `https://${domain}`
    tasks.push({ kind: 'fetch', url })
  }

  const contact = context.contactName?.trim()
  const company = context.companyName?.trim()
  if (contact && company) {
    tasks.push({ kind: 'search', query: `${contact} ${company}` })
  } else if (contact) {
    tasks.push({ kind: 'search', query: contact })
  }

  if (company) {
    tasks.push({ kind: 'search', query: `${company} news` })
  }

  return tasks
}
