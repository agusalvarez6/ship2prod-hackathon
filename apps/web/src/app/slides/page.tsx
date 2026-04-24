import type { Metadata } from 'next'
import { SlidesExperience } from './SlidesExperience'

export const metadata: Metadata = {
  title: 'PreCall Demo Slides',
  description: 'Three-slide hackathon demo intro for PreCall.',
}

export default function SlidesPage(): JSX.Element {
  return <SlidesExperience />
}
