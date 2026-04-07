// Code execution tool — quickjs-emscripten isolated sandbox

import { newAsyncContext, getQuickJS } from 'quickjs-emscripten'
import type { ToolDefinition } from '../providers/provider.js'
import type { CodeResult } from '../types.js'

export const codeToolDef: ToolDefinition = {
  name: 'code_exec',
  description: 'Execute JavaScript code. Returns console output and the last expression value.',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript code to execute' },
    },
    required: ['code'],
  },
}

export async function executeCode(
  input: Record<string, unknown>,
): Promise<CodeResult> {
  const code = String(input.code ?? '')
  if (!code) return { code: '', output: '', error: 'No code provided' }

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
