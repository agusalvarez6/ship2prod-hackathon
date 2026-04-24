import { z } from "zod";

const EnvSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  SESSION_JWT_SECRET: z.string().min(32, "SESSION_JWT_SECRET must be at least 32 bytes"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration. Missing or bad: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test-only. Resets the memoised env so tests can mutate `process.env`. */
export function resetEnvCache(): void {
  cached = null;
}

/** True when running in production. Controls `Secure` cookie attribute. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
