// Vercel serverless function — /api/ask
// Inline implementation to avoid build complexity

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { prompt, tools = ['search', 'code'], provider = 'anthropic', baseUrl, apiKey, model, searchApiKey } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt required' })
  if (!apiKey) return res.status(400).json({ error: 'apiKey required' })

  try {
    const result = await agenticAsk(prompt, { provider, baseUrl, apiKey, model, tools, searchApiKey })
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(200).json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
}

// ── Inline agentic-lite core ──

const MAX_ROUNDS = 10

async function agenticAsk(prompt, config) {
  const chat = config.provider === 'anthropic' ? anthropicChat : openaiChat
  const toolDefs = buildToolDefs(config.tools)
  const messages = [{ role: 'user', content: prompt }]
  const acc = { sources: [], codeResults: [], files: [], toolCalls: [], images: [] }
  let usage = { input: 0, output: 0 }

  for (let i = 0; i < MAX_ROUNDS; i++) {
    const res = await chat(messages, toolDefs, config)
    usage.input += res.usage.input
    usage.output += res.usage.output

    if (res.stopReason !== 'tool_use' || !res.toolCalls.length) {
      return {
        answer: res.text,
        sources: acc.sources.length ? acc.sources : undefined,
        images: acc.images.length ? acc.images : undefined,
        codeResults: acc.codeResults.length ? acc.codeResults : undefined,
        toolCalls: acc.toolCalls.length ? acc.toolCalls : undefined,
        usage,
      }
    }

    // Execute tools
    const results = []
    for (const tc of res.toolCalls) {
      const output = await execTool(tc, config, acc)
      acc.toolCalls.push({ tool: tc.name, input: tc.input, output })
      results.push(String(output))
    }

    // For Anthropic: use standard tool_result format
    if (config.provider === 'anthropic') {
      messages.push({ role: 'assistant', content: res.rawContent || res.text })
      messages.push({ role: 'user', content: res.toolCalls.map((tc, idx) => ({
        type: 'tool_result', tool_use_id: tc.id, content: results[idx],
      })) })
      continue
    }

    // For OpenAI-compatible proxies: flatten to text + final call without tools
    const callSummary = res.toolCalls.map(tc => `I called ${tc.name}(${JSON.stringify(tc.input)})`).join('\n')
    const assistantText = [res.text, callSummary].filter(Boolean).join('\n')
    messages.push({ role: 'assistant', content: assistantText })
    messages.push({ role: 'user', content: `Here are the tool results:\n${results.join('\n')}\n\nPlease provide the final answer based on these results.` })

    // Final call WITHOUT tools to force answer
    const finalRes = await chat(messages, [], config)
    usage.input += finalRes.usage.input
    usage.output += finalRes.usage.output
    return {
      answer: finalRes.text,
      sources: acc.sources.length ? acc.sources : undefined,
      images: acc.images.length ? acc.images : undefined,
      codeResults: acc.codeResults.length ? acc.codeResults : undefined,
      toolCalls: acc.toolCalls.length ? acc.toolCalls : undefined,
      usage,
    }
  }
  throw new Error('Max tool rounds exceeded')
}

// ── Anthropic provider ──

async function anthropicChat(messages, tools, config) {
  const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
  const endpoint = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`
  const body = {
    model: config.model || 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: messages.map(m => {
      if (m.role === 'user' && Array.isArray(m.content) && m.content[0]?.type === 'tool_result') {
        return { role: 'user', content: m.content }
      }
      return { role: m.role, content: m.content }
    }),
  }
  if (tools.length) body.tools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }))

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  const data = await res.json()

  let text = ''
  const toolCalls = []
  for (const b of data.content) {
    if (b.type === 'text') text += b.text
    else if (b.type === 'tool_use') toolCalls.push({ id: b.id, name: b.name, input: b.input || {} })
  }
  return { text, toolCalls, rawContent: data.content, usage: { input: data.usage.input_tokens, output: data.usage.output_tokens }, stopReason: data.stop_reason === 'tool_use' ? 'tool_use' : 'end' }
}

// ── OpenAI provider ──

async function openaiChat(messages, tools, config) {
  const base = (config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '')
  const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`
  const body = { model: config.model || 'gpt-4o', stream: false, messages: messages.map(m => {
    if (m.role === 'user' && Array.isArray(m.content) && m.content[0]?.type === 'tool_result') {
      return m.content.map(c => ({ role: 'tool', tool_call_id: c.tool_use_id, content: c.content }))
    }
    return { role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }
  }).flat() }
  if (tools.length) body.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  const rawText = await res.text()
  let data
  if (rawText.trimStart().startsWith('data: ')) {
    data = reassembleSSE(rawText)
  } else {
    data = JSON.parse(rawText)
  }
  const choice = data.choices[0]
  const toolCalls = (choice?.message.tool_calls || []).map(tc => {
    let input = {}
    try { input = JSON.parse(tc.function.arguments || '{}') } catch {}
    return { id: tc.id, name: tc.function.name, input, arguments: tc.function.arguments || '' }
  })
  return { text: choice?.message.content || '', toolCalls, usage: { input: data.usage.prompt_tokens, output: data.usage.completion_tokens }, stopReason: choice?.finish_reason === 'tool_calls' ? 'tool_use' : 'end' }
}

