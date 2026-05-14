# Pi 原版 vs oh-my-pi 功能差异列表

日期：2026-05-13
目的：识别 oh-my-pi 相对于 Pi 原版新增的功能，评估哪些值得直接拿来用或模仿集成到 LumenCli fork 中。

## 对比基线

- **Pi 原版**：`earendil-works/pi-mono` v0.74.0（`references/pi/`）
- **oh-my-pi**：`can1357/oh-my-pi` v14.9.9（`references/oh-my-pi/`）

## 包级差异

| 包 | Pi 原版 | oh-my-pi | 说明 |
|----|---------|----------|------|
| `packages/ai` | ✅ | ✅ | 两者都有，omp 扩展了更多 provider |
| `packages/agent` | ✅ | ✅ | agent-core runtime |
| `packages/coding-agent` | ✅ | ✅ (大幅扩展) | omp 从 ~35 文件扩展到 ~200+ 文件 |
| `packages/tui` | ✅ | ✅ | TUI 渲染库 |
| `packages/web-ui` | ✅ | ❌ | Pi 有 web UI，omp 没有 |
| `packages/natives` | ❌ | ✅ (新增) | Rust N-API：grep/shell/text/keys/highlight/glob/image/clipboard |
| `packages/stats` | ❌ | ✅ (新增) | 本地 AI 使用统计仪表盘 |
| `packages/swarm-extension` | ❌ | ✅ (新增) | Swarm 编排扩展 |
| `packages/utils` | ❌ | ✅ (新增) | 共享工具库 |
| `packages/typescript-edit-benchmark` | ❌ | ✅ (新增) | 编辑质量基准测试 |

## 功能级差异（oh-my-pi 新增）

### 🟢 强烈推荐采用（高价值、低复杂度）

| 功能 | 目录 | 说明 | 采用方式 |
|------|------|------|----------|
| **Hashline 编辑** | `src/hashline/` + `src/edit/` | 每行内容哈希锚点，编辑比 str_replace 可靠 10 倍 | 直接移植或参考实现 |
| **TTSR (Time Traveling Streamed Rules)** | `src/prompts/` (ttsrTrigger) | 零上下文成本的规则注入，按需触发 | 直接移植 |
| **Todo tool** | `src/tools/todo-write.ts` | 结构化任务跟踪，分阶段进度管理 | 直接移植 |
| **Ask tool** | `src/tools/ask.ts` | 结构化用户交互（多选、多问题） | 直接移植 |
| **Plan mode** | `src/plan-mode/` | 计划模式，先规划再执行 | 直接移植 |
| **Commit tool** | `src/commit/` | AI 驱动的 git commit（分析、拆分、changelog） | 直接移植 |
| **Universal Config Discovery** | `src/discovery/` | 兼容 Claude/Cursor/Windsurf/Codex/Gemini 配置 | 直接移植 |
| **Multi-credential** | `src/config/` | 多 API key 轮换、rate limit fallback | 参考实现 |
| **Model roles** | `src/config/` | default/smol/slow/plan/commit 角色路由 | 参考实现（Pi 原版可能已有基础） |
| **Session branching** | `src/session/` | 会话树分支、/tree 导航 | Pi 原版已有基础，omp 增强了 |
| **Autonomous Memory** | `src/memories/` + `src/memory-backend/` | 跨 session 自动记忆提取与注入 | 直接移植 |
| **Hindsight** | `src/hindsight/` | 回顾式学习（recall/reflect/retain） | 直接移植 |
| **Secrets redaction** | `src/secrets/` | 自动屏蔽 key/token/邮箱 | 直接移植 |

### 🟡 推荐采用（高价值、中等复杂度）

| 功能 | 目录 | 说明 | 采用方式 |
|------|------|------|----------|
| **LSP 集成** | `src/lsp/` | 40+ 语言的 LSP 支持（diagnostics/definition/references/rename） | 直接移植（依赖 natives） |
| **Python tool (IPython)** | `src/eval/` | 持久 IPython kernel + rich output | 直接移植 |
| **Browser tool (Puppeteer)** | `src/tools/browser.ts` + `src/tools/puppeteer/` | 无头浏览器 + 14 stealth 脚本 | 直接移植 |
| **Web search + fetch** | `src/web/` | 多 provider 搜索 + 专用 scraper | 直接移植 |
| **Task/Subagent 系统** | `src/task/` | 并行子代理、隔离 worktree、后台 job | 参考实现（你的 orchestrator 可以基于此） |
| **SSH tool** | `src/ssh/` | 远程命令执行、持久连接 | 按需移植 |
| **MCP 完整实现** | `src/mcp/` | stdio + HTTP + OAuth + 过滤 | 直接移植 |
| **Custom TypeScript commands** | `src/extensibility/custom-commands/` | 可编程 slash 命令 | 直接移植 |
| **Custom tools** | `src/extensibility/custom-tools/` | 用户自定义 tool | 直接移植 |
| **Hooks 系统** | `src/extensibility/hooks/` | pre/post 生命周期钩子 | 直接移植 |
| **Plugin 系统** | `src/extensibility/plugins/` | npm 插件安装/管理 | 直接移植 |
| **Async background jobs** | `src/async/` | 后台并发任务 + poll 工具 | 参考实现 |

### 🔵 可选采用（有价值但非必需）

