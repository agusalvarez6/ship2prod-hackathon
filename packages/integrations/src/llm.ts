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

export function createLLMClient(_config: LLMClientConfig): LLMClient {
  return {
    async synthesize(_input: SynthesizerInput): Promise<string> {
      throw new Error('not implemented in Phase 0')
    },
  }
}
