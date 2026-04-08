// agentic-lite — Integration layer
// Connects agentic-core agent loop with tool implementations

import { createProvider, runAgentLoop, type ProviderToolCall, type ToolDefinition } from 'agentic-core'
import { shellToolDef, executeShell, isNodeEnv } from './tools/shell.js'
import type { AgenticConfig, AgenticResult, ToolName, Source, CodeResult, FileResult, ShellResult, ToolCall } from './types.js'
import { searchToolDef, executeSearch } from './tools/search.js'
import { codeToolDef, executeCode } from './tools/code.js'
import { fileReadToolDef, fileWriteToolDef, executeFileRead, executeFileWrite } from './tools/file.js'
import { AgenticFileSystem, MemoryStorage } from 'agentic-filesystem'

export async function ask(prompt: string, config: AgenticConfig): Promise<AgenticResult> {
  const filesystem = config.filesystem ?? new AgenticFileSystem({ storage: new MemoryStorage() })
  const resolvedConfig = { ...config, filesystem }
  const provider = createProvider(resolvedConfig)
  const enabledTools = resolvedConfig.tools ?? ['search']
  const toolDefs = buildToolDefs(enabledTools)
  const allSources: Source[] = []
  const allCodeResults: CodeResult[] = []
  const allFileResults: FileResult[] = []
  const allShellResults: ShellResult[] = []
  const allToolCalls: ToolCall[] = []
  const allImages: string[] = []
  const result = await runAgentLoop({
    provider,
    prompt,
    systemPrompt: resolvedConfig.systemPrompt,
    toolDefs,
    executeToolCall: (tc: ProviderToolCall) => handleToolCall(tc, resolvedConfig, {
      allSources, allCodeResults, allFileResults, allShellResults, allToolCalls, allImages,
    }),
  })
  return {
    answer: result.answer,
    sources: allSources.length > 0 ? allSources : undefined,
    images: allImages,
    codeResults: allCodeResults.length > 0 ? allCodeResults : undefined,
    files: allFileResults.length > 0 ? allFileResults : undefined,
    shellResults: allShellResults.length > 0 ? allShellResults : undefined,
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    usage: result.usage,
  }
}

async function handleToolCall(
  tc: ProviderToolCall,
  config: AgenticConfig,
  acc: { allSources: Source[]; allCodeResults: CodeResult[]; allFileResults: FileResult[]; allShellResults: ShellResult[]; allToolCalls: ToolCall[]; allImages: string[] },
): Promise<string> {
  let output: string
  switch (tc.name) {
    case 'web_search': {
      const result = await executeSearch(tc.input, config.toolConfig?.search)
      acc.allSources.push(...result.sources)
      if (result.images) acc.allImages.push(...result.images)
      output = result.text
      break
    }
    case 'code_exec': {
      const result = await executeCode(tc.input, config.filesystem)
      acc.allCodeResults.push(result)
      output = result.error ? `Error: ${result.error}` : result.output
      break
    }
    case 'file_read': {
      const result = await executeFileRead(tc.input, config.filesystem)
      acc.allFileResults.push(result)
      output = result.content ?? 'File read complete'
      break
    }
    case 'file_write': {
      const result = await executeFileWrite(tc.input, config.filesystem)
      acc.allFileResults.push(result)
      output = result.content ?? 'File written'
      break
    }
    case 'shell_exec': {
      const result = await executeShell(tc.input, config.filesystem)
      acc.allShellResults.push(result)
      output = result.error ? `Error: ${result.error}` : result.output
      break
    }
    default:
      output = `Unknown tool: ${tc.name}`
  }
  acc.allToolCalls.push({ tool: tc.name, input: tc.input, output })
  return output
}
function buildToolDefs(tools: ToolName[]): ToolDefinition[] {
  const defs: ToolDefinition[] = []
  if (tools.includes('search')) defs.push(searchToolDef)
  if (tools.includes('code')) defs.push(codeToolDef)
  if (tools.includes('file')) {
    defs.push(fileReadToolDef)
    defs.push(fileWriteToolDef)
  }
  if (tools.includes('shell') && isNodeEnv()) defs.push(shellToolDef)
  return defs
}
