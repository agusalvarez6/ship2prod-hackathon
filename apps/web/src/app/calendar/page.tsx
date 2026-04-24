import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { ensureAccessToken } from "@/lib/oauth";
import { getUserById } from "@/lib/users";
import { listUpcomingEvents, type UpcomingEvent } from "@/lib/calendar";
import { getBriefingsByEvents, type BriefingSummary } from "@/lib/briefings";
import { DebriefAllButton } from "./DebriefAllButton";
import { EventRow } from "./EventRow";

export const dynamic = "force-dynamic";

type LoadResult =
  | { kind: "ok"; events: UpcomingEvent[]; briefings: Map<string, BriefingSummary> }
  | { kind: "error"; message: string };

async function loadEvents(userId: string): Promise<LoadResult> {
  try {
    const accessToken = await ensureAccessToken(userId);
    const events = await listUpcomingEvents(accessToken, 20);
    const briefings = await getBriefingsByEvents(
      userId,
      events.map((e) => e.id),
    );
    return { kind: "ok", events, briefings };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { kind: "error", message };
  }
}

export default async function CalendarPage(): Promise<JSX.Element> {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect("/");

  let session;
  try {
    session = await verifySession(token);
  } catch {
    redirect("/");
  }

  const user = await getUserById(session.sub);
  if (!user) redirect("/");
  if (!user.phone_number_e164) redirect("/onboarding");

  const result = await loadEvents(user.id);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="flex items-end justify-between border-b border-ink-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-700">
            Schedule
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">Calendar</h1>
        </div>
        <Link
          href="/dashboard"
          className="rounded-md border border-ink-300 bg-paper px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50"
        >
          Back to dashboard
        </Link>
      </header>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-ink-900">Upcoming events</h2>
            <p className="mt-1 text-xs text-ink-500">
              Prepare a briefing for any event; PreCall researches the contact and company.
            </p>
          </div>
          {result.kind === "ok" ? (
            <DebriefAllButton events={result.events} windowHours={24} />
          ) : null}
        </div>

        {result.kind === "error" ? (
          <div className="mt-6 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-900">
            Could not load events: {result.message}
          </div>
        ) : result.events.length === 0 ? (
          <p className="mt-6 text-sm text-ink-600">No upcoming events on your primary calendar.</p>
        ) : (
          <ul className="mt-6 divide-y divide-ink-200 overflow-hidden rounded-2xl border border-ink-200 bg-paper shadow-sm">
            {result.events.map((event) => {
              const brief = result.briefings.get(event.id);
              return (
                <EventRow
                  key={event.id}
                  event={event}
                  initialBriefing={brief ? { id: brief.id, status: brief.status } : null}
                />
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
