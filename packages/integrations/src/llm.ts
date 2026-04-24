import { err, ok, withRetry, type AppError } from '@ship2prod/errors'

export interface SynthesizerInput {
  system: string
  context: string
  question: string
  /**
   * When true, tells Gemini to emit application/json directly (no markdown fences).
   * Callers that expect a JSON object should set this.
   */
  json?: boolean
}

export interface LLMClient {
  synthesize(input: SynthesizerInput): Promise<string>
}

export interface LLMClientConfig {
  apiKey: string
  model?: string
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODEL = 'gemini-2.5-flash'
const MAX_OUTPUT_TOKENS = 8192

interface GeminiContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
  }>
}

export function createLLMClient(config: LLMClientConfig): LLMClient {
  const model = config.model ?? DEFAULT_MODEL

  return {
    async synthesize(input: SynthesizerInput): Promise<string> {
      const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`
      const body = {
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Context:\n${input.context}\n\nQuestion: ${input.question}`,
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0,
          ...(input.json ? { responseMimeType: 'application/json' } : {}),
        },
      }

      const result = await withRetry<GeminiContentResponse>(async () => {
        const response = await globalThis.fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
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
        const data = (await response.json()) as GeminiContentResponse
        return ok(data)
      })

      if (!result.ok) {
        if (result.error.kind === 'upstream') {
          throw new Error(`llm upstream ${result.error.status}`)
        }
        throw new Error(`llm ${result.error.kind}`)
      }

      const text = result.value.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        throw new Error('llm empty response')
      }
      return text
    },
  }
}
