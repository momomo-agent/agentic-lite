# agentic-lite PRD

## Overview
agentic-lite is a lightweight agent library for Node.js and browsers. Target users: developers who need a simple `ask()` API with built-in tool use.

## Agent Loop
`ask(prompt, config)` runs a multi-round loop: calls the LLM, executes any tool calls, feeds results back, and repeats until `stopReason !== 'tool_use'`.

## Tools
- `search` — web search, returns sources
- `code_exec` — executes JS via AsyncFunction (browser-compatible)
- `file_read` / `file_write` — file I/O via AgenticFileSystem (browser-compatible)

## Provider Config
| Field | Description |
|---|---|
| `provider` | `'anthropic'` \| `'openai'` \| `'custom'` |
| `apiKey` | Required for anthropic/openai |
| `model` | Model name override |
| `baseUrl` | Custom endpoint |
| `customProvider` | Required when `provider='custom'` |
| `systemPrompt` | Optional system prompt |

## AgenticResult
```ts
{
  answer: string
  sources: Source[]
  images: string[]
  codeResults: CodeResult[]
  files: FileResult[]
  toolCalls: ToolCall[]
  usage: { input: number; output: number }
}
```
