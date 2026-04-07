import { describe, it, expect } from 'vitest'
import { AgenticFileSystem, MemoryStorage } from 'agentic-filesystem'
import { executeCode } from '../src/tools/code.js'

function makeFs() {
  return new AgenticFileSystem({ storage: new MemoryStorage() })
}

describe('Python fs injection - Node environment', () => {
  // BUG: Python Node implementation doesn't actually read from filesystem
  // Line 106 in code.ts: def read(self,p): return ""
  // The __fs.read() always returns empty string instead of calling filesystem.read()
  it.fails('open(path, "r") reads from virtual filesystem [BUG: not implemented]', async () => {
    const fs = makeFs()
    await fs.write('/data.txt', 'python data')
    const result = await executeCode({
      code: 'with open("/data.txt") as f: print(f.read())'
    }, fs)
    expect(result.error).toBeUndefined()
    expect(result.output).toContain('python data')
  })

  // BUG: Python Node implementation doesn't parse __FS_WRITES__ from stdout
  // Line 137-142 in code.ts: just returns stdout, doesn't extract and apply writes
  it.fails('open(path, "w") writes to virtual filesystem [BUG: writes not applied]', async () => {
    const fs = makeFs()
    await executeCode({
      code: 'with open("/out.txt", "w") as f: f.write("test output")'
    }, fs)
    const r = await fs.read('/out.txt')
    expect(r.content).toBe('test output')
  })

  // This test passes because the implementation returns empty string (which is falsy)
  it.fails('open() throws FileNotFoundError for missing file [BUG: returns empty instead]', async () => {
    const fs = makeFs()
    const result = await executeCode({
      code: 'with open("/missing.txt") as f: print(f.read())'
    }, fs)
    // Currently returns empty output, not an error
    expect(result.error).toMatch(/FileNotFoundError|No such file/)
  })

  it('Python code without filesystem works normally', async () => {
    const result = await executeCode({
      code: 'print("hello from python")'
    })
    expect(result.output).toContain('hello from python')
  })

  // BUG: Relative paths with ./ are not supported in Node implementation
  // Line 113: only checks file.startswith('/'), not './'
  it.fails('Python with relative path ./file [BUG: ./ not supported in Node]', async () => {
    const fs = makeFs()
    await fs.write('./relative.txt', 'relative content')
    const result = await executeCode({
      code: 'with open("./relative.txt") as f: print(f.read())'
    }, fs)
    expect(result.error).toBeUndefined()
    expect(result.output).toContain('relative content')
  })

  it.fails('Python write multiple lines [BUG: writes not applied]', async () => {
    const fs = makeFs()
    await executeCode({
      code: `
with open("/multi.txt", "w") as f:
    f.write("line1\\n")
    f.write("line2\\n")
    f.write("line3")
`
    }, fs)
    const r = await fs.read('/multi.txt')
    expect(r.content).toBe('line1\nline2\nline3')
  })
})
