# LumenCli 迁移计划：Fork Pi 作为新主线

日期：2026-05-13
状态：Ready to execute
决策：**推翻** `2026-05-12-fork-vs-standalone-decision.md` 的 standalone 结论，转向 **fork earendil-works/pi 作为 LumenCli 新主线**。

## 0. 决策变更理由

原 standalone 决策基于以下假设，现已失效：

1. ~~"Pi-tui 与 OpenTUI+React 不兼容，fork 要重写 40-50% UI"~~ → 新决策接受 pi-tui，放弃 OpenTUI+React。Pi-tui 已被社区验证足够好用。
2. ~~"Day 1 有完整能力的优势已过期"~~ → 实际上当前 LumenCli 70% 代码在重复 Pi 已有能力，维护成本远超预期。
3. ~~"适配层维护成本可控"~~ → adapter 层（event-mapper、tool-adapter、permission-resolver）已成为持续负担。

新增需求（orchestrator / 指挥 Codex+Claude）进一步确认：需要一个轻量稳定的 agent shell 作为底座，而不是自己维护完整 agent 框架。

## 1. 目标架构

**深度集成模式**：不限于 extension API，直接改核心代码。合并上游冲突由 AI 辅助完成。

```
earendil-works/pi (upstream)
  │
  fork → LumenCli (你的 repo)
  │
  ├── packages/coding-agent/src/core/
  │   ├── tools/
  │   │   ├── delegate.ts          ← orchestrator: 派发任务给 Codex/Claude
  │   │   ├── worker-adapters.ts   ← codex/claude/local worker 实现
  │   │   └── ...（Pi 原有 tools）
  │   ├── slash-commands.ts        ← 直接加入 /plan /draft /review /revise
  │   ├── system-prompt.ts         ← 中文规则直接写入
  │   ├── novel-context.ts         ← .novel 项目检测与上下文注入（新文件）
  │   ├── lumen-memory.ts          ← 增强记忆模块（新文件）
  │   ├── model-resolver.ts        ← 按需改动 model routing
  │   └── ...（Pi 原有核心）
  │
  ├── packages/tui/                ← 直接改 TUI（中文化、布局定制）
  │
  ├── .lumen/                      ← 配置目录（从 .pi/ 改名）
  │   ├── AGENTS.md
  │   ├── skills/
  │   ├── themes/
  │   └── settings.json
  │
  └── AGENTS.md                    ← 项目级中文规则
```

**原则**：
- 你的功能和 Pi 原生功能平级，享受同等生命周期和 UI 渲染
- 不受 extension API 限制
- 合并上游冲突用 AI 解决，可接受较高冲突量
- 新增文件优先（零冲突），改已有文件其次

## 2. 迁移步骤

### Phase 0：准备（1 天）

- [ ] 当前 LumenCli repo 打 tag `v0.1-standalone-archive`
- [ ] 创建 `archive` 分支保存当前全部代码
- [ ] Fork `earendil-works/pi` 到你的 GitHub（或本地 git clone + remote 设置）
- [ ] 设置 upstream remote：`git remote add upstream https://github.com/earendil-works/pi-mono.git`

### Phase 1：品牌与深度定制（2-3 天）

不限于表面改名，直接深入核心文件。

#### 1.1 命令名与产品标识

- [ ] `packages/coding-agent/package.json`：`bin.pi` → `bin.lumen`
- [ ] `packages/coding-agent/package.json`：`piConfig.configDir` → `.lumen`
- [ ] 全局搜索替换品牌文本（欢迎语、help 输出、footer、错误提示）
- [ ] `README.md` 完全重写为 LumenCli 说明

#### 1.2 配置目录

- [ ] `.pi/` → `.lumen/`（改 `packages/coding-agent/src/config.ts`）
- [ ] `~/.pi/agent/` → `~/.lumen/agent/`
- [ ] 保留 `.pi/` fallback 读取（兼容社区插件）

#### 1.3 中文化（深度）

