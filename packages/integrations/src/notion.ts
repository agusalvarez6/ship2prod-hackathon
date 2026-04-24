export interface NotionPage {
  id: string
  title: string
  text: string
}

export interface NotionSearchResult {
  id: string
  title: string
}

export interface NotionClient {
  getPage(id: string): Promise<NotionPage>
  searchPages(query: string): Promise<NotionSearchResult[]>
}

export interface NotionClientConfig {
  accessToken: string
}

export function createNotionClient(_config: NotionClientConfig): NotionClient {
  return {
    async getPage(_id: string): Promise<NotionPage> {
      throw new Error('not implemented in Phase 0')
    },
    async searchPages(_query: string): Promise<NotionSearchResult[]> {
      throw new Error('not implemented in Phase 0')
    },
  }
}
