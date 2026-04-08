# M28 DBB — Streaming & Timeout Enforcement

## DBB-001: Provider interface includes stream() method
- Requirement: `Provider` interface in `packages/agentic-core/src/types.ts` has a `stream()` method alongside existing `chat()`
- Given: `Provider` interface is inspected
- Expect: Interface declares `stream(messages, tools, system?)` returning `AsyncGenerator<StreamChunk>`
- Verify: TypeScript compiles; `Provider` type exports both `chat` and `stream` methods

## DBB-002: Anthropic provider implements stream()
- Requirement: `createAnthropicProvider` returns an object with a working `stream()` method that uses SSE
- Given: Anthropic provider is called with `stream()` and a mock API
- Expect: Uses `stream: true` in request body; parses SSE `data:` lines; yields `StreamChunk` objects with `type: 'text_delta'` or `type: 'tool_use'`
- Verify: Unit test calls `stream()` and collects chunks; final chunk has `type: 'done'` with usage

## DBB-003: OpenAI provider implements stream()
- Requirement: `createOpenAIProvider` returns an object with a working `stream()` method that uses SSE
- Given: OpenAI provider is called with `stream()` and a mock API
- Expect: Uses `stream: true` in request body; parses SSE `data:` lines; yields `StreamChunk` objects
- Verify: Unit test calls `stream()` and collects chunks; final chunk has `type: 'done'` with usage

## DBB-004: runAgentLoopStream() yields chunks in real-time
- Requirement: `packages/agentic-core/src/loop.ts` exports `runAgentLoopStream()` as an async generator
- Given: `runAgentLoopStream` is called with a config
- Expect: Yields `StreamChunk` objects as they arrive from the provider; final yield is `{ type: 'done', answer, toolCalls, usage }`
- Verify: Test feeds mock provider chunks and asserts chunks arrive before the generator completes

## DBB-005: agentic-lite exposes streaming entry point
- Requirement: `src/ask.ts` exports `askStream()` or `ask()` accepts a streaming option
- Given: Consumer calls streaming entry point
- Expect: Returns `AsyncGenerator` that yields partial results; final result matches `AgenticResult` shape
- Verify: Test calls `askStream()` with mock provider and collects chunks

## DBB-006: Code timeout is enforced via Promise.race
- Requirement: `executeCode` in `src/tools/code.ts` respects `toolConfig.code.timeout`
- Given: `executeCode` is called with a timeout config and a long-running code snippet
- Expect: Execution is aborted after timeout milliseconds; returns `CodeResult` with `error` containing timeout message
- Verify: Test sets timeout=100ms and runs `while(true){}`; result has error mentioning timeout

## DBB-007: Timeout works for all three execution backends
- Requirement: Timeout is enforced for QuickJS (browser JS), Pyodide (browser Python), and python3 subprocess (Node Python)
- Given: Each backend is tested with a long-running operation and timeout=100ms
- Expect: All three return timeout error within ~200ms
- Verify: Three tests — one per backend — each assert timeout error

## DBB-008: Existing ask() API is backward compatible
- Requirement: Non-streaming `ask()` continues to work identically
- Given: `ask(prompt, config)` is called without streaming options
- Expect: Returns `AgenticResult` with same shape; no behavioral change
- Verify: All existing tests pass without modification

## DBB-009: ARCHITECTURE.md documents streaming API
- Requirement: ARCHITECTURE.md includes streaming interface documentation
- Given: ARCHITECTURE.md is read
- Expect: Documents `Provider.stream()` method signature, `runAgentLoopStream()` behavior, and `askStream()` usage
- Verify: ARCHITECTURE.md contains streaming section with method signatures

## DBB-010: All tests pass (existing + new)
- Requirement: No regressions; new streaming and timeout tests pass
- Given: Full test suite is run
- Expect: All existing tests pass + new tests for streaming and timeout
- Verify: `npm test` reports all tests passing

## DBB-011: Vision gap closes to ≥90%
- Requirement: Streaming + timeout enforcement satisfy remaining vision requirements
- Given: Vision score is recalculated after implementation
- Expect: Vision compliance score is ≥90%
- Verify: Gap analysis reports vision score ≥90%
