const KEY = 'sk-ant-oat01-3WzGV9aOWyGZTVnUu4LVnuyNFn5Au2EAGDfXhRybBZlc2pD5v7rjUBhcCJgWEiCzPLxWk6DI3r73hq-kd2ihX9rvFqJ_QAA'

const messages = [
  { role: 'user', content: 'What is sqrt(144)? Use the code_exec tool.' },
]
const tools = [{
  type: 'function',
  function: { name: 'code_exec', description: 'Execute JavaScript code and return result', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
}]

const res = await fetch('https://code.newcli.com/codex/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
  body: JSON.stringify({ model: 'gpt-5.2', messages, tools, stream: false }),
})
const raw = await res.text()

// Extract all lines with 'item' or 'tool' or 'function' or 'call_id'
const lines = raw.split('\n')
for (const line of lines) {
  if (line.includes('item') || line.includes('tool_call') || line.includes('call_id') || line.includes('function_call') || line.includes('finish_reason')) {
    // Parse and pretty print
    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
      try {
        const chunk = JSON.parse(line.slice(6))
        if (chunk.item || chunk.choices?.[0]?.delta?.tool_calls || chunk.choices?.[0]?.finish_reason) {
          console.log(JSON.stringify(chunk, null, 2).slice(0, 500))
          console.log('---')
        }
      } catch {}
    }
  }
}
console.log('\n=== DONE ===')
