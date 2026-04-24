import { describe, expect, it } from 'vitest'
import {
  OPERATIONS,
  OP_ANSWER_FROM_BRIEFING,
  OP_CREATE_BRIEFING_FROM_MEETING,
  OP_DRAFT_FOLLOW_UP_EMAIL,
  OP_GET_BRIEFING,
  OP_GET_BRIEFING_PROGRESS,
  OP_LIST_BRIEFINGS,
  OP_LIST_UPCOMING_MEETINGS,
  OP_SAVE_CALL_TRANSCRIPT,
  OP_SEARCH_NOTION_CONTEXT,
} from '../src/operations.js'

describe('operation constants', () => {
  it('exposes all nine operation names', () => {
    expect(OPERATIONS).toEqual({
      listUpcomingMeetings: OP_LIST_UPCOMING_MEETINGS,
      searchNotionContext: OP_SEARCH_NOTION_CONTEXT,
      createBriefingFromMeeting: OP_CREATE_BRIEFING_FROM_MEETING,
      getBriefingProgress: OP_GET_BRIEFING_PROGRESS,
      getBriefing: OP_GET_BRIEFING,
      listBriefings: OP_LIST_BRIEFINGS,
      answerFromBriefing: OP_ANSWER_FROM_BRIEFING,
      draftFollowUpEmail: OP_DRAFT_FOLLOW_UP_EMAIL,
      saveCallTranscript: OP_SAVE_CALL_TRANSCRIPT,
    })
  })
})
