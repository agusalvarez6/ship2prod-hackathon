import { z } from "zod";
import type { BriefingSections, ResearchError } from "./briefing.js";

export const UsersRowSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    google_refresh_token: z.string().nullable(),
    notion_token: z.string().nullable(),
    created_at: z.string(),
  })
  .strict();
export type UsersRow = z.infer<typeof UsersRowSchema>;

export const AttendeeSchema = z
  .object({
    email: z.string().email(),
    displayName: z.string().optional(),
    organizer: z.boolean().optional(),
  })
  .strict();
export type Attendee = z.infer<typeof AttendeeSchema>;

export const MeetingsRowSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    calendar_event_id: z.string(),
    title: z.string(),
    starts_at: z.string(),
    attendees: z.array(AttendeeSchema),
    description: z.string().nullable(),
    created_at: z.string(),
  })
  .strict();
export type MeetingsRow = z.infer<typeof MeetingsRowSchema>;

export const BriefingStatusDbSchema = z.enum([
  "pending",
  "researching",
  "drafting",
  "ready",
  "failed",
]);
export type BriefingStatusDb = z.infer<typeof BriefingStatusDbSchema>;

export interface BriefingsRow {
  id: string;
  user_id: string;
  meeting_id: string | null;

  contact_name: string | null;
  contact_email: string | null;
  contact_role: string | null;
  company_name: string | null;
  company_domain: string | null;
  company_summary: string | null;

  status: BriefingStatusDb;
  summary_60s: string | null;
  sections: BriefingSections | null;
  sources_count: number;
  error_message: string | null;

  research_started_at: string | null;
  research_finished_at: string | null;
  research_error: ResearchError | null;

  created_at: string;
  updated_at: string;
}

export const SourceKindDbSchema = z.enum([
  "notion_page",
  "company_site",
  "product_page",
  "pricing_page",
  "blog_post",
  "news",
  "linkedin",
  "filing",
  "other",
]);
export type SourceKindDb = z.infer<typeof SourceKindDbSchema>;

export const SourceStatusDbSchema = z.enum([
  "ok",
  "blocked",
  "captcha",
  "timeout",
  "dead",
  "skipped",
]);
export type SourceStatusDb = z.infer<typeof SourceStatusDbSchema>;

export interface SourcesRow {
  id: string;
  briefing_id: string;
  kind: SourceKindDb;
  url: string | null;
  final_url: string | null;
  external_id: string | null;
  title: string | null;
  excerpt: string | null;
  raw: unknown;
  status: SourceStatusDb;
  fetched_at: string;
}

export interface CallTranscriptsRow {
  id: string;
  user_id: string;
  briefing_id: string | null;
  vapi_call_id: string | null;
  recording_url: string | null;
  transcript: unknown;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}
