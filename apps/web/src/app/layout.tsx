import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: 'PreCall',
  description: 'Voice-first meeting-prep agent.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
