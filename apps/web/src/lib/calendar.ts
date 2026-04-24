import { classifyGoogleError } from "./errors.js";

const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export interface UpcomingEvent {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  htmlLink: string | null;
  attendees: { email: string; displayName?: string }[];
  description: string | null;
}

export interface GoogleEventResource {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  htmlLink?: string;
  attendees?: { email: string; displayName?: string }[];
}

export interface CreateEventInput {
  title: string;
  startsAt: string;
  durationMinutes: number;
  timeZone: string;
}

/**
 * List upcoming events on the user's primary calendar. Returns at most
 * `limit` items, ordered by start time.
 */
export async function listUpcomingEvents(
  accessToken: string,
  limit = 20,
  fetchImpl: typeof fetch = fetch,
): Promise<UpcomingEvent[]> {
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(limit),
  });
  const url = `${CAL_BASE}/calendars/primary/events?${params.toString()}`;
  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw classifyGoogleError(res.status, body);
  }
  const parsed = (await res.json()) as { items?: GoogleEventResource[] };
  return (parsed.items ?? []).map(toUpcomingEvent);
}

/**
 * Insert a single event on the primary calendar. Returns the created event
 * in our trimmed shape.
 */
export async function createEvent(
  accessToken: string,
  input: CreateEventInput,
  fetchImpl: typeof fetch = fetch,
): Promise<UpcomingEvent> {
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`invalid startsAt: ${input.startsAt}`);
  }
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);

  const body = {
    summary: input.title,
    start: { dateTime: start.toISOString(), timeZone: input.timeZone },
    end: { dateTime: end.toISOString(), timeZone: input.timeZone },
  };

  const res = await fetchImpl(`${CAL_BASE}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw classifyGoogleError(res.status, text);
  }
  const created = (await res.json()) as GoogleEventResource;
  return toUpcomingEvent(created);
}

/**
 * Set the description of an existing primary-calendar event. The given
 * string replaces the entire `description` field; pass empty string to
 * clear it.
 */
export async function setEventDescription(
  accessToken: string,
  eventId: string,
  description: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UpcomingEvent> {
  const encodedId = encodeURIComponent(eventId);
  const res = await fetchImpl(`${CAL_BASE}/calendars/primary/events/${encodedId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) {
    throw classifyGoogleError(res.status, await res.text());
  }
  const patched = (await res.json()) as GoogleEventResource;
  return toUpcomingEvent(patched);
}

function toUpcomingEvent(resource: GoogleEventResource): UpcomingEvent {
  return {
    id: resource.id,
    title: resource.summary ?? "(no title)",
    startsAt: resource.start?.dateTime ?? resource.start?.date ?? null,
    endsAt: resource.end?.dateTime ?? resource.end?.date ?? null,
    htmlLink: resource.htmlLink ?? null,
    attendees: resource.attendees ?? [],
    description: resource.description ?? null,
  };
}
