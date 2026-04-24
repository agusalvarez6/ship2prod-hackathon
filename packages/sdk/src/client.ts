import {
  ANSWER_FROM_BRIEFING,
  CREATE_BRIEFING_FROM_MEETING,
  DRAFT_FOLLOW_UP_EMAIL,
  GET_BRIEFING,
  GET_BRIEFING_PROGRESS,
  LIST_BRIEFINGS,
  LIST_UPCOMING_MEETINGS,
  SAVE_CALL_TRANSCRIPT,
  SEARCH_NOTION_CONTEXT,
  type OperationName,
} from './operations.js'

export interface PrecallClientConfig {
  endpoint: string
  getToken: () => Promise<string>
}

export interface PrecallClient {
  listUpcomingMeetings: (variables?: Record<string, unknown>) => Promise<unknown>
  searchNotionContext: (variables: Record<string, unknown>) => Promise<unknown>
  createBriefingFromMeeting: (variables: Record<string, unknown>) => Promise<unknown>
  getBriefingProgress: (variables: Record<string, unknown>) => Promise<unknown>
  getBriefing: (variables: Record<string, unknown>) => Promise<unknown>
  listBriefings: (variables?: Record<string, unknown>) => Promise<unknown>
  answerFromBriefing: (variables: Record<string, unknown>) => Promise<unknown>
  draftFollowUpEmail: (variables: Record<string, unknown>) => Promise<unknown>
  saveCallTranscript: (variables: Record<string, unknown>) => Promise<unknown>
}

interface GraphQLResponse {
  data?: unknown
  errors?: unknown
}

async function execute(
  config: PrecallClientConfig,
  operationName: OperationName,
  variables: Record<string, unknown>,
): Promise<unknown> {
  const token = await config.getToken()
  const res = await globalThis.fetch(`${config.endpoint}/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ operationName, variables }),
  })

  if (!res.ok) {
    throw new Error(`sdk upstream: HTTP ${res.status}`)
  }

  const body = (await res.json()) as GraphQLResponse
  if (body.errors) {
    throw new Error(`sdk graphql: ${JSON.stringify(body.errors)}`)
  }
  return body.data
}

export function createPrecallClient(config: PrecallClientConfig): PrecallClient {
  return {
    listUpcomingMeetings: (variables = {}) => execute(config, LIST_UPCOMING_MEETINGS, variables),
    searchNotionContext: (variables) => execute(config, SEARCH_NOTION_CONTEXT, variables),
    createBriefingFromMeeting: (variables) =>
      execute(config, CREATE_BRIEFING_FROM_MEETING, variables),
    getBriefingProgress: (variables) => execute(config, GET_BRIEFING_PROGRESS, variables),
    getBriefing: (variables) => execute(config, GET_BRIEFING, variables),
    listBriefings: (variables = {}) => execute(config, LIST_BRIEFINGS, variables),
    answerFromBriefing: (variables) => execute(config, ANSWER_FROM_BRIEFING, variables),
    draftFollowUpEmail: (variables) => execute(config, DRAFT_FOLLOW_UP_EMAIL, variables),
    saveCallTranscript: (variables) => execute(config, SAVE_CALL_TRANSCRIPT, variables),
  }
}
