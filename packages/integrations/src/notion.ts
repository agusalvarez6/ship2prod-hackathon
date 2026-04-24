import { Client, isFullPage, isFullBlock } from '@notionhq/client'
import type {
  BlockObjectResponse,
  PageObjectResponse,
  PartialBlockObjectResponse,
  PartialPageObjectResponse,
  QueryDatabaseParameters,
  RichTextItemResponse,
} from '@notionhq/client/build/src/api-endpoints.js'

export interface NotionPage {
  id: string
  title: string
  text: string
  url: string
  lastEditedAt: string
}

export interface NotionSearchResult {
  id: string
  title: string
  url: string
}

export interface NotionCalendarEvent {
  id: string
  title: string
  start: string
  end: string | null
  url: string
}

export interface ListCalendarEventsOptions {
  /** Name of the database property of type `date` to read event times from. */
  dateProperty: string
  /** Optional title-property name. If omitted, the page's title property is used. */
  titleProperty?: string
  /** ISO-8601 date/datetime. Inclusive lower bound on `dateProperty`. */
  from?: string
  /** ISO-8601 date/datetime. Exclusive upper bound on `dateProperty`. */
  to?: string
  /** Page size per Notion request (1–100). Defaults to 100. */
  pageSize?: number
}

export interface NotionClient {
  getPage(id: string): Promise<NotionPage>
  searchPages(query: string): Promise<NotionSearchResult[]>
  listCalendarEvents(
    databaseId: string,
    options: ListCalendarEventsOptions,
  ): Promise<NotionCalendarEvent[]>
}

export interface NotionClientConfig {
  accessToken: string
  /** Override the Notion API version header. Defaults to `2022-06-28`. */
  notionVersion?: string
  /** Injectable SDK client for tests. Not part of public contract. */
  sdk?: Pick<Client, 'pages' | 'blocks' | 'databases' | 'search'>
}

const DEFAULT_NOTION_VERSION = '2022-06-28'
const DEFAULT_PAGE_SIZE = 100

export function createNotionClient(config: NotionClientConfig): NotionClient {
  const notion =
    config.sdk ??
    new Client({
      auth: config.accessToken,
      notionVersion: config.notionVersion ?? DEFAULT_NOTION_VERSION,
    })

  return {
    async getPage(id) {
      const page = await notion.pages.retrieve({ page_id: id })
      if (!isFullPage(page)) {
        throw new Error(`notion: partial page response for id=${id}`)
      }
      const text = await readBlockTree(notion, id)
      return {
        id: page.id,
        title: extractPageTitle(page),
        text,
        url: page.url,
        lastEditedAt: page.last_edited_time,
      }
    },

    async searchPages(query) {
      const results: NotionSearchResult[] = []
      let cursor: string | undefined
      do {
        const res = await notion.search({
          query,
          filter: { property: 'object', value: 'page' },
          page_size: DEFAULT_PAGE_SIZE,
          ...(cursor ? { start_cursor: cursor } : {}),
        })
        for (const r of res.results) {
          if (r.object !== 'page' || !isFullPage(r)) continue
          results.push({
            id: r.id,
            title: extractPageTitle(r),
            url: r.url,
          })
        }
        cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
      } while (cursor)
      return results
    },

    async listCalendarEvents(databaseId, options) {
      const pageSize = clampPageSize(options.pageSize)
      const events: NotionCalendarEvent[] = []
      let cursor: string | undefined

      const filter = buildDateFilter(options)
      do {
        const params: QueryDatabaseParameters = {
          database_id: databaseId,
          page_size: pageSize,
          sorts: [{ property: options.dateProperty, direction: 'ascending' }],
          ...(filter ? { filter } : {}),
          ...(cursor ? { start_cursor: cursor } : {}),
        }
        const res = await notion.databases.query(params)
        for (const row of res.results) {
          if (!isFullPage(row)) continue
          const event = rowToCalendarEvent(row, options)
          if (event) events.push(event)
        }
        cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
      } while (cursor)

      return events
    },
  }
}

