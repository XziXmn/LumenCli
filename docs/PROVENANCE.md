# Code Provenance Registry

记录所有从外部项目移植/参考的功能来源，方便后续更新和合并。

## 基调

> 能拿就拿，拿不到再自己重构。

## 来源项目

| 项目 | 仓库 | License | 本地参考路径 |
|------|------|---------|-------------|
| Pi | earendil-works/pi-mono | MIT | `references/pi/` |
| oh-my-pi | can1357/oh-my-pi | MIT | `references/oh-my-pi/` |
| Claude Code | (reverse-engineered) | — | `references/ClaudeCodeRev/` |
| opencode | sst/opencode | MIT | `references/opencode/` |
| Codex | openai/codex | Apache-2.0 | `references/codex/` |

## 功能来源追踪

### 已移植

| 功能 | 来源 | 来源路径 | 本地路径 | 移植方式 | 备注 |
|------|------|----------|----------|----------|------|
| Todo Tool | oh-my-pi + Pi example | omp: `src/tools/todo-write.ts`, pi: `examples/extensions/todo.ts` | `packages/coding-agent/src/core/lumen-todo.ts` | 参考重写 | 分阶段任务跟踪，ops 模式 |
| AskUser Tool | Claude Code + Pi example | CC: `src/tools/AskUserQuestionTool/`, pi: `examples/extensions/question.ts` | `packages/coding-agent/src/core/lumen-askuser.ts` | 参考重写 | select/confirm/text 三种模式 |
| Config Discovery | oh-my-pi | `src/discovery/` (claude.ts, cursor.ts, mcp-json.ts) | `packages/coding-agent/src/core/lumen-config-discovery.ts` | 参考重写 | 大幅简化为单文件 extension |
| Repo Clone + Overview | opencode | `src/tool/repo_clone.ts` + `repo_overview.ts` | `packages/coding-agent/src/core/lumen-repo.ts` | 参考重写 | 合并为单文件双 tool |
| Hashline | oh-my-pi | `src/hashline/` (hash.ts, anchors.ts) | `packages/coding-agent/src/core/lumen-hashline.ts` | 参考重写 | Node.js crypto 替代 Bun.hash |
| LSP Tool (full protocol) | LSP 3.17 spec + oh-my-pi | spec + `oh-my-pi: src/lsp/` | `packages/coding-agent/src/core/lumen-lsp{,-client,-config,-types}.ts` | 参考重写 | 完整 LSP 3.17 协议实现 (Node.js 纯实现，去除 Bun 依赖)，10 个 actions，CLI fallback |
| Preset Routing | 自研 | — | `packages/coding-agent/src/core/lumen-preset.ts` | 自研 | `.lumen/presets.json` + vision auto-routing |
| Worktree Isolation | 自研 | — | `packages/coding-agent/src/core/lumen-worktree.ts` | 自研 | git worktree helpers + `/worktree` 命令 |
| Snip/Brief | Claude Code 概念 | — | `packages/coding-agent/src/core/lumen-snip.ts` | 自研 | 启发式截断/摘要（无 LLM 依赖） |
| CodeSearch | Claude Code + opencode 概念 | — | `packages/coding-agent/src/core/lumen-codesearch.ts` | 自研 | GitHub code search API（Exa Code 是付费的替代方案） |
| Memory Pipeline (2-phase) | Codex rs/memories/ | — | `packages/coding-agent/src/core/lumen-memory.ts` | 参考重写 | Phase 1 rollout summary + Phase 2 cwd/kind 合并 + Jaccard dedup |
| PowerShell Tool | 自研 | — | `packages/coding-agent/src/core/lumen-powershell.ts` | 自研 | Windows 原生 pwsh/powershell.exe 包装 |
| Background Agents | 自研 (Claude Code parallel agents 概念) | — | `packages/coding-agent/src/core/lumen-agents-bg.ts` | 自研 | 5 个 tools: spawn/status/send/wait/kill |

### 计划移植

| 功能 | 首选来源 | 来源路径 | 移植方式 | 优先级 |
|------|----------|----------|----------|--------|
| Snapshot/Checkpoint | opencode | `packages/opencode/src/snapshot/` | 参考重写 | 高 |
| Apply Patch | opencode | `packages/opencode/src/patch/` + `src/tool/apply_patch.ts` | 直接移植+适配 | 高 |
| Agent System | Pi subagent example + Claude Code | Pi: `examples/extensions/subagent/`, CC: `src/tools/AgentTool/` | 参考重写 | 高 |
| LSP Tool | oh-my-pi | `packages/coding-agent/src/lsp/` | 直接移植+适配 | 高 |
| Web Search | opencode | `packages/opencode/src/tool/websearch.ts` | 参考重写 | 高 |
| Web Fetch | opencode | `packages/opencode/src/tool/webfetch.ts` | 参考重写 | 高 |
| Plan Mode | oh-my-pi + opencode | omp: `src/plan-mode/`, oc: `src/tool/plan.ts` | 参考重写 | 高 |
| Hashline | oh-my-pi | `packages/coding-agent/src/hashline/` | 直接移植+适配 | 高 |
| TTSR | oh-my-pi | `packages/coding-agent/src/prompts/` (ttsrTrigger) | 参考重写 | 中 |
| Todo Tool | oh-my-pi + Claude Code | omp: `src/tools/todo-write.ts`, CC: `src/tools/TodoWriteTool/` | 参考重写 | 中 |
| Config Discovery | oh-my-pi | `packages/coding-agent/src/discovery/` | 直接移植+适配 | 中 |
| Repo Clone/Overview | opencode | `src/tool/repo_clone.ts` + `repo_overview.ts` | 参考重写 | 中 |
| CodeSearch | opencode | `src/tool/codesearch.ts` | 参考重写 | 中 |
| Secrets Redaction | oh-my-pi + Codex | omp: `src/secrets/`, codex: `codex-rs/secrets/` | 参考重写 | 中 |
| Memory Pipeline | Codex | `codex-rs/memories/` | 参考重写 | 中 |
| Commit Tool | oh-my-pi | `packages/coding-agent/src/commit/` | 参考重写 | 已完成(简版) |
| AskUser Tool | Claude Code | `src/tools/AskUserQuestionTool/` | 参考重写 | 低 |
| Snip/Brief | Claude Code | `src/tools/SnipTool/` + `BriefTool/` | 参考重写 | 低 |

## 移植方式说明

| 方式 | 含义 |
|------|------|
| **直接移植+适配** | 复制源文件，修改 import 路径和接口适配 Pi 的 extension API |
| **参考重写** | 阅读源码理解设计，用 Pi 的模式重新实现（避免不必要的依赖） |
| **Cherry-pick** | git cherry-pick 特定 commit（仅适用于 Pi upstream） |

## 更新流程

当上游项目更新了某个已移植功能时：

1. 查看本文件确认来源路径
2. 对比上游变更和本地实现
3. 决定是否需要同步更新
4. 更新后在本文件记录更新日期

## 格式约定

移植代码文件头部添加注释：

```typescript
/**
 * [Provenance] 来源: oh-my-pi/packages/coding-agent/src/lsp/
 * [Provenance] 移植方式: 直接移植+适配
 * [Provenance] 原始 commit: abc1234 (2026-05-10)
 * [Provenance] 适配改动: import 路径、Pi extension API 接口
 */
```
