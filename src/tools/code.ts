// Code execution tool — quickjs-emscripten isolated sandbox

import { newAsyncContext, getQuickJS } from 'quickjs-emscripten'
import type { ToolDefinition } from '../providers/provider.js'
import type { CodeResult } from '../types.js'
import type { AgenticFileSystem } from 'agentic-filesystem'

// Browser environment detection
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

// Pyodide instance cache (browser)
let pyodideInstance: any = null

function createFsWrapper(filesystem: AgenticFileSystem) {
  return {
    read: (path: string) => filesystem.read(path),
    write: (path: string, data: string) => filesystem.write(path, data),
  }
}

async function injectFilesystem(vm: any, filesystem?: AgenticFileSystem) {
  if (!filesystem) return
  const fsHandle = vm.newObject()

  const readFn = vm.newAsyncifiedFunction('readFileSync', async (pathHandle: any) => {
    const path = String(vm.dump(pathHandle))
    const result = await filesystem.read(path)
    if (result.error || !result.content) throw vm.newError(`ENOENT: no such file or directory, open '${path}'`)
    return vm.newString(result.content)
  })
  vm.setProp(fsHandle, 'readFileSync', readFn)
  readFn.dispose()

  const writeFn = vm.newAsyncifiedFunction('writeFileSync', async (pathHandle: any, dataHandle: any) => {
    const path = String(vm.dump(pathHandle))
    const data = String(vm.dump(dataHandle))
    const result = await filesystem.write(path, data)
    if (result.error) throw vm.newError(`EACCES: permission denied, write '${path}'`)
    return vm.undefined
  })
  vm.setProp(fsHandle, 'writeFileSync', writeFn)
  writeFn.dispose()

  const existsFn = vm.newAsyncifiedFunction('existsSync', async (pathHandle: any) => {
    const path = String(vm.dump(pathHandle))
    const result = await filesystem.read(path)
    return vm.newBoolean(!result.error && result.content !== null)
  })
  vm.setProp(fsHandle, 'existsSync', existsFn)
  existsFn.dispose()

  vm.setProp(vm.global, 'fs', fsHandle)
  fsHandle.dispose()
}

function detectLanguage(code: string): 'python' | 'javascript' {
  const pythonPatterns = /\b(import|from|def|print|if __name__|class\s+\w+:)\b/
  return pythonPatterns.test(code) ? 'python' : 'javascript'
}

async function executePythonBrowser(code: string, filesystem?: AgenticFileSystem): Promise<CodeResult> {
  if (!pyodideInstance) {
    const { loadPyodide } = await import('pyodide')
    pyodideInstance = await loadPyodide()
  }

  try {
    if (filesystem) {
      pyodideInstance.globals.set('__filesystem__', {
        read: (path: string) => filesystem.read(path),
        write: (path: string, data: string) => filesystem.write(path, data),
      })
      await pyodideInstance.runPythonAsync(`
import io, js
_original_open = open
def open(file, mode='r', *args, **kwargs):
    if isinstance(file, str) and (file.startswith('/') or file.startswith('./')):
        fs = js.__filesystem__
        if 'r' in mode:
            result = fs.read(file)
            if result.error: raise FileNotFoundError(f"No such file: {file}")
            return io.StringIO(result.content)
        elif 'w' in mode:
            class W:
                def __init__(self, p): self.p=p; self.b=[]
                def write(self, d): self.b.append(str(d)); return len(d)
                def close(self): fs.write(self.p,''.join(self.b))
                def __enter__(self): return self
                def __exit__(self, *a): self.close()
            return W(file)
    return _original_open(file, mode, *args, **kwargs)
`)
    }

    const output: string[] = []
    pyodideInstance.setStdout({ batched: (text: string) => output.push(text) })
    const result = await pyodideInstance.runPythonAsync(code)
    const resultStr = result !== undefined && result !== null ? String(result) : ''
    return { code, output: [...output, ...(resultStr ? [`→ ${resultStr}`] : [])].join('\n') }
  } catch (err: any) {
    return { code, output: '', error: err.message || String(err) }
  }
}

