import { describe, expect, it } from 'vitest'
import { createNotionClient } from '../src/notion.js'

type AnyObj = Record<string, unknown>

function richText(text: string) {
  return [
    {
      type: 'text',
      text: { content: text, link: null },
      annotations: {
        bold: false,
        italic: false,
        strikethrough: false,
        underline: false,
        code: false,
        color: 'default',
      },
      plain_text: text,
      href: null,
    },
  ]
}

function titleProp(text: string) {
  return { id: 'title', type: 'title', title: richText(text) }
}

function makePage(id: string, title: string, url: string, extra: AnyObj = {}) {
  return {
    object: 'page',
    id,
    created_time: '2026-01-01T00:00:00.000Z',
    last_edited_time: '2026-02-01T00:00:00.000Z',
    created_by: { object: 'user', id: 'u1' },
    last_edited_by: { object: 'user', id: 'u1' },
    cover: null,
    icon: null,
    parent: { type: 'workspace', workspace: true },
    archived: false,
    in_trash: false,
    url,
    public_url: null,
    properties: { Name: titleProp(title), ...((extra.properties as AnyObj) ?? {}) },
    ...extra,
  }
}

function makeBlock(id: string, type: string, text: string, hasChildren = false) {
  const block: AnyObj = {
    object: 'block',
    id,
    parent: { type: 'page_id', page_id: 'parent' },
    created_time: '2026-01-01T00:00:00.000Z',
    last_edited_time: '2026-01-01T00:00:00.000Z',
    created_by: { object: 'user', id: 'u1' },
    last_edited_by: { object: 'user', id: 'u1' },
    has_children: hasChildren,
    archived: false,
    in_trash: false,
    type,
  }
  const body: AnyObj = { rich_text: richText(text), color: 'default' }
  if (type === 'to_do') body['checked'] = false
  block[type] = body
  return block
}

describe('NotionClient.getPage', () => {
  it('returns page title and joined block text', async () => {
    const page = makePage('page-1', 'Intro Doc', 'https://notion.so/page-1')
    const blocks = [
      makeBlock('b1', 'heading_1', 'Hello'),
      makeBlock('b2', 'paragraph', 'World'),
      makeBlock('b3', 'bulleted_list_item', 'point one'),
    ]

    const calls: AnyObj[] = []
    const sdk = {
      pages: {
        retrieve: async (args: AnyObj) => {
          calls.push({ op: 'retrieve', args })
          return page
        },
      },
      blocks: {
        children: {
          list: async (args: AnyObj) => {
            calls.push({ op: 'children.list', args })
            return { results: blocks, has_more: false, next_cursor: null }
          },
        },
      },
      databases: { query: async () => ({ results: [], has_more: false, next_cursor: null }) },
      search: async () => ({ results: [], has_more: false, next_cursor: null }),
    }

    const client = createNotionClient({
      accessToken: 't',
      sdk: sdk as never,
    })
    const out = await client.getPage('page-1')

    expect(out.id).toBe('page-1')
    expect(out.title).toBe('Intro Doc')
    expect(out.url).toBe('https://notion.so/page-1')
    expect(out.lastEditedAt).toBe('2026-02-01T00:00:00.000Z')
    expect(out.text).toBe('Hello\nWorld\npoint one')
    expect(calls[0]).toEqual({ op: 'retrieve', args: { page_id: 'page-1' } })
  })

  it('recurses into children when has_children is true', async () => {
    const page = makePage('p', 'Parent', 'https://notion.so/p')
    const parentToggle = makeBlock('b1', 'toggle', 'Toggle header', true)
    const child = makeBlock('b1c', 'paragraph', 'nested body')

    const sdk = {
      pages: { retrieve: async () => page },
      blocks: {
        children: {
          list: async (args: { block_id: string }) => {
            if (args.block_id === 'p') {
              return { results: [parentToggle], has_more: false, next_cursor: null }
            }
            if (args.block_id === 'b1') {
              return { results: [child], has_more: false, next_cursor: null }
            }
            return { results: [], has_more: false, next_cursor: null }
          },
        },
      },
      databases: { query: async () => ({ results: [], has_more: false, next_cursor: null }) },
      search: async () => ({ results: [], has_more: false, next_cursor: null }),
    }

    const client = createNotionClient({ accessToken: 't', sdk: sdk as never })
    const out = await client.getPage('p')
    expect(out.text).toBe('Toggle header\nnested body')
  })

  it('paginates block children via next_cursor', async () => {
    const page = makePage('p', 'Doc', 'https://notion.so/p')
    const firstBatch = [makeBlock('b1', 'paragraph', 'one')]
    const secondBatch = [makeBlock('b2', 'paragraph', 'two')]

    let callCount = 0
    const sdk = {
      pages: { retrieve: async () => page },
      blocks: {
        children: {
          list: async (args: AnyObj) => {
            callCount += 1
            if (callCount === 1) {
              expect(args['start_cursor']).toBeUndefined()
              return { results: firstBatch, has_more: true, next_cursor: 'cur-1' }
            }
            expect(args['start_cursor']).toBe('cur-1')
            return { results: secondBatch, has_more: false, next_cursor: null }
          },
        },
      },
      databases: { query: async () => ({ results: [], has_more: false, next_cursor: null }) },
      search: async () => ({ results: [], has_more: false, next_cursor: null }),
    }

    const client = createNotionClient({ accessToken: 't', sdk: sdk as never })
    const out = await client.getPage('p')
    expect(out.text).toBe('one\ntwo')
    expect(callCount).toBe(2)
  })

  it('throws when a partial page is returned', async () => {
    const sdk = {
      pages: { retrieve: async () => ({ object: 'page', id: 'p' }) },
      blocks: { children: { list: async () => ({ results: [], has_more: false, next_cursor: null }) } },
      databases: { query: async () => ({ results: [], has_more: false, next_cursor: null }) },
      search: async () => ({ results: [], has_more: false, next_cursor: null }),
    }
    const client = createNotionClient({ accessToken: 't', sdk: sdk as never })
    await expect(client.getPage('p')).rejects.toThrow(/partial page/)
  })
})

