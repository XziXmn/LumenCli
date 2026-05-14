# Technical Design Document

## Introduction

本文档为 LumenCli Phase 3+ 后续开发提供技术设计。基于已完成的 Phase 1（品牌定制）和 Phase 2（写作工作流、.novel 检测、记忆模块），规划 Orchestrator、oh-my-pi 功能移植、上游合并工作流、测试和文档的实现方案。

## Architecture Overview

```
packages/coding-agent/src/core/
├── agents/                          ← Agent System (Claude Code 风格)
│   ├── types.ts                     ← AgentDefinition, AgentProgress, AgentToolResult
│   ├── discovery.ts                 ← Agent 发现（built-in + user + project）
│   ├── runner.ts                    ← 进程内 agent 执行引擎
│   ├── agent-tool.ts                ← AgentTool（LLM 可调用的 tool）
│   ├── worktree.ts                  ← Git worktree 隔离管理
│   ├── team.ts                      ← Team 通信（Phase 2）
│   └── built-in/                    ← 内置 agent 定义
│       ├── scout.md
│       ├── planner.md
│       ├── worker.md
│       └── reviewer.md
├── tools/
│   ├── commit.ts                    ← Commit tool (Req 8)
│   └── todo.ts                      ← Todo tool (future)
├── hashline/
│   ├── hasher.ts                    ← Line content hashing (Req 4)
│   ├── resolver.ts                  ← Anchor resolution
│   └── edit-tool-hashline.ts        ← Hashline-aware edit tool variant
├── ttsr/
│   ├── registry.ts                  ← Trigger pattern registry (Req 5)
│   ├── injector.ts                  ← Context injection engine
│   └── triggers.ts                  ← Built-in trigger definitions
├── plan-mode/
│   ├── plan-mode.ts                 ← Plan mode state machine (Req 6)
│   ├── plan-executor.ts             ← Sequential plan execution
│   └── plan-renderer.ts             ← Plan display formatting
├── lumen-memory.ts                  ← Enhanced memory (Req 7, existing + upgrade)
├── lumen-writing.ts                 ← Writing commands (existing)
├── lumen-novel.ts                   ← .novel detection (existing)
├── secrets/
│   ├── redactor.ts                  ← Pattern-based redaction (Req 15)
│   └── patterns.ts                  ← Built-in secret patterns
├── discovery/
│   ├── config-discovery.ts          ← External config scanner (Req 16)
│   └── adapters.ts                  ← Per-tool config adapters
└── model-routing/
    ├── presets.ts                   ← Preset definitions (Req 14)
    └── routing-engine.ts            ← Sub-system routing

.lumen/agents/                       ← 项目级 agent 定义
~/.lumen/agent/agents/               ← 用户级 agent 定义

scripts/
├── upstream-merge.sh                ← Merge workflow script (Req 9)
└── upstream-merge-prompt.md         ← AI conflict resolution prompt

docs/
├── installation.md                  ← User installation guide (Req 11)
├── mimo-setup.md                    ← Mimo configuration guide (Req 12)
└── extension-development.md         ← Extension dev guide (Req 13)

test/
└── e2e/
    ├── mimo-smoke.test.ts           ← E2E mimo tests (Req 10)
    ├── writing-commands.test.ts
    ├── novel-detection.test.ts
    └── memory-persistence.test.ts

CUSTOMIZATION_MANIFEST.md            ← Modified files tracking (Req 9)
```

## Component Design

### Component 1: Agent System（Claude Code 风格）(Req 1-3)

**参考**: Claude Code 的 `src/tools/AgentTool/` + `src/tasks/InProcessTeammateTask/`

**核心设计**：进程内独立 AgentSession 实例，每个 subagent 有独立 context window、独立 tool set、可指定 model。

#### 1.1 Agent Definition 格式

**文件**: `packages/coding-agent/src/core/agents/types.ts`