- [ ] 直接改 `system-prompt.ts`：默认系统提示词注入中文规则
- [ ] 直接改 `messages.ts` / `defaults.ts`：错误提示、状态信息中文化
- [ ] slash 命令 description 全部中文化
- [ ] TUI footer / welcome screen 中文化（直接改 `packages/tui/` 或 interactive mode）

#### 1.4 默认配置

- [ ] 默认 theme 定制
- [ ] 默认 model roles 预配置（本地 mimo）
- [ ] `settings.json` 默认值（compaction enabled、thinking level 等）
- [ ] 默认 provider 配置指向你的本地推理服务

### Phase 2：功能深度集成（3-5 天）

直接写进核心，和 Pi 原生功能平级。

#### 2.1 写作工作流 → 直接集成到 core

在 `packages/coding-agent/src/core/` 下新建或修改：

- [ ] 新建 `novel-context.ts`：`.novel` 项目检测 + 上下文注入
  - 迁移自 `packages/context/src/index.ts` 的 `detectNovelProject`
  - Hook 到 Pi 的 resource-loader 或 system-prompt 组装流程
- [ ] 直接在 `slash-commands.ts` 注册 `/plan /draft /review /revise`
  - 迁移自 `packages/writing/src/index.ts` 的命令逻辑
  - 和 Pi 原生的 `/compact /export /share` 同级
- [ ] 写作 prompt 直接写进 `prompt-templates.ts` 或独立 `writing-prompts.ts`

#### 2.2 Orchestrator → 直接集成为核心 tool

在 `packages/coding-agent/src/core/tools/` 下新建：

- [ ] `delegate.ts`：主 tool，负责任务派发

```typescript
// 和 Pi 的 read/bash/edit/write tool 同级
export const delegateTool = {
  name: "delegate",
  description: "将复杂任务派发给外部 agent (Codex/Claude) 执行",
  parameters: {
    worker: { type: "string", enum: ["codex", "claude", "local"] },
    task: { type: "string" },
    workdir: { type: "string", optional: true },
    isolation: { type: "string", enum: ["worktree", "tmpdir", "none"], default: "worktree" },
  },
  async execute({ worker, task, workdir, isolation }) {
    // 1. 创建隔离工作区
    // 2. spawn worker CLI
    // 3. 收集结果
    // 4. 返回标准化输出
  },
};
```

- [ ] `worker-adapters.ts`：各 worker 的具体实现

```typescript
export async function spawnCodex(task: string, cwd: string): Promise<WorkerResult> {
  // codex --quiet --approval-mode full-auto task
}

export async function spawnClaude(task: string, cwd: string): Promise<WorkerResult> {
  // claude -p task --output-format json
}

export async function runLocal(task: string, cwd: string): Promise<WorkerResult> {
  // 简单 shell 执行
}
```

- [ ] `workspace-isolator.ts`：隔离工作区管理（git worktree / tmpdir）
- [ ] `result-normalizer.ts`：统一输出格式

#### 2.3 增强记忆 → 直接集成到 core

- [ ] 新建 `packages/coding-agent/src/core/lumen-memory.ts`
  - JSONL 持久化 store
  - 跨 session 记忆检索
  - 自动摘要（session end hook）
- [ ] 在 tool 注册表里加 `memory.recall` / `memory.remember`
- [ ] 在 slash-commands 里加 `/remember` / `/memory`
- [ ] Hook 到 Pi 的 session 生命周期（session end → 生成摘要写入记忆）

#### 2.4 中文规则深度集成

- [ ] 直接改 `system-prompt.ts`，在 Pi 的基础系统提示后追加中文规则段
- [ ] 改 `defaults.ts`，默认 AGENTS.md 内容包含中文工作流指导
- [ ] 改 `auth-guidance.ts`，认证引导信息中文化

#### 2.5 Model Routing 增强（如果 Pi 原生不够）

- [ ] 评估 Pi 的 `model-registry.ts` + `model-resolver.ts`
- [ ] 如果需要 preset/routing：直接改这两个文件，加入你的 routing engine 逻辑
- [ ] 如果 Pi 已有类似机制（model roles: default/smol/slow/plan）：直接用，只改默认值

