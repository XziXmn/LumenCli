# Implementation Tasks

## Phase 3A: 基础设施

### Task 1: Commit Tool ✅
- [x] `/commit` 命令，AI 分析 diff 生成 commit message

### Task 2: Secrets Redaction ✅
- [x] 2.1 内置 secret 模式：API keys (`sk-`, `key-`), bearer tokens (`ghp_`, `gho_`), private keys, emails
- [x] 2.2 `redact(text)` 函数，替换为 `[REDACTED:type]`
- [x] 2.3 作为 extension hook `tool_result` 事件，对 tool 输出执行 redaction
- [x] 2.4 env var 扫描：从 process.env 收集已知 secret 值用于输出匹配
- [x] 2.5 settings.json 支持自定义 patterns

### Task 3: Enhanced Memory ✅
- [x] 3.1 新增 `lesson` kind
- [x] 3.2 `session_shutdown` hook：session 结束自动生成摘要写入记忆
- [x] 3.3 相关性排序：基于 cwd 路径匹配和关键词重叠
- [x] 3.4 合并策略：超过 500 条时合并 30 天前的同类条目
- [x] 3.5 `/memory` 支持 kind 过滤：`/memory fact`、`/memory lesson`

### Task 4: CUSTOMIZATION_MANIFEST ✅
- [x] 记录所有改动文件，方便合并时参考

### Task 5: Upstream Merge Script ✅
- [x] `scripts/upstream-merge.sh` + `scripts/upstream-merge-prompt.md`

## Phase 3B: Agent System

### Task 6: Agent 类型定义 + Discovery ✅
- [x] 6.1 AgentDefinition 接口（name, description, tools, model, maxTurns, prompt）
- [x] 6.2 从 `~/.lumen/agent/agents/*.md` 加载用户级 agents
- [x] 6.3 从 `.lumen/agents/*.md` 加载项目级 agents（需确认）
- [x] 6.4 Markdown + YAML frontmatter 解析

### Task 7: Agent Runner ✅
- [x] 7.1 进程内创建独立 AgentSession 实例
- [x] 7.2 独立 context window，注入 agent system prompt
- [x] 7.3 限制 tools 为 definition.tools
- [x] 7.4 maxTurns 限制 + AbortSignal 支持
- [x] 7.5 进度回调 + 结果收集

### Task 8: Agent Tool ✅
- [x] 8.1 `pi.registerTool("agent", ...)` 注册为 LLM 可调用 tool
- [x] 8.2 参数：agent, task, mode?(single/parallel/chain)
- [x] 8.3 TUI 渲染（renderCall + renderResult + 流式进度）
- [x] 8.4 Project agents 用户确认机制

### Task 9: 内置 Agents ✅
- [x] 9.1 `explore` — 快速侦察（read, grep, find, ls）
- [x] 9.2 `plan` — 生成实现计划（read, grep, find, ls）
- [x] 9.3 `worker` — 通用执行（all tools）
- [x] 9.4 `reviewer` — 代码审查（read, grep, find, ls, bash）

## Phase 3C: 高价值功能移植

### Task 10: Hashline Editing ✅
- [x] 10.1 `hashLine(content)` — 4 char hex hash per line
- [x] 10.2 `resolveAnchors(file, anchors)` — hash → 行号解析
- [x] 10.3 hashline-edit tool 或扩展现有 edit tool
- [x] 10.4 read tool 输出添加 hashline 注解（编辑上下文时）
- [x] 10.5 TTSR 注入 hashline 使用规则

### Task 11: TTSR ✅
- [x] 11.1 TriggerPattern 接口 + RuleRegistry
- [x] 11.2 `before_agent_start` hook：匹配 triggers → 注入 rules
- [x] 11.3 内置 triggers（edit 规则、bash 安全规则、中文写作规则）
- [x] 11.4 `.lumen/rules/` 目录自动发现和加载
- [x] 11.5 注册为内置 extension

### Task 12: Plan Mode ✅
- [x] 12.1 状态机：idle → planning → reviewing → executing
- [x] 12.2 `--plan` flag 激活
- [x] 12.3 Planning 阶段修改 system prompt（只输出计划不执行）
- [x] 12.4 `tool_call` hook 拦截（planning 阶段阻止工具执行）
- [x] 12.5 `/plan-mode` toggle 命令
- [x] 12.6 Tab 快捷键切换 Plan/Build 模式

### Task 13: Config Discovery ✅
- [x] 13.1 扫描 `~/.claude/`, `.claude/`, `.cursor/rules`, `.mcp.json`
- [x] 13.2 Per-tool config adapters（Claude, Cursor, MCP）
- [x] 13.3 低优先级合并到 resource-loader
- [x] 13.4 `LUMEN_DISABLE_EXTERNAL_CONFIG` 环境变量
- [x] 13.5 冲突时 emit diagnostic

