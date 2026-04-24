"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

function tomorrowAt10Local(): string {
  const now = new Date();
  const t = new Date(now);
  t.setDate(now.getDate() + 1);
  t.setHours(10, 0, 0, 0);
  return t.toISOString();
}

export function CreateEventForm(): JSX.Element {
  const router = useRouter();
  const [title, setTitle] = useState("PreCall test event");
  const [startsAt, setStartsAt] = useState<string>(() => tomorrowAt10Local());
  const [duration, setDuration] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tz = useMemo(() => {
    if (typeof Intl !== "undefined") {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
    }
    return "America/Los_Angeles";
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, startsAt, durationMinutes: duration, timeZone: tz }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.message ?? `request failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-4"
    >
      <label className="sm:col-span-2 text-sm text-slate-700">
        <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Title
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
        />
      </label>
      <label className="text-sm text-slate-700">
        <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Starts at (ISO)
        </span>
        <input
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono focus:border-slate-900 focus:outline-none"
        />
      </label>
      <label className="text-sm text-slate-700">
        <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Duration (min)
        </span>
        <input
          type="number"
          min={5}
          max={480}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
        />
      </label>

      <div className="sm:col-span-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
        >
          {submitting ? "Creating..." : "Create test event"}
        </button>
        <span className="text-xs text-slate-500">Timezone: {tz}</span>
      </div>

      {error ? (
        <p className="sm:col-span-4 text-sm text-red-700">Error: {error}</p>
      ) : null}
    </form>
  );
}
