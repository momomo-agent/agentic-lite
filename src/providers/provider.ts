// Provider abstraction — unified interface for LLM calls with tool use

import type { AgenticConfig } from '../types.js'
import { createAnthropicProvider } from './anthropic.js'
import { createOpenAIProvider } from './openai.js'

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ProviderToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ProviderResponse {
  text: string
  toolCalls: ProviderToolCall[]
  usage: { input: number; output: number }
  stopReason: 'end' | 'tool_use'
  /** Raw content blocks for assistant message replay (Anthropic needs this) */
  rawContent?: unknown[]
}

export interface ProviderMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string | ProviderToolContent[] | unknown[]
}

export interface ProviderToolContent {
  type: 'tool_result'
  toolCallId: string
  content: string
}

export interface Provider {
  chat(messages: ProviderMessage[], tools: ToolDefinition[], system?: string): Promise<ProviderResponse>
}

export function createProvider(config: AgenticConfig): Provider {
  const provider = config.provider ?? detectProvider(config)

  if (provider !== 'custom' && !config.apiKey) {
    throw new Error('apiKey is required for provider: ' + provider)
  }

  switch (provider) {
    case 'anthropic':
      return createAnthropicProvider(config)
    case 'custom':
      if (!config.customProvider) throw new Error('customProvider required when provider="custom"')
      return config.customProvider
    case 'openai':
    default:
      return createOpenAIProvider(config)
  }
}

function detectProvider(config: AgenticConfig): string {
  if (!config.apiKey) throw new Error('apiKey is required')
  if (config.baseUrl?.includes('anthropic')) return 'anthropic'
  if (config.apiKey?.startsWith('sk-ant-')) return 'anthropic'
  return 'openai'
}