### Phase 3：验证与清理（1-2 天）

- [ ] `lumen` 命令可启动，TUI 正常
- [ ] `/model` 切换模型正常
- [ ] 写作命令 `/plan /draft /review /revise` 工作
- [ ] orchestrator tool 可 spawn codex CLI
- [ ] 中文规则生效
- [ ] `git fetch upstream && git merge upstream/main` 测试一次合并
- [ ] 清理不需要的文件（如果有）

### Phase 4：建立日常工作流

- [ ] 设置定期合并脚本或提醒（每周/每两周 merge upstream）
- [ ] 记录你的改动文件清单，方便合并时快速定位冲突
- [ ] 建立 extension 开发的本地测试流程

## 3. 合并冲突策略

**核心原则：用 AI 解决合并冲突，不惧怕耦合。**

合并上游时：
1. `git fetch upstream && git merge upstream/main`
2. 冲突文件交给 AI（Codex/Claude/Kiro）处理
3. AI 理解你的改动意图 + 上游的变更意图，智能合并
4. 你审查结果，确认无误后提交

**为什么这样可行**：
- 你的改动有明确的语义（中文化、写作功能、orchestrator）
- 上游的改动也有明确的语义（bug fix、新功能、重构）
- AI 能理解两边意图并正确合并
- 即使偶尔合错，`lumen` 启动测试一下就能发现

**不再需要的约束**：
- ~~"只改 5-6 个文件"~~ → 改多少都行
- ~~"新增文件优先"~~ → 直接改已有文件也行
- ~~"通过 extension API"~~ → 直接写进核心

## 4. 从当前 LumenCli 迁移的资产清单

### 迁移（改写为 Pi extension 格式）

| 来源 | 目标 | 工作量 |
|------|------|--------|
| `packages/writing/src/index.ts` | extension `lumen-writing` | 小（逻辑简单） |
| `packages/context/src/index.ts` 的 .novel 检测 | extension `lumen-writing` 的 hook | 小 |
| `packages/memory/src/index.ts` | extension `lumen-memory` | 小 |
| Orchestrator 概念（新写） | extension `lumen-orchestrator` | 中 |
| 中文规则 | `AGENTS.md` | 小（纯文本） |
| `packages/config/src/routing-engine.ts` | 评估是否需要 | 可能不需要 |

### 保留为参考文档

| 来源 | 用途 |
|------|------|
| `Docs/specs/*.md` | 设计决策历史记录 |
| `Docs/plans/*.md` | 规划思路参考 |
| `Docs/reports/*.md` | 技术调研结果 |
| `.tmp/dogfood-feature-workspace/` | 测试 fixture 参考 |

### 丢弃（Pi 已有更好实现）

| 来源 | Pi 对应 |
|------|---------|
| `packages/agent-core/` (2,801 LOC) | Pi 的 `packages/agent/` + `packages/coding-agent/src/core/` |
| `packages/command-system/` | Pi 的 slash commands 机制 |
| `packages/shared-schema/` | Pi 的内部类型 |
| `packages/model-provider/` | Pi 的 `packages/ai/` |
| `packages/tools/` | Pi 的 `packages/coding-agent/src/core/tools/` |
| `packages/permissions/` | Pi 的 permission hook 机制 |
| `packages/prompts/` (skills/templates loader) | Pi 原生 skills + prompt-templates |
| `packages/mcp/` | Pi 通过 extension 支持 MCP |
| `apps/cli/` (OpenTUI + React) | Pi 的 `packages/tui/` + interactive mode |
| 24 条 smoke 脚本 | Pi 的 vitest 测试 |

## 5. Orchestrator Extension 详细设计

这是你的核心差异化功能，值得详细规划。

### 5.1 Worker Adapters

```
lumen-orchestrator/
  adapters/
    codex.ts       ← spawn `codex` CLI，收集输出
    claude.ts      ← spawn `claude` CLI 或调用 SDK
    pi-worker.ts   ← spawn 另一个 `lumen` 实例
    local.ts       ← 简单本地脚本执行
  router.ts        ← 判断任务该派给谁
  workspace.ts     ← 创建隔离工作目录（git worktree 或 tmp）
  normalizer.ts    ← 统一输出格式
  index.ts         ← extension 入口
```

