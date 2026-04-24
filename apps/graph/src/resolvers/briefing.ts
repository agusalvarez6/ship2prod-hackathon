import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.resolve(HERE, '../../../../infra/seed/briefings.seed.json')
const FIXTURE_ID = '11111111-2222-3333-4444-555555555555'

let cached: unknown | undefined

async function loadFixture(): Promise<unknown> {
  if (cached !== undefined) return cached
  const raw = await readFile(FIXTURE_PATH, 'utf8')
  cached = JSON.parse(raw)
  return cached
}

export const briefingResolvers = {
  Query: {
    async getBriefing(_: unknown, args: { id: string }) {
      if (args.id !== FIXTURE_ID) {
        throw new Error('not implemented in Phase 0')
      }
      return loadFixture()
    },
    listBriefings() {
      throw new Error('not implemented in Phase 0')
    },
    getBriefingProgress() {
      throw new Error('not implemented in Phase 0')
    },
  },
  Mutation: {
    createBriefingFromMeeting() {
      throw new Error('not implemented in Phase 0')
    },
  },
}
