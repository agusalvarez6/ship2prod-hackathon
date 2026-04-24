export interface CalendarEvent {
  id: string
  title: string
  startsAt: string
  attendees: Array<{ email: string; name?: string }>
}

export interface GCalClient {
  listUpcoming(userId: string): Promise<CalendarEvent[]>
}

export interface GCalClientConfig {
  accessToken: string
}

export function createGCalClient(_config: GCalClientConfig): GCalClient {
  return {
    async listUpcoming(_userId: string): Promise<CalendarEvent[]> {
      throw new Error('not implemented in Phase 0')
    },
  }
}