// ── Tool definitions ──

function buildToolDefs(tools) {
  const defs = []
  if (tools.includes('search')) defs.push({
    name: 'web_search', description: 'Search the web for current information.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] },
  })
  if (tools.includes('code')) defs.push({
    name: 'code_exec', description: 'Execute JavaScript code. Returns the result.',
    parameters: { type: 'object', properties: { code: { type: 'string', description: 'JavaScript code' } }, required: ['code'] },
  })
  return defs
}

// ── Tool execution ──

async function execTool(tc, config, acc) {
  if (tc.name === 'web_search') return execSearch(tc.input, config, acc)
  if (tc.name === 'code_exec') return execCode(tc.input, acc)
  return `Unknown tool: ${tc.name}`
}

async function execSearch(input, config, acc) {
  const query = String(input.query || '')
  if (!config.searchApiKey) return `Search requires searchApiKey`
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: config.searchApiKey, query, max_results: 5, include_answer: true, include_images: true }),
  })
  if (!res.ok) return `Search error: ${res.status}`
  const data = await res.json()
  const sources = (data.results || []).map(r => ({ title: r.title, url: r.url, snippet: r.content }))
  const images = (data.images || []).map(img => typeof img === 'string' ? img : img.url)
  acc.sources.push(...sources)
  if (images.length) { if (!acc.images) acc.images = []; acc.images.push(...images) }
  return data.answer || sources.map(s => `${s.title}: ${s.snippet}`).join('\n')
}

function execCode(input, acc) {
  const code = String(input.code || '')
  try {
    const fn = new Function(`const logs=[];const console={log:(...a)=>logs.push(a.map(String).join(' ')),error:(...a)=>logs.push(a.map(String).join(' '))};const r=(function(){${code}})();return{r,logs}`)
    const { r, logs } = fn()
    const output = logs.length ? logs.join('\n') + (r !== undefined ? '\n→ ' + r : '') : String(r ?? '')
    acc.codeResults.push({ code, output })
    return output
  } catch (err) {
    acc.codeResults.push({ code, output: '', error: String(err) })
    return `Error: ${err}`
  }
}

// ── SSE reassembly ──

function reassembleSSE(text) {
  const lines = text.split('\n')
  let content = ''
  const toolCalls = new Map()
  let finishReason = 'stop'
  let usage = { prompt_tokens: 0, completion_tokens: 0 }

  for (const line of lines) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
    try {
      const chunk = JSON.parse(line.slice(6))
      const delta = chunk.choices?.[0]?.delta
      if (!delta) { if (chunk.usage) usage = chunk.usage; continue }
      if (delta.content) content += delta.content
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0
          const existing = toolCalls.get(idx)
          if (!existing) {
            toolCalls.set(idx, { id: tc.id || '', name: tc.function?.name || '', args: tc.function?.arguments || '' })
          } else {
            if (tc.function?.arguments) existing.args += tc.function.arguments
          }
        }
      }
      // Handle Responses API format: tool calls in chunk.item (incremental)
      const item = chunk.item
      if (item?.call_id) {
        let found = false
        for (const [, tc] of toolCalls) {
          if (tc.id === item.call_id) {
            if (item.name) tc.name = item.name
            if (item.arguments) tc.args = item.arguments
            found = true
            break
          }
        }
        if (!found) {
          toolCalls.set(toolCalls.size, { id: item.call_id, name: item.name || '', args: item.arguments || '' })
        }
      }
      if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason
    } catch {}
  }

  const reassembled = [...toolCalls.values()].map(tc => ({
    id: tc.id, function: { name: tc.name, arguments: tc.args },
  }))

  const hasToolCalls = reassembled.length > 0

  return {
    choices: [{ message: { content: content || null, tool_calls: hasToolCalls ? reassembled : undefined }, finish_reason: hasToolCalls ? 'tool_calls' : finishReason }],
    usage,
  }
}
