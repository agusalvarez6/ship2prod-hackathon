import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "PreCallBot",
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
              <img
                src="/brand/logo-white.png"
                alt=""
                className="h-8 w-8 rounded-md object-cover"
              />
              <span className="text-[13px] font-semibold uppercase tracking-[0.22em]">
                PreCallBot
              </span>
            </Link>
            <span className="hidden text-[11px] uppercase tracking-[0.2em] text-ink-400 sm:inline">
              Meeting prep, before the call
            </span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
