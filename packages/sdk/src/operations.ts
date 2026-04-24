export const LIST_UPCOMING_MEETINGS = 'listUpcomingMeetings'
export const SEARCH_NOTION_CONTEXT = 'searchNotionContext'
export const CREATE_BRIEFING_FROM_MEETING = 'createBriefingFromMeeting'
export const GET_BRIEFING_PROGRESS = 'getBriefingProgress'
export const GET_BRIEFING = 'getBriefing'
export const LIST_BRIEFINGS = 'listBriefings'
export const ANSWER_FROM_BRIEFING = 'answerFromBriefing'
export const DRAFT_FOLLOW_UP_EMAIL = 'draftFollowUpEmail'
export const SAVE_CALL_TRANSCRIPT = 'saveCallTranscript'

export const OPERATION_NAMES = [
  LIST_UPCOMING_MEETINGS,
  SEARCH_NOTION_CONTEXT,
  CREATE_BRIEFING_FROM_MEETING,
  GET_BRIEFING_PROGRESS,
  GET_BRIEFING,
  LIST_BRIEFINGS,
  ANSWER_FROM_BRIEFING,
  DRAFT_FOLLOW_UP_EMAIL,
  SAVE_CALL_TRANSCRIPT,
] as const

export type OperationName = (typeof OPERATION_NAMES)[number]
