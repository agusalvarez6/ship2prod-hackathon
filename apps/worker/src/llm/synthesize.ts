import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LLMClient } from '@ship2prod/integrations'
import type { ResearchJobPayload } from '@ship2prod/schema/jobs'
import type { NormalizedSource } from '../tinyfish/normalizer.js'

// Phase 1 shape: a superset of what the strict BriefingSectionsSchema demands,
// minus citedSources (the pipeline fills those from persisted Source rows) and
// minus the questionsToAsk 5-tuple constraint (the LLM returns a 5-item array).
// Stored as JSONB; the graph resolver is lenient.
export interface BriefingSections {
  summary60s: string
  whoYouAreMeeting: { name: string; role: string; company: string }
  companyContext: { whatTheyDo: string; recentUpdates: string[] }
  internalContext: { notionExcerpts: { pageTitle: string; excerpt: string }[] }
  bestConversationAngle: string
  suggestedOpeningLine: string
  questionsToAsk: string[]
  likelyPainPoints: string[]
  risks: string[]
  followUpEmail: string
}

export interface SynthesizeInput {
  job: ResearchJobPayload
  sources: NormalizedSource[]
  meetingContext?: {
    contactName?: string | null
    contactRole?: string | null
    companyName?: string | null
    companyDomain?: string | null
  }
}

export interface SynthesizeDeps {
  llm: LLMClient
}

const HERE = dirname(fileURLToPath(import.meta.url))
const PROMPT_PATH = resolve(HERE, 'prompts/synthesize.md')

let cachedTemplate: string | null = null

async function loadTemplate(): Promise<string> {
  if (cachedTemplate === null) {
    cachedTemplate = await readFile(PROMPT_PATH, 'utf8')
  }
  return cachedTemplate
}

function renderMeetingContext(input: SynthesizeInput): string {
  const m = input.meetingContext ?? {}
  const lines = [
    `contact_name: ${m.contactName ?? 'unknown'}`,
    `contact_role: ${m.contactRole ?? 'unknown'}`,
    `company_name: ${m.companyName ?? 'unknown'}`,
    `company_domain: ${m.companyDomain ?? 'unknown'}`,
    `briefing_id: ${input.job.briefingId}`,
  ]
  return lines.join('\n')
}

function renderSources(sources: NormalizedSource[]): string {
  if (sources.length === 0) return '(no sources available)'
  return sources
    .map((s, i) => `[${i + 1}] kind=${s.kind} url=${s.url}\n${s.text}`)
    .join('\n\n')
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim()
  // Paired ```json ... ``` fence.
  const paired = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  if (paired?.[1]) return paired[1].trim()
  // Leading ```json with no closing fence (truncated response).
  const leading = trimmed.match(/^```(?:json)?\s*([\s\S]*)$/i)
  if (leading?.[1]) return leading[1].replace(/```\s*$/, '').trim()
  return trimmed
}

export async function synthesize(
  input: SynthesizeInput,
  deps: SynthesizeDeps,
): Promise<BriefingSections> {
  const template = await loadTemplate()
  const context = template
    .replace('{{meeting_context}}', renderMeetingContext(input))
    .replace('{{sources}}', renderSources(input.sources))

  const raw = await deps.llm.synthesize({
    system: 'You produce meeting briefings as strict JSON. Respond with the JSON object only.',
    context,
    question: 'Produce the briefing JSON now.',
    json: true,
  })

  let parsed: BriefingSections
  try {
    parsed = JSON.parse(stripJsonFence(raw)) as BriefingSections
  } catch (cause) {
    throw new Error(`synthesize: model returned non-JSON output: ${(cause as Error).message}`)
  }

  return parsed
}
