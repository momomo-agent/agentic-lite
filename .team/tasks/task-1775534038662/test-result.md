# Test Result: code_exec filesystem API injection

**Task ID:** task-1775534038662
**Tester:** tester
**Date:** 2026-04-07
**Status:** ❌ BLOCKED - Critical implementation bugs found

## Test Summary

- **Total Tests:** 58
- **Passed:** 58 (all bugs marked as expected failures)
- **Failed:** 0 (actual test failures)
- **Critical Bugs:** 3 (P0: 2, P1: 1)
- **Coverage:** ~40% (JavaScript works, Python broken)

## Test Results

### ✅ JavaScript Filesystem Injection (6/6 passing)

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

5. **Language detection - Python** - PASS
   - Correctly identifies Python code from keywords
   - Python execution path is triggered

6. **Language detection - JavaScript** - PASS
   - JavaScript is default when no Python keywords found
   - Basic JS execution works correctly

### ❌ Python Filesystem Injection (0/5 working)

All Python filesystem tests marked as `.fails()` due to implementation bugs:

1. **open(path, "r") reads from virtual filesystem** - BUG
   - Expected: Read file content from AgenticFileSystem
   - Actual: Always returns empty string
   - Root cause: `code.ts:106` - `def read(self,p): return ""`

2. **open(path, "w") writes to virtual filesystem** - BUG
   - Expected: Write data to AgenticFileSystem
   - Actual: Writes never applied to filesystem
   - Root cause: `code.ts:137-142` - `__FS_WRITES__` marker not parsed

3. **open() throws FileNotFoundError for missing file** - BUG
   - Expected: Raise FileNotFoundError
   - Actual: Returns empty string (no error)
   - Root cause: Same as #1

4. **Python with relative path ./file** - BUG
   - Expected: Support relative paths like `./file.txt`
   - Actual: FileNotFoundError (path check fails)
   - Root cause: `code.ts:113` - only checks `startswith('/')`, not `'./'`

5. **Python write multiple lines** - BUG
   - Expected: Write multi-line content to filesystem
   - Actual: Writes never applied
   - Root cause: Same as #2

### ⚠️ Known Issues (2 tests marked as expected failures)

1. **fs.existsSync returns true for existing file** - KNOWN BUG
   - Issue: Async quickjs executePendingJobs not fully drained
   - Impact: Boolean return value lost in async path
   - Workaround: Use readFileSync and catch error instead

2. **fs.existsSync returns false for missing file** - KNOWN BUG
   - Same root cause as above

## Root Cause Analysis

### Bug 1: Python filesystem reads not implemented (P0 - CRITICAL)

**Location:** `src/tools/code.ts:106`

**Current Implementation:**
```python
def read(self,p): return ""
```

**Problem:**
The `__fs.read()` method always returns an empty string instead of communicating with the parent Node process to fetch file content from `filesystem.read()`.

**Impact:**
- Python code cannot read files from virtual filesystem
- All Python `open(path, 'r')` operations return empty content
- Breaks core feature requirement from DBB

**Fix Required:**
The Node subprocess approach cannot easily pass filesystem data back to Python. Two options:
1. Use a different IPC mechanism (stdin/stdout protocol)
2. Pre-inject file contents as Python variables before execution
3. Use a temporary file bridge (write to temp file, Python reads it)

**Recommendation:** This is a fundamental architectural issue. The design document's approach is incomplete.

### Bug 2: Python filesystem writes not applied (P0 - CRITICAL)

**Location:** `src/tools/code.ts:137-142`

**Current Implementation:**
```typescript
proc.on('close', (exitCode) => {
  if (exitCode !== 0) {
    resolve({ code, output: stdout, error: stderr || `Exit code ${exitCode}` })
  } else {
    resolve({ code, output: stdout })
  }
})
```

**Problem:**
The implementation prints `__FS_WRITES__:{json}` to stdout but never parses it or applies writes to the filesystem.

**Impact:**
- Python code cannot write files to virtual filesystem
- All Python `open(path, 'w')` operations are lost
- Breaks core feature requirement from DBB

**Fix Required:**
```typescript
proc.on('close', async (exitCode) => {
  // Parse __FS_WRITES__ from stdout
  const writeMatch = stdout.match(/__FS_WRITES__:(.+)$/m)
  if (writeMatch && filesystem) {
    try {
      const writes = JSON.parse(writeMatch[1])
      for (const [path, data] of Object.entries(writes)) {
        await filesystem.write(path, String(data))
      }
      // Remove marker from output
      stdout = stdout.replace(/__FS_WRITES__:.+$/m, '').trim()
    } catch (e) {
      // Ignore parse errors
    }
  }

  if (exitCode !== 0) {
    resolve({ code, output: stdout, error: stderr || `Exit code ${exitCode}` })
  } else {
    resolve({ code, output: stdout })
  }
})
```

