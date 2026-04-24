import { z } from "zod";

const NotionEnvSchema = z.object({
  NOTION_OAUTH_CLIENT_ID: z.string().min(1),
  NOTION_OAUTH_CLIENT_SECRET: z.string().min(1),
  NOTION_OAUTH_REDIRECT_URI: z.string().url(),
});

export type NotionEnv = z.infer<typeof NotionEnvSchema>;

let cached: NotionEnv | null = null;

export function getNotionEnv(): NotionEnv {
  if (cached) return cached;
  const parsed = NotionEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid Notion OAuth environment. Missing or bad: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetNotionEnvCache(): void {
  cached = null;
}