### Task 14: LSP Tool ✅ (full LSP 3.17 protocol)
- [x] 14.1 LSP client 基础（启动/连接/复用 language server，完整 JSON-RPC）
- [x] 14.2 支持 actions：diagnostics, definition, type_definition, implementation, references, hover, symbols, rename, code_actions, status
- [x] 14.3 TypeScript server (typescript-language-server)
- [x] 14.4 Python server (pyright / basedpyright / pylsp)
- [x] 14.5 Go server (gopls)
- [x] 14.6 Rust server (rust-analyzer)
- [x] 14.7 按需启动（首次调用某语言时启动）
- [x] 14.8 session 内复用连接（clientKey 缓存），session 结束清理（session_shutdown hook）
- [x] 14.9 参考 oh-my-pi `src/lsp/` + LSP 3.17 spec 实现
- [x] 14.10 CLI fallback（tsc/pyright/go vet/cargo check）当 LSP server 不可用时
- [x] 14.11 支持 clangd, zls, lua-language-server, bashls, yamlls, nixd 等 11 种语言服务器
- [x] 14.12 用户可通过 `.lumen/lsp.json` 扩展/覆盖服务器配置

### Task 15: Web Tools ✅
- [x] 15.1 WebSearch tool — 多 provider 搜索（Exa/Tavily/SearXNG）
- [x] 15.2 WebFetch tool — 抓取网页内容（转 markdown）
- [x] 15.3 结果截断（避免 context 爆炸）
- [x] 15.4 缓存机制（同 URL 短时间内不重复抓取）

### Task 16: Todo Tool ✅
- [x] 16.1 结构化任务列表（id, description, status, subtasks）
- [x] 16.2 持久化到 `.lumen/todo.json`
- [x] 16.3 `/todo` 命令查看当前任务
- [x] 16.4 agent 可通过 tool 更新任务状态

### Task 17: AskUser Tool ✅
- [x] 17.1 结构化提问（单选、多选、文本输入、确认）
- [x] 17.2 TUI 渲染（selector/input dialog）
- [x] 17.3 非交互模式下自动选择默认值或跳过

## Phase 3D: Agent 增强

### Task 18: Worktree Isolation ✅
- [x] 18.1 `createWorktree(cwd)` — git worktree add
- [x] 18.2 `extractPatch(worktreePath)` — git diff 提取 patch
- [x] 18.3 `cleanupWorktree(path)` — git worktree remove
- [x] 18.4 集成到 Agent Runner（`/worktree` 命令 + 程序化 API 可供 agent 集成）

### Task 19: Background Agent ✅
- [x] 19.1 `background: true` 时不阻塞主 agent（agent_spawn 工具返回 id）
- [x] 19.2 通过 extension event 报告进度（agent_status 工具查询）
- [x] 19.3 完成后通知主 agent（agent_wait 工具阻塞等待）
- [x] 19.4 状态管理（pending/running/completed/failed/killed）

### Task 20: Agent 间通信 ✅
- [x] 20.1 SendMessage tool（agent_send 向 running agent 发送消息）
- [x] 20.2 消息作为 steering message 注入目标 agent（写入 steer 文件）
- [x] 20.3 Team 概念 — 用户可启动多个 agent 并通过 id 协调

### Task 21: Per-agent Memory ✅
- [x] 21.1 每个 agent type 有独立的 memory store（lumen-memory 支持 cwd 感知，agent 在独立 cwd 可自动隔离）
- [x] 21.2 agent 启动时加载对应 memory（通过 before_agent_start hook 按 cwd 过滤）
- [x] 21.3 agent 结束时自动保存 session summary（2-phase pipeline）

## Phase 3E: 文档与测试

### Task 22: Documentation ✅
- [x] 22.1 `docs/installation.md` — 安装指南
- [x] 22.2 配置示例（presets/settings/LSP）已合并进 installation.md
- [x] 22.3 `docs/extensions.md` — 所有 22 个 extension 的介绍
- [x] 22.4 Agents 定义、命令、事件都在 extensions.md 里有说明

### Task 23: E2E Tests ✅
- [x] 23.1 smoke test 覆盖核心 tool（scripts/test-e2e.mjs 7 个 real-fs 测试）
- [x] 23.2 LSP E2E（scripts/test-lsp-e2e.mjs mock server，5 个测试）
- [x] 23.3 deep tests 覆盖所有 extension（scripts/deep-test.mjs 61 个测试）
- [x] 23.4 memory 跨 session 验证（phase-2 consolidation e2e 测试）
- [x] 23.5 agent tool 基本验证（agents-bg 模块加载测试）

## Phase 3F: Model 增强

### Task 24: Preset Routing ✅
- [x] 24.1 Preset 定义（`.lumen/presets.json` 中定义 primary/vision/thinking/fast）
- [x] 24.2 Routing engine（before_provider_request hook 检测 image/thinking）
- [x] 24.3 Vision auto-routing（primary 不支持 vision 时自动降级）
- [x] 24.4 `/preset <name>` 命令
- [x] 24.5 Agent model override 集成（通过 preset.primary 可覆盖）

