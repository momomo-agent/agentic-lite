import { createProvider } from './src/providers/index.ts'

const KEY = 'sk-ant-oat01-3WzGV9aOWyGZTVnUu4LVnuyNFn5Au2EAGDfXhRybBZlc2pD5v7rjUBhcCJgWEiCzPLxWk6DI3r73hq-kd2ihX9rvFqJ_QAA'

const provider = createProvider({
  provider: 'openai', baseUrl: 'https://code.newcli.com/codex/v1',
  apiKey: KEY, model: 'gpt-5.2',
})

// Use ToolDefinition format (provider.chat wraps it)
const tools = [{
  name: 'code_exec',
  description: 'Execute JavaScript code and return the result',
  parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
}]

const messages: any[] = [{ role: 'user', content: 'What is sqrt(144)? Use the code_exec tool. Just give the number.' }]

async function run() {
  for (let round = 0; round < 3; round++) {
    console.log(`\n=== ROUND ${round + 1} ===`)
    console.log('Messages:', JSON.stringify(messages.map(m => ({
      role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 120) : '(array)'
    }))))
    
    const res = await provider.chat(messages, tools as any)
    console.log('stopReason:', res.stopReason)
    console.log('text:', res.text?.slice(0, 200))
    console.log('toolCalls:', res.toolCalls?.length, res.toolCalls?.map(tc => `${tc.name}(${tc.arguments?.slice(0,80)})`))

    if (res.stopReason !== 'tool_use' || !res.toolCalls?.length) {
      console.log('\n=== DONE: no more tool calls ===')
      console.log('Final answer:', res.text?.slice(0, 300))
      break
    }

    // Simulate tool execution
    const toolResult = '12'
    console.log('Simulated tool result:', toolResult)

    // Replicate what ask.ts does
    const callSummary = res.toolCalls.map(tc => `[Calling tool: ${tc.name}(${tc.arguments})]`).join('\n')
    const assistantText = [res.text, callSummary].filter(Boolean).join('\n')
    messages.push({ role: 'assistant', content: assistantText })
    messages.push({ role: 'user', content: `[Tool result for ${res.toolCalls[0].id}]: ${toolResult}` })
  }
}

run()
