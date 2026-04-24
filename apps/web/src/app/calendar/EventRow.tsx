"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UpcomingEvent } from "@/lib/calendar";
import type { BriefingStatus } from "@/lib/briefings";

interface InitialBriefing {
  id: string;
  status: BriefingStatus;
}

const ACTIVE_STATUSES: readonly BriefingStatus[] = ["pending", "researching", "drafting"];

function formatTime(iso: string | null): string {
  if (!iso) return "No start time";
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

export function EventRow({
  event,
  initialBriefing,
}: {
  event: UpcomingEvent;
  initialBriefing: InitialBriefing | null;
}): JSX.Element {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [briefing, setBriefing] = useState<InitialBriefing | null>(initialBriefing);
  const [working, setWorking] = useState<"debrief" | "rerun" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const externalAttendees = event.attendees.filter((a) => Boolean(a.email));

  async function triggerDebrief(force: boolean): Promise<void> {
    if (working) return;
    setWorking(force ? "rerun" : "debrief");
    setError(null);
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
          force,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `Request failed (${res.status}).`);
        return;
      }
      const data = (await res.json()) as { id: string; status: BriefingStatus };
      setBriefing({ id: data.id, status: data.status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setWorking(null);
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
        // transient: keep the last known status
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
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-ink-900">{event.title}</p>
            <BriefingChip briefing={briefing} />
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            {formatTime(event.startsAt)}
            {externalAttendees.length > 0
              ? ` · ${externalAttendees.length} attendee${externalAttendees.length === 1 ? "" : "s"}`
              : ""}
          </p>
          <EventMeta
            event={event}
            briefing={briefing}
            editing={expanded}
            onEdit={() => setExpanded((v) => !v)}
            onRerun={() => void triggerDebrief(true)}
            rerunning={working === "rerun"}
          />
        </div>
        <PrimaryAction
          briefing={briefing}
          onDebrief={() => void triggerDebrief(false)}
          debriefing={working === "debrief"}
        />
      </div>

      {error ? <p className="mt-2 text-xs text-danger-700">{error}</p> : null}

      {expanded ? (
        <DescriptionEditor
          event={event}
          onClose={() => setExpanded(false)}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </li>
  );
}

function BriefingChip({ briefing }: { briefing: InitialBriefing | null }): JSX.Element | null {
  if (!briefing) return null;
  const styles: Record<BriefingStatus, string> = {
    pending: "bg-warning-50 text-warning-900 border-warning-200",
    researching: "bg-warning-50 text-warning-900 border-warning-200",
    drafting: "bg-warning-50 text-warning-900 border-warning-200",
    ready: "bg-success-50 text-success-900 border-success-200",
    failed: "bg-danger-50 text-danger-900 border-danger-200",
  };
  const labels: Record<BriefingStatus, string> = {
    pending: "Preparing",
    researching: "Researching",
    drafting: "Writing",
    ready: "Ready",
    failed: "Failed",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[briefing.status]}`}
    >
      {labels[briefing.status]}
    </span>
  );
}

function PrimaryAction({
  briefing,
  onDebrief,
  debriefing,
}: {
  briefing: InitialBriefing | null;
  onDebrief: () => void;
  debriefing: boolean;
}): JSX.Element {
  if (briefing?.status === "ready") {
    return (
      <Link
        href={`/briefings/${briefing.id}`}
        className="inline-flex items-center gap-1 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-paper shadow-sm transition-colors hover:bg-accent-700"
      >
        Open briefing
        <span aria-hidden>→</span>
      </Link>
    );
  }
  if (briefing && ACTIVE_STATUSES.includes(briefing.status)) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-ink-200 bg-paper px-4 py-2 text-sm font-medium text-ink-600">
        <Spinner />
        Researching
      </span>
    );
  }
  const label = briefing?.status === "failed" ? "Retry" : "Prepare";
  return (
    <button
      type="button"
      onClick={onDebrief}
      disabled={debriefing}
      className="inline-flex items-center gap-2 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-paper shadow-sm transition-colors hover:bg-accent-700 disabled:bg-ink-300 disabled:text-ink-500 disabled:shadow-none"
    >
      {debriefing ? <Spinner /> : null}
      {debriefing ? "Starting…" : label}
    </button>
  );
}

function EventMeta({
  event,
  briefing,
  editing,
  onEdit,
  onRerun,
  rerunning,
}: {
  event: UpcomingEvent;
  briefing: InitialBriefing | null;
  editing: boolean;
  onEdit: () => void;
  onRerun: () => void;
  rerunning: boolean;
}): JSX.Element {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {event.htmlLink ? (
        <a
          href={event.htmlLink}
          target="_blank"
          rel="noreferrer"
          className="text-ink-600 transition-colors hover:text-accent-700"
        >
          Open in Google ↗
        </a>
      ) : null}
      <button
        type="button"
        onClick={onEdit}
        aria-expanded={editing}
        className="text-ink-600 transition-colors hover:text-accent-700"
      >
        {editing ? "Close description" : "Edit description"}
      </button>
      {briefing?.status === "ready" ? (
        <button
          type="button"
          onClick={onRerun}
          disabled={rerunning}
          title="Throw out the current briefing and research again."
          className="text-ink-600 transition-colors hover:text-accent-700 disabled:text-ink-400"
        >
          {rerunning ? "Re-running…" : "Re-run"}
        </button>
      ) : null}
    </div>
  );
}

function DescriptionEditor({
  event,
  onClose,
  onSaved,
}: {
  event: UpcomingEvent;
  onClose: () => void;
  onSaved: () => void;
}): JSX.Element {
  const [description, setDescription] = useState(event.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirty = description !== (event.description ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

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
        setError(body?.message ?? `Request failed (${res.status}).`);
        return;
      }
      setSavedAt(Date.now());
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 flex flex-col gap-3 rounded-lg border border-ink-200 bg-ink-50 p-4"
    >
      <label className="block text-xs font-semibold uppercase tracking-wider text-ink-500">
        Description
      </label>
      <textarea
        ref={textareaRef}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={5}
        placeholder="Context the briefing should use: company URL, pre-work, who the other side is…"
        className="w-full rounded-md border border-ink-300 bg-paper px-3 py-2 text-sm text-ink-900 focus:border-accent-500 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !dirty}
          className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-paper shadow-sm transition-colors hover:bg-accent-700 disabled:bg-ink-300 disabled:text-ink-500 disabled:shadow-none"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-ink-300 bg-paper px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50"
        >
          Close
        </button>
        {savedAt && !dirty ? (
          <span className="text-xs font-medium text-success-700">Saved</span>
        ) : null}
        {error ? <span className="text-xs text-danger-700">{error}</span> : null}
      </div>
    </form>
  );
}

function Spinner(): JSX.Element {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
