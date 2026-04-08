// agentic-lite — thin integration layer over agentic-core
// agentic-core handles LLM calls, agent loop, streaming
// agentic-lite provides file/code/shell tools + OS system prompt

import { executeCode } from './tools/code.js'
import { executeFileRead, executeFileWrite, fileReadToolDef, fileWriteToolDef } from './tools/file.js'
import { executeShell, isNodeEnv, shellToolDef } from './tools/shell.js'
import { searchToolDef, executeSearch } from './tools/search.js'
import { AgenticFileSystem, MemoryStorage } from 'agentic-filesystem'
import type { AgenticConfig, AgenticResult, ToolCall } from './types.js'

import { runAgentLoop, runAgentLoopStream, createProvider } from 'agentic-core'
import type { Provider, ProviderToolCall, ToolDefinition } from 'agentic-core'

const OS_SYSTEM_PROMPT = `You are an AI assistant running on a computer. You have access to a filesystem and can execute code. Use the available tools to complete tasks.`

function buildTools(config: AgenticConfig, imagesCollector?: string[]) {
  const tools: any[] = []
  const fs = config.filesystem
  const enabled = config.tools ?? ['file', 'code']

  if (enabled.includes('file')) {
    tools.push({
      ...fileReadToolDef,
      parameters: fileReadToolDef.parameters,
      execute: (input: any) => executeFileRead(input, fs).then(r => r.content ?? r.error ?? 'done'),
    })
    tools.push({
      ...fileWriteToolDef,
      parameters: fileWriteToolDef.parameters,
      execute: (input: any) => executeFileWrite(input, fs).then(r => r.content ?? r.error ?? 'File written'),
    })
  }

  if (enabled.includes('code')) {
    tools.push({
      name: 'code_exec',
      description: 'Execute JavaScript or Python code in a sandbox',
      parameters: { type: 'object', properties: { code: { type: 'string' }, language: { type: 'string', enum: ['javascript', 'python'] } }, required: ['code'] },
      execute: (input: any) => executeCode(input, fs).then(r => r.error ? `Error: ${r.error}` : r.output),
    })
  }

  if (enabled.includes('search')) {
    tools.push({
      ...searchToolDef,
      parameters: searchToolDef.parameters,
      execute: (input: any) => executeSearch(input, config.toolConfig?.search).then(r => {
        if (imagesCollector && r.images?.length) imagesCollector.push(...r.images)
        return r.text
      }),
    })
  }

  if (enabled.includes('shell') && isNodeEnv()) {
    tools.push({
      ...shellToolDef,
      parameters: shellToolDef.parameters,
      execute: (input: any) => executeShell(input, fs).then(r => r.error ? `Error: ${r.error}` : r.output),
    })
  }

  return tools
}

export async function ask(prompt: string, config: AgenticConfig = {}): Promise<AgenticResult> {
  const filesystem = config.filesystem ?? new AgenticFileSystem({ storage: new MemoryStorage() })
  const resolvedConfig = { ...config, filesystem }

  // Build a Provider from config
  const provider: Provider = createProvider({
    provider: config.provider ?? 'anthropic',
    customProvider: config.customProvider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  })

  // Separate tool definitions from execute callbacks
  const images: string[] = []
  const tools = buildTools(resolvedConfig, images)
  const toolDefs: ToolDefinition[] = tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))

  const toolMap = new Map(tools.map(t => [t.name, t]))

  const executeToolCall = async (tc: ProviderToolCall): Promise<string> => {
    const tool = toolMap.get(tc.name)
    if (!tool) return `Error: Unknown tool ${tc.name}`
    return String(await tool.execute(tc.input))
  }

  const result = await runAgentLoop({
    provider,
    prompt,
    systemPrompt: config.systemPrompt ?? OS_SYSTEM_PROMPT,
    toolDefs,
    executeToolCall,
  })

  return {
    answer: result.answer,
    images,
    toolCalls: result.toolCalls.length > 0 ? result.toolCalls as ToolCall[] : undefined,
    usage: result.usage,
  }
}

export async function* askStream(prompt: string, config: AgenticConfig = {}): AsyncGenerator<{ type: string; text?: string; toolCall?: { tool: string; input: Record<string, unknown> }; output?: string; result?: any }> {
  const filesystem = config.filesystem ?? new AgenticFileSystem({ storage: new MemoryStorage() })
  const resolvedConfig = { ...config, filesystem }

  // Build a Provider from config
  const provider: Provider = createProvider({
    provider: config.provider ?? 'anthropic',
    customProvider: config.customProvider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  })

  // Separate tool definitions from execute callbacks
  const tools = buildTools(resolvedConfig)
  const toolDefs: ToolDefinition[] = tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))

  const toolMap = new Map(tools.map(t => [t.name, t]))

  const executeToolCall = async (tc: ProviderToolCall): Promise<string> => {
    const tool = toolMap.get(tc.name)
    if (!tool) return `Error: Unknown tool ${tc.name}`
    return String(await tool.execute(tc.input))
  }

  // Stream from runAgentLoopStream
  for await (const chunk of runAgentLoopStream({
    provider,
    prompt,
    systemPrompt: config.systemPrompt ?? OS_SYSTEM_PROMPT,
    toolDefs,
    executeToolCall,
  })) {
    yield chunk
  }
}
