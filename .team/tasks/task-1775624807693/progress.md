# Fix askStream() to use runAgentLoopStream instead of legacy agenticAsk

## Changes Made

### 1. `src/ask.ts` — Rewrote both `ask()` and `askStream()`
- **Before**: Used legacy `agenticAsk` from agentic-core with callback-based emit pattern
- **After**: Uses new provider-based API:
  - `createProvider()` to build Provider from config (supports `customProvider`)
  - `runAgentLoop()` for `ask()` (non-streaming)
  - `runAgentLoopStream()` for `askStream()` (streaming)
- Added `search` tool to `buildTools()` (was missing — search was not wired up)
- Imported `searchToolDef` and `executeSearch` from `./tools/search.js`

### 2. `src/types.ts` — Added `customProvider` field
- Changed `import type { Provider }` to inline `import('agentic-core').Provider` to avoid issues with module resolution

### 3. `node_modules/agentic-core` — Package was already updated
- `package.json` already pointed `main` to `dist/index.js` and `types` to `dist/index.d.ts`
- `dist/index.js` already had full implementations of `runAgentLoopStream`, `createProvider`, etc.
- `dist/index.d.ts` already had all the type declarations

## Test Results
- `ask-stream.test.ts`: 12/12 pass
- `streaming.test.ts`: 16/16 pass
- Full suite: 209/213 pass (4 pre-existing failures unrelated to this change)

## Key Architecture Change
The old `agenticAsk` managed its own provider creation, message building, and agent loop. The new approach:
1. `createProvider()` — builds a Provider object with `chat()` and `stream()` methods
2. `runAgentLoop()` / `runAgentLoopStream()` — manages multi-round agent loop
3. `executeToolCall` — callback for tool execution (maps tool names to agentic-lite implementations)
