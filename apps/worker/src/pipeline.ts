import type { ResearchJobPayload } from '@ship2prod/schema/jobs'

export async function runPipeline(_job: ResearchJobPayload): Promise<void> {
  throw new Error('not implemented in Phase 0')
}
