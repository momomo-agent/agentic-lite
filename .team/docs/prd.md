# PRD

## 目标

agentic-lite 浏览器版改造，让 AI 能在浏览器里"以为自己在电脑上"。

## 需求

### 1. 修复 agent loop（ask.ts）
- 当前问题：执行完一轮工具就强制 final call，不支持多轮
- 目标：真正的多轮循环，stopReason !== tool_use 才结束

### 2. file 工具换成 agentic-filesystem（file.ts）
- 当前：Node.js `fs` 模块，浏览器不可用
- 目标：换成 `AgenticFileSystem`，后端用 `AgenticStoreBackend`（IndexedDB）
- 接口不变：file_read / file_write

### 3. code 工具换成浏览器兼容实现（code.ts）
- 当前：`new Function` + Node console mock
- 目标：`AsyncFunction` eval，捕获 console.log 输出，纯浏览器可用
- 去掉所有 Node.js 依赖

## 验收标准
- 三个工具在浏览器 demo 里跑通
- AI 能连续调用 file_write → file_read → code_exec 完成一个任务
