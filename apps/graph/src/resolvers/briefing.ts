import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SARAH_BRIEFING_ID = '11111111-2222-3333-4444-555555555555'

const here = dirname(fileURLToPath(import.meta.url))
const fixturePath = resolve(here, '../../../../infra/seed/briefings.seed.json')
const sarahBriefing = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, unknown>

export const briefingResolvers = {
  createBriefingFromMeeting: (): never => {
    throw new Error('not implemented in Phase 0')
  },
  getBriefingProgress: (): never => {
    throw new Error('not implemented in Phase 0')
  },
  getBriefing: (_parent: unknown, args: { id: string }): Record<string, unknown> => {
    if (args.id === SARAH_BRIEFING_ID) return sarahBriefing
    throw new Error('not implemented in Phase 0')
  },
  listBriefings: (): never => {
    throw new Error('not implemented in Phase 0')
  },
  draftFollowUpEmail: (): never => {
    throw new Error('not implemented in Phase 0')
  },
}
