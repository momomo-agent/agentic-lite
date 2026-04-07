// agentic-lite — Core agent loop
// One function call, structured result with tool use

import { createProvider } from './providers/index.js'
import type { Provider, ProviderMessage, ToolDefinition, ProviderToolCall } from './providers/index.js'
import { shellToolDef, executeShell } from './tools/shell.js'
import type { AgenticConfig, AgenticResult, ToolName, Source, CodeResult, FileResult, ShellResult, ToolCall } from './types.js'
import { searchToolDef, executeSearch } from './tools/search.js'
import { codeToolDef, executeCode } from './tools/code.js'
import { fileReadToolDef, fileWriteToolDef, executeFileRead, executeFileWrite } from './tools/file.js'

const MAX_TOOL_ROUNDS = 10

export async function ask(prompt: string, config: AgenticConfig): Promise<AgenticResult> {
  const provider = createProvider(config)
  const enabledTools = config.tools ?? ['search']
  const toolDefs = buildToolDefs(enabledTools)

  const messages: ProviderMessage[] = [{ role: 'user', content: prompt }]
  const allToolCalls: ToolCall[] = []
  const allSources: Source[] = []
  const allCodeResults: CodeResult[] = []
  const allFileResults: FileResult[] = []
  const allShellResults: ShellResult[] = []
  const allImages: string[] = []
  let totalUsage = { input: 0, output: 0 }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await provider.chat(messages, toolDefs, config.systemPrompt)
    totalUsage.input += response.usage.input
    totalUsage.output += response.usage.output

    if (response.stopReason !== 'tool_use' || response.toolCalls.length === 0) {
      return {
        answer: response.text,
        sources: allSources.length > 0 ? allSources : undefined,
        images: allImages,
        codeResults: allCodeResults.length > 0 ? allCodeResults : undefined,
        files: allFileResults.length > 0 ? allFileResults : undefined,
        shellResults: allShellResults.length > 0 ? allShellResults : undefined,
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
        usage: totalUsage,
      }
    }

    // Execute tool calls and continue the loop
    const toolResults = await executeToolCalls(response.toolCalls, config, {
      allSources, allCodeResults, allFileResults, allShellResults, allToolCalls, allImages,
    })

    // Anthropic needs rawContent (with tool_use blocks) for assistant turn
    messages.push({ role: 'assistant', content: response.rawContent ?? response.text ?? '' })
    messages.push({
      role: 'tool',
      content: toolResults.map(r => ({ type: 'tool_result' as const, toolCallId: r.toolCallId, content: r.content })),
    })
  }

  throw new Error(`Agent loop exceeded ${MAX_TOOL_ROUNDS} rounds`)
}

// --- Tool execution ---

interface Accumulators {
  allSources: Source[]
  allCodeResults: CodeResult[]
  allFileResults: FileResult[]
  allShellResults: ShellResult[]
  allToolCalls: ToolCall[]
  allImages: string[]
}

async function executeToolCalls(
  toolCalls: ProviderToolCall[],
  config: AgenticConfig,
  acc: Accumulators,
): Promise<{ type: 'tool_result'; toolCallId: string; content: string }[]> {
  const results = []

  for (const tc of toolCalls) {
    const output = await executeSingleTool(tc, config, acc)
    acc.allToolCalls.push({ tool: tc.name, input: tc.input, output })
    results.push({ type: 'tool_result' as const, toolCallId: tc.id, content: String(output) })
  }

  return results
}

async function executeSingleTool(
  tc: ProviderToolCall,
  config: AgenticConfig,
  acc: Accumulators,
): Promise<string> {
  switch (tc.name) {
    case 'web_search': {
      const result = await executeSearch(tc.input, config.toolConfig?.search)
      acc.allSources.push(...result.sources)
      if (result.images) acc.allImages.push(...result.images)
      return result.text
    }
    case 'code_exec': {
      const result = await executeCode(tc.input, config.filesystem)
      acc.allCodeResults.push(result)
      return result.error ? `Error: ${result.error}` : result.output
    }
    case 'file_read': {
      const result = await executeFileRead(tc.input, config.filesystem)
      acc.allFileResults.push(result)
      return result.content ?? 'File read complete'
    }
    case 'file_write': {
      const result = await executeFileWrite(tc.input, config.filesystem)
      acc.allFileResults.push(result)
      return result.content ?? 'File written'
    }
    case 'shell_exec': {
      const result = await executeShell(tc.input, config.filesystem)
      acc.allShellResults.push(result)
      return result.error ? `Error: ${result.error}` : result.output
    }
    default:
      return `Unknown tool: ${tc.name}`
  }
}

function buildToolDefs(tools: ToolName[]): ToolDefinition[] {
  const defs: ToolDefinition[] = []
  if (tools.includes('search')) defs.push(searchToolDef)
  if (tools.includes('code')) defs.push(codeToolDef)
  if (tools.includes('file')) {
    defs.push(fileReadToolDef)
    defs.push(fileWriteToolDef)
  }
  if (tools.includes('shell')) defs.push(shellToolDef)
  return defs
}
