export const OP_LIST_UPCOMING_MEETINGS = 'listUpcomingMeetings'
export const OP_SEARCH_NOTION_CONTEXT = 'searchNotionContext'
export const OP_CREATE_BRIEFING_FROM_MEETING = 'createBriefingFromMeeting'
export const OP_GET_BRIEFING_PROGRESS = 'getBriefingProgress'
export const OP_GET_BRIEFING = 'getBriefing'
export const OP_LIST_BRIEFINGS = 'listBriefings'
export const OP_ANSWER_FROM_BRIEFING = 'answerFromBriefing'
export const OP_DRAFT_FOLLOW_UP_EMAIL = 'draftFollowUpEmail'
export const OP_SAVE_CALL_TRANSCRIPT = 'saveCallTranscript'

export const OPERATIONS = {
  listUpcomingMeetings: OP_LIST_UPCOMING_MEETINGS,
  searchNotionContext: OP_SEARCH_NOTION_CONTEXT,
  createBriefingFromMeeting: OP_CREATE_BRIEFING_FROM_MEETING,
  getBriefingProgress: OP_GET_BRIEFING_PROGRESS,
  getBriefing: OP_GET_BRIEFING,
  listBriefings: OP_LIST_BRIEFINGS,
  answerFromBriefing: OP_ANSWER_FROM_BRIEFING,
  draftFollowUpEmail: OP_DRAFT_FOLLOW_UP_EMAIL,
  saveCallTranscript: OP_SAVE_CALL_TRANSCRIPT,
} as const
