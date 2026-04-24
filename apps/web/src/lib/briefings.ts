/**
 * Server-side helpers that talk to the graph on behalf of a logged-in user.
 * The graph is not auth-aware in Phase 0. Auth happens at the Next.js layer
 * (session cookie) and the user id is passed through as a parameter.
 */

const DEFAULT_GRAPH_URL = "http://localhost:4001/graphql";

function graphEndpoint(): string {
  return process.env["GRAPH_INTERNAL_URL"] ?? DEFAULT_GRAPH_URL;
}

export type BriefingStatus = "pending" | "researching" | "drafting" | "ready" | "failed";

export interface BriefingSummary {
  id: string;
  status: BriefingStatus;
  contactName: string | null;
  companyName: string | null;
}

export interface BriefingDetail extends BriefingSummary {
  userId: string;
  meetingId: string | null;
  contactEmail: string | null;
  contactRole: string | null;
  companyDomain: string | null;
  companySummary: string | null;
  summary60s: string | null;
  sections: Record<string, unknown> | null;
  sourcesCount: number;
  errorMessage: string | null;
  researchStartedAt: string | null;
  researchFinishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EnsureBriefingInput {
  userId: string;
  userEmail: string | null;
  calendarEventId: string;
  title: string;
  startsAt: string;
  attendees: Array<{ email: string; displayName?: string }>;
  description: string | null;
  force?: boolean;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(graphEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors && json.errors.length > 0) {
    throw new Error(`graph: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("graph: empty response");
  return json.data;
}

/** Look up the latest briefing for a calendar event. Returns null if none exists. */
export async function getBriefingByEvent(
  userId: string,
  calendarEventId: string,
): Promise<BriefingSummary | null> {
  const data = await gql<{ getBriefingByEvent: BriefingSummary | null }>(
    `query($u: ID!, $e: String!) {
       getBriefingByEvent(userId: $u, calendarEventId: $e) {
         id status contactName companyName
       }
     }`,
    { u: userId, e: calendarEventId },
  );
  return data.getBriefingByEvent ?? null;
}

/** Bulk-load briefings for a list of calendar events. Silent on individual failures. */
export async function getBriefingsByEvents(
  userId: string,
  calendarEventIds: string[],
): Promise<Map<string, BriefingSummary>> {
  const entries = await Promise.all(
    calendarEventIds.map(async (id) => {
      try {
        const b = await getBriefingByEvent(userId, id);
        return b ? ([id, b] as const) : null;
      } catch {
        return null;
      }
    }),
  );
  return new Map(entries.filter((e): e is readonly [string, BriefingSummary] => e !== null));
}

/**
 * Creates a meeting row and briefing if missing, else returns the current one.
 * Pass `force: true` to always create a fresh briefing even when one already
 * exists (used for Re-run from the UI).
 */
export async function ensureBriefingForEvent(
  input: EnsureBriefingInput,
): Promise<BriefingSummary> {
  const data = await gql<{ ensureBriefingForEvent: BriefingSummary }>(
    `mutation($i: EnsureBriefingForEventInput!) {
       ensureBriefingForEvent(input: $i) {
         id status contactName companyName
       }
     }`,
    { i: input },
  );
  return data.ensureBriefingForEvent;
}

/** Fetch full briefing detail. Used by the viewer page. */
export async function getBriefing(id: string): Promise<BriefingDetail | null> {
  const data = await gql<{ getBriefing: BriefingDetail | null }>(
    `query($b: ID!) {
       getBriefing(id: $b) {
         id userId meetingId status
         contactName contactEmail contactRole
         companyName companyDomain companySummary
         summary60s sections sourcesCount errorMessage
         researchStartedAt researchFinishedAt createdAt updatedAt
       }
     }`,
    { b: id },
  );
  return data.getBriefing;
}
