# M6: Image Return Fix & Provider Validation

## Goals
- Fix `images` field silently dropped in final return path of `ask.ts`
- Add apiKey validation in provider auto-detection (`detectProvider`)

## Acceptance Criteria
- `AgenticResult.images` is populated when images are collected during tool rounds
- `detectProvider` throws a clear error when apiKey is missing or invalid
- All existing tests continue to pass

## Scope
2 tasks targeting P1 architecture gaps.
