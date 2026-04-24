import { randomUUID } from 'node:crypto'
import { z } from 'zod'

type Brand<T, B extends string> = T & { readonly __brand: B }

export type UserId = Brand<string, 'UserId'>
export type MeetingId = Brand<string, 'MeetingId'>
export type BriefingId = Brand<string, 'BriefingId'>
export type JobId = Brand<string, 'JobId'>
export type SourceId = Brand<string, 'SourceId'>
export type TranscriptId = Brand<string, 'TranscriptId'>
export type NotionPageId = Brand<string, 'NotionPageId'>

const uuid = z.string().uuid()

const notionPageIdSchema = z
  .string()
  .min(1)
  .refine(
    (s) =>
      uuid.safeParse(s).success ||
      uuid.safeParse(
        s.replace(/-/g, '').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
      ).success,
    'notion page id must be a uuid (with or without dashes)',
  )

export const UserId = {
  parse: (s: string): UserId => uuid.parse(s) as UserId,
  safeParse: (s: string) => {
    const r = uuid.safeParse(s)
    return r.success
      ? { success: true as const, data: r.data as UserId }
      : { success: false as const, error: r.error }
  },
  new: (): UserId => randomUUID() as UserId,
}

export const MeetingId = {
  parse: (s: string): MeetingId => uuid.parse(s) as MeetingId,
  safeParse: (s: string) => {
    const r = uuid.safeParse(s)
    return r.success
      ? { success: true as const, data: r.data as MeetingId }
      : { success: false as const, error: r.error }
  },
  new: (): MeetingId => randomUUID() as MeetingId,
}

export const BriefingId = {
  parse: (s: string): BriefingId => uuid.parse(s) as BriefingId,
  safeParse: (s: string) => {
    const r = uuid.safeParse(s)
    return r.success
      ? { success: true as const, data: r.data as BriefingId }
      : { success: false as const, error: r.error }
  },
  new: (): BriefingId => randomUUID() as BriefingId,
}

export const JobId = {
  parse: (s: string): JobId => uuid.parse(s) as JobId,
  safeParse: (s: string) => {
    const r = uuid.safeParse(s)
    return r.success
      ? { success: true as const, data: r.data as JobId }
      : { success: false as const, error: r.error }
  },
  new: (): JobId => randomUUID() as JobId,
}

export const SourceId = {
  parse: (s: string): SourceId => uuid.parse(s) as SourceId,
  safeParse: (s: string) => {
    const r = uuid.safeParse(s)
    return r.success
      ? { success: true as const, data: r.data as SourceId }
      : { success: false as const, error: r.error }
  },
  new: (): SourceId => randomUUID() as SourceId,
}

export const TranscriptId = {
  parse: (s: string): TranscriptId => uuid.parse(s) as TranscriptId,
  safeParse: (s: string) => {
    const r = uuid.safeParse(s)
    return r.success
      ? { success: true as const, data: r.data as TranscriptId }
      : { success: false as const, error: r.error }
  },
  new: (): TranscriptId => randomUUID() as TranscriptId,
}

export const NotionPageId = {
  parse: (s: string): NotionPageId => notionPageIdSchema.parse(s) as NotionPageId,
  safeParse: (s: string) => {
    const r = notionPageIdSchema.safeParse(s)
    return r.success
      ? { success: true as const, data: r.data as NotionPageId }
      : { success: false as const, error: r.error }
  },
}

export const UserIdSchema = uuid.transform((s) => s as UserId)
export const MeetingIdSchema = uuid.transform((s) => s as MeetingId)
export const BriefingIdSchema = uuid.transform((s) => s as BriefingId)
export const JobIdSchema = uuid.transform((s) => s as JobId)
export const SourceIdSchema = uuid.transform((s) => s as SourceId)
export const TranscriptIdSchema = uuid.transform((s) => s as TranscriptId)
export const NotionPageIdSchema = notionPageIdSchema.transform((s) => s as NotionPageId)
