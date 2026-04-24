"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UpcomingEvent } from "@/lib/calendar";
import type { BriefingStatus } from "@/lib/briefings";

interface InitialBriefing {
  id: string;
  status: BriefingStatus;
}

const ACTIVE_STATUSES: readonly BriefingStatus[] = ["pending", "researching", "drafting"];

export function EventRow({
  event,
  initialBriefing,
}: {
  event: UpcomingEvent;
  initialBriefing: InitialBriefing | null;
}): JSX.Element {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [description, setDescription] = useState(event.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [briefing, setBriefing] = useState<InitialBriefing | null>(initialBriefing);
  const [debriefing, setDebriefing] = useState(false);
  const [debriefError, setDebriefError] = useState<string | null>(null);

  const dirty = description !== (event.description ?? "");

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!dirty) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/events/${encodeURIComponent(event.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.message ?? `request failed (${res.status})`);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  function onReset(): void {
    setDescription(event.description ?? "");
    setError(null);
    setSavedAt(null);
  }

  async function onDebrief(): Promise<void> {
    if (debriefing) return;
    setDebriefing(true);
    setDebriefError(null);
    try {
      const res = await fetch("/api/briefings/ensure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          calendarEventId: event.id,
          title: event.title,
          startsAt: event.startsAt,
          attendees: event.attendees,
          description: event.description,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDebriefError(body?.error ?? `request failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as { id: string; status: BriefingStatus };
      setBriefing({ id: data.id, status: data.status });
    } catch (err) {
      setDebriefError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setDebriefing(false);
    }
  }

  useEffect(() => {
    if (!briefing || !ACTIVE_STATUSES.includes(briefing.status)) return;
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const res = await fetch("/api/graph", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            query: `query($b: ID!) { getBriefing(id: $b) { id status } }`,
            variables: { b: briefing!.id },
          }),
        });
        const payload = (await res.json()) as {
          data?: { getBriefing: { id: string; status: BriefingStatus } | null };
        };
        if (cancelled) return;
        const next = payload.data?.getBriefing;
        if (next) setBriefing({ id: next.id, status: next.status });
      } catch {
        /* keep the last known status on transient failure */
      }
    }

    const interval = setInterval(() => void poll(), 2000);
    void poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [briefing]);

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{event.title}</p>
          <p className="text-xs text-slate-500">
            {event.startsAt ? new Date(event.startsAt).toLocaleString() : "no start time"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <BriefingBadge briefing={briefing} />
          <DebriefControl
            briefing={briefing}
            debriefing={debriefing}
            onDebrief={() => void onDebrief()}
          />
          {event.htmlLink ? (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-slate-700 hover:underline"
            >
              Open in Google
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            aria-expanded={expanded}
          >
            {expanded ? "Close" : "Edit description"}
          </button>
        </div>
      </div>

      {debriefError ? (
        <p className="mt-2 text-xs text-red-700">Debrief error: {debriefError}</p>
      ) : null}

      {expanded ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="text-sm text-slate-700">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Event description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                placeholder="No description yet. Add talking points, context, links…"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting || !dirty}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
              >
                {submitting ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={onReset}
                disabled={submitting || !dirty}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
              >
                Reset
              </button>
              {savedAt && !dirty ? (
                <span className="text-xs text-emerald-700">Saved</span>
              ) : null}
              {error ? (
                <span className="text-xs text-red-700">Error: {error}</span>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </li>
  );
}

function BriefingBadge({ briefing }: { briefing: InitialBriefing | null }): JSX.Element | null {
  if (!briefing) return null;
  const label = briefing.status;
  const styles: Record<BriefingStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    researching: "bg-yellow-100 text-yellow-800",
    drafting: "bg-yellow-100 text-yellow-800",
    ready: "bg-emerald-100 text-emerald-800",
    failed: "bg-red-100 text-red-800",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[label]}`}>{label}</span>
  );
}

function DebriefControl({
  briefing,
  debriefing,
  onDebrief,
}: {
  briefing: InitialBriefing | null;
  debriefing: boolean;
  onDebrief: () => void;
}): JSX.Element {
  if (briefing?.status === "ready") {
    return (
      <Link
        href={`/briefings/${briefing.id}`}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
      >
        Open briefing
      </Link>
    );
  }
  if (briefing && ACTIVE_STATUSES.includes(briefing.status)) {
    return (
      <span className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-500">
        Researching…
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onDebrief}
      disabled={debriefing}
      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
    >
      {debriefing ? "Starting…" : briefing?.status === "failed" ? "Retry debrief" : "Debrief"}
    </button>
  );
}
