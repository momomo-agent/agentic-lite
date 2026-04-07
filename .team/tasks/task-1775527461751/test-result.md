# Test Result: task-1775527461751 — 升级 code_exec 沙箱

## Summary

| | Count |
|---|---|
| Total | 3 |
| Passed | 1 |
| Failed | 2 |

## DBB Verification

| Criterion | Status |
|---|---|
| No `new Function` or bare `eval` in code.ts | ✅ Pass |
| `quickjs-emscripten` in package.json | ✅ Pass |
| `executeCode()` returns `{ code, output }` or `{ code, output, error }` | ✅ Pass |
| Sandbox captures `console.log/warn/error` | ✅ Pass |
| Sandbox runs in Node.js (test suite passes) | ❌ FAIL — 2 tests failing |
| `codeToolDef` / `executeCode` interface unchanged | ✅ Pass |
| At least one success + one error test | ❌ FAIL — error test broken |

## Test Results

### ✅ DBB-009: console.log captured
`executeCode({ code: 'console.log("hello")' })` → output contains `hello`

### ❌ DBB-010: async code supported
`executeCode({ code: 'await Promise.resolve(42)' })` → `error` is `[object Object]`

**Root cause:** QuickJS does not support top-level `await` by default. `vm.evalCode()` returns an error handle for async code. The test assumes async is supported but the implementation does not handle it.

### ❌ DBB-011: runtime errors captured
`executeCode({ code: 'throw new Error("oops")' })` → `error` is `"[object Object]"` instead of matching `/oops/`

**Root cause:** `vm.dump(result.error)` returns a plain JS object `{name, message, stack}`. The implementation does `String(err)` which yields `[object Object]`. Should use `err?.message ?? String(err)` or `JSON.stringify(err)`.

## Implementation Bugs (do NOT modify src/)

1. **Bug 1 — Error serialization** (`src/tools/code.ts` line 47):
   `String(err)` on a dumped QuickJS error object gives `[object Object]`.
   Fix: use `(err as any)?.message ?? String(err)`.

2. **Bug 2 — Async/await not supported**:
   QuickJS `evalCode` does not support top-level `await`. Either:
   - Wrap code in an async IIFE and use `vm.executePendingJobs()`, or
   - Remove the async test from DBB if async is out of scope.

## Status: BLOCKED — implementation bugs must be fixed by developer
