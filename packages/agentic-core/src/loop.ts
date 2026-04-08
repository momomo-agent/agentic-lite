// agentic-core — Generic agent loop

import type { AgentLoopConfig, AgentLoopResult, ProviderMessage, ProviderToolCall } from './types.js'

const DEFAULT_MAX_TOOL_ROUNDS = 10

export async function runAgentLoop(config: AgentLoopConfig): Promise<AgentLoopResult> {
  const maxRounds = config.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS
  const messages: ProviderMessage[] = [{ role: 'user', content: config.prompt }]
  const allToolCalls: AgentLoopResult['toolCalls'] = []
  let totalUsage = { input: 0, output: 0 }

  for (let round = 0; round < maxRounds; round++) {
    const response = await config.provider.chat(messages, config.toolDefs, config.systemPrompt)
    totalUsage.input += response.usage.input
    totalUsage.output += response.usage.output

    if (response.stopReason !== 'tool_use' || response.toolCalls.length === 0) {
      return { answer: response.text, toolCalls: allToolCalls, usage: totalUsage }
    }

    // Execute each tool call via the provided callback
    const toolResults: Array<{ type: 'tool_result'; toolCallId: string; content: string }> = []
    for (const tc of response.toolCalls) {
      const output = await config.executeToolCall(tc)
      allToolCalls.push({ tool: tc.name, input: tc.input, output })
      toolResults.push({ type: 'tool_result', toolCallId: tc.id, content: String(output) })
    }

    // Anthropic needs rawContent for assistant turn replay
    messages.push({ role: 'assistant', content: response.rawContent ?? response.text ?? '' })
    messages.push({ role: 'tool', content: toolResults })
  }

  throw new Error(`Agent loop exceeded ${maxRounds} rounds`)
}
