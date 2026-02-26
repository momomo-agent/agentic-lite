// Test with custom OpenAI-compatible provider
import { ask } from './src/index.ts'

async function main() {
  console.log('=== Test: Custom provider (code.newcli.com) ===')
  const r = await ask('What is 17 * 23? Just give me the number.', {
    provider: 'openai',
    baseUrl: 'https://code.newcli.com/codex/v1',
    apiKey: 'sk-ant-oat01-3WzGV9aOWyGZTVnUu4LVnuyNFn5Au2EAGDfXhRybBZlc2pD5v7rjUBhcCJgWEiCzPLxWk6DI3r73hq-kd2ihX9rvFqJ_QAA',
    model: 'gpt-5.2',
    tools: [],
  })
  console.log('Answer:', r.answer)
  console.log('Usage:', r.usage)

  console.log('\n=== Test: Code tool ===')
  const r2 = await ask('Calculate fibonacci(10). Just the number.', {
    provider: 'openai',
    baseUrl: 'https://code.newcli.com/codex/v1',
    apiKey: 'sk-ant-oat01-3WzGV9aOWyGZTVnUu4LVnuyNFn5Au2EAGDfXhRybBZlc2pD5v7rjUBhcCJgWEiCzPLxWk6DI3r73hq-kd2ihX9rvFqJ_QAA',
    model: 'gpt-5.2',
    tools: ['code'],
  })
  console.log('Answer:', r2.answer)
  console.log('Tool calls:', r2.toolCalls?.length ?? 0)
  console.log('Usage:', r2.usage)
}

main().catch(console.error)
