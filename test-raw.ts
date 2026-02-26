import { ask } from './src/index.ts'

const KEY = 'sk-ant-oat01-3WzGV9aOWyGZTVnUu4LVnuyNFn5Au2EAGDfXhRybBZlc2pD5v7rjUBhcCJgWEiCzPLxWk6DI3r73hq-kd2ihX9rvFqJ_QAA'

async function run() {
  // Manually do one round to see what happens
  const { callProvider } = await import('./src/providers/openai.ts')
  
  const messages = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is sqrt(144)? Use the code tool to calculate.' },
  ]
  
  const tools = [
    {
      type: 'function',
      function: {
        name: 'code_exec',
        description: 'Execute JavaScript code',
        parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
      },
    },
  ]
  
  console.log('--- Round 1: sending with tools ---')
  const res = await fetch('https://code.newcli.com/codex/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'gpt-5.2', messages, tools, stream: false }),
  })
  const raw = await res.text()
  console.log('Raw response (first 2000 chars):')
  console.log(raw.slice(0, 2000))
}

run()
