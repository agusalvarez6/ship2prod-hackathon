import { z } from 'zod'
import {
  BriefingIdSchema,
  JobIdSchema,
  MeetingIdSchema,
  NotionPageIdSchema,
  UserIdSchema,
} from './ids.js'

export const ResearchJobPayloadSchema = z
  .object({
    jobId: JobIdSchema,
    briefingId: BriefingIdSchema,
    userId: UserIdSchema,
    meetingId: MeetingIdSchema,
    notionPageIds: z.array(NotionPageIdSchema),
    requestedAt: z.number().int().nonnegative(),
  })
  .strict()
export type ResearchJobPayload = z.infer<typeof ResearchJobPayloadSchema>

export const ProgressStepSchema = z.enum([
  'queued',
  'searching_notion',
  'researching_company',
  'reading_pages',
  'synthesizing',
  'ready',
  'failed',
])
export type ProgressStep = z.infer<typeof ProgressStepSchema>

export const ProgressEventSchema = z
  .object({
    step: ProgressStepSchema,
    pct: z.number().int().min(0).max(100),
    detail: z.string().optional(),
    at: z.number().int().nonnegative(),
  })
  .strict()
export type ProgressEvent = z.infer<typeof ProgressEventSchema>

export const ProgressSnapshotSchema = z
  .object({
    jobId: JobIdSchema,
    current: ProgressEventSchema,
    history: z.array(ProgressEventSchema),
  })
  .strict()
export type ProgressSnapshot = z.infer<typeof ProgressSnapshotSchema>
