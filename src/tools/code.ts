// Code execution tool — quickjs-emscripten isolated sandbox

import { newAsyncContext, getQuickJS } from 'quickjs-emscripten'
import type { ToolDefinition } from '../providers/provider.js'
import type { CodeResult } from '../types.js'

// Browser environment detection
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

// Pyodide instance cache (browser)
let pyodideInstance: any = null

function detectLanguage(code: string): 'python' | 'javascript' {
  const pythonPatterns = /\b(import|from|def|print|if __name__|class\s+\w+:)\b/
  return pythonPatterns.test(code) ? 'python' : 'javascript'
}

async function executePythonBrowser(code: string): Promise<CodeResult> {
  if (!pyodideInstance) {
    const { loadPyodide } = await import('pyodide')
    pyodideInstance = await loadPyodide()
  }

  try {
    // Capture stdout
    const output: string[] = []
    pyodideInstance.setStdout({
      batched: (text: string) => output.push(text)
    })

    const result = await pyodideInstance.runPythonAsync(code)
    const resultStr = result !== undefined && result !== null ? String(result) : ''

    return {
      code,
      output: [...output, ...(resultStr ? [`→ ${resultStr}`] : [])].join('\n')
    }
  } catch (err: any) {
    return {
      code,
      output: '',
      error: err.message || String(err)
    }
  }
}

async function executePythonNode(code: string): Promise<CodeResult> {
  const { spawn } = await import('child_process')

  return new Promise((resolve) => {
    const proc = spawn('python3', ['-c', code])
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
): Promise<CodeResult> {
  const code = String(input.code ?? '')
  if (!code) return { code: '', output: '', error: 'No code provided' }

  const language = detectLanguage(code)

  // Route to Python execution
  if (language === 'python') {
    if (isBrowser) {
      return executePythonBrowser(code)
    } else {
      return executePythonNode(code)
    }
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

  if (hasAwait) {
    const vm = await newAsyncContext()
    injectConsole(vm as any)
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
