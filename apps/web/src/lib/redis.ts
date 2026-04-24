import Redis from "ioredis";
import { getEnv } from "./env.js";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;
  const env = getEnv();
  client = new Redis(env.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
  });
  return client;
}

/** Test-only. Disconnects and clears the singleton. */
export async function closeRedis(): Promise<void> {
  if (!client) return;
  client.disconnect();
  client = null;
}
