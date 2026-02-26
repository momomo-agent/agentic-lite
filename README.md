# ⚡ agentic-lite

One function call with built-in search, code execution, and file processing.

Lighter than LangChain. Smarter than raw API calls.

**[Live Demo →](https://agentic-lite.vercel.app)**

## Features

- 🔍 Web search (Tavily) with sources and images
- 💻 Code execution (sandboxed JS eval)
- 📁 File read/write
- 🔄 Multi-round tool loop (up to 10 rounds)
- 🌊 SSE streaming support
- 🤖 Anthropic + OpenAI + any OpenAI-compatible proxy

## Install

```bash
npm install agentic-lite
```

## Quick Start

```js
import { ask } from 'agentic-lite'

const result = await ask('Latest AI news today', {
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  tools: ['search'],
  toolConfig: {
    search: { apiKey: process.env.TAVILY_API_KEY }
  }
})

console.log(result.answer)   // Summarized answer
console.log(result.sources)  // [{ title, url, snippet }]
console.log(result.images)   // ["https://...jpg", ...]
```

## Providers

```js
// Anthropic
await ask('...', {
  provider: 'anthropic',
  apiKey: 'sk-ant-...',
})

// OpenAI
await ask('...', {
  provider: 'openai',
  apiKey: 'sk-...',
  model: 'gpt-4o',
})

// Any OpenAI-compatible proxy
await ask('...', {
  provider: 'openai',
  baseUrl: 'https://my-proxy.com/v1',
  apiKey: 'sk-...',
  model: 'gpt-4o',
})
```

## Tools

### Search
```js
const r = await ask('What happened at WWDC 2026?', {
  apiKey: '...', tools: ['search'],
  toolConfig: { search: { apiKey: 'tvly-...' } }
})
r.sources  // [{ title, url, snippet }]
r.images   // ["https://..."]
```

### Code Execution
```js
const r = await ask('Calculate sqrt(256)', {
  apiKey: '...', tools: ['code'],
})
r.codeResults  // [{ code, output }]
```

### All Tools
```js
const r = await ask('Research and analyze...', {
  apiKey: '...', tools: ['search', 'code', 'file'],
})
```

## Response

```ts
interface AgenticResult {
  answer: string
  sources?: Source[]
  images?: string[]
  codeResults?: CodeResult[]
  files?: FileResult[]
  toolCalls?: ToolCall[]
  usage?: { input: number; output: number }
}
```

## Web Demo

The demo at [agentic-lite.vercel.app](https://agentic-lite.vercel.app) uses SSE streaming — you see real-time status updates during tool execution and token-by-token text rendering for the final answer.

Bring your own API keys (stored in localStorage, never sent to our servers).

## License

MIT
