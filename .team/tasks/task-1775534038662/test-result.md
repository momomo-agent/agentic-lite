# Test Result: code_exec filesystem API injection

**Task ID:** task-1775534038662
**Tester:** tester-2
**Date:** 2026-04-07
**Status:** ❌ FAILED - Implementation bug found (confirmed by tester-1)

## Test Summary

- **Total Tests:** 8
- **Passed:** 6
- **Failed:** 2
- **Coverage:** 75%

## Test Results

### ✅ Passing Tests (6/8)

1. **fs.readFileSync reads from virtual filesystem** - PASS
   - Correctly reads file content from AgenticFileSystem
   - Error handling works properly
   - Output contains expected content

2. **fs.writeFileSync writes to virtual filesystem** - PASS
   - Successfully writes data to virtual filesystem
   - Data persists and can be read back

3. **fs.readFileSync throws ENOENT for missing file** - PASS
   - Proper error handling for missing files
   - Error message matches Node.js format

4. **no filesystem configured — fs is not injected** - PASS
   - When no filesystem provided, `fs` is undefined
   - Graceful degradation works correctly

5. **detects Python from import keyword** - PASS
   - Language detection correctly identifies Python code
   - Python execution path is triggered

6. **defaults to JavaScript for non-Python code** - PASS
   - JavaScript is default when no Python keywords found
   - Basic JS execution works correctly

### ❌ Failing Tests (2/8)

1. **fs.existsSync returns true for existing file** - FAIL
   ```
   Expected output to contain: 'true'
   Actual output: ''
   ```
   - Test code: `fs.existsSync("/exists.txt")`
   - Issue: Returns empty output instead of boolean value

2. **fs.existsSync returns false for missing file** - FAIL
   ```
   Expected output to contain: 'false'
   Actual output: ''
   ```
   - Test code: `fs.existsSync("/missing.txt")`
   - Issue: Returns empty output instead of boolean value

## Root Cause Analysis

### Bug: `fs.existsSync` is async but should behave synchronously

**Location:** `src/tools/code.ts:44-50`

**Problem:**
The `existsSync` function is implemented using `vm.newAsyncifiedFunction`, which makes it return a Promise. However:
1. The function name `existsSync` implies synchronous behavior (Node.js convention)
2. The tests call it without `await`, expecting a boolean return value
3. When called without `await`, it returns a Promise object which doesn't get resolved

**Current Implementation:**
```typescript
const existsFn = vm.newAsyncifiedFunction('existsSync', async (pathHandle: any) => {
  const path = String(vm.dump(pathHandle))
  const result = await filesystem.read(path)
  return vm.newBoolean(!result.error && result.content !== null)
})
```

**Issue:** `newAsyncifiedFunction` creates an async function, so calling `fs.existsSync(path)` returns a Promise, not a boolean.

**Expected Behavior:**
- `fs.existsSync(path)` should return `true` or `false` directly (synchronous)
- OR the function should be renamed to `fs.exists(path)` and documented as async

## DBB Verification

Checking against `.team/milestones/m8/dbb.md`:

### JavaScript Sandbox (Lines 18-22)
- ✅ `fs.readFileSync(path)` reads from `config.filesystem`
- ✅ `fs.writeFileSync(path, data)` writes to `config.filesystem`
- ❌ `fs.existsSync(path)` checks file existence - **BROKEN** (returns Promise instead of boolean)
- ✅ Injected `fs` object available in code execution scope

### Python Sandbox (Lines 24-27)
- ⚠️ Not fully tested (Python tests pass but no filesystem injection tests for Python)
- Need additional tests for Python `open()` with filesystem

### Integration (Lines 44-56)
- ⚠️ Missing comprehensive test coverage for Python filesystem injection
- ⚠️ No tests for shell_exec tool (separate task)

## Edge Cases Identified

1. **Async/Sync Mismatch:** `existsSync` name implies sync but implementation is async
2. **Missing Python filesystem tests:** No tests verify Python `open()` reads/writes through virtual filesystem
3. **No error handling tests for Python:** What happens when Python code tries to read missing file?
4. **No concurrent access tests:** Multiple reads/writes in same code execution
5. **No relative path tests:** Tests only use absolute paths (`/path`), not relative (`./path`)

## Recommendations

### Critical (Must Fix)

1. **Fix `existsSync` implementation:**
   - Option A: Make it truly synchronous by caching filesystem state
   - Option B: Rename to `exists` and document as async (requires `await`)
   - Option C: Remove it entirely (not essential for MVP)

2. **Update tests to match implementation:**
   - If keeping async: Change tests to use `await fs.existsSync()`
   - If making sync: Keep tests as-is

### High Priority

3. **Add Python filesystem injection tests:**
   ```python
   # Test: Python open() read
   with open('/test.txt', 'r') as f:
       content = f.read()

   # Test: Python open() write
   with open('/out.txt', 'w') as f:
       f.write('data')
   ```

4. **Add error handling tests for Python:**
   - Reading missing file should raise `FileNotFoundError`
   - Writing to invalid path should raise appropriate error

### Medium Priority

5. **Test relative paths:** Verify `./file.txt` and `../file.txt` work correctly
6. **Test concurrent operations:** Multiple file operations in single code block
7. **Add integration test:** Full workflow with code reading, processing, and writing files

## Conclusion

The filesystem injection feature is **75% complete** but has a critical bug in `existsSync` that prevents it from working as expected. The core functionality (`readFileSync`, `writeFileSync`) works correctly.

**Recommendation:** Move task to **BLOCKED** status until `existsSync` bug is fixed.

## Next Steps

1. Developer should fix `existsSync` async/sync issue
2. Re-run tests to verify fix
3. Add Python filesystem injection tests
4. Add edge case tests
5. Update task status to "done" once all tests pass
