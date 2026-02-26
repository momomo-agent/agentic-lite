# agentic-lite

One function call with built-in search, code execution, and file processing.

Lighter than LangChain. Smarter than raw API calls.

## Install

```bash
npm install agentic-lite
```

## Quick Start

```js
import { ask } from 'agentic-lite'

const result = await ask('WWDC 2026 什么时候', {
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  tools: ['search'],
  toolConfig: {
    search: { apiKey: process.env.TAVILY_API_KEY }
  }
})

console.log(result.answer)   // "WWDC 2026 将于6月9日..."
console.log(result.sources)  // [{ title, url, snippet }]
```

## Custom Provider / Base URL

```js
// OpenAI
const r1 = await ask('...', {
  provider: 'openai',
  apiKey: 'sk-...',
  model: 'gpt-4o',
})

// Any OpenAI-compatible API (Groq, Together, local)
const r2 = await ask('...', {
  baseUrl: 'http://localhost:11434/v1',
  apiKey: 'ollama',
  model: 'llama3',
})

// Anthropic via proxy
const r3 = await ask('...', {
  provider: 'anthropic',
  baseUrl: 'https://my-proxy.com',
  apiKey: 'sk-ant-...',
})
```

## Tools

### Search
```js
const r = await ask('Latest news on AI', {
  apiKey: '...',
  tools: ['search'],
  toolConfig: { search: { apiKey: 'tvly-...', provider: 'tavily' } }
})
// r.sources → [{ title, url, snippet }]
```

### Code Execution
```js
const r = await ask('Calculate the standard deviation of [2,4,4,4,5,5,7,9]', {
  apiKey: '...',
  tools: ['code'],
})
// r.codeResults → [{ code, output }]
```

### File Processing
```js
const r = await ask('Summarize the contents of data.csv', {
  apiKey: '...',
  tools: ['file'],
})
// r.files → [{ path, action: 'read', content }]
```

### All Tools
```js
const r = await ask('Research React vs Vue npm downloads and save a report', {
  apiKey: '...',
  tools: ['search', 'code', 'file'],
})
```

## Response Shape

```ts
interface AgenticResult {
  answer: string
  sources?: Source[]
  codeResults?: CodeResult[]
  files?: FileResult[]
  toolCalls?: ToolCall[]
  usage?: { input: number; output: number }
}
```

## License

MIT
