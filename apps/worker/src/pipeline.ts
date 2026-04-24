import type { Pool } from 'pg'
import type { Redis } from 'ioredis'
import type { LLMClient, TinyFishClient } from '@ship2prod/integrations'
import type { ResearchJobPayload } from '@ship2prod/schema/jobs'
import { synthesize } from './llm/synthesize.js'
import { persistBriefing } from './persist.js'
import { plan, type PlannerContext, type ResearchTask } from './planner.js'
import type { emitProgress } from './progress.js'
import { normalize, type NormalizedSource } from './tinyfish/normalizer.js'

export interface PipelineDeps {
  tinyfish: TinyFishClient
  llm: LLMClient
  pool: Pool
  redis: Redis
  emitProgress: typeof emitProgress
}

interface BriefingContextRow {
  contact_name: string | null
  contact_role: string | null
  company_name: string | null
  company_domain: string | null
}

async function loadBriefingContext(
  pool: Pool,
  briefingId: string,
): Promise<BriefingContextRow | null> {
  const { rows } = await pool.query<BriefingContextRow>(
    `SELECT contact_name, contact_role, company_name, company_domain
       FROM briefings WHERE id = $1`,
    [briefingId],
  )
  return rows[0] ?? null
}

async function runTask(
  task: ResearchTask,
  tinyfish: TinyFishClient,
): Promise<NormalizedSource[]> {
  if (task.kind === 'fetch') {
    const result = await tinyfish.fetch(task.url)
    const normalized = normalize(result)
    return normalized ? [normalized] : []
  }
  const hits = await tinyfish.search(task.query)
  return hits
    .map((hit) => normalize({ url: hit.url, text: hit.snippet, blocked: false }))
    .filter((s): s is NormalizedSource => s !== null)
}

export async function runPipeline(job: ResearchJobPayload, deps: PipelineDeps): Promise<void> {
  const now = (): number => Date.now()
  try {
    await deps.emitProgress(job.briefingId, {
      step: 'queued',
      pct: 5,
      detail: 'planning',
      at: now(),
    })

    const ctxRow = await loadBriefingContext(deps.pool, job.briefingId)
    const plannerCtx: PlannerContext = {
      companyDomain: ctxRow?.company_domain ?? null,
      companyName: ctxRow?.company_name ?? null,
      contactName: ctxRow?.contact_name ?? null,
    }
    const tasks = plan(job, plannerCtx)

    await deps.emitProgress(job.briefingId, {
      step: 'researching_company',
      pct: 25,
      detail: `fetching ${tasks.length} sources`,
      at: now(),
    })

    // One failed task must not kill the whole briefing: TinyFish sometimes
    // blocks on a single domain while the other sources succeed.
    const settled = await Promise.allSettled(tasks.map((t) => runTask(t, deps.tinyfish)))
    const sources: NormalizedSource[] = []
    for (const [i, r] of settled.entries()) {
      if (r.status === 'fulfilled') {
        sources.push(...r.value)
        continue
      }
      const task = tasks[i]
      const target = task?.kind === 'fetch' ? task.url : task?.kind === 'search' ? task.query : ''
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
      console.warn(`pipeline: research task failed (${task?.kind} ${target}): ${msg}`)
    }

    await deps.emitProgress(job.briefingId, {
      step: 'synthesizing',
      pct: 70,
      detail: `${sources.length} sources`,
      at: now(),
    })

    const sections = await synthesize(
      {
        job,
        sources,
        meetingContext: {
          contactName: ctxRow?.contact_name ?? null,
          contactRole: ctxRow?.contact_role ?? null,
          companyName: ctxRow?.company_name ?? null,
          companyDomain: ctxRow?.company_domain ?? null,
        },
      },
      { llm: deps.llm },
    )

    await deps.emitProgress(job.briefingId, {
      step: 'synthesizing',
      pct: 90,
      detail: 'persisting',
      at: now(),
    })

    await persistBriefing({
      pool: deps.pool,
      briefingId: job.briefingId,
      sections,
      sources,
    })

    await deps.emitProgress(job.briefingId, {
      step: 'ready',
      pct: 100,
      detail: 'done',
      at: now(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await deps.emitProgress(job.briefingId, {
      step: 'failed',
      pct: 100,
      detail: message,
      at: now(),
    })
    throw err
  }
}
