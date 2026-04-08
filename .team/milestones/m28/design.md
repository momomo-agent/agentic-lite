# Milestone 28 Technical Design — Streaming & Timeout Enforcement

## Goal

Close the two remaining vision gaps: (1) streaming support in agentic-core/agentic-lite, (2) code execution timeout enforcement. This pushes Vision compliance from ~82% to ≥90%.

## Architecture

### Streaming Layer

```
agentic-core/
  src/
    types.ts         — add StreamChunk, StreamAgentLoopResult
    loop.ts          — add runAgentLoopStream() async generator
    providers/
      anthropic.ts   — add stream() method using SSE
      openai.ts      — add stream() method using SSE

agentic-lite/
  src/
    ask.ts           — add askStream() async generator
```

### Timeout Layer

```
agentic-lite/
  src/
    tools/
      code.ts        — wrap all three backends with Promise.race timeout
```

---

## Key Interfaces

### StreamChunk (agentic-core/src/types.ts)

```typescript
export type StreamChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_input_delta'; id: string; json: string }
  | { type: 'tool_use'; toolCall: ProviderToolCall }
  | { type: 'done'; answer: string; toolCalls: ProviderToolCall[]; usage: { input: number; output: number } }
```

### Provider.stream() method

```typescript
export interface Provider {
  chat(messages: ProviderMessage[], tools: ToolDefinition[], system?: string): Promise<ProviderResponse>
  stream(messages: ProviderMessage[], tools: ToolDefinition[], system?: string): AsyncGenerator<StreamChunk>
}
```

`stream()` is optional — providers that don't implement it fall back to `chat()` in the loop. The `createProvider` factory ensures both methods exist on the returned object.

### runAgentLoopStream()

```typescript
export async function* runAgentLoopStream(config: AgentLoopConfig): AsyncGenerator<StreamChunk>
```

- Same config as `runAgentLoop` (reuse `AgentLoopConfig`)
- Calls `provider.stream()` instead of `provider.chat()`
- Accumulates tool calls from `tool_use` chunks
- After a complete tool_use round: executes tool calls via `config.executeToolCall`, appends results to messages, starts next stream round
- Yields all chunks from provider plus a final `done` chunk with aggregated answer/toolCalls/usage
- Respects `maxToolRounds` (same constant as `runAgentLoop`)

### askStream() (agentic-lite/src/ask.ts)

```typescript
export async function* askStream(prompt: string, config: AgenticConfig): AsyncGenerator<StreamChunk>
```

- Mirrors `ask()` setup: resolve filesystem, create provider, build tool defs
- Calls `runAgentLoopStream()` from agentic-core
- Yields chunks directly (pass-through)
- Final `done` chunk includes same aggregated data as `AgenticResult`

---

## Streaming: Provider Implementations

### Anthropic stream()

- Request: set `stream: true` in body
- Response: Read as `ReadableStream`, parse SSE lines
- Event types to handle:
  - `content_block_delta` with `delta.type: 'text_delta'` → yield `{ type: 'text_delta', text }`
  - `content_block_start` with `type: 'tool_use'` → yield `{ type: 'tool_use_start', id, name }`
  - `content_block_delta` with `delta.type: 'input_json_delta'` → yield `{ type: 'tool_input_delta', id, json }`
  - `message_delta` with `stop_reason` → assemble complete tool calls, yield `{ type: 'tool_use', toolCall }` for each
  - `message_stop` → yield `{ type: 'done', ... }`
- Use `response.body.getReader()` for streaming reads

### OpenAI stream()

- Request: set `stream: true` in body
- Response: Read as `ReadableStream`, parse SSE `data:` lines
- Accumulate `delta.content` → yield `{ type: 'text_delta', text }`
- Accumulate `delta.tool_calls` by index → yield `tool_use_start` / `tool_input_delta` / `tool_use`
- `[DONE]` → yield `{ type: 'done', ... }`

---

## Timeout Enforcement

### Approach: Promise.race with timeout wrapper

```typescript
export async function executeCode(
  input: Record<string, unknown>,
  filesystem?: AgenticFileSystem,
  timeout?: number,  // NEW optional parameter
): Promise<CodeResult>
```

**Implementation strategy:**

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ])
}
```

Apply `withTimeout` to each backend:

1. **QuickJS (browser JS)**: Wrap `vm.evalCodeAsync(code)` + `runtime.executePendingJobs()` in timeout
2. **Pyodide (browser Python)**: Wrap `pyodideInstance.runPythonAsync(code)` in timeout
3. **python3 subprocess (Node Python)**: Use `proc.kill()` on timeout via `setTimeout` + `proc.on('close')`

For the subprocess case, `Promise.race` alone isn't sufficient because the child process must be killed:

```typescript
const timer = setTimeout(() => proc.kill('SIGTERM'), timeout)
proc.on('close', () => clearTimeout(timer))
```

### Timeout source

Read from `config.toolConfig?.code?.timeout`. Pass through from `ask.ts` `handleToolCall` → `executeCode`. Default: no timeout (undefined = no enforcement).

### Edge cases

- `timeout <= 0`: treat as no timeout
- Pyodide loading time: timeout applies to `runPythonAsync` only, not `loadPyodide` (loading is cached, one-time)
- QuickJS disposal: ensure `vm.dispose()` is called even on timeout (use try/finally)

---

## File Changes Summary

| File | Change |
|------|--------|
| `packages/agentic-core/src/types.ts` | Add `StreamChunk` type, add `stream()` to `Provider` interface |
| `packages/agentic-core/src/loop.ts` | Add `runAgentLoopStream()` async generator |
| `packages/agentic-core/src/providers/anthropic.ts` | Add `stream()` method |
| `packages/agentic-core/src/providers/openai.ts` | Add `stream()` method |
| `packages/agentic-core/src/index.ts` | Export `runAgentLoopStream`, `StreamChunk` |
| `src/ask.ts` | Add `askStream()` function, pass timeout to `executeCode` |
| `src/tools/code.ts` | Add timeout parameter, wrap backends with `Promise.race` |
| `src/types.ts` | No changes needed (AgenticConfig already has `toolConfig.code.timeout`) |

---

## Task Sequence

1. **task-1775620573568** — Add streaming to agentic-core Provider interface (types + providers + loop)
2. **task-1775620587853** — Expose streaming API in agentic-lite (askStream)
3. **task-1775620592995** — Enforce toolConfig.code.timeout in executeCode
4. **task-1775620598483** — Update ARCHITECTURE.md for streaming API
5. **task-1775620603459** — Add tests for streaming and timeout

Tasks 1-3 are independent (can be parallelized). Task 4 depends on 1. Task 5 depends on 1, 2, 3.

---

## Risk Mitigation

1. **Provider.stream() backward compat**: `stream()` is a new method. Existing code calling `chat()` is unaffected. `runAgentLoop` (non-streaming) still uses `chat()`. No breaking changes.

2. **SSE parsing complexity**: Both Anthropic and OpenAI SSE formats are well-documented. The existing OpenAI provider already has SSE reassembly logic (`reassembleSSE`) — the streaming version extends this pattern.

3. **Pyodide timeout**: Pyodide doesn't support `AbortController`. `Promise.race` will reject the promise but Pyodide execution continues in the background. This is acceptable for browser — the timeout returns an error to the caller promptly.

4. **QuickJS async timeout**: quickjs-emscripten doesn't have a built-in interrupt mechanism. `Promise.race` provides the timeout boundary. The VM context is disposed in the `finally` block.

5. **Test isolation**: Streaming tests use mock providers (no real API calls). Timeout tests use known-long-running code snippets.
