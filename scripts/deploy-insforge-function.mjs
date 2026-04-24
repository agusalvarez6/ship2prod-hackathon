import { readFile } from 'node:fs/promises'

const DEFAULT_CODE_FILE = 'apps/vapi-webhook/functions/precall-next-meeting.js'
const DEFAULT_DESCRIPTION =
  'Returns the next meeting and briefing data for the PreCallBot Vapi tool.'

async function main() {
  const insforgeUrl = requiredEnv('INSFORGE_URL').replace(/\/+$/, '')
  const apiKey = requiredEnv('INSFORGE_API_KEY')
  const slug = process.env.INSFORGE_FUNCTION_SLUG ?? 'precall-next-meeting'
  const codeFile = process.env.INSFORGE_FUNCTION_CODE_FILE ?? DEFAULT_CODE_FILE
  const name = process.env.INSFORGE_FUNCTION_NAME ?? 'PreCallBot Next Meeting'
  const description = process.env.INSFORGE_FUNCTION_DESCRIPTION ?? DEFAULT_DESCRIPTION
  const status = process.env.INSFORGE_FUNCTION_STATUS ?? 'active'
  const code = await readFile(codeFile, 'utf8')

  const response = await fetch(`${insforgeUrl}/api/functions/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name, description, code, status }),
  })

  const text = await response.text()
  const parsed = parseJson(text)

  if (!response.ok) {
    const message = parsed ? JSON.stringify(parsed) : text
    throw new Error(`InsForge function deploy failed (${response.status}): ${message}`)
  }

  const deployedAt = parsed?.function?.deployedAt ?? parsed?.function?.updatedAt ?? 'unknown'
  process.stdout.write(`Deployed InsForge function ${slug} at ${deployedAt}\n`)
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function parseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

await main()