| 功能 | 目录 | 说明 | 采用方式 |
|------|------|------|----------|
| **Rust N-API natives** | `packages/natives/` | grep/shell/text/keys/highlight/glob/image/clipboard 原生实现 | 按需（性能瓶颈时再引入） |
| **Image generation** | `src/tools/image-gen.ts` | Gemini 图片生成 | 按需 |
| **AST grep/edit** | `src/tools/ast-grep.ts` + `ast-edit.ts` | 语法感知搜索和代码修改 | 按需 |
| **Calculator** | `src/tools/calculator.ts` | 确定性计算器 | 小功能，直接拿 |
| **Vim mode** | `src/vim/` | Vim 键绑定 | 按需 |
| **STT (Speech-to-text)** | `src/stt/` | 语音输入 | 按需 |
| **DAP (Debug Adapter)** | `src/dap/` | 调试器集成 | 按需 |
| **Cursor provider** | `src/cursor.ts` | 用 Cursor Pro 订阅 | 按需 |
| **Stats dashboard** | `packages/stats/` | 使用统计 | 按需 |
| **Swarm extension** | `packages/swarm-extension/` | 多 agent 编排 | 后期 orchestrator 时参考 |
| **GitHub tool** | `src/tools/gh.ts` | GitHub CLI 集成 | 按需 |
| **SQLite reader** | `src/tools/sqlite-reader.ts` | 读取 SQLite 数据库 | 按需 |
| **Archive reader** | `src/tools/archive-reader.ts` | 读取压缩包 | 按需 |
| **Mermaid rendering** | `src/tools/render-mermaid.ts` | 图表渲染 | 按需 |

### ⚪ 不需要（Pi 原版已有或不适用）

| 功能 | 说明 |
|------|------|
| 基础 tools (read/write/bash/find/grep/edit) | Pi 原版已有 |
| Session 管理基础 | Pi 原版已有 |
| Skills/Extensions 加载 | Pi 原版已有 |
| Prompt templates | Pi 原版已有 |
| Themes | Pi 原版已有 |
| Compaction 基础 | Pi 原版已有 |
| Model 选择 (/model) | Pi 原版已有 |
| HTML export | Pi 原版已有 |

## 推荐的采用优先级

### 第一批（fork Pi 后立即集成）

这些功能成熟度高、独立性强、对日常使用提升最大：

1. **Hashline 编辑** — 编辑可靠性质的飞跃
2. **TTSR** — 零成本规则注入，对中文规则特别有用
3. **Plan mode** — 你本来就要做 /plan
4. **Todo tool** — 任务管理
5. **Commit tool** — 日常 git 工作流
6. **Autonomous Memory** — 跨 session 记忆
7. **Universal Config Discovery** — 兼容其他工具的配置
8. **Secrets redaction** — 安全基础

### 第二批（稳定后逐步加入）

9. **LSP 集成** — 代码智能
10. **Web search + fetch** — 信息获取
11. **MCP 完整实现** — 工具生态
12. **Custom tools + hooks + plugins** — 扩展性
13. **Ask tool** — 结构化交互
14. **Multi-credential** — 多 key 管理

### 第三批（按需）

15. Python tool、Browser tool、SSH、AST grep 等

### 后期（Orchestrator 阶段）

16. Task/Subagent 系统 — 作为你的 orchestrator 基础
17. Swarm extension — 多 agent 编排参考
18. Async background jobs — 并行任务

## 采用策略

**原则：能用开源的就不重复造轮子。**

| 策略 | 适用场景 | 做法 |
|------|----------|------|
| **直接移植** | 功能独立、文件自包含 | 从 oh-my-pi 复制相关文件到你的 Pi fork，适配接口 |
| **参考实现** | 功能和 Pi 核心耦合深 | 看 omp 怎么做的，在你的 fork 里用类似方式实现 |
| **按需引入** | 非核心功能 | 等需要时再移植，不提前做 |

**注意事项**：
- oh-my-pi 是 MIT license，可以自由使用
- 移植时注意 omp 依赖 `@oh-my-pi/pi-natives`（Rust N-API），如果不想引入 Rust 编译链，需要用纯 TS fallback
- omp 的一些功能依赖 Bun 特性（`Bun.spawn`、`bun:ffi`），确认你的 fork 也用 Bun

## Pi 原版 vs oh-my-pi 的核心差异总结

| 维度 | Pi 原版 | oh-my-pi |
|------|---------|----------|
| 文件数 (coding-agent/src) | ~35 | ~200+ |
| Tools | 7 个基础 | 50+ 个 |
| 编辑方式 | str_replace | hashline (更可靠) |
| 记忆 | 无 | autonomous memory + hindsight |
| 搜索 | grep (内置) | grep + web search + exa |
| LSP | 无 | 40+ 语言 |
| 浏览器 | 无 | Puppeteer + stealth |
| 子代理 | 无 | task tool + 6 bundled agents |
| MCP | 通过 extension | 原生内置 |
| 配置发现 | .pi/ 目录 | 8 种工具的配置统一发现 |
| Rust 原生 | 无 | 7500 行 N-API |
| Plan mode | 无（通过 extension） | 内置 |
| Commit | 无 | 内置 agentic commit |
| 规则注入 | 静态 AGENTS.md | TTSR (动态按需) |
