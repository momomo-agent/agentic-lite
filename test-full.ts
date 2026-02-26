import { ask } from './src/index.ts'

const KEY = 'sk-ant-oat01-3WzGV9aOWyGZTVnUu4LVnuyNFn5Au2EAGDfXhRybBZlc2pD5v7rjUBhcCJgWEiCzPLxWk6DI3r73hq-kd2ihX9rvFqJ_QAA'
const base = { provider: 'openai' as const, baseUrl: 'https://code.newcli.com/codex/v1', apiKey: KEY, model: 'gpt-5.2' }

const tests = [
  { name: 'T1: Plain (no tools)', prompt: 'What is 2+2? Just the number.', tools: [] as string[] },
  { name: 'T2: Code (fibonacci)', prompt: 'Calculate fibonacci(10). Just the number.', tools: ['code'] },
  { name: 'T3: Code (sqrt)', prompt: 'What is sqrt(144)? Use code. Just the number.', tools: ['code'] },
  { name: 'T4: Code (complex)', prompt: 'Generate first 5 prime numbers using code. Return as comma-separated.', tools: ['code'] },
  { name: 'T5: Search', prompt: 'What is the latest version of Node.js?', tools: ['search'] },
  { name: 'T6: Multi-tool', prompt: 'Search for the current population of Tokyo, then use code to calculate what percentage of world population (8 billion) that is.', tools: ['search', 'code'] },
]

async function run() {
  const results: { name: string; status: string; answer?: string; tools?: number; error?: string }[] = []

  for (const t of tests) {
    console.log(`\n=== ${t.name} ===`)
    try {
      const r = await ask(t.prompt, { ...base, tools: t.tools as any })
      const ans = r.answer?.slice(0, 150) || '(empty)'
      const tc = r.toolCalls?.length ?? 0
      console.log(`Answer: ${ans}`)
      console.log(`Tool calls: ${tc}`)
      if (r.codeResults?.length) console.log(`Code: ${r.codeResults.map(c => c.output?.slice(0,80)).join('; ')}`)
      if (r.sources?.length) console.log(`Sources: ${r.sources.length}`)
      console.log('Status: PASS')
      results.push({ name: t.name, status: 'PASS', answer: ans, tools: tc })
    } catch (err: any) {
      const msg = err.message?.slice(0, 150) || String(err).slice(0, 150)
      console.log(`Error: ${msg}`)
      console.log('Status: FAIL')
      results.push({ name: t.name, status: 'FAIL', error: msg })
    }
    // Rate limit buffer
    await new Promise(r => setTimeout(r, 3000))
  }

  console.log('\n\n========== REPORT ==========')
  const pass = results.filter(r => r.status === 'PASS').length
  console.log(`${pass}/${results.length} passed\n`)
  for (const r of results) {
    console.log(`${r.status === 'PASS' ? '✅' : '❌'} ${r.name}`)
    if (r.answer) console.log(`   → ${r.answer}`)
    if (r.error) console.log(`   → ERROR: ${r.error}`)
  }
}

run()
