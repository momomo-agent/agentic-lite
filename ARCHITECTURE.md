# Architecture

## Overview

agentic-lite is a minimal LLM agent library. It exposes a single `ask()` function that runs a tool-use loop until the model produces a final answer.

## Module Structure

- `src/index.ts` — public exports
- `src/ask.ts` — core agent loop (`ask()`)
- `src/types.ts` — all shared interfaces (`AgenticConfig`, `AgenticResult`, `Provider`, `ToolDefinition`)
- `src/providers/` — LLM provider adapters
  - `anthropic.ts` — Anthropic Claude adapter
  - `openai.ts` — OpenAI adapter
  - `provider.ts` — custom provider support
  - `index.ts` — `createProvider()` factory
- `src/tools/` — tool implementations
  - `search.ts` — web search
  - `code.ts` — code execution
  - `file.ts` — file read/write (via agentic-filesystem)
  - `shell.ts` — shell commands
  - `index.ts` — tool registry

## Data Flow

```
ask(prompt, config)
  → createProvider(config)
  → loop:
      provider.chat(messages)
      if stopReason === 'tool_use':
        executeToolCalls(toolCalls)
        append results to messages
      else:
        return AgenticResult
```

## Key Interfaces

- `AgenticConfig` — input config (provider, apiKey, model, tools, systemPrompt, filesystem)
- `AgenticResult` — output (answer, sources, images, codeResults, files, shellResults, toolCalls, usage)
- `Provider` — adapter interface with `chat()` method
- `ToolDefinition` — tool name, description, input schema, and execute function
