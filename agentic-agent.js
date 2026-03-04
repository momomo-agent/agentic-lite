// agentic-agent.js - 前端 Agent Loop
// 完全端侧运行，通过可配置的 proxy 调用 LLM
// 使用智能循环检测（对齐 OpenClaw）

import { detectToolCallLoop, recordToolCall, recordToolCallOutcome } from './loop-detection.js'

const MAX_ROUNDS = 100  // 软限制，实际由循环检测控制

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
  const state = { toolCallHistory: [] }  // 循环检测状态
  
  while (round < MAX_ROUNDS) {
    round++
    emit('status', { message: `Round ${round}/${MAX_ROUNDS}` })
    
    // Call LLM
    const response = await chat({ messages, tools: toolDefs, model, baseUrl, apiKey, proxyUrl })
    
    console.log(`[Round ${round}] stop_reason:`, response.stop_reason, 'tool_calls:', response.tool_calls?.length || 0)
    
    // Check if done
    if (['end_turn', 'stop'].includes(response.stop_reason) || !response.tool_calls?.length) {
      finalAnswer = response.content
      break
    }
    
    // Execute tools
    messages.push({ role: 'assistant', content: response.content, tool_calls: response.tool_calls })
    
    for (const call of response.tool_calls) {
      // 记录工具调用
      recordToolCall(state, call.name, call.input)
      
      // 检测循环
      const loopDetection = detectToolCallLoop(state, call.name, call.input)
      if (loopDetection.stuck) {
        emit('warning', { 
          level: loopDetection.level,
          message: loopDetection.message 
        })
        if (loopDetection.level === 'critical') {
          finalAnswer = `[Loop Detection] ${loopDetection.message}`
          break
        }
      }
      
      // 执行工具
      emit('tool', { name: call.name, input: call.input })
      const result = await executeTool(call.name, call.input, { searchApiKey })
      
      // 记录工具结果
      recordToolCallOutcome(state, call.name, call.input, result, null)
      
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
    
    // 如果检测到 critical 循环，退出
    if (finalAnswer) break
  }
  
  // If hit MAX_ROUNDS without final answer, force one more call without tools
  if (!finalAnswer) {
    emit('status', { message: 'Generating final answer...' })
    const finalResponse = await chat({ messages, tools: [], model, baseUrl, apiKey, proxyUrl })
    finalAnswer = finalResponse.content || '(no response)'
  }
  
  return { answer: finalAnswer, rounds: round, messages }
}

// ── LLM Chat Functions ──

