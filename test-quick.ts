// Quick test — agentic-lite
import { ask } from './src/index.ts'

const config = {
  provider: 'anthropic' as const,
  baseUrl: 'https://code.newcli.com/claude/aws',
  apiKey: process.argv[2] || '',
  model: 'claude-sonnet-4-20250514',
}

async function main() {
  console.log('=== Test 1: Code execution ===')
  const r1 = await ask('Calculate the standard deviation of [2, 4, 4, 4, 5, 5, 7, 9]. Just give me the number.', {
    ...config,
    tools: ['code'],
  })
  console.log('Answer:', r1.answer?.slice(0, 200))
  console.log('Tool calls:', r1.toolCalls?.length ?? 0)
  console.log('Usage:', r1.usage)

  console.log('\n=== Test 2: Plain (no tools) ===')
  const r2 = await ask('What is 2+2? Reply with just the number.', {
    ...config,
    tools: [],
  })
  console.log('Answer:', r2.answer)
  console.log('Usage:', r2.usage)
}

main().catch(console.error)
