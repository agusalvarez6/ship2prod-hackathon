import { z } from "zod";
import { BriefingIdSchema, SourceIdSchema } from "./ids.js";

export const SourceKindSchema = z.enum([
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
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SourceStatusSchema = z.enum([
  "ok",
  "blocked",
  "captcha",
  "timeout",
  "dead",
  "skipped",
]);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const SourceSchema = z
  .object({
    id: SourceIdSchema,
    briefingId: BriefingIdSchema,
    kind: SourceKindSchema,
    url: z.string().url().nullable(),
    finalUrl: z.string().url().nullable(),
    externalId: z.string().nullable(),
    title: z.string().nullable(),
    excerpt: z.string().nullable(),
    raw: z.unknown(),
    status: SourceStatusSchema,
    fetchedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type Source = z.infer<typeof SourceSchema>;

export const CitedSourceSchema = z
  .object({
    id: SourceIdSchema,
    title: z.string(),
    url: z.string().url().optional(),
    kind: SourceKindSchema,
  })
  .strict();
export type CitedSource = z.infer<typeof CitedSourceSchema>;
