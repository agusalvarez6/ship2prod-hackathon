'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Slide = {
  eyebrow: string
  title: string
  body: string
  bullets: readonly string[]
  kind: 'problem' | 'flow' | 'demo'
}

const slides = [
  {
    eyebrow: '01 / Problem',
    title: 'Meeting prep is scattered right before the call.',
    body: 'PreCallBot turns calendar invites, Notion context, public research, and voice follow-ups into one tactical briefing.',
    bullets: [
      'No more last-minute tab hunting.',
      'Private notes and public context stay tied to the meeting.',
      'The output is short enough to use while walking in.',
    ],
    kind: 'problem',
  },
  {
    eyebrow: '02 / Product',
    title: 'A focused agent pipeline for every upcoming meeting.',
    body: 'The user picks a meeting. PreCallBot reads the workspace context, researches the company, stores the briefing, and exposes it through the web app and voice.',
    bullets: [
      'Google Calendar finds the next meeting.',
      'Notion and TinyFish provide private and public context.',
      'InsForge, Redis, WunderGraph, and Vapi make it demo-ready.',
    ],
    kind: 'flow',
  },
  {
    eyebrow: '03 / Demo',
    title: 'Open PreCallBot, brief a meeting, then ask by voice.',
    body: 'The hackathon demo shows a real user flow: connect sources, choose a meeting, generate a briefing, and ask for the best opening question.',
    bullets: [
      'The app keeps the workflow simple enough to understand live.',
      'The agent gives a 60-second summary and tactical questions.',
      'After this slide, the deck returns to the landing page.',
    ],
    kind: 'demo',
  },
] as const satisfies readonly Slide[]

function ProblemVisual(): JSX.Element {
  return (
    <div className="grid gap-3 text-sm text-ink-700">
      {['Calendar invite', 'Notion notes', 'Company site', 'Voice Q&A'].map((label, index) => (
        <div
          key={label}
          className="flex min-h-14 items-center justify-between rounded-lg border border-ink-200 bg-paper px-4 shadow-sm"
        >
          <span className="font-medium text-ink-900">{label}</span>
          <span className="font-mono text-xs text-ink-500">source {index + 1}</span>
        </div>
      ))}
      <div className="rounded-lg border border-accent-200 bg-accent-50 px-4 py-4 text-accent-900">
        <p className="text-xs font-semibold uppercase">PreCallBot</p>
        <p className="mt-1 text-lg font-semibold">One meeting-ready brief</p>
      </div>
    </div>
  )
}

function FlowVisual(): JSX.Element {
  const steps = ['Meeting', 'Context', 'Research', 'Briefing', 'Voice']

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        {steps.map((step, index) => (
          <div
            key={step}
            className="min-h-24 rounded-lg border border-ink-200 bg-paper p-3 shadow-sm"
          >
            <p className="font-mono text-xs text-accent-700">0{index + 1}</p>
            <p className="mt-3 text-sm font-semibold text-ink-900">{step}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-success-200 bg-success-50 p-4 text-sm leading-relaxed text-success-900">
        Queue progress, cached research, and stored briefings make the agent feel fast while the
        system remains production-shaped.
      </div>
    </div>
  )
}

function DemoVisual(): JSX.Element {
  return (
    <div className="rounded-lg border border-ink-200 bg-paper p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-ink-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase text-accent-700">Next meeting</p>
          <p className="mt-1 text-lg font-semibold text-ink-950">Intro with Sarah from Ramp</p>
        </div>
        <span className="rounded-md bg-ink-950 px-3 py-2 text-xs font-medium text-paper">
          Brief me
        </span>
      </div>
      <div className="mt-5 grid gap-3">
        <p className="rounded-lg bg-ink-100 px-4 py-3 text-sm text-ink-700">
          60-second summary: Sarah likely cares about finance operations, adoption friction, and
          proof that the workflow saves time.
        </p>
        <p className="rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-950">
          Ask first: What part of meeting prep still feels manual for your team?
        </p>
      </div>
    </div>
  )
}

function SlideVisual({ kind }: { kind: Slide['kind'] }): JSX.Element {
  if (kind === 'problem') return <ProblemVisual />
  if (kind === 'flow') return <FlowVisual />
  return <DemoVisual />
}

export function SlidesExperience(): JSX.Element {
  const router = useRouter()
  const [active, setActive] = useState(0)
  const slide = slides[active] ?? slides[0]
  const isFirst = active === 0
  const isLast = active === slides.length - 1

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'ArrowLeft') setActive((current) => Math.max(0, current - 1))
      if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        if (isLast) router.push('/')
        else setActive((current) => Math.min(slides.length - 1, current + 1))
      }
      if (event.key === 'Escape') router.push('/')
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLast, router])

  function goNext(): void {
    if (isLast) {
      router.push('/')
      return
    }
    setActive((current) => Math.min(slides.length - 1, current + 1))
  }

  return (
    <main className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden bg-paper text-ink-950">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(90deg,oklch(0.875_0.011_70)_1px,transparent_1px),linear-gradient(0deg,oklch(0.875_0.011_70)_1px,transparent_1px)] bg-[size:44px_44px] opacity-40" />
      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-6xl content-between px-5 py-6 sm:px-8 lg:px-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2" aria-label="Slide progress">
            {slides.map((item, index) => (
              <button
                key={item.eyebrow}
                type="button"
                aria-label={`Go to slide ${index + 1}`}
                onClick={() => setActive(index)}
                className={
                  index === active
                    ? 'h-2.5 w-10 rounded-md bg-accent-600 transition-all'
                    : 'h-2.5 w-2.5 rounded-md bg-ink-300 transition-all hover:bg-ink-500'
                }
              />
            ))}
          </div>
          <a
            href="/"
            className="rounded-md border border-ink-300 bg-paper px-3 py-2 text-sm font-medium text-ink-700 shadow-sm transition-colors hover:bg-ink-50"
          >
            Landing
          </a>
        </div>

        <div className="grid items-center gap-8 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          <section>
            <p className="text-sm font-semibold uppercase text-accent-700">{slide.eyebrow}</p>
            <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-none text-ink-950 md:text-6xl">
              {slide.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-700">{slide.body}</p>
            <ul className="mt-8 grid gap-3">
              {slide.bullets.map((bullet) => (
                <li
                  key={bullet}
                  className="flex items-start gap-3 text-base leading-7 text-ink-700"
                >
                  <span aria-hidden className="mt-3 h-1.5 w-5 rounded-full bg-accent-500" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </section>

          <aside className="border-l-4 border-accent-500 bg-ink-50 p-4 shadow-[0_24px_80px_-56px_oklch(0.145_0.010_70_/_0.7)] sm:p-6">
            <SlideVisual kind={slide.kind} />
          </aside>
        </div>

        <div className="flex flex-col gap-3 border-t border-ink-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-500">
            Slide {active + 1} of {slides.length}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActive((current) => Math.max(0, current - 1))}
              disabled={isFirst}
              className="rounded-md border border-ink-300 bg-paper px-4 py-2 text-sm font-medium text-ink-700 shadow-sm transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={goNext}
              className="rounded-md bg-accent-600 px-5 py-2 text-sm font-semibold text-paper shadow-sm transition-colors hover:bg-accent-700"
            >
              {isLast ? 'Finish to landing page' : 'Next'}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
