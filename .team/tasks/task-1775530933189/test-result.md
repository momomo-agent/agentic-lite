# Test Result: Implement custom provider support

## Status: BLOCKED (tester-1 re-verification 2026-04-07)

## Summary
The implementation has a critical bug. It requires `baseUrl` for all custom providers, but should check for `customProvider` first and use it when provided.

## Test Execution Results
```
npm test -- test/custom-provider.test.ts
Exit code: 1
Total: 2 tests
Passed: 0 tests
Failed: 2 tests
```

## Failing Tests ❌
- **DBB-013 Test 1**: uses customProvider.chat() when provider="custom" - FAIL
  - Error: `baseUrl is required when provider="custom"`
  - Expected: Should use the provided `customProvider` object

- **DBB-013 Test 2**: throws when provider="custom" but no customProvider - FAIL
  - Error: `baseUrl is required when provider="custom"`
  - Expected: Should throw error mentioning `customProvider`

## Root Cause Analysis

**Bug Location:** `src/providers/provider.ts:62-65`

**Current Implementation (WRONG):**
```typescript
case 'custom':
  if (!config.baseUrl) throw new Error('baseUrl is required when provider="custom"')
  if (!config.apiKey) throw new Error('apiKey is required when provider="custom"')
  return createOpenAIProvider(config)
```

**Expected Implementation:**
```typescript
case 'custom':
  if (config.customProvider) return config.customProvider  // Use provided mock/custom provider
  if (!config.baseUrl) throw new Error('baseUrl is required when provider="custom"')
  if (!config.apiKey) throw new Error('apiKey is required when provider="custom"')
  return createOpenAIProvider(config)  // Fallback to OpenAI-compatible proxy
```

## Why This Is Wrong

1. **Type definition** (`src/types.ts:9-10`): Says `customProvider` is "required when provider='custom'"
2. **Tests expect**: When `customProvider` is provided, use it directly
3. **Current code**: Ignores `customProvider` and always requires `baseUrl`

The implementation supports only one use case (OpenAI-compatible proxies with `baseUrl`) but should support two:
- **Use case 1**: Mock/custom provider object (for testing and custom implementations)
- **Use case 2**: OpenAI-compatible proxy with `baseUrl` + `apiKey`

## DBB Verification Against M7

### DBB Criterion 1: Custom Provider Support ❌
- ✅ Creates OpenAI-compatible client with `baseUrl` + `apiKey` (when no `customProvider`)
- ❌ Should use `customProvider` object when provided (MISSING)
- ✅ Unknown providers throw error (verified by default case)
- ✅ Missing `baseUrl` throws error (but checked too early)

### DBB Criterion 3: Regression ❌
- 10 tests failing due to this bug
- All failing tests use `customProvider` for mocking

## Impact

This bug blocks:
- **task-1775530596867** (images field fix) - 2 tests blocked
- **task-1775530614268** (apiKey validation) - 1 test blocked
- All other tests that use `customProvider` for mocking (7 more tests)

## Required Fix

Add check for `config.customProvider` before checking `baseUrl`:

```typescript
case 'custom':
  if (config.customProvider) return config.customProvider
  if (!config.baseUrl) throw new Error('baseUrl is required when provider="custom" without customProvider')
  if (!config.apiKey) throw new Error('apiKey is required when provider="custom"')
  return createOpenAIProvider(config)
```

## Recommendation

**BLOCK THIS TASK** and send back to developer with clear bug report:
- Implementation does not match type definition
- Implementation does not match test expectations
- Implementation breaks all tests that use mocking
- Fix required: Check for `customProvider` first before requiring `baseUrl`
