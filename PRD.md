# agentic-lite PRD

## Overview
agentic-lite is a lightweight agent library for Node.js and browsers. Target users: developers who need a simple `ask()` API with built-in tool use.

## Agent Loop
`ask(prompt, config)` runs a multi-round loop: calls the LLM, executes any tool calls, feeds results back, and repeats until `stopReason !== 'tool_use'`.

## Tools
- `search` — web search, returns sources
- `code_exec` — executes JS/Python code via quickjs-emscripten sandbox (browser-compatible) with auto-language detection. Python uses Pyodide (browser) or python3 subprocess (Node). Injects filesystem API (fs object for JS, open() for Python) backed by AgenticFileSystem.
- `file_read` / `file_write` — file I/O via AgenticFileSystem (browser-compatible)
- `shell_exec` — executes shell commands via agentic-shell (browser/Node compatible)

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
  shellResults?: ShellResult[]
}
```


Create PRD.md defining feature requirements and EXPECTED_DBB.md defining global verification criteria for agentic-lite.

Update PRD.md Tools section:
1. Change 'code_exec — executes JS via AsyncFunction' to 'code_exec — executes JS/Python via quickjs-emscripten sandbox (browser-compatible)'
2. Add 'shell_exec — executes shell commands via agentic-shell'
3. Update code_exec description to mention Python support (Pyodide in browser, python3 in Node)

1) Add shell_exec tool section documenting its interface and behavior. 2) Update code_exec section to reflect Python support. 3) Update sandbox description from 'AsyncFunction eval' to 'quickjs-emscripten sandbox'. 4) Add shellResults field to AgenticResult schema.

Add 'shellResults: ShellResult[]' to the AgenticResult block in PRD.md

1. Add shell_exec tool section to PRD.md documenting its interface and behavior. 2. Update code_exec section to reflect quickjs-emscripten sandbox implementation supporting both JS and Python, replacing the stale AsyncFunction eval description.

Add `shellResults?: ShellResult[]` to the AgenticResult section in PRD.md