// agentic-lite — Lightweight agent API
// One function call with built-in search, code execution, and file processing

export { ask, askStream } from './ask.js'
export type { AgenticConfig, AgenticResult, ToolName, Source, CodeResult, FileResult, ShellResult, ToolCall } from './types.js'
export { createProvider } from 'agentic-core'
export type { Provider } from 'agentic-core'
