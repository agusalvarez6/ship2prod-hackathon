import type { Briefing, BriefingSections, MeetingsRow, Source } from '@ship2prod/schema'
import type { NotionPageRead } from './notion.js'

export interface SynthesizerInput {
  meeting: MeetingsRow
  contact: { name?: string; email?: string; role?: string } | null
  company: { name?: string; domain?: string; summary?: string } | null
  notionContext: NotionPageRead[]
  sources: Source[]
}

export interface VoiceTurn {
  role: 'user' | 'assistant'
  text: string
  at: number
}

export interface LLMClient {
  synthesizeBriefing(input: SynthesizerInput): Promise<BriefingSections>
  answerQuestion(input: {
    briefing: Briefing
    question: string
    recentTurns: VoiceTurn[]
  }): Promise<{ text: string }>
  draftFollowUpEmail(input: {
    briefing: Briefing
    tone?: 'neutral' | 'warm' | 'direct'
  }): Promise<{ text: string }>
}

export interface LLMClientConfig {
  apiKey: string
  model?: string
}

export function createLLMClient(_config: LLMClientConfig): LLMClient {
  return {
    async synthesizeBriefing() {
      throw new Error('not implemented in Phase 0')
    },
    async answerQuestion() {
      throw new Error('not implemented in Phase 0')
    },
    async draftFollowUpEmail() {
      throw new Error('not implemented in Phase 0')
    },
  }
}