async function executePythonNode(code: string, filesystem?: AgenticFileSystem): Promise<CodeResult> {
  const { spawn } = await import('child_process')

  let fullCode = code
  if (filesystem) {
    const preamble = `
import io, json as __json
class __FS:
    def __init__(self): self._w={}
    def read(self,p): return ""
    def write(self,p,d): self._w[p]=d
    def flush(self):
        if self._w: print(f"__FS_WRITES__:{__json.dumps(self._w)}",flush=True)
__fs=__FS()
_open=open
def open(file,mode='r',*a,**k):
    if isinstance(file,str) and (file.startswith('/')):
        if 'r' in mode: return io.StringIO(__fs.read(file))
        if 'w' in mode:
            class W:
                def __init__(self,p): self.p=p;self.b=[]
                def write(self,d): self.b.append(str(d));return len(d)
                def close(self): __fs.write(self.p,''.join(self.b))
                def __enter__(self): return self
                def __exit__(self,*a): self.close()
            return W(file)
    return _open(file,mode,*a,**k)
import atexit; atexit.register(__fs.flush)
`
    fullCode = preamble + '\n' + code
  }

  return new Promise((resolve) => {
    const proc = spawn('python3', ['-c', fullCode])
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (exitCode) => {
      if (exitCode !== 0) {
        resolve({ code, output: stdout, error: stderr || `Exit code ${exitCode}` })
      } else {
        resolve({ code, output: stdout })
      }
    })

    proc.on('error', (err) => {
      resolve({ code, output: '', error: `Python not found: ${err.message}` })
    })
  })
}

export const codeToolDef: ToolDefinition = {
  name: 'code_exec',
  description: 'Execute JavaScript or Python code. Auto-detects language. Returns console output and the last expression value.',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript or Python code to execute' },
    },
    required: ['code'],
  },
}

export async function executeCode(
  input: Record<string, unknown>,
  filesystem?: AgenticFileSystem,
): Promise<CodeResult> {
  const code = String(input.code ?? '')
  if (!code) return { code: '', output: '', error: 'No code provided' }

  const language = detectLanguage(code)

  if (language === 'python') {
    return isBrowser ? executePythonBrowser(code, filesystem) : executePythonNode(code, filesystem)
  }

  // JavaScript execution
  const hasAwait = /\bawait\b/.test(code)
  const logs: string[] = []

  function injectConsole(vm: { newObject: Function; newFunction: Function; setProp: Function; global: unknown; dump: Function }) {
    const consoleHandle = vm.newObject()
    for (const method of ['log', 'warn', 'error'] as const) {
      const fn = vm.newFunction(method, (...args: unknown[]) => {
        logs.push((args as any[]).map((h: any) => String(vm.dump(h))).join(' '))
      })
      vm.setProp(consoleHandle, method, fn)
      fn.dispose()
    }
    vm.setProp(vm.global, 'console', consoleHandle)
    consoleHandle.dispose()
  }

  function handleResult(result: any, vm: any): CodeResult {
    if (result.error) {
      const err = vm.dump(result.error)
      result.error.dispose()
      vm.dispose()
      const errMsg = err && typeof err === 'object' ? (err.message ?? err.name ?? JSON.stringify(err)) : String(err)
      return { code, output: logs.join('\n'), error: String(errMsg) }
    }
    const val = vm.dump(result.value)
    result.value.dispose()
    vm.dispose()
    const output = [
      ...logs,
      ...(val !== undefined && val !== null ? [`→ ${String(val)}`] : []),
    ].join('\n')
    return { code, output }
  }

  if (hasAwait || filesystem) {
    const vm = await newAsyncContext()
    injectConsole(vm as any)
    await injectFilesystem(vm as any, filesystem)
    const wrapped = `(async()=>{return(${code})})().then(v=>{globalThis.__asyncResult=v},e=>{globalThis.__asyncError=String(e)})`
    const result = await vm.evalCodeAsync(wrapped)
    if (result.error) return handleResult(result, vm)
    result.value.dispose()
    ;(vm as any).runtime.executePendingJobs()
    const errHandle = vm.getProp(vm.global, '__asyncError')
    const errVal = vm.dump(errHandle)
    errHandle.dispose()
    if (errVal !== undefined) {
      vm.dispose()
      return { code, output: logs.join('\n'), error: String(errVal) }
    }
    const valHandle = vm.getProp(vm.global, '__asyncResult')
    const val = vm.dump(valHandle)
    valHandle.dispose()
    vm.dispose()
    const output = [
      ...logs,
      ...(val !== undefined && val !== null ? [`→ ${String(val)}`] : []),
    ].join('\n')
    return { code, output }
  }

  const QuickJS = await getQuickJS()
  const vm = QuickJS.newContext()
  injectConsole(vm as any)
  const result = vm.evalCode(code)
  return handleResult(result, vm)
}
