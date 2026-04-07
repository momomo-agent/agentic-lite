// Code execution tool — quickjs-emscripten isolated sandbox

import { getQuickJS } from 'quickjs-emscripten'
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

  const QuickJS = await getQuickJS()
  const vm = QuickJS.newContext()
  const logs: string[] = []

  // Inject console
  const consoleHandle = vm.newObject()
  for (const method of ['log', 'warn', 'error'] as const) {
    const fn = vm.newFunction(method, (...args) => {
      logs.push(args.map(h => { const v = vm.dump(h); return String(v) }).join(' '))
    })
    vm.setProp(consoleHandle, method, fn)
    fn.dispose()
  }
  vm.setProp(vm.global, 'console', consoleHandle)
  consoleHandle.dispose()

  const result = vm.evalCode(code)

  if (result.error) {
    const err = vm.dump(result.error)
    result.error.dispose()
    vm.dispose()
    return { code, output: logs.join('\n'), error: String(err) }
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
