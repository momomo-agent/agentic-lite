// Code execution tool — browser-compatible AsyncFunction sandbox

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

  const logs: string[] = []
  const mockConsole = {
    log: (...a: unknown[]) => logs.push(a.map(String).join(' ')),
    error: (...a: unknown[]) => logs.push(a.map(String).join(' ')),
    warn: (...a: unknown[]) => logs.push(a.map(String).join(' ')),
  }

  try {
    // AsyncFunction works in browsers and Node — no Node-specific deps
    // Try as expression first (returns value), fall back to statements
    let fnBody: string
    try {
      new Function(`return (${code})`)  // syntax check
      fnBody = `return (async () => { return (${code}) })()`
    } catch {
      fnBody = `return (async () => { ${code} })()`
    }
    const fn = new Function('console', fnBody)
    const result = await fn(mockConsole)
    const output = [
      ...logs,
      ...(result !== undefined ? [`→ ${String(result)}`] : []),
    ].join('\n')
    return { code, output }
  } catch (err) {
    return { code, output: logs.join('\n'), error: String(err) }
  }
}