describe('NotionClient.searchPages', () => {
  it('returns id, title, url for page results and skips non-pages', async () => {
    const sdk = {
      pages: { retrieve: async () => ({}) },
      blocks: { children: { list: async () => ({ results: [], has_more: false, next_cursor: null }) } },
      databases: { query: async () => ({ results: [], has_more: false, next_cursor: null }) },
      search: async (args: AnyObj) => {
        expect(args['query']).toBe('meeting')
        expect(args['filter']).toEqual({ property: 'object', value: 'page' })
        return {
          results: [
            makePage('p1', 'Meeting Notes', 'https://notion.so/p1'),
            { object: 'database', id: 'db1' },
            makePage('p2', 'Other Meeting', 'https://notion.so/p2'),
          ],
          has_more: false,
          next_cursor: null,
        }
      },
    }

    const client = createNotionClient({ accessToken: 't', sdk: sdk as never })
    const out = await client.searchPages('meeting')
    expect(out).toEqual([
      { id: 'p1', title: 'Meeting Notes', url: 'https://notion.so/p1' },
      { id: 'p2', title: 'Other Meeting', url: 'https://notion.so/p2' },
    ])
  })

  it('follows pagination cursor', async () => {
    let call = 0
    const sdk = {
      pages: { retrieve: async () => ({}) },
      blocks: { children: { list: async () => ({ results: [], has_more: false, next_cursor: null }) } },
      databases: { query: async () => ({ results: [], has_more: false, next_cursor: null }) },
      search: async (args: AnyObj) => {
        call += 1
        if (call === 1) {
          return {
            results: [makePage('p1', 'A', 'https://notion.so/p1')],
            has_more: true,
            next_cursor: 'c1',
          }
        }
        expect(args['start_cursor']).toBe('c1')
        return {
          results: [makePage('p2', 'B', 'https://notion.so/p2')],
          has_more: false,
          next_cursor: null,
        }
      },
    }
    const client = createNotionClient({ accessToken: 't', sdk: sdk as never })
    const out = await client.searchPages('x')
    expect(out.map((r) => r.id)).toEqual(['p1', 'p2'])
  })
})

