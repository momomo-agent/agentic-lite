// agentic-core — Core type definitions

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

/** Minimal config for provider creation */
export interface ProviderConfig {
  provider?: 'anthropic' | 'openai' | 'custom'
  customProvider?: Provider
  apiKey?: string
  baseUrl?: string
  model?: string
}

/** Config for runAgentLoop */
export interface AgentLoopConfig {
  provider: Provider
  prompt: string
  systemPrompt?: string
  toolDefs: ToolDefinition[]
  executeToolCall: (toolCall: ProviderToolCall) => Promise<string>
  maxToolRounds?: number
}

/** Result from runAgentLoop */
export interface AgentLoopResult {
  answer: string
  toolCalls: Array<{ tool: string; input: Record<string, unknown>; output: unknown }>
  usage: { input: number; output: number }
}
