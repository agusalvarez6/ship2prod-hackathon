import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

export interface TinyFishFetchResult {
  url: string
  text: string
  blocked: boolean
}

export interface TinyFishSearchResult {
  url: string
  snippet: string
}

export interface TinyFishClient {
  fetch(url: string): Promise<TinyFishFetchResult>
  search(query: string): Promise<Array<TinyFishSearchResult>>
}

export interface TinyFishClientConfig {
  apiKey: string
}

const execFileAsync = promisify(execFile)

// TinyFish is shipped as a CLI (@tiny-fish/cli). There is no REST API at
// api.tinyfish.io. We spawn the bin via `node` and parse the JSON it prints
// to stdout. Resolution starts from this file so the package's own
// node_modules wins, regardless of which app spawned the worker.
const require = createRequire(import.meta.url)

let cachedBinPath: string | null = null
function resolveTinyFishBin(): string {
  if (cachedBinPath) return cachedBinPath
  const pkgJson = require.resolve('@tiny-fish/cli/package.json')
  cachedBinPath = resolve(dirname(pkgJson), 'dist/index.js')
  return cachedBinPath
}

async function runTinyFish(apiKey: string, args: string[]): Promise<unknown> {
  const binPath = resolveTinyFishBin()
  const { stdout } = await execFileAsync(process.execPath, [binPath, ...args], {
    env: { ...process.env, TINYFISH_API_KEY: apiKey },
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60_000,
  })
  const trimmed = stdout.trim()
  if (!trimmed) throw new Error('tinyfish cli: empty stdout')
  return JSON.parse(trimmed)
}

interface FetchCliItem {
  url?: string
  final_url?: string
  title?: string
  description?: string
  text?: string
}
interface FetchCliResponse {
  results?: FetchCliItem[]
  errors?: Array<{ url?: string; error?: string }>
}

interface SearchCliItem {
  url?: string
  title?: string
  snippet?: string
  site_name?: string
}
interface SearchCliResponse {
  results?: SearchCliItem[]
}

function joinFetchText(item: FetchCliItem): string {
  return [item.title, item.description, item.text]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join('\n\n')
}

export function createTinyFishClient(config: TinyFishClientConfig): TinyFishClient {
  if (!config.apiKey) {
    throw new Error('tinyfish: TINYFISH_API_KEY is required')
  }

  return {
    async fetch(url: string): Promise<TinyFishFetchResult> {
      const raw = (await runTinyFish(config.apiKey, [
        'fetch',
        'content',
        'get',
        url,
        '--format',
        'markdown',
      ])) as FetchCliResponse
      const item = raw.results?.[0]
      if (!item) {
        const first = raw.errors?.[0]
        throw new Error(
          `tinyfish fetch: no results for ${url}${first?.error ? `: ${first.error}` : ''}`,
        )
      }
      return {
        url: item.final_url ?? item.url ?? url,
        text: joinFetchText(item),
        blocked: false,
      }
    },

    async search(query: string): Promise<Array<TinyFishSearchResult>> {
      const raw = (await runTinyFish(config.apiKey, [
        'search',
        'query',
        query,
      ])) as SearchCliResponse
      return (raw.results ?? [])
        .filter((r): r is SearchCliItem & { url: string } => typeof r.url === 'string')
        .map((r) => ({
          url: r.url,
          snippet: [r.title, r.snippet].filter(Boolean).join(' — '),
        }))
    },
  }
}
