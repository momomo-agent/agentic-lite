import { describe, it, expect } from 'vitest'
import { executeCode } from '../src/tools/code.js'

describe('DBB-009: console.log captured', () => {
  it('includes logged value in output', async () => {
    const result = await executeCode({ code: 'console.log("hello")' })
    expect(result.output).toContain('hello')
    expect(result.error).toBeUndefined()
  })
})

describe('DBB-010: async code supported', () => {
  it('executes await without error', async () => {
    const result = await executeCode({ code: 'await Promise.resolve(42)' })
    expect(result.error).toBeUndefined()
  })
})

describe('DBB-011: runtime errors captured', () => {
  it('returns error without throwing', async () => {
    const result = await executeCode({ code: 'throw new Error("oops")' })
    expect(result.error).toMatch(/oops/)
  })
})
