import { z } from 'zod'
import { BriefingIdSchema, MeetingIdSchema, UserIdSchema } from './ids.js'
import { CitedSourceSchema } from './source.js'

export const BriefingStatusSchema = z.enum([
  'pending',
  'researching',
  'drafting',
  'ready',
  'failed',
])
export type BriefingStatus = z.infer<typeof BriefingStatusSchema>

export const BriefingSectionKeySchema = z.enum([
  'summary',
  'questions',
  'opening_line',
  'pain_points',
  'notion_context',
  'follow_up_email',
  'risks',
])
export type BriefingSectionKey = z.infer<typeof BriefingSectionKeySchema>

export const BriefingSectionsSchema = z
  .object({
    summary60s: z.string(),
    whoYouAreMeeting: z
      .object({
        name: z.string(),
        role: z.string().optional(),
        company: z.string(),
      })
      .strict(),
    companyContext: z
      .object({
        whatTheyDo: z.string(),
        recentUpdates: z.array(z.string()),
      })
      .strict(),
    internalContext: z
      .object({
        notionExcerpts: z.array(
          z
            .object({
              pageTitle: z.string(),
              excerpt: z.string(),
            })
            .strict(),
        ),
      })
      .strict(),
    bestConversationAngle: z.string(),
    suggestedOpeningLine: z.string(),
    questionsToAsk: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]),
    likelyPainPoints: z.array(z.string()),
    risks: z.array(z.string()),
    followUpEmail: z.string(),
    citedSources: z.array(CitedSourceSchema),
  })
  .strict()
export type BriefingSections = z.infer<typeof BriefingSectionsSchema>

export const ResearchErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    at: z.string().datetime({ offset: true }),
  })
  .strict()
export type ResearchError = z.infer<typeof ResearchErrorSchema>

export const BriefingSchema = z
  .object({
    id: BriefingIdSchema,
    userId: UserIdSchema,
    meetingId: MeetingIdSchema.nullable(),

    contactName: z.string().nullable(),
    contactEmail: z.string().email().nullable(),
    contactRole: z.string().nullable(),
    companyName: z.string().nullable(),
    companyDomain: z.string().nullable(),
    companySummary: z.string().nullable(),

    status: BriefingStatusSchema,
    summary60s: z.string().nullable(),
    sections: BriefingSectionsSchema.nullable(),
    sourcesCount: z.number().int().nonnegative(),
    errorMessage: z.string().nullable(),

    researchStartedAt: z.string().datetime({ offset: true }).nullable(),
    researchFinishedAt: z.string().datetime({ offset: true }).nullable(),
    researchError: ResearchErrorSchema.nullable(),

    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
export type Briefing = z.infer<typeof BriefingSchema>

export const BriefingListItemSchema = z
  .object({
    id: BriefingIdSchema,
    title: z.string(),
    companyName: z.string().nullable(),
    status: BriefingStatusSchema,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()
export type BriefingListItem = z.infer<typeof BriefingListItemSchema>
