// OpenAI-compatible provider — works with OpenAI, Groq, Together, any compatible API

import type { AgenticConfig } from '../types.js'
import type { Provider, ProviderMessage, ProviderResponse, ToolDefinition } from './provider.js'

export function createOpenAIProvider(config: AgenticConfig): Provider {
  const baseUrl = config.baseUrl ?? 'https://api.openai.com'
  const model = config.model ?? 'gpt-4o'

  return {
    async chat(messages: ProviderMessage[], tools: ToolDefinition[]): Promise<ProviderResponse> {
      const body: Record<string, unknown> = {
        model,
        messages: convertMessages(messages),
      }

      if (tools.length > 0) {
        body.tools = tools.map(t => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }))
      }

      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`OpenAI API error ${res.status}: ${err}`)
      }

      const data = await res.json() as OpenAIResponse
      return parseResponse(data)
    }
  }
}

// --- OpenAI response types ---

interface OpenAIToolCall {
  id: string
  function: { name: string; arguments: string }
}

interface OpenAIChoice {
  message: {
    content: string | null
    tool_calls?: OpenAIToolCall[]
  }
  finish_reason: string
}

interface OpenAIResponse {
  choices: OpenAIChoice[]
  usage: { prompt_tokens: number; completion_tokens: number }
}

function convertMessages(messages: ProviderMessage[]) {
  return messages.map(m => {
    if (m.role === 'tool' && Array.isArray(m.content)) {
      return m.content.map(c => ({
        role: 'tool' as const,
        tool_call_id: (c as { toolCallId: string }).toolCallId,
        content: (c as { content: string }).content,
      }))
    }
    return { role: m.role, content: m.content }
  }).flat()
}

function parseResponse(data: OpenAIResponse): ProviderResponse {
  const choice = data.choices[0]
  const toolCalls = (choice?.message.tool_calls ?? []).map(tc => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  }))

  return {
    text: choice?.message.content ?? '',
    toolCalls,
    usage: { input: data.usage.prompt_tokens, output: data.usage.completion_tokens },
    stopReason: choice?.finish_reason === 'tool_calls' ? 'tool_use' : 'end',
  }
}