async function anthropicChat({ messages, tools, model = 'claude-sonnet-4', baseUrl = 'https://api.anthropic.com', apiKey, proxyUrl }) {
  const base = baseUrl.replace(/\/+$/, '')
  const url = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`
  const body = {
    model,
    max_tokens: 4096,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  }
  if (tools?.length) body.tools = tools
  
  const response = await callLLM(url, apiKey, body, proxyUrl, true)
  
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
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  const body = { model, messages, stream: false }
  if (tools?.length) body.tools = tools.map(t => ({ type: 'function', function: t }))
  
  const response = await callLLM(url, apiKey, body, proxyUrl, false)
  
  // 处理 SSE 流式响应（code.newcli.com gpt-5.2 返回 SSE 格式）
  if (typeof response === 'string' && response.includes('chat.completion.chunk')) {
    return parseSSEResponse(response)
  }
  
  // 标准 OpenAI 响应
  const choice = response.choices?.[0]
  if (!choice) return { content: '', tool_calls: [], stop_reason: 'stop' }
  
  return {
    content: choice.message?.content || '',
    tool_calls: choice.message?.tool_calls?.map(t => {
      let input = {}
      try { input = JSON.parse(t.function.arguments || '{}') } catch {}
      return { id: t.id, name: t.function.name, input }
    }) || [],
    stop_reason: choice.finish_reason
  }
}

function parseSSEResponse(sseText) {
  const lines = sseText.split('\n')
  let textContent = ''
  const toolCalls = []
  let currentToolCall = null
  
  for (const line of lines) {
    if (!line.trim() || !line.includes('"')) continue
    
    try {
      // 提取 JSON 对象
      const jsonMatch = line.match(/\{.*\}/)
      if (!jsonMatch) continue
      
      const chunk = JSON.parse(jsonMatch[0])
      
      // 提取文本内容
      if (chunk.choices?.[0]?.delta?.content) {
        textContent += chunk.choices[0].delta.content
      }
      
      // 提取工具调用
      if (chunk.name && chunk.arguments !== undefined) {
        if (currentToolCall && currentToolCall.name === chunk.name) {
          currentToolCall.arguments += chunk.arguments
        } else {
          if (currentToolCall) toolCalls.push(currentToolCall)
          currentToolCall = {
            id: chunk.call_id || `call_${Date.now()}`,
            name: chunk.name,
            arguments: chunk.arguments || ''
          }
        }
      }
    } catch (e) {
      // 忽略解析错误
    }
  }
  
  if (currentToolCall) toolCalls.push(currentToolCall)
  
  // 解析工具调用参数
  const parsedToolCalls = toolCalls.map(t => {
    let input = {}
    try { input = JSON.parse(t.arguments || '{}') } catch {}
    return { id: t.id, name: t.name, input }
  })
  
  return {
    content: textContent,
    tool_calls: parsedToolCalls,
    stop_reason: parsedToolCalls.length > 0 ? 'tool_use' : 'stop'
  }
}

// ── Proxy or Direct Call ──

async function callLLM(url, apiKey, body, proxyUrl, isAnthropic = false) {
  const headers = { 'content-type': 'application/json' }
  if (isAnthropic) {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else {
    headers['authorization'] = `Bearer ${apiKey}`
  }
  
  if (proxyUrl) {
    // 通过 proxy 调用
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        mode: 'raw'
      })
    })
    const result = await response.json()
    if (!result.success) throw new Error(result.error || `Proxy failed: ${result.status}`)
    const rawBody = typeof result.body === 'string' ? result.body : JSON.stringify(result.body)
    if (result.status >= 400) throw new Error(`API error ${result.status}: ${rawBody.slice(0, 300)}`)
    // Handle SSE responses (some providers return SSE even with stream:false)
    try {
      if (rawBody.trimStart().startsWith('data: ')) {
        return reassembleSSE(rawBody)
      }
      return JSON.parse(rawBody)
    } catch (e) {
      throw new Error(`Response parse error: ${e.message}. Body starts with: ${rawBody.slice(0, 100)}`)
    }
  } else {
    // 直连
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`API error ${response.status}: ${text}`)
    }
    const text = await response.text()
    if (text.trimStart().startsWith('data: ')) {
      return reassembleSSE(text)
    }
    return JSON.parse(text)
  }
}

// ── SSE Reassembly ──

function reassembleSSE(raw) {
  const lines = raw.split('\n')
  let content = ''
  let toolCalls = {}
  let model = ''
  let usage = null
  let finishReason = null
  
  for (const line of lines) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
    try {
      const chunk = JSON.parse(line.slice(6))
      if (chunk.model) model = chunk.model
      if (chunk.usage) usage = chunk.usage
      const delta = chunk.choices?.[0]?.delta
      if (!delta) continue
      if (delta.content) content += delta.content
      if (delta.finish_reason) finishReason = delta.finish_reason
      if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: '', name: '', arguments: '' }
          if (tc.id) toolCalls[tc.index].id = tc.id
          if (tc.function?.name) toolCalls[tc.index].name = tc.function.name
          if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments
        }
      }
    } catch {}
  }
  
  const tcList = Object.values(toolCalls).filter(t => t.name)
  return {
    choices: [{
      message: {
        content,
        tool_calls: tcList.length ? tcList.map(t => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: t.arguments }
        })) : undefined
      },
      finish_reason: finishReason || 'stop'
    }],
    model,
    usage: usage || { prompt_tokens: 0, completion_tokens: 0 }
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
