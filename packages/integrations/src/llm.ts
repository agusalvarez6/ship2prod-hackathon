import { err, ok, withRetry, type AppError, type Result } from '@ship2prod/errors'

export interface SynthesizerInput {
  system: string
  context: string
  question: string
}

export interface LLMClient {
  synthesize(input: SynthesizerInput): Promise<string>
}

export interface LLMClientConfig {
  apiKey: string
  model?: string
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 2048

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>
}

export function createLLMClient(config: LLMClientConfig): LLMClient {
  const model = config.model ?? DEFAULT_MODEL

  return {
    async synthesize(input: SynthesizerInput): Promise<string> {
      const body = {
        model,
        max_tokens: MAX_TOKENS,
        system: input.system,
        messages: [
          {
            role: 'user',
            content: `Context:\n${input.context}\n\nQuestion: ${input.question}`,
          },
        ],
      }

      const result = await withRetry<AnthropicMessageResponse>(async () => {
        const response = await globalThis.fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        })
        if (!response.ok) {
          const retryAfter = response.headers.get('retry-after')
          const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined
          return err<AppError>({
            kind: 'upstream',
            service: 'openai',
            status: response.status,
            ...(retryAfterMs !== undefined && !Number.isNaN(retryAfterMs)
              ? { retryAfterMs }
              : {}),
          })
        }
        const data = (await response.json()) as AnthropicMessageResponse
        return ok(data)
      })

      if (!result.ok) {
        if (result.error.kind === 'upstream') {
          throw new Error(`llm upstream ${result.error.status}`)
        }
        throw new Error(`llm ${result.error.kind}`)
      }

      const first = result.value.content.find((c) => c.type === 'text')
      if (!first?.text) {
        throw new Error('llm empty response')
      }
      return first.text
    },
  }
}
