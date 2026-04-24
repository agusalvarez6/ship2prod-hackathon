import type { Metadata } from 'next'
import { SlidesExperience } from './SlidesExperience'

export const metadata: Metadata = {
  title: 'PreCallBot Demo Slides',
  description: 'Three-slide hackathon demo intro for PreCallBot.',
}

export default function SlidesPage(): JSX.Element {
  return <SlidesExperience />
}
