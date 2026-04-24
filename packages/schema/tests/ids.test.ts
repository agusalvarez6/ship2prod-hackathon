import { describe, expect, it } from "vitest";
import {
  BriefingId,
  BriefingIdSchema,
  JobId,
  MeetingId,
  NotionPageId,
  SourceId,
  TranscriptId,
  UserId,
  UserIdSchema,
} from "../src/ids.js";

describe("branded id parsers", () => {
  it("parses a valid uuid into a branded BriefingId", () => {
    const raw = "11111111-2222-3333-4444-555555555555";
    const id = BriefingId.parse(raw);
    expect(id).toBe(raw);
  });

  it("rejects a non-uuid string for UserId", () => {
    expect(() => UserId.parse("not-a-uuid")).toThrow();
  });

  it("safeParse returns success false on invalid input", () => {
    const result = MeetingId.safeParse("");
    expect(result.success).toBe(false);
  });

  it("mints unique JobIds via new()", () => {
    const a = JobId.new();
    const b = JobId.new();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("NotionPageId accepts both dashed and undashed uuids", () => {
    const dashed = "11111111-2222-3333-4444-555555555555";
    const undashed = "11111111222233334444555555555555";
    expect(() => NotionPageId.parse(dashed)).not.toThrow();
    expect(() => NotionPageId.parse(undashed)).not.toThrow();
  });

  it("NotionPageId rejects empty", () => {
    const result = NotionPageId.safeParse("");
    expect(result.success).toBe(false);
  });

  it("SourceId and TranscriptId round-trip via schema", () => {
    const raw = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(SourceId.parse(raw)).toBe(raw);
    expect(TranscriptId.parse(raw)).toBe(raw);
  });

  it("UserIdSchema is the zod schema form and round-trips", () => {
    const raw = "11111111-2222-3333-4444-555555555555";
    expect(UserIdSchema.parse(raw)).toBe(raw);
    expect(BriefingIdSchema.safeParse("no").success).toBe(false);
  });
});
