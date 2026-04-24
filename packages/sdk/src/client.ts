import type {
  BriefingId,
  JobId,
  MeetingId,
  NotionPageId,
  TranscriptId,
  UserId,
} from '@ship2prod/schema'
import {
  OP_ANSWER_FROM_BRIEFING,
  OP_CREATE_BRIEFING_FROM_MEETING,
  OP_DRAFT_FOLLOW_UP_EMAIL,
  OP_GET_BRIEFING,
  OP_GET_BRIEFING_PROGRESS,
  OP_LIST_BRIEFINGS,
  OP_LIST_UPCOMING_MEETINGS,
  OP_SAVE_CALL_TRANSCRIPT,
  OP_SEARCH_NOTION_CONTEXT,
} from './operations.js'

export interface PrecallClientConfig {
  endpoint: string
  getToken: () => Promise<string>
}

export interface CreateBriefingResult {
  briefingId: BriefingId
  jobId: JobId
  deduped: boolean
}

export interface PrecallClient {
  // TODO: narrow when subgraph lands
  listUpcomingMeetings(variables: { userId: UserId; limit?: number }): Promise<unknown>
  // TODO: narrow when subgraph lands
  searchNotionContext(variables: { userId: UserId; query: string }): Promise<unknown>
  createBriefingFromMeeting(variables: {
    userId: UserId
    meetingId: MeetingId
    notionPageIds: NotionPageId[]
  }): Promise<CreateBriefingResult>
  // TODO: narrow when subgraph lands
  getBriefingProgress(variables: { jobId: JobId }): Promise<unknown>
  // TODO: narrow when subgraph lands
  getBriefing(variables: { id: BriefingId }): Promise<unknown>
  // TODO: narrow when subgraph lands
  listBriefings(variables: { userId: UserId; limit?: number }): Promise<unknown>
  answerFromBriefing(variables: {
    briefingId: BriefingId
    mode: 'question' | 'section'
    input: string
    callId: string
  }): Promise<{ text: string }>
  draftFollowUpEmail(variables: {
    briefingId: BriefingId
    tone?: string
  }): Promise<{ emailText: string }>
  saveCallTranscript(variables: {
    briefingId: BriefingId
    vapiCallId: string
    transcript: string
    recordingUrl?: string
    startedAt: string
    endedAt: string
  }): Promise<{ transcriptId: TranscriptId }>
}

async function execute<T>(
  config: PrecallClientConfig,
  operationName: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const token = await config.getToken()
  const res = await globalThis.fetch(`${config.endpoint}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ operationName, variables }),
  })
  if (!res.ok) throw new Error(`SDK upstream: HTTP ${res.status}`)
  const body = (await res.json()) as { data?: T; errors?: unknown }
  if (body.errors) throw new Error(`SDK graphql: ${JSON.stringify(body.errors)}`)
  return body.data as T
}

export function createPrecallClient(config: PrecallClientConfig): PrecallClient {
  return {
    listUpcomingMeetings: (variables) => execute(config, OP_LIST_UPCOMING_MEETINGS, variables),
    searchNotionContext: (variables) => execute(config, OP_SEARCH_NOTION_CONTEXT, variables),
    createBriefingFromMeeting: (variables) =>
      execute<CreateBriefingResult>(config, OP_CREATE_BRIEFING_FROM_MEETING, {
        ...variables,
        notionPageIds: [...variables.notionPageIds],
      }),
    getBriefingProgress: (variables) => execute(config, OP_GET_BRIEFING_PROGRESS, variables),
    getBriefing: (variables) => execute(config, OP_GET_BRIEFING, variables),
    listBriefings: (variables) => execute(config, OP_LIST_BRIEFINGS, variables),
    answerFromBriefing: (variables) =>
      execute<{ text: string }>(config, OP_ANSWER_FROM_BRIEFING, variables),
    draftFollowUpEmail: (variables) =>
      execute<{ emailText: string }>(config, OP_DRAFT_FOLLOW_UP_EMAIL, variables),
    saveCallTranscript: (variables) =>
      execute<{ transcriptId: TranscriptId }>(config, OP_SAVE_CALL_TRANSCRIPT, variables),
  }
}