```typescript
export type AgentSource = "built-in" | "user" | "project";

export interface AgentDefinition {
  agentType: string;           // 唯一标识，如 "scout", "planner", "worker"
  whenToUse: string;           // 描述何时使用（LLM 可见）
  tools?: string[];            // 允许的 tools（undefined = all）
  disallowedTools?: string[];  // 禁止的 tools
  model?: string;              // 模型覆盖（"inherit" = 用主 agent 的模型）
  maxTurns?: number;           // 最大 turn 数
  permissionMode?: "plan" | "auto" | "supervised";
  memory?: "user" | "project" | "local";  // per-agent 持久化记忆
  isolation?: "worktree" | "none";        // git worktree 隔离
  background?: boolean;        // 后台运行
  skills?: string[];           // 预加载的 skills
  hooks?: Record<string, unknown>;  // session-scoped hooks
  source: AgentSource;
  filePath?: string;
  getSystemPrompt: () => string;
}
```

**Agent 定义文件格式** (`.lumen/agents/*.md`):
```markdown
---
name: scout
description: 快速代码侦察，返回压缩上下文供其他 agent 使用
tools: read, grep, find, ls, bash
model: local-mimo/mimo-v2.5-pro
maxTurns: 10
---

你是侦察兵。快速调查代码库并返回结构化发现...
```

#### 1.2 Agent Tool（LLM 可调用）

**文件**: `packages/coding-agent/src/core/tools/agent-tool.ts`

```typescript
// 注册为 Pi 原生 tool，和 read/bash/edit/write 同级
interface AgentToolParams {
  agent: string;           // agent type name
  task: string;            // 任务描述
  background?: boolean;    // 后台执行
  isolated?: boolean;      // worktree 隔离
}

interface AgentToolResult {
  agentId: string;
  content: Array<{ type: "text"; text: string }>;
  totalToolUseCount: number;
  totalDurationMs: number;
  totalTokens: number;
}
```

#### 1.3 Agent Runner（进程内执行）

**文件**: `packages/coding-agent/src/core/agents/runner.ts`

```typescript
// 核心：在同一进程内创建独立的 AgentSession
async function runAgent(options: {
  definition: AgentDefinition;
  task: string;
  cwd: string;
  signal: AbortSignal;
  onProgress?: (progress: AgentProgress) => void;
}): Promise<AgentToolResult> {
  // 1. 创建独立的 AgentSession（独立 context window）
  // 2. 注入 agent 的 system prompt
  // 3. 限制 tools 为 definition.tools
  // 4. 执行 task，收集结果
  // 5. 返回 AgentToolResult
}
```

**进程内 vs 进程外**：
- 默认进程内（性能好，共享 model registry 和 auth）
- `isolation: "worktree"` 时仍然进程内，但 cwd 指向 worktree
- 未来可选进程外（spawn `lumen -p --no-session`）用于不信任的 project agents

#### 1.4 Agent Discovery

**文件**: `packages/coding-agent/src/core/agents/discovery.ts`

**加载顺序**（后者覆盖前者）：
1. Built-in agents（代码中定义）
2. User agents（`~/.lumen/agent/agents/*.md`）
3. Project agents（`.lumen/agents/*.md`，需确认）

#### 1.5 Built-in Agents

| Agent | 用途 | Model | Tools |
|-------|------|-------|-------|
| `scout` | 快速代码侦察 | fast model | read, grep, find, ls |
| `planner` | 实现计划生成 | default | read, grep, find, ls |
| `worker` | 通用执行 | default | all |
| `reviewer` | 代码审查 | default | read, grep, find, ls, bash |

#### 1.6 Team 通信（Phase 2）

**文件**: `packages/coding-agent/src/core/agents/team.ts`

```typescript
// SendMessage tool：agent 间通信
interface SendMessageParams {
  targetAgent: string;  // agent ID
  message: string;
}

// Team 概念：一组协作的 agents
interface Team {
  name: string;
  leader: string;       // leader agent ID
  members: string[];    // member agent IDs
}
```

#### 1.7 与 Pi 架构的集成点

- Agent Tool 注册到 `agent-session.ts` 的 tool 注册流程
- Agent definitions 通过 `resource-loader.ts` 发现和加载
- Background agents 通过 extension event system 报告进度
- Worktree 隔离复用 Pi 的 bash tool 的 cwd 机制