### 5.2 统一输出格式

```typescript
interface WorkerResult {
  worker: "codex" | "claude" | "pi" | "local";
  success: boolean;
  summary: string;
  filesChanged: string[];
  diff?: string;
  commandsRun: string[];
  testResults?: { passed: number; failed: number };
  risks: string[];
  duration: number;
}
```

### 5.3 隔离策略

- Worker 默认在 git worktree 或临时目录工作
- 完成后主助手审查 diff，决定是否合并
- 用户可通过 `/approve` 或 `/reject` 控制

### 5.4 路由逻辑

```typescript
function routeTask(task: string, context: TaskContext): WorkerChoice {
  // 简单文件操作 → local
  // 复杂编码 → codex (如果可用) 或 claude
  // 需要推理/分析 → claude
  // 需要多文件重构 → codex
  // 写作相关 → 不走 orchestrator，走 lumen-writing extension
}
```

## 6. 合并上游的工作流

```bash
# 每周/每两周执行一次
git fetch upstream
git merge upstream/main

# 冲突处理：交给 AI
# 方式 1：在 Kiro/Claude Code 里打开冲突文件，让 AI 解决
# 方式 2：用 codex 自动处理
codex "resolve all merge conflicts, keeping my customizations (Chinese UI, writing commands, orchestrator tools, lumen branding) while accepting upstream improvements"

# 验证
lumen  # 启动测试
# 跑一下基本功能确认没坏
```

**不需要**：
- 维护改动文件清单
- 小心翼翼避免碰某些文件
- 手动 vimdiff 每个冲突

**AI 合并的上下文提示**（可以写成 AGENTS.md 或合并脚本的 prompt）：

```
这是 LumenCli，一个 Pi coding agent 的 fork。
我的定制包括：
1. 品牌：pi → lumen，.pi/ → .lumen/
2. 中文化：系统提示、错误信息、命令描述
3. 写作功能：/plan /draft /review /revise，.novel 项目检测
4. Orchestrator：delegate tool，worker adapters (codex/claude)
5. 增强记忆：lumen-memory 模块
6. 默认配置：本地 mimo 推理服务

合并时保留我的定制，同时接受上游的 bug fix 和新功能。
如果上游改了我也改了的文件，优先保留我的定制逻辑，但吸收上游的结构改进。
```

## 7. 时间线估算

| 阶段 | 时间 | 产出 |
|------|------|------|
| Phase 0 准备 | 1 天 | fork 就位，upstream 设置好 |
| Phase 1 品牌改动 | 2-3 天 | `lumen` 命令可用，中文化基础 |
| Phase 2 功能迁移 | 3-5 天 | 写作/记忆/orchestrator extension |
| Phase 3 验证 | 1-2 天 | 全部功能验证通过 |
| **总计** | **7-11 天** | 可用的 LumenCli on Pi |

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Pi 上游停更 | 核心小（5 个包），你能接手；社区活跃度目前很高 |
| 合并冲突多 | AI 解决，不是人工负担 |
| 上游大重构 | AI 理解两边意图，智能合并；最坏情况手动审查 |
| Pi extension API 变更 | 你直接集成在核心里，不依赖 extension API |
| Windows 兼容性 | Pi 已有 Windows 支持（Git Bash） |
| 上游删除你改过的文件 | AI 合并时会提示，你决定保留还是跟随 |

## 9. 成功标准

迁移完成后，你应该能：

1. `lumen` 启动进入 Pi TUI，看到中文欢迎语
2. 正常对话、使用所有 Pi 内置工具
3. `/plan "写一段雨夜重逢"` 触发写作工作流
4. `lumen.delegate` tool 可以 spawn codex 执行任务
5. `git merge upstream/main` 冲突 ≤ 5 个文件
6. 社区 Pi packages 可以直接安装使用
