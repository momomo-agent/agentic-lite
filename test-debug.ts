import { ask } from './src/index.ts'

const KEY = 'sk-ant-oat01-3WzGV9aOWyGZTVnUu4LVnuyNFn5Au2EAGDfXhRybBZlc2pD5v7rjUBhcCJgWEiCzPLxWk6DI3r73hq-kd2ihX9rvFqJ_QAA'
const base = { provider: 'openai' as const, baseUrl: 'https://code.newcli.com/codex/v1', apiKey: KEY, model: 'gpt-5.2' }

async function run() {
  console.log('=== T3 debug: Code + math ===')
  try {
    const r = await ask('What is the square root of 144? Use code to calculate. Just give me the number.', {
      ...base, tools: ['code'] as any,
    })
    console.log('Answer:', r.answer?.slice(0, 300))
    console.log('Tool calls:', r.toolCalls?.length ?? 0)
    if (r.codeResults?.length) console.log('Code:', r.codeResults.map(c => `${c.code} → ${c.output}`).join('; '))
    console.log('Status: PASS')
  } catch (err) {
    console.log('Error:', String(err).slice(0, 300))
    console.log('Status: FAIL')
  }
}

run()
