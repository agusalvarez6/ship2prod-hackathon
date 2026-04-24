import type { NotionPageId, UserId } from '@ship2prod/schema'

export interface NotionPage {
  id: NotionPageId
  title: string
  url: string
  lastEditedAt: string
}

export interface NotionPageRead {
  id: NotionPageId
  title: string
  url: string
  text: string
}

export interface NotionClient {
  search(input: { userId: UserId; query: string }): Promise<NotionPage[]>
  readPage(input: { userId: UserId; pageId: NotionPageId }): Promise<NotionPageRead>
}

export interface NotionClientConfig {
  tokenResolver: (userId: UserId) => Promise<string>
}

export function createNotionClient(_config: NotionClientConfig): NotionClient {
  return {
    async search() {
      throw new Error('not implemented in Phase 0')
    },
    async readPage() {
      throw new Error('not implemented in Phase 0')
    },
  }
}
