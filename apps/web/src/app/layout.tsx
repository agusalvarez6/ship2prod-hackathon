import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "PreCall",
  description: "Voice-first meeting-prep agent.",
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-30 border-b border-ink-950/40 bg-ink-950">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-paper transition-opacity hover:opacity-80"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full bg-accent-500 shadow-[0_0_0_3px_oklch(0.520_0.095_265_/_0.18)]"
              />
              <span className="text-[13px] font-semibold uppercase tracking-[0.22em]">PreCall</span>
            </Link>
            <span className="text-[11px] uppercase tracking-[0.2em] text-ink-400">
              Meeting prep, before the call
            </span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
