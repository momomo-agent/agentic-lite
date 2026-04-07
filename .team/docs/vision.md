# Vision

agentic-lite 是一个纯浏览器端的 AI agent SDK。

目标：让 AI 以为自己在操作一台电脑——能读写文件、执行代码——但实际运行在浏览器里。

核心能力：
- file_read / file_write：通过 agentic-filesystem 操作浏览器虚拟文件系统（IndexedDB/localStorage）
- code_exec：在浏览器沙箱里执行 JavaScript 代码
- 真正的多轮 agent loop：AI 可以连续调用工具直到任务完成
