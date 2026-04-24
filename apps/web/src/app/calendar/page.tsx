import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { ensureAccessToken } from "@/lib/oauth";
import { listUpcomingEvents, type UpcomingEvent } from "@/lib/calendar";
import { getBriefingsByEvents, type BriefingSummary } from "@/lib/briefings";
import { CreateEventForm } from "./CreateEventForm";
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

  const result = await loadEvents(session.sub);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">PreCall</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-900">Calendar</h1>
        </div>
        <Link
          href="/dashboard"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          Back to dashboard
        </Link>
      </header>

      <section className="mt-8">
        <CreateEventForm />
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Upcoming events</h2>
          {result.kind === "ok" && result.events.length > 0 ? (
            <DebriefAllButton events={result.events} windowHours={24} />
          ) : null}
        </div>
        {result.kind === "error" ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            Could not load events: {result.message}
          </div>
        ) : result.events.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No upcoming events on your primary calendar.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
