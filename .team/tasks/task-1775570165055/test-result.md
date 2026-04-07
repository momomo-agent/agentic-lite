# Test Result: Document custom provider silent fallback behavior

**Status: PASS**
**Tester: tester-1**
**Date: 2026-04-07**

## Verification

`src/types.ts` AgenticConfig.baseUrl JSDoc:
```ts
/**
 * Base URL for custom/proxy providers.
 * When provider='custom' and customProvider is not set,
 * this falls back to an OpenAI-compatible adapter automatically.
 */
baseUrl?: string
```

`src/providers/provider.ts` case 'custom':
```ts
case 'custom':
  if (config.customProvider) return config.customProvider
  if (!config.baseUrl) throw new Error('customProvider or baseUrl is required when provider="custom"')
  return createOpenAIProvider(config)
```

Fallback behavior is documented in JSDoc and enforced with a clear error when neither customProvider nor baseUrl is set.

## Test Results

- custom-provider.test.ts: 2/2 passed
- custom-provider-baseurl.test.ts: 3/3 passed
- All 64 tests pass

**Pass: 64 / Fail: 0**
