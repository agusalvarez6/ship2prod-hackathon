import type { BriefingId, MeetingId, NotionPageId, UserId } from "./ids.js";

export const REDIS_KEYS = {
  jobs: {
    pending: "research_jobs:pending",
    processing: "research_jobs:processing",
  },
  progress: (briefingId: BriefingId): string => `job:${briefingId}:progress`,
  claim: (briefingId: BriefingId): string => `job:${briefingId}:claim`,
  callSession: (callId: string): string => `call:session:${callId}`,
  idem: {
    vapi: (eventKey: string): string => `idem:vapi:${eventKey}`,
    vapiResult: (eventKey: string): string => `idem:vapi:${eventKey}:result`,
    createBriefing: (userId: UserId, meetingId: MeetingId): string =>
      `idem:briefings:create:${userId}:${meetingId}`,
  },
  cache: {
    briefing: (briefingId: BriefingId): string => `cache:briefing:${briefingId}`,
    tinyfish: (sha256: string): string => `cache:tinyfish:${sha256}`,
    notionPage: (pageId: NotionPageId): string => `cache:notion:page:${pageId}`,
    notionSearch: (sha256: string): string => `cache:notion:search:${sha256}`,
  },
} as const;

export const REDIS_TTL = {
  progress: 3600,
  claim: 600,
  callSession: 900,
  idemVapi: 600,
  idemCreate: 3600,
  cacheBriefing: 900,
  cacheTinyfish: 86400,
  cacheNotionPage: 3600,
  cacheNotionSearch: 600,
} as const;

export const REDIS_STREAM = {
  progress: {
    field: {
      step: "step",
      pct: "pct",
      detail: "detail",
      at: "at",
    },
    maxLen: 100,
  },
} as const;
