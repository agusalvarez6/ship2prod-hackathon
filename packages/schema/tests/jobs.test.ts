import { describe, expect, it } from "vitest";
import {
  ProgressEventSchema,
  ProgressSnapshotSchema,
  ProgressStepSchema,
  ResearchJobPayloadSchema,
} from "../src/jobs.js";

describe("ResearchJobPayloadSchema", () => {
  const valid = {
    jobId: "11111111-1111-1111-1111-111111111111",
    briefingId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    meetingId: "44444444-4444-4444-4444-444444444444",
    notionPageIds: ["55555555-5555-5555-5555-555555555555"],
    requestedAt: 1714000000000,
  };

  it("round-trips a valid payload", () => {
    const parsed = ResearchJobPayloadSchema.parse(valid);
    expect(parsed.notionPageIds).toHaveLength(1);
  });

  it("rejects non-uuid briefingId", () => {
    const bad = { ...valid, briefingId: "abc" };
    expect(ResearchJobPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative requestedAt", () => {
    const bad = { ...valid, requestedAt: -1 };
    expect(ResearchJobPayloadSchema.safeParse(bad).success).toBe(false);
  });
});

describe("ProgressEventSchema", () => {
  it("round-trips a valid event", () => {
    const parsed = ProgressEventSchema.parse({
      step: "synthesizing",
      pct: 70,
      detail: "Calling LLM",
      at: 1714000000000,
    });
    expect(parsed.step).toBe("synthesizing");
  });

  it("rejects pct > 100", () => {
    const bad = { step: "ready", pct: 101, at: 1714000000000 };
    expect(ProgressEventSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown step", () => {
    const bad = { step: "deploying", pct: 50, at: 1714000000000 };
    expect(ProgressEventSchema.safeParse(bad).success).toBe(false);
  });
});

describe("ProgressSnapshotSchema", () => {
  it("round-trips a snapshot with history", () => {
    const snap = {
      jobId: "11111111-1111-1111-1111-111111111111",
      current: { step: "ready" as const, pct: 100, at: 1714000000500 },
      history: [
        { step: "queued" as const, pct: 0, at: 1714000000000 },
        { step: "ready" as const, pct: 100, at: 1714000000500 },
      ],
    };
    const parsed = ProgressSnapshotSchema.parse(snap);
    expect(parsed.history).toHaveLength(2);
  });

  it("rejects missing current", () => {
    const bad = {
      jobId: "11111111-1111-1111-1111-111111111111",
      history: [],
    };
    expect(ProgressSnapshotSchema.safeParse(bad).success).toBe(false);
  });
});

describe("ProgressStepSchema", () => {
  it("accepts all 7 steps from master §4", () => {
    const steps = [
      "queued",
      "searching_notion",
      "researching_company",
      "reading_pages",
      "synthesizing",
      "ready",
      "failed",
    ];
    for (const s of steps) {
      expect(ProgressStepSchema.safeParse(s).success).toBe(true);
    }
  });
});
