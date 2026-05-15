# lumen-memory 模块已删除

## 删除原因

当前模块完全无效。2-phase pipeline 设计过于复杂但实际效果差：
- 召回逻辑基于 cwd 路径匹配 + 3-gram 相似度，精度低
- session_shutdown 提取的 rollout_summary 信息密度低
- 合并逻辑（consolidation）在实际使用中几乎不触发
- 整体 ROI 不值得维护

## 原实现内容

文件：`packages/coding-agent/src/core/lumen-memory.ts`

提供命令：
- `/remember <content>` 或 `/remember <kind>:<content>` — 持久化一条记忆
- `/memory [kind] [query]` — 搜索/列出记忆
- `/memory consolidate` — 手动触发 Phase 2 合并

存储位置：`~/.lumen/agent/memory.jsonl`（JSONL 格式）

架构：
- Phase 1 (session_shutdown)：提取 rollout_summary 写入 JSONL
- Phase 2 (后台异步)：去重 + 合并旧条目
- before_agent_start hook：注入相关记忆到 system prompt

## 后续重新设计方向（三条路线）

- **A：单文件 + 元信息头 + grep-able 召回**（半天工作量）
  - 一个 markdown 文件，每条记忆带时间戳和 tag
  - 召回靠 grep 关键词匹配
  - 优点：简单、可人工编辑、零依赖

- **B：分主题文件 + 按命令上下文挑文件注入**（一天工作量）
  - 按项目/主题分文件存储
  - 根据当前 cwd 和 session 上下文选择注入哪些文件
  - 优点：结构清晰、可控

- **C：embedding 检索 + auto-recall + 团队记忆**（两三天工作量）
  - 本地 embedding 模型做语义检索
  - 自动从 session 提取值得记住的内容
  - 支持多用户共享记忆
  - 优点：最智能；缺点：依赖重、调试难

待用户后续决策选择哪条路线。

## 恢复方式

旧实现可在 git history 中找回。搜索最后包含该文件的 commit 即可。
