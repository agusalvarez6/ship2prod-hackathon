'use client'

import { useEffect, useState } from 'react'

const SARAH_MEETING_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const SARAH_FIXTURE_BRIEFING_ID = '11111111-2222-3333-4444-555555555555'

type BriefingStatus = 'pending' | 'ready' | 'failed' | 'unknown'

interface BriefingResponse {
  id: string
  status: BriefingStatus
  sections?: unknown
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/graph', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const payload = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }
  if (payload.errors && payload.errors.length > 0) {
    throw new Error(payload.errors.map((e) => e.message).join('; '))
  }
  if (!payload.data) throw new Error('empty response')
  return payload.data
}

export default function DebugPage(): JSX.Element {
  const [briefingId, setBriefingId] = useState<string | null>(null)
  const [status, setStatus] = useState<BriefingStatus>('unknown')
  const [sections, setSections] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)

  async function generate(): Promise<void> {
    setError(null)
    setSections(null)
    setStatus('unknown')
    setElapsed(0)
    try {
      const { createBriefingFromMeeting: b } = await gql<{
        createBriefingFromMeeting: BriefingResponse
      }>(
        `mutation($m: ID!) { createBriefingFromMeeting(meetingId: $m) { id status } }`,
        { m: SARAH_MEETING_ID },
      )
      setBriefingId(b.id)
      setStatus(b.status)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function viewFixture(): void {
    setError(null)
    setSections(null)
    setStatus('unknown')
    setElapsed(0)
    setBriefingId(SARAH_FIXTURE_BRIEFING_ID)
  }

  useEffect(() => {
    if (!briefingId) return
    let cancelled = false
    let t: ReturnType<typeof setTimeout> | null = null
    const start = Date.now()

    async function tick(): Promise<void> {
      if (cancelled) return
      try {
        const { getBriefing } = await gql<{ getBriefing: BriefingResponse | null }>(
          `query($b: ID!) { getBriefing(id: $b) { id status sections } }`,
          { b: briefingId },
        )
        if (cancelled) return
        if (!getBriefing) {
          setError('briefing not found')
          return
        }
        setStatus(getBriefing.status)
        setSections(getBriefing.sections ?? null)
        setElapsed(Math.floor((Date.now() - start) / 1000))
        if (getBriefing.status === 'pending') {
          t = setTimeout(tick, 2000)
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      }
    }
    void tick()

    return () => {
      cancelled = true
      if (t) clearTimeout(t)
    }
  }, [briefingId])

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">PreCall debug</h1>
          <p className="mt-2 text-sm text-gray-500">
            No-auth harness to trigger a briefing for the Sarah fixture meeting and watch it run.
          </p>
        </header>

        <section className="mb-6 flex gap-3">
          <button
            onClick={generate}
            disabled={status === 'pending'}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            Generate briefing for Sarah
          </button>
          <button
            onClick={viewFixture}
            disabled={status === 'pending'}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed"
          >
            View seeded fixture
          </button>
        </section>

        {error && (
          <div className="mb-6 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {briefingId && (
          <section className="mb-6 rounded border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500">briefing id</div>
                <div className="font-mono text-xs text-gray-900">{briefingId}</div>
              </div>
              <StatusPill status={status} elapsed={elapsed} />
            </div>
          </section>
        )}

        {sections != null && (
          <section className="rounded border border-gray-200 bg-white p-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">sections</div>
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-gray-800">
              {JSON.stringify(sections, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </main>
  )
}

function StatusPill({
  status,
  elapsed,
}: {
  status: BriefingStatus
  elapsed: number
}): JSX.Element {
  const styles: Record<BriefingStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    ready: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    unknown: 'bg-gray-100 text-gray-600',
  }
  return (
    <span
      className={`rounded px-2 py-1 text-xs font-medium ${styles[status]}`}
      title={`elapsed ${elapsed}s`}
    >
      {status}
      {status === 'pending' && elapsed > 0 ? ` (${elapsed}s)` : ''}
    </span>
  )
}
