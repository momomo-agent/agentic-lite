// agentic-agent.js - 前端 Agent Loop
// 完全端侧运行，通过可配置的 proxy 调用 LLM

const MAX_ROUNDS = 10

export async function agenticAsk(prompt, config, emit) {
  const { provider = 'anthropic', baseUrl, apiKey, model, tools = ['search', 'code'], searchApiKey, history, proxyUrl } = config
  
  if (!apiKey) throw new Error('API Key required')
  
  const chat = provider === 'anthropic' ? anthropicChat : openaiChat
  const toolDefs = buildToolDefs(tools)
  
  // Build messages
  const messages = []
  if (history?.length) {
    messages.push(...history)
  }
  messages.push({ role: 'user', content: prompt })
  
  let round = 0
  let finalAnswer = null
  
  while (round < MAX_ROUNDS) {
    round++
    emit('status', { message: `Round ${round}/${MAX_ROUNDS}` })
    
    // Call LLM
    const response = await chat({ messages, tools: toolDefs, model, baseUrl, apiKey, proxyUrl })
    
    // Check if done
    if (response.stop_reason === 'end_turn' || !response.tool_calls?.length) {
      finalAnswer = response.content
      break
    }
    
    // Execute tools
    messages.push({ role: 'assistant', content: response.content, tool_calls: response.tool_calls })
    
    for (const call of response.tool_calls) {
      emit('tool', { name: call.name, input: call.input })
      const result = await executeTool(call.name, call.input, { searchApiKey })
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }
  
  return { answer: finalAnswer, rounds: round, messages }
}

// ── LLM Chat Functions ──

async function anthropicChat({ messages, tools, model = 'claude-sonnet-4', baseUrl = 'https://api.anthropic.com', apiKey, proxyUrl }) {
  const url = `${baseUrl}/v1/messages`
  const body = {
    model,
    max_tokens: 4096,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    tools: tools || []
  }
  
  const response = await callLLM(url, apiKey, body, proxyUrl)
  
  return {
    content: response.content.find(c => c.type === 'text')?.text || '',
    tool_calls: response.content.filter(c => c.type === 'tool_use').map(t => ({
      id: t.id,
      name: t.name,
      input: t.input
    })),
    stop_reason: response.stop_reason
  }
}

async function openaiChat({ messages, tools, model = 'gpt-4', baseUrl = 'https://api.openai.com', apiKey, proxyUrl }) {
  const url = `${baseUrl}/v1/chat/completions`
  const body = {
    model,
    messages,
    tools: tools?.map(t => ({ type: 'function', function: t })) || []
  }
  
  const response = await callLLM(url, apiKey, body, proxyUrl)
  const choice = response.choices[0]
  
  return {
    content: choice.message.content || '',
    tool_calls: choice.message.tool_calls?.map(t => ({
      id: t.id,
      name: t.function.name,
      input: JSON.parse(t.function.arguments)
    })) || [],
    stop_reason: choice.finish_reason
  }
}

// ── Proxy or Direct Call ──

async function callLLM(url, apiKey, body, proxyUrl) {
  if (proxyUrl) {
    // 通过 proxy 调用
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url,
        method: 'POST',
        headers: {
          'authorization': `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body,
        mode: 'llm'
      })
    })
    const result = await response.json()
    if (!result.success) throw new Error(result.error || 'Proxy request failed')
    return result.data
  } else {
    // 直连
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  }
}

// ── Tools ──

function buildToolDefs(tools) {
  const defs = []
  if (tools.includes('search')) {
    defs.push({
      name: 'search',
      description: 'Search the web for current information',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    })
  }
  if (tools.includes('code')) {
    defs.push({
      name: 'execute_code',
      description: 'Execute Python code',
      input_schema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python code to execute' }
        },
        required: ['code']
      }
    })
  }
  return defs
}

async function executeTool(name, input, config) {
  if (name === 'search') {
    return await searchWeb(input.query, config.searchApiKey)
  }
  if (name === 'execute_code') {
    return { output: '[Code execution not available in browser]' }
  }
  return { error: 'Unknown tool' }
}

async function searchWeb(query, apiKey) {
  if (!apiKey) return { error: 'Search API key required' }
  
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 5
    })
  })
  
  const data = await response.json()
  return { results: data.results || [] }
}
