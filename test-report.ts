import { ask } from './src/index.ts'

const KEY = 'sk-ant-oat01-3WzGV9aOWyGZTVnUu4LVnuyNFn5Au2EAGDfXhRybBZlc2pD5v7rjUBhcCJgWEiCzPLxWk6DI3r73hq-kd2ihX9rvFqJ_QAA'
const base = { provider: 'openai' as const, baseUrl: 'https://code.newcli.com/codex/v1', apiKey: KEY, model: 'gpt-5.2' }

const tests = [
  { name: 'T1: Plain (no tools)', prompt: 'What is 2+2? Just the number.', tools: [] as string[] },
  { name: 'T2: Code tool', prompt: 'Calculate fibonacci(10). Just the number.', tools: ['code'] },
  { name: 'T3: Code + math', prompt: 'What is the square root of 144? Use code to calculate.', tools: ['code'] },
]

async function run() {
  for (const t of tests) {
    console.log(`\n=== ${t.name} ===`)
    try {
      const r = await ask(t.prompt, { ...base, tools: t.tools as any })
      console.log('Answer:', r.answer?.slice(0, 200))
      console.log('Tool calls:', r.toolCalls?.length ?? 0)
      console.log('Usage:', JSON.stringify(r.usage))
      if (r.codeResults?.length) console.log('Code output:', r.codeResults[0].output?.slice(0, 100))
      console.log('Status: PASS')
    } catch (err) {
      console.log('Error:', String(err).slice(0, 200))
      console.log('Status: FAIL')
    }
  }
}

run()