function clampPageSize(n: number | undefined): number {
  if (!n || n <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(100, Math.max(1, Math.floor(n)))
}

async function readBlockTree(
  notion: Pick<Client, 'blocks'>,
  blockId: string,
): Promise<string> {
  const lines: string[] = []
  let cursor: string | undefined
  do {
    const res = await notion.blocks.children.list({
      block_id: blockId,
      page_size: DEFAULT_PAGE_SIZE,
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    for (const child of res.results) {
      const line = await renderBlock(notion, child)
      if (line) lines.push(line)
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
  } while (cursor)
  return lines.join('\n')
}

async function renderBlock(
  notion: Pick<Client, 'blocks'>,
  block: BlockObjectResponse | PartialBlockObjectResponse,
): Promise<string> {
  if (!isFullBlock(block)) return ''
  const own = extractBlockText(block)
  if (!block.has_children) return own
  const childText = await readBlockTree(notion, block.id)
  if (!own) return childText
  if (!childText) return own
  return `${own}\n${childText}`
}

function extractBlockText(block: BlockObjectResponse): string {
  switch (block.type) {
    case 'paragraph':
      return richTextToPlain(block.paragraph.rich_text)
    case 'heading_1':
      return richTextToPlain(block.heading_1.rich_text)
    case 'heading_2':
      return richTextToPlain(block.heading_2.rich_text)
    case 'heading_3':
      return richTextToPlain(block.heading_3.rich_text)
    case 'bulleted_list_item':
      return richTextToPlain(block.bulleted_list_item.rich_text)
    case 'numbered_list_item':
      return richTextToPlain(block.numbered_list_item.rich_text)
    case 'to_do':
      return richTextToPlain(block.to_do.rich_text)
    case 'toggle':
      return richTextToPlain(block.toggle.rich_text)
    case 'quote':
      return richTextToPlain(block.quote.rich_text)
    case 'callout':
      return richTextToPlain(block.callout.rich_text)
    case 'code':
      return richTextToPlain(block.code.rich_text)
    default:
      return ''
  }
}

function richTextToPlain(rt: RichTextItemResponse[]): string {
  return rt.map((r) => r.plain_text).join('')
}

function extractPageTitle(page: PageObjectResponse): string {
  for (const key of Object.keys(page.properties)) {
    const prop = page.properties[key]
    if (prop && prop.type === 'title') {
      return richTextToPlain(prop.title)
    }
  }
  return ''
}

function extractPropertyText(
  prop: PageObjectResponse['properties'][string] | undefined,
): string | null {
  if (!prop) return null
  switch (prop.type) {
    case 'title':
      return richTextToPlain(prop.title)
    case 'rich_text':
      return richTextToPlain(prop.rich_text)
    default:
      return null
  }
}

type DateFilter = NonNullable<QueryDatabaseParameters['filter']>

function buildDateFilter(options: ListCalendarEventsOptions): DateFilter | undefined {
  const { from, to, dateProperty } = options
  if (from && to) {
    return {
      and: [
        { property: dateProperty, date: { on_or_after: from } },
        { property: dateProperty, date: { before: to } },
      ],
    }
  }
  if (from) {
    return { property: dateProperty, date: { on_or_after: from } }
  }
  if (to) {
    return { property: dateProperty, date: { before: to } }
  }
  return undefined
}

function rowToCalendarEvent(
  row: PageObjectResponse,
  options: ListCalendarEventsOptions,
): NotionCalendarEvent | null {
  const dateProp = row.properties[options.dateProperty]
  if (!dateProp || dateProp.type !== 'date' || !dateProp.date) return null

  const title = options.titleProperty
    ? (extractPropertyText(row.properties[options.titleProperty]) ?? '')
    : extractPageTitle(row)

  return {
    id: row.id,
    title,
    start: dateProp.date.start,
    end: dateProp.date.end,
    url: row.url,
  }
}