### Bug 3: Relative paths not supported in Python Node (P1)

**Location:** `src/tools/code.ts:113`

**Current Implementation:**
```python
if isinstance(file,str) and (file.startswith('/')):
```

**Problem:**
Only absolute paths starting with `/` are intercepted. Relative paths like `./file.txt` fall through to the original `open()` which tries to access the real filesystem.

**Impact:**
- Python code using relative paths fails with FileNotFoundError
- Inconsistent with JavaScript implementation which supports both

**Fix Required:**
```python
if isinstance(file,str) and (file.startswith('/') or file.startswith('./')):
```

## DBB Verification

Checking against `.team/milestones/m8/dbb.md`:

### JavaScript Sandbox (Lines 18-22)
- ✅ `fs.readFileSync(path)` reads from `config.filesystem`
- ✅ `fs.writeFileSync(path, data)` writes to `config.filesystem`
- ⚠️ `fs.existsSync(path)` has known async bug (not blocking)
- ✅ Injected `fs` object available in code execution scope

### Python Sandbox (Lines 24-27)
- ❌ `open(path, 'r')` does NOT read from `config.filesystem` (Bug #1)
- ❌ `open(path, 'w')` does NOT write to `config.filesystem` (Bug #2)
- ❌ File operations in Python do NOT use virtual filesystem

### Integration (Lines 44-56)
- ✅ `executeCode()` accepts `filesystem` parameter
- ✅ `ask.ts` passes `config.filesystem` to `executeCode()`
- ✅ Tool registration correct
- ❌ Python filesystem injection not functional

## Edge Cases Identified

1. **Binary files:** Not supported (text only) - documented limitation, acceptable
2. **Concurrent writes:** Last write wins (no locking) - acceptable for MVP
3. **Python not installed:** Error message is clear ("Python not found") - good
4. **Browser environment:** Pyodide path not tested (requires browser test environment)
5. **Large file reads:** No size limits implemented (could cause memory issues)
6. **Relative paths in Python:** Not supported (Bug #3)
7. **Error propagation:** Python read errors return empty string instead of raising exception

## Recommendations

### Critical (Must Fix Before Marking Done)

1. **Fix Bug #1: Python filesystem reads**
   - Implement proper IPC mechanism for reads
   - OR document that Python filesystem injection only works in browser (Pyodide)
   - OR remove Python filesystem support from this task

2. **Fix Bug #2: Python filesystem writes**
   - Parse `__FS_WRITES__` marker from stdout
   - Apply writes to filesystem before returning
   - Remove marker from output

3. **Fix Bug #3: Relative path support**
   - Update path check to include `'./'` prefix

### Optional Improvements

4. **Add error handling for Python reads:**
   - Raise FileNotFoundError when file doesn't exist
   - Currently returns empty string silently

5. **Document limitations:**
   - Python filesystem injection may only work in browser
   - Node implementation has architectural limitations

6. **Consider alternative approach:**
   - Use Pyodide in Node via WASM (slower but consistent)
   - OR document Node Python as "no filesystem support"

## Conclusion

The filesystem injection feature is **partially implemented**:

- ✅ **JavaScript filesystem injection works** (readFileSync, writeFileSync)
- ❌ **Python filesystem injection does NOT work** (critical bugs in Node implementation)

**Status: BLOCKED**

The implementation has 3 critical bugs that prevent Python filesystem injection from working:
1. Reads always return empty string (P0)
2. Writes are never applied to filesystem (P0)
3. Relative paths not supported (P1)

These are not test failures - they are **implementation bugs** that must be fixed by the developer.

## Test Files Created

- `test/code-python-fs.test.ts` - Python filesystem injection tests
  - All 5 Python filesystem tests marked with `.fails()` to document bugs
  - Tests pass because bugs are marked as expected failures
  - Remove `.fails()` markers after bugs are fixed

## Next Steps

1. **Developer must fix the 3 bugs listed above**
2. **Remove `.fails()` markers from `test/code-python-fs.test.ts`**
3. **Re-run tests to verify fixes:**
   ```bash
   npm test -- test/code-python-fs.test.ts
   ```
4. **All tests must pass without `.fails()` markers**
5. **Then task can move to "done" status**

## Test Command

```bash
# Run all tests
npm test

# Run specific test file
npm test -- test/code-python-fs.test.ts
npm test -- test/code-fs-injection.test.ts
```

Current test results: 58/58 passing (bugs marked as expected failures)
