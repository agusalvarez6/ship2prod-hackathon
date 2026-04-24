import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "PreCall",
  description: "Voice-first meeting-prep agent.",
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