### Component 2: Hashline Editing (Req 4)

**文件**: `packages/coding-agent/src/core/hashline/`

**设计**:
- 读取文件时，为每行生成 4 字符 content hash（取 SHA-256 前 4 字节 hex）
- 输出格式: `[a3f2] const x = 1;`
- 编辑时，agent 引用 hash 而非行号
- 解析器匹配 hash → 当前行号 → 应用编辑

**Hash 算法**:
```typescript
function hashLine(content: string): string {
  // 4 char hex from first 2 bytes of SHA-256
  const hash = createHash("sha256").update(content.trimEnd()).digest("hex");
  return hash.slice(0, 4);
}
```

**集成点**:
- Hook 到 `read` tool 的输出格式化
- 新增 `hashline-edit` tool 或扩展现有 `edit` tool
- 通过 TTSR 注入 hashline 使用规则（仅在 edit 时触发）

### Component 3: TTSR (Req 5)

**文件**: `packages/coding-agent/src/core/ttsr/`

**设计**:
- Registry: `Map<TriggerPattern, RuleSnippet>`
- TriggerPattern: `{ keywords?: string[], toolNames?: string[], events?: string[] }`
- 注入时机: `before_agent_start` 事件中检查当前 context
- 零成本: 未触发的规则不出现在 system prompt 中

**集成**:
- 作为内置 extension 注册到 `resource-loader.ts`
- 从 `.lumen/rules/` 目录加载 TTSR 规则文件
- 规则文件格式:
```yaml
---
triggers:
  tools: [edit, write]
  keywords: [重构, refactor]
---
编辑文件时的规则内容...
```

### Component 4: Plan Mode (Req 6)

**文件**: `packages/coding-agent/src/core/plan-mode/`

**设计**:
- 状态机: `idle` → `planning` → `reviewing` → `executing` → `idle`
- 通过 extension flag `--plan` 激活（和 oh-my-pi 一致）
- Planning 阶段: 修改 system prompt 追加 "只输出计划，不执行工具"
- Executing 阶段: 逐步执行，每步完成后报告进度

**集成**:
- 作为内置 extension 注册
- 使用 `registerFlag("plan", { type: "boolean", default: false })`
- Hook `before_agent_start` 修改 system prompt
- Hook `tool_call` 在 planning 阶段拦截工具调用

### Component 5: Enhanced Memory (Req 7)

**文件**: `packages/coding-agent/src/core/lumen-memory.ts` (升级现有)

**升级内容**:
- 新增 `lesson` kind
- Session end hook: 自动生成摘要写入记忆
- 相关性排序: 基于 cwd 和关键词匹配
- 合并策略: 超过 500 条时，合并 30 天前的同类条目

**Session End Summary**:
```typescript
pi.on("session_shutdown", async (event, ctx) => {
  if (event.reason === "quit") {
    const summary = await generateSessionSummary(ctx);
    if (summary) appendMemoryEntry({ kind: "summary", content: summary, source: "auto" });
  }
});
```

### Component 6: Commit Tool (Req 8)

**文件**: `packages/coding-agent/src/core/tools/commit.ts`

**设计**:
- 注册为 `/commit` slash command
- 流程: `git diff --staged` → 分析 → 生成 message → 用户确认 → `git commit`
- 如果没有 staged changes，分析 `git diff` 并建议 `git add`
- 遵循 AGENTS.md 的 commit 规则

### Component 7: Upstream Merge Workflow (Req 9)

**文件**: `scripts/upstream-merge.sh` + `scripts/upstream-merge-prompt.md`

**脚本流程**:
```bash
#!/bin/bash
git fetch upstream
git merge upstream/main --no-commit
# 如果有冲突，生成报告
git diff --name-only --diff-filter=U > /tmp/conflicts.txt
# 输出冲突文件列表和建议
```

