'use client'

export function CallButton() {
  return (
    <button
      type="button"
      onClick={() => {
        console.warn('CallButton clicked — voice client not yet wired')
      }}
      className="rounded bg-black px-4 py-2 text-white"
    >
      Start call
    </button>
  )
}