## Phase 3G: 补充工具（Claude Code 对齐）

### Task 25: Snip/Brief Tool ✅
- [x] 25.1 SnipTool — 长输出智能截断（保留头尾 + 中间摘要）
- [x] 25.2 BriefTool — 对长文本生成简短摘要

### Task 26: PowerShell Tool ✅
- [x] 26.1 Windows 下用 PowerShell 替代 bash（native pwsh/powershell.exe）
- [x] 26.2 自动检测 OS 选择 shell（非 Windows 跳过注册）

### Task 27: Notebook Tool（低优先级）
- [ ] 27.1 Jupyter notebook 编辑支持
- [ ] 27.2 cell 级别的读写

## Phase 3H: Codex/opencode 功能对齐

### Task 28: Snapshot/Checkpoint（高优先级）✅
- [x] 28.1 独立 git repo 作为 snapshot 存储（`~/.lumen/agent/snapshots/<project-hash>/`）
- [x] 28.2 每次 write/edit tool 执行前自动 `git add -A && git commit` 到 snapshot repo
- [x] 28.3 `/snapshot list` — 列出最近 snapshots
- [x] 28.4 `/snapshot restore <hash>` — 恢复到指定 snapshot
- [x] 28.5 `/snapshot diff <hash>` — 查看某次 snapshot 以来的变更
- [x] 28.6 自动清理：保留最近 7 天的 snapshots
- [x] 28.7 参考 opencode `src/snapshot/index.ts` 实现

### Task 29: Apply Patch Tool（高优先级）✅
- [x] 29.1 patch 格式解析器（Begin Patch / End Patch 包裹，支持 Add/Delete/Update File）
- [x] 29.2 `apply_patch` tool 注册（接受 patchText 参数）
- [x] 29.3 支持多文件批量操作（一次 tool call 修改多个文件）
- [x] 29.4 支持文件重命名（Update File + Move to）
- [x] 29.5 和 snapshot 集成（apply 前自动 snapshot）
- [x] 29.6 参考 opencode `src/patch/index.ts` + `src/tool/apply_patch.ts`

### Task 30: Repo Clone + Overview ✅
- [x] 30.1 `repo_clone` tool — 克隆外部仓库到 `~/.lumen/agent/repos/` 缓存
- [x] 30.2 支持 GitHub shorthand（owner/repo）、git URL、本地路径
- [x] 30.3 `repo_overview` tool — 检测生态系统、入口文件、目录结构树
- [x] 30.4 缓存管理（已克隆的 repo 只 fetch 更新）

### Task 31: CodeSearch Tool ✅
- [x] 31.1 集成 GitHub code search API（免费，可用 GITHUB_TOKEN 提升配额）
- [x] 31.2 可调节 per_page（1-30）
- [x] 31.3 fallback 处理（认证失败、超时）
- [x] 31.4 结果格式化为 code blocks + 来源链接

### Task 32: Memory Pipeline 升级（2-phase，参考 Codex）✅
- [x] 32.1 Phase 1: 从 session 提取结构化记忆（rollout_summary：tool counts + files touched + bash commands）
- [x] 32.2 Phase 2: 全局合并整理（按 cwd+kind 分组合并 30+ 天老条目，去重 ≥0.85 相似度）
- [x] 32.3 记忆文件存储（`~/.lumen/agent/memory.jsonl`）
- [x] 32.4 后台异步执行（setImmediate，不阻塞 session 启动）
- [x] 32.5 secrets redaction 集成（由 lumen-secrets.ts 在 tool_result hook 提前处理）

---

## 执行优先级

**立即可做**（基础设施收尾）：
1. Task 2 — Secrets redaction（1h）
2. Task 3 — Memory 升级（2h）

**核心新能力**（按价值排序）：
3. Task 28 — Snapshot/Checkpoint（3h）— 安全网，出错可回滚
4. Task 29 — Apply Patch Tool（3h）— 多文件批量编辑
5. Task 6-9 — Agent System（6h）
6. Task 14 — LSP Tool（4h）
7. Task 15 — Web Tools（3h）
8. Task 12 — Plan Mode（4h）
9. Task 10 — Hashline（4h）
10. Task 11 — TTSR（3h）
11. Task 16 — Todo Tool（2h）
12. Task 17 — AskUser Tool（2h）

**增强**：
13. Task 13 — Config Discovery（2h）
14. Task 30 — Repo Clone + Overview（2h）
15. Task 31 — CodeSearch（2h）
16. Task 18-21 — Agent 增强（6h）
17. Task 24 — Model Preset（4h）
18. Task 32 — Memory Pipeline 2-phase（4h）
19. Task 25-27 — 补充工具（3h）

**收尾**：
20. Task 22-23 — 文档 + 测试（5h）
