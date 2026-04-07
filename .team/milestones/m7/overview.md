# M7: Custom Provider & Multi-Round Tool Loop

## Goals
- Implement custom/proxy provider support (P0 architecture gap)
- Fix multi-round tool loop so ask.ts iterates up to MAX_TOOL_ROUNDS (P1 architecture gap)

## Tasks
- task-1775530933189: Implement custom provider support (P0)
- task-1775530939117: Fix multi-round tool loop in ask.ts (P1, blocked by custom provider task)

## Acceptance Criteria
- `provider: 'custom'` with `baseUrl` + `apiKey` creates a working OpenAI-compatible client
- Unknown providers throw a clear error instead of silently falling through to openai
- `ask()` continues tool rounds until `stopReason !== 'tool_use'` or `MAX_TOOL_ROUNDS` is reached
- All existing tests continue to pass
