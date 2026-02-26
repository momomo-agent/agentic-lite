// Test what tool format the proxy accepts
const KEY = 'sk-ant-oat01-3WzGV9aOWyGZTVnUu4LVnuyNFn5Au2EAGDfXhRybBZlc2pD5v7rjUBhcCJgWEiCzPLxWk6DI3r73hq-kd2ihX9rvFqJ_QAA'
const endpoint = 'https://code.newcli.com/codex/v1/chat/completions'
const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` }
const messages = [{ role: 'user', content: 'What is 2+2? Use code_exec.' }]

// Format A: Responses API style (flat name/description/parameters)
const toolsA = [{ type: 'function', name: 'code_exec', description: 'Run JS', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } }]

// Format B: Chat Completions style (nested function.name)
const toolsB = [{ type: 'function', function: { name: 'code_exec', description: 'Run JS', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } } }]

async function tryFormat(label, tools) {
  try {
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ model: 'gpt-5.2', messages, tools, stream: false }) })
    const text = await res.text()
    console.log(`${label}: ${res.status} ${text.slice(0, 200)}`)
  } catch (e) { console.log(`${label}: ERROR ${e}`) }
}

await tryFormat('Format A (flat)', toolsA)
await new Promise(r => setTimeout(r, 2000))
await tryFormat('Format B (nested)', toolsB)
