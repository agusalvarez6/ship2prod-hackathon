import type { UserId } from '@ship2prod/schema'

export interface CalendarEvent {
  id: string
  title: string
  startsAt: string
  endsAt: string
  attendees: { email: string; displayName?: string; organizer?: boolean }[]
  description?: string
}

export interface GCalClient {
  listUpcoming(input: { userId: UserId; limit: number }): Promise<CalendarEvent[]>
}

export interface GCalClientConfig {
  refreshTokenResolver: (userId: UserId) => Promise<string>
  clientId: string
  clientSecret: string
}

export function createGCalClient(_config: GCalClientConfig): GCalClient {
  return {
    async listUpcoming() {
      throw new Error('not implemented in Phase 0')
    },
  }
}