**CUSTOMIZATION_MANIFEST.md**:
```markdown
# LumenCli Customization Manifest
| File | Customization |
|------|---------------|
| packages/coding-agent/package.json | bin: lumen, lumenConfig |
| packages/coding-agent/src/config.ts | APP_NAME, CONFIG_DIR_NAME, LEGACY fallback |
| packages/coding-agent/src/core/system-prompt.ts | Chinese rules injection |
| packages/coding-agent/src/core/slash-commands.ts | Chinese descriptions |
| packages/coding-agent/src/core/lumen-writing.ts | Writing workflow (new file) |
| packages/coding-agent/src/core/lumen-novel.ts | .novel detection (new file) |
| packages/coding-agent/src/core/lumen-memory.ts | Memory module (new file) |
| ... |
```

### Component 8: Secrets Redaction (Req 15)

**文件**: `packages/coding-agent/src/core/secrets/`

**设计**:
- Hook 到 `tool_result` 事件
- 正则模式匹配: API keys (`sk-...`, `key-...`), tokens (`ghp_...`, `gho_...`), emails
- 替换为 `[REDACTED:type]`
- 用户可在 settings.json 添加自定义 patterns

### Component 9: Config Discovery (Req 16)

**文件**: `packages/coding-agent/src/core/discovery/`

**扫描路径**:
- `~/.claude/` → skills, CLAUDE.md
- `.claude/` → project-level claude config
- `.cursor/rules` → cursor rules
- `.mcp.json` → MCP server configs
- `AGENTS.md` / `CLAUDE.md` → 已由 Pi 原生支持

**优先级**: native `.lumen/` > legacy `.pi/` > external configs

### Component 10: Model Preset Routing (Req 14)

**文件**: `packages/coding-agent/src/core/model-routing/`

**Preset 格式** (在 models.json 中):
```json
{
  "presets": {
    "local": {
      "default": "local-mimo/mimo-v2.5-pro",
      "vision": "local-mimo/mimo-v2.5",
      "fast": "local-mimo/mimo-v2.5-pro"
    },
    "cloud": {
      "default": "anthropic/claude-sonnet-4",
      "slow": "anthropic/claude-opus-4",
      "fast": "google/gemini-2.5-flash"
    }
  }
}
```

## Implementation Phases

### Phase 3A: 核心功能（1-2 周）
- Commit tool
- Secrets redaction
- Enhanced memory (session end summary)
- CUSTOMIZATION_MANIFEST.md
- Upstream merge script

### Phase 3B: Agent System 基础（2-3 周）
- AgentDefinition 类型和格式解析
- Agent discovery（built-in + user + project）
- Agent runner（进程内执行）
- AgentTool 注册（LLM 可调用）
- Built-in agents（scout, planner, worker, reviewer）
- Worktree 隔离

### Phase 3C: 高价值移植（2-3 周）
- Hashline editing
- TTSR
- Plan mode（集成到 agent permissionMode）
- Config discovery

### Phase 3D: Agent System 增强（1-2 周）
- Per-agent memory
- Background agent 执行
- Agent 间通信（SendMessage）
- Team 编排

### Phase 3E: 文档与测试（1 周）
- Installation guide
- Mimo setup guide
- Extension development guide
- E2E tests

### Phase 3F: Model 系统增强（1 周）
- Preset routing
- Vision auto-routing
- Agent model override 集成

## Dependencies

| 组件 | 依赖 |
|------|------|
| Delegate tool | codex CLI, claude CLI (optional) |
| Hashline | crypto (Node.js built-in) |
| TTSR | 无外部依赖 |
| Plan mode | 无外部依赖 |
| Commit tool | git CLI |
| Secrets redaction | 无外部依赖 |
| Config discovery | fs (Node.js built-in) |
| E2E tests | 本地 mimo 服务运行 |

## Risk Assessment

| 风险 | 影响 | 缓解 |
|------|------|------|
| oh-my-pi 代码依赖 Bun 特性 | 移植需要适配 | 用 Node.js 等价 API 替换 |
| oh-my-pi 依赖 natives (Rust) | hashline 性能 | 纯 TS 实现，性能足够 |
| Orchestrator worker 不稳定 | 任务失败 | timeout + 错误恢复 + fallback |
| 上游大重构 | 合并冲突多 | AI 辅助 + manifest 追踪 |
| 本地 mimo 服务不稳定 | E2E 测试 flaky | 服务不可用时 skip |