describe('NotionClient.listCalendarEvents', () => {
  const datePropFor = (start: string, end: string | null) => ({
    id: 'date',
    type: 'date',
    date: { start, end, time_zone: null },
  })

  it('maps database rows into events and builds the date filter', async () => {
    const row1 = makePage('r1', 'Kickoff', 'https://notion.so/r1', {
      properties: {
        Name: titleProp('Kickoff'),
        When: datePropFor('2026-05-01', null),
      },
    })
    const row2 = makePage('r2', 'Review', 'https://notion.so/r2', {
      properties: {
        Name: titleProp('Review'),
        When: datePropFor('2026-05-02T10:00:00Z', '2026-05-02T11:00:00Z'),
      },
    })

    const sdk = {
      pages: { retrieve: async () => ({}) },
      blocks: { children: { list: async () => ({ results: [], has_more: false, next_cursor: null }) } },
      databases: {
        query: async (args: AnyObj) => {
          expect(args['database_id']).toBe('db-xyz')
          expect(args['sorts']).toEqual([{ property: 'When', direction: 'ascending' }])
          expect(args['filter']).toEqual({
            and: [
              { property: 'When', date: { on_or_after: '2026-05-01' } },
              { property: 'When', date: { before: '2026-06-01' } },
            ],
          })
          return { results: [row1, row2], has_more: false, next_cursor: null }
        },
      },
      search: async () => ({ results: [], has_more: false, next_cursor: null }),
    }

    const client = createNotionClient({ accessToken: 't', sdk: sdk as never })
    const out = await client.listCalendarEvents('db-xyz', {
      dateProperty: 'When',
      from: '2026-05-01',
      to: '2026-06-01',
    })
    expect(out).toEqual([
      {
        id: 'r1',
        title: 'Kickoff',
        start: '2026-05-01',
        end: null,
        url: 'https://notion.so/r1',
      },
      {
        id: 'r2',
        title: 'Review',
        start: '2026-05-02T10:00:00Z',
        end: '2026-05-02T11:00:00Z',
        url: 'https://notion.so/r2',
      },
    ])
  })

  it('omits filter when no from/to given and skips rows missing the date property', async () => {
    const row1 = makePage('r1', 'Has date', 'https://notion.so/r1', {
      properties: {
        Name: titleProp('Has date'),
        When: datePropFor('2026-05-01', null),
      },
    })
    const row2 = makePage('r2', 'No date', 'https://notion.so/r2', {
      properties: {
        Name: titleProp('No date'),
        When: { id: 'date', type: 'date', date: null },
      },
    })

    const sdk = {
      pages: { retrieve: async () => ({}) },
      blocks: { children: { list: async () => ({ results: [], has_more: false, next_cursor: null }) } },
      databases: {
        query: async (args: AnyObj) => {
          expect(args['filter']).toBeUndefined()
          return { results: [row1, row2], has_more: false, next_cursor: null }
        },
      },
      search: async () => ({ results: [], has_more: false, next_cursor: null }),
    }

    const client = createNotionClient({ accessToken: 't', sdk: sdk as never })
    const out = await client.listCalendarEvents('db', { dateProperty: 'When' })
    expect(out.map((e) => e.id)).toEqual(['r1'])
  })

  it('uses titleProperty override when provided', async () => {
    const row = makePage('r1', 'PageTitle', 'https://notion.so/r1', {
      properties: {
        Name: titleProp('PageTitle'),
        Subject: { id: 's', type: 'rich_text', rich_text: richText('Custom Subject') },
        When: datePropFor('2026-05-01', null),
      },
    })
    const sdk = {
      pages: { retrieve: async () => ({}) },
      blocks: { children: { list: async () => ({ results: [], has_more: false, next_cursor: null }) } },
      databases: {
        query: async () => ({ results: [row], has_more: false, next_cursor: null }),
      },
      search: async () => ({ results: [], has_more: false, next_cursor: null }),
    }
    const client = createNotionClient({ accessToken: 't', sdk: sdk as never })
    const out = await client.listCalendarEvents('db', {
      dateProperty: 'When',
      titleProperty: 'Subject',
    })
    expect(out[0]?.title).toBe('Custom Subject')
  })

  it('paginates database query results', async () => {
    const row1 = makePage('r1', 'A', 'https://notion.so/r1', {
      properties: { Name: titleProp('A'), When: datePropFor('2026-05-01', null) },
    })
    const row2 = makePage('r2', 'B', 'https://notion.so/r2', {
      properties: { Name: titleProp('B'), When: datePropFor('2026-05-02', null) },
    })

    let call = 0
    const sdk = {
      pages: { retrieve: async () => ({}) },
      blocks: { children: { list: async () => ({ results: [], has_more: false, next_cursor: null }) } },
      databases: {
        query: async (args: AnyObj) => {
          call += 1
          if (call === 1) {
            expect(args['start_cursor']).toBeUndefined()
            return { results: [row1], has_more: true, next_cursor: 'c' }
          }
          expect(args['start_cursor']).toBe('c')
          return { results: [row2], has_more: false, next_cursor: null }
        },
      },
      search: async () => ({ results: [], has_more: false, next_cursor: null }),
    }
    const client = createNotionClient({ accessToken: 't', sdk: sdk as never })
    const out = await client.listCalendarEvents('db', { dateProperty: 'When' })
    expect(out.map((e) => e.id)).toEqual(['r1', 'r2'])
  })
})
