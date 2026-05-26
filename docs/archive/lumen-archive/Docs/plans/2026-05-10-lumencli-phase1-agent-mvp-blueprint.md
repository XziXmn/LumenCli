# LumenCli Phase 1 Agent MVP Blueprint

日期：2026-05-10

## 0. Blueprint 元信息

- 模式：git local mode
- 原因：`D:\UGit\LumenCli` 已初始化 git 并连接 `https://github.com/XziXmn/LumenCli.git`；本机未检测到 `gh` 命令，因此不规划 GitHub CLI / PR 自动化流程。
- 子代理：本计划未派发子代理审查，因为当前会话规则要求只有用户明确授权子代理时才可使用。
- 当前状态：已存在最小 TypeScript monorepo 骨架，但该骨架是在正式规划前创建的；后续执行需先收口工程卫生，再继续扩展。

## 1. 总目标

Phase 1 要把 LumenCli 做成一个独立、可运行、可扩展的 **CLI-first coding 通用智能体 MVP**，在 runtime 主干上叠加写作扩展。

- 产品身份：**主流代码编程通用智能体 + 写作扩展**（详见 `Docs/specs/2026-05-10-lumencli-bootstrap-direction.md` §1）。
- 它不是 `pi` / `oh-my-pi` / `opencode` / Claude Code 的 fork，不是 `Lumen-Rebuild` 的附属 CLI，也不是未来桌面端的临时壳层。
- CLI 是当前主产品形态。Coding agent runtime 是主干。写作是第一批扩展 command pack，站在 Lumen-Rebuild 已有成果肩膀上。
- Runtime 栈：Bun + OpenTUI + React + pi-agent-core + pi-ai。Windows x64 一等公民。

## 2. Phase 1 验收标准

完成 Phase 1 时应满足：

1. 用户可以通过 `bun dev:cli` 或构建后的 `lumen` CLI 启动交互 shell，UI 基于 OpenTUI + React。
2. CLI 支持单次 prompt 模式和交互 TUI 模式（含 `/model` 选择框、权限确认模态、工具日志折叠）。
3. agent runtime 接入 pi-agent-core 作为内核，支持真实 OpenAI-compatible provider 的流式回复与 tool-call loop。
4. 工具系统支持 coding-first 的 Read / Edit / Write / Bash / Grep / Search 工具集合，以及 MCP 工具的注册、描述、执行、结果回传。
5. 权限系统能区分 read、write、shell、network、destructive 等风险等级，并在 CLI TUI 中以中文模态确认高风险操作。
6. MCP 作为工具来源接入，至少支持 stdio MCP server 的发现、listTools、callTool。
7. 上下文系统能读取项目规则文件、当前工作目录摘要、最近消息和 memory；pi-agent-core 的 compaction 在上下文接近上限时触发。
8. memory 第一阶段至少支持本地持久化的 profile / preference / summary / project 记录。
9. 写作 command pack 接入 `/plan`、`/draft`、`/review`、`/revise`，prompt 从 `packages/prompts/assets/writing/*.zh.md` 加载，并明确哪些能力来自 `Lumen-Rebuild` 的迁移。
10. 多模型配置支持能力槽位（default / coding / vision / writing / fast / long-context）与 `/model` 交互切换。
11. 命令、工具、provider、memory、writing pack、prompt 资产均有边界清晰的包结构和最小测试或 smoke。
12. `bun run build`、`bun run typecheck`、`bun run smoke:all` 通过。
13. README 能说明安装（含 Bun）、配置、运行、当前能力与限制。

## 3. 非目标

Phase 1 不做：

- Tauri 或桌面 UI。
- Rust native host。
- 多 OS 支持（Phase 1 仅 Windows x64）。
- 自动修改自身核心代码。
- 长期自主后台任务。
- 多 agent 并行（子代理串行调度可，嵌套或并行不做）。
- 完整 `Lumen-Rebuild` 写作工作台迁移。
- OpenTUI three / solid、GPU 高级动画、自定义 reconciler 特性。

## 4. 参考来源使用规则

### pi

参考：

- agent event loop
- streaming event model
- tool calling lifecycle
- session / compaction / command UX
- provider abstraction

不做：

- 不 fork `pi`
- 不直接继承 `pi` 包结构
- 不把 LumenCli 变成 coding-agent-only 产品

### ClaudeCodeRev

参考：

- permission mode
- allowed tools
- tool annotations
- slash command metadata
- MCP helpers
- prompt 分层

不做：

- 不直接复制 Claude 私有提示词文本
- 不照搬命名造成产品边界混淆

### Lumen-Rebuild

复用或迁移：

- `.novel` 协议思想
- project memory / continuity
- `/plan`、`/draft`、`/review`、`/revise`
- prompt asset 管理方式

不做：

- 不把 LumenCli 降级为 Lumen-Rebuild 的 CLI 壳层
- 不在 Phase 1 迁移完整桌面/Obsidian 工作台

## 5. 当前基线

当前已有：

- `apps/cli`
- `packages/agent-core`
- `packages/command-system`
- `packages/prompts`
- `packages/memory`
- `packages/tools`
- `packages/writing`
- `packages/shared-schema`
- pnpm workspace
- TypeScript project references
- `/help`、`/status`、`/memory`、`/plan`、`/draft`、`/review`、`/revise` 占位命令

当前缺口：

- 未初始化 git。
- `.gitignore` 需要覆盖 nested `dist/`。
- 缺少 tests。
- 无真实 LLM provider。
- 无 tool-call loop。
- 无权限系统。
- 无 MCP client。
- 无持久化 memory。
- 写作命令仅占位。
- 无配置系统。
- 无项目规则文件加载。

## 6. 依赖图

```text
S0 工程卫生与基线
  -> S1 配置与 provider 抽象
    -> S2 agent event loop 与 streaming
      -> S3 tool contract 与权限模型
        -> S4 core tools
          -> S5 MCP stdio client
      -> S6 context assembler
        -> S7 memory 持久化
          -> S8 writing command pack
            -> S9 CLI UX 收口
              -> S10 文档与 release gate
```

可并行点：

- S6 context assembler 与 S7 memory 可在 S1 后部分并行，但最终要在 S8 整合。
- S5 MCP stdio client 可以在 S3 权限 contract 稳定后开始设计，但正式接入应等 S4 的 core tool contract 与错误模型稳定。
- S10 文档可随每步增量更新，最终统一收口。

默认单线程执行，因为当前仓库很小，且 shared schema、agent core、command-system 是共享边界，过早并行写入容易冲突。

## 7. 执行步骤

### S0：工程卫生与基线收口

上下文：

当前已生成 `dist/` 产物，仓库已初始化 git 并连接远程。需要先确保构建产物、参考仓库、依赖目录不会污染版本控制，并把已有骨架变成可维护基线。

任务：

1. 更新 `.gitignore`，覆盖 `**/dist/`、`*.tsbuildinfo`、`node_modules/`、`references/`、`.env*`。
2. 确认 git remote 与分支跟踪状态；后续提交 / push 仍需遵循用户授权边界。
3. 增加 `pnpm clean` 的跨 workspace 行为，避免误删非项目目录。
4. 删除或忽略已有构建产物。
5. 补充 `Docs/reports/` 中的当前基线记录。

验证：

```powershell
pnpm clean
pnpm build
pnpm typecheck
pnpm --filter @lumen/cli dev -- --once /status
```

退出标准：

- 构建产物不再被 `rg --files -g '!references/**' -g '!node_modules/**'` 误列为源码关注对象。
- build/typecheck/CLI smoke 通过。

回滚：

- 回退 `.gitignore` 与 clean script 改动。
- 不执行破坏性清理，除非路径确认在 workspace 内。

### S1：配置系统与 OpenAI-compatible Provider

上下文：

Phase 1 先接 OpenAI-compatible provider，而不是多 provider 全量适配。它能覆盖 OpenAI、OpenRouter 和大多数代理商，也给后续 Anthropic/Gemini 留接口。

任务：

1. 新增 `packages/config`，定义 `LumenConfig`。
2. 配置来源优先级：CLI flags > env vars > config file > defaults。
3. 支持 `LUMEN_API_KEY`、`LUMEN_BASE_URL`、`LUMEN_MODEL`。
4. 新增 `packages/model-provider` 或在 `agent-core` 内先定义最小 provider interface。
5. 实现 OpenAI-compatible chat completion client。
6. 支持非流式优先；若不增加复杂度，再加流式事件。
7. CLI 增加 `--model`、`--base-url`、`--api-key-env` 或等价配置入口。

验证：

```powershell
pnpm build
pnpm typecheck
pnpm --filter @lumen/cli dev -- --once "hello"
```

需要真实 key 时：

```powershell
$env:LUMEN_API_KEY="..."
$env:LUMEN_BASE_URL="https://api.openai.com/v1"
$env:LUMEN_MODEL="<openai-compatible-model>"
pnpm --filter @lumen/cli dev -- --once "用一句话介绍你自己"
```

退出标准：

- 没有 key 时给出明确配置错误，不崩溃。
- 有 key 时能返回模型回复。
- provider interface 不泄漏到 CLI UI 层。

回滚：

- 保留 mock provider。
- 禁用真实 provider 注册，不影响原 CLI 命令。

### S2：Agent Event Loop 与消息流

上下文：

当前 agent 只判断 slash command 或返回占位回复。需要建立类似 `pi` 的事件模型，但保持 Lumen 自己的命名和简化边界。

任务：

1. 定义 `AgentEvent`：run_start、turn_start、message_delta、tool_call_start、tool_call_end、turn_end、run_end、error。
2. `LumenAgent.handleInput` 增加 async iterable 或 subscriber 事件出口。
3. CLI 根据事件渲染文本输出。
4. 区分 slash command 与 natural prompt。
5. 为 provider 输出建立 message history。
6. 增加 abort/cancel 的预留接口，Phase 1 可只做结构不做复杂中断。

验证：

```powershell
pnpm build
pnpm typecheck
pnpm --filter @lumen/cli dev -- --once "hello"
pnpm --filter @lumen/cli dev -- --once /status
```

退出标准：

- 普通 prompt 与 slash command 都走清晰的 event lifecycle。
- CLI 不直接拼 agent 内部状态。
- 后续 tool call 可以挂入同一 event loop。

回滚：

- 保留同步 `handleInput` wrapper，CLI 可回退到非事件模式。

### S3：Tool Contract 与 Permission Engine

上下文：

LumenCli 是本地个人 agent，工具能力必须先有权限边界。参考 ClaudeCodeRev 的 permission mode 和 tool annotation 思路，但用 Lumen 自己的数据结构。

任务：

1. 扩展 `LumenTool`：description、inputSchema、risk、capabilities、readOnly、destructive、openWorld。
2. 新增 `packages/permissions` 或放入 `packages/tools` 子模块。
3. 定义 permission mode：default、askAlways、autoReadOnly、denyDangerous。
4. 定义 `PermissionDecision`：allow、deny、ask。
5. CLI 实现确认提示，默认只自动允许 read-only 工具。
6. 工具执行前必须经过 permission engine。
7. 工具结果统一为结构化 content blocks 或最小 text result。

验证：

```powershell
pnpm build
pnpm typecheck
pnpm --filter @lumen/cli dev
```

手工 smoke：

- read-only 工具自动执行。
- write/shell 工具触发确认。
- deny 后模型收到明确 tool denial。

退出标准：

- 无工具可绕过 permission engine。
- 危险工具默认不自动执行。
- 权限决策可被测试。

回滚：

- 禁用所有 write/shell 工具，仅保留 read-only 工具。

### S4：Core Tools 第一批

上下文：

Phase 1 需要工具能力，但不能一开始就给全权限 shell。先做小而清晰的 core tools。

任务：

1. `fs.readText`：读取文本文件，限制在 cwd 或显式 workspace root 内。
2. `fs.list`：列目录，支持 ignore 规则。
3. `fs.writeText`：写文件，需确认。
4. `shell.run`：执行命令，需确认；默认 timeout；禁止明显危险命令。
5. `project.search`：优先使用 `rg`，无 `rg` 时降级。
6. 工具统一记录审计事件。

验证：

```powershell
pnpm build
pnpm typecheck
pnpm --filter @lumen/cli dev
```

手工 smoke：

- 让模型读取 README。
- 让模型搜索 `LumenCli`。
- 让模型尝试写入测试文件并确认。
- 让模型尝试 shell 命令并确认。

退出标准：

- 路径越界被拒绝。
- shell timeout 生效。
- 工具错误返回给模型，而不是进程崩溃。

回滚：

- 保留 read/search 工具，禁用 write/shell。

### S5：MCP stdio Client

上下文：

MCP 是 LumenCli 需要兼容的关键生态。Phase 1 只做 stdio client，不做完整 MCP server。

任务：

1. 新增 `packages/mcp`。
2. 支持 config 中声明 MCP server：name、command、args、env。
3. 启动 stdio server，完成 initialize。
4. 支持 `listTools` 并映射为 `LumenTool`。
5. 支持 `callTool` 并统一返回工具结果。
6. MCP tool 同样经过 permission engine。
7. 处理 server 启动失败、协议错误、超时和退出。

验证：

```powershell
pnpm build
pnpm typecheck
```

手工 smoke：

- 配置一个简单本地 MCP server。
- `/status` 或 `/tools` 能列出 MCP 工具。
- 模型能调用一个 MCP read-only 工具。

退出标准：

- MCP server 失败不会导致 CLI 崩溃。
- MCP 工具权限不绕过本地策略。
- MCP 配置可文档化。

回滚：

- MCP 包可不注册，core tools 仍可用。

### S6：Context Assembler

上下文：

LumenCli 需要读取项目规则、当前目录、最近消息、memory 和写作项目上下文。先做通用 assembler，再由 writing pack 追加 `.novel` 上下文。

任务：

1. 新增 `packages/context`。
2. 读取规则文件：`AGENTS.md`、`LUMEN.md`、`.lumen/context.md`。
3. 生成 cwd 摘要：路径、文件概览、是否 git repo。
4. 注入最近消息窗口。
5. 注入 memory 摘要。
6. 提供 token/字符预算裁剪。
7. 暴露给 agent-core 的 `buildContext()`。

验证：

```powershell
pnpm build
pnpm typecheck
pnpm --filter @lumen/cli dev -- --once /status
```

退出标准：

- 没有规则文件时安静跳过。
- 有规则文件时能进入 prompt context。
- 上下文裁剪可预测。

回滚：

- agent-core 回退为仅使用 system prompt + history。

### S7：Memory 持久化

上下文：

当前 memory 是内存实现。Phase 1 需要本地持久化，但不引入复杂数据库也可以先用 JSONL 或 SQLite。考虑后续 Rust/SQLite，建议先定义 repository interface，初始实现用 JSONL。

任务：

1. 定义 memory storage path：默认 `%USERPROFILE%\.lumen\memory.jsonl` 或项目 `.lumen/memory.jsonl`。
2. 实现 JSONL memory store。
3. 支持 `/remember --kind <kind> <content>`。
4. 支持 `/memory --kind <kind>`。
5. 支持 session summary 写入接口。
6. 设计 future migration 到 SQLite 的接口。

验证：

```powershell
pnpm build
pnpm typecheck
pnpm --filter @lumen/cli dev -- --once "/remember --kind preference 喜欢简洁中文回答"
pnpm --filter @lumen/cli dev -- --once "/memory --kind preference"
```

退出标准：

- 跨进程重启后 memory 仍可读取。
- malformed JSONL 行不会让 CLI 崩溃。
- memory 写入不记录 API key 等敏感内容。

回滚：

- 保留 interface，恢复内存实现。

### S8：Writing Command Pack 第一版

上下文：

小说写作是 LumenCli 的特色能力，但 Phase 1 只迁移 command pack，不迁移完整工作台。

任务：

1. 梳理 `Lumen-Rebuild` 的 writing command 语义与 prompt asset。
2. 定义 `WritingContext`：projectRoot、manuscriptFiles、currentText、projectMemory。
3. `/plan`：支持写作计划与普通任务计划分流。
4. `/draft`：基于 brief 生成草稿 artifact。
5. `/review`：输出结构、语言、连续性三类建议。
6. `/revise`：对输入文本或文件片段给出修订建议。
7. 如检测到 `.novel`，读取最小项目信息；否则普通写作模式运行。
8. 不直接改正文文件，除非用户确认并通过 tool permission。

验证：

```powershell
pnpm build
pnpm typecheck
pnpm --filter @lumen/cli dev -- --once "/draft 写一段雨夜重逢"
pnpm --filter @lumen/cli dev -- --once "/review 这是一段测试文本"
```

退出标准：

- 写作命令能调用真实 LLM provider。
- 无 `.novel` 时可作为通用写作助手。
- 有 `.novel` 时能读取项目上下文。
- 输出 artifact 与普通聊天回复有明显结构差异。

回滚：

- 写作命令退回占位实现，不影响 agent core。

### S9：CLI UX 收口

上下文：

CLI 是 Phase 1 产品本体，需要比裸 readline 更清晰，但不必一开始做完整 TUI。

任务：

1. 支持 `lumen "prompt"` 或 `lumen --once "prompt"`。
2. 支持交互 shell。
3. 增加 `/tools`、`/config`、`/model`、`/exit`。
4. 输出样式区分 assistant、tool、error、permission prompt。
5. Ctrl+C 行为明确：中断当前输入或退出。
6. Windows PowerShell 路径显示正常。
7. 错误信息简洁且可行动。

验证：

```powershell
pnpm build
pnpm typecheck
pnpm --filter @lumen/cli dev -- --once /help
pnpm --filter @lumen/cli dev -- --once /tools
```

退出标准：

- 新用户可通过 README 启动并完成一次真实问答。
- 工具确认提示不会吞输入或卡死。
- 单次模式适合脚本调用。

回滚：

- 保留 readline shell，关闭增强样式。

### S10：文档、测试与 Release Gate

上下文：

Phase 1 完成不能只靠手工试跑，需要固定验收命令和已知限制。

任务：

1. README 更新：安装、配置、运行、provider、MCP、权限、写作命令。
2. 新增 `Docs/reports/phase1-verification.md`。
3. 每个 package 至少有 smoke 或单元测试入口；若暂不引入测试框架，记录原因和替代 smoke。
4. 增加 root script：`smoke:cli`。
5. 记录已知限制。
6. 如果用户确认初始化 git，补首次 commit 前检查清单。

验证：

```powershell
pnpm clean
pnpm install
pnpm build
pnpm typecheck
pnpm smoke:cli
```

退出标准：

- 文档能让新会话独立接手。
- 验收命令稳定。
- 未完成项全部列为已知限制，而不是暗坑。

回滚：

- 文档改动可独立回退，不影响代码。

## 8. Anti-pattern 清单

执行时避免：

1. 把 `pi` 包结构直接改名搬入 LumenCli。
2. 先做漂亮 TUI，agent loop 仍为空。
3. 工具没有权限系统就接 shell/write。
4. MCP 工具绕过本地 permission engine。
5. prompt 文本硬编码在 handler 深处。
6. 把写作能力做成特殊分支，破坏通用 command pack 机制。
7. 在没有配置边界前引入多个 provider。
8. 在 Phase 1 引入 Rust 并让核心逻辑双写。
9. 把 `.novel` 协议变成 LumenCli 的唯一项目模型。
10. 声称验证通过但没有运行命令。

## 9. Plan Mutation Protocol

允许的计划变更：

- Split：某一步超过 1 到 2 个工作回合时拆分。
- Insert：发现前置依赖缺失时插入新步骤。
- Skip：某能力被用户明确后置时跳过，并记录理由。
- Reorder：仅当依赖图不受影响时调整顺序。
- Abandon：若核心方向改变，停止执行并新建 blueprint。

每次变更必须记录：

- 变更日期
- 原步骤
- 新步骤
- 原因
- 对验证门禁的影响

### 9.1 变更记录

#### 2026-05-10 Insert：pi 参考项目使用策略与 pi-ai 接入前置

- 类型：Insert
- 原步骤：S1 配置与 provider 抽象 → S2 agent event loop。
- 新步骤：新增 S1.5 pi-ai provider 接入评估与落地；S2 前增加 S2.0 pi-agent-core spike 决策。
- 原因：用户确认将 pi 作为上游依赖使用，以拿到多 provider、OAuth、streaming、tool-call 的维护红利。为避免 `@lumen/model-provider` 长期并存两套 provider 实现造成割裂，需要在进入 tool-call loop 之前完成 provider 收敛。同时 pi-agent-core 是否接入会显著影响 agent-core 的事件形状与消息结构，应在 S11 tool-call loop 启动前做结论性 spike。
- 合规依据：`Docs/specs/2026-05-10-lumencli-reference-usage-policy.md`。策略要求 pi 仅以 npm 依赖形式接入，不 fork、不 vendor，且 pi 类型不跨出 LumenCli 边界包。
- 对验证门禁的影响：
  - `pnpm smoke:provider` 保留 mock OpenAI-compatible 路径作为无 key 默认路径。
  - 新增 `pnpm smoke:provider-pi` 在本策略落地后作为可选 smoke，默认在无真实 key 时 skipped 并打印原因，不阻塞 `pnpm smoke:all`。
  - S2.0 spike 若结论为接入 pi-agent-core，需要在后续 S11 引入时同步调整 `pnpm smoke:all` 中和 event loop 契约相关的子项。
- 状态：策略已落地，S1.5 与 S2.0 为占位步骤，具体任务条目待各步启动前补全。

#### 2026-05-10 Merge：S1.5 与 S2.0 合并为深度重构窗口

- 类型：Merge + Decision
- 原步骤：S1.5 pi-ai provider 接入 → S2.0 pi-agent-core spike → 可能的后续接入。
- 新步骤：S1.5+S2.0 深度重构一次执行窗口。同时接入 `@earendil-works/pi-ai` 与 `@earendil-works/pi-agent-core`，并在 LumenCli 边界包内封装所有 pi 类型。
- 原因：见 `Docs/specs/2026-05-10-lumencli-pi-agent-core-decision.md`。spike 结论为接入 pi-agent-core；若分两步执行会在中间阶段产生与 pi-ai 平行的 tool-call / streaming 自写中间表示，违反用户明确的不割裂要求。
- 合规依据：`Docs/specs/2026-05-10-lumencli-reference-usage-policy.md` §3 允许 pi-agent-core 在 spike 通过后接入，前提是类型不外泄、权限不被绕过、prompt 自有。决策 spec §3.3 定义了封装边界。
- 对验证门禁的影响：
  - `pnpm smoke:provider` 保留为无 key fallback 路径，实现可能改为 pi-ai 的 `faux` provider`。
  - 新增 `pnpm smoke:agent-loop`，进入 `smoke:all` 链。覆盖 tool-call loop、parallel / sequential、权限拦截。
  - 现有 `smoke:permissions / smoke:tools / smoke:mcp / smoke:context / smoke:memory / smoke:writing / smoke:ux` 保留，断言按新 event 结构更新。
  - README 与 `phase1-verification.md` 在重构落地后同步更新。
- 状态：决策已落地，实施未启动。S1.5+S2.0 实施计划详见决策 spec §5。

#### 2026-05-10 Refine：Private-Project Exemption、opencode 引入、Prompt Layer 双层化、语言规则

- 类型：Refine
- 原步骤：S1.5+S2.0 深度重构一次执行窗口（仅覆盖 runtime 接入，prompt 从 pi 或 LumenCli 自写）。
- 新步骤：S1.5+S2.0 深度重构拆为两条独立工作流：Runtime Layer（pi-agent-core 组件分件接入）+ Prompt Layer（借鉴 ClaudeCodeRev adapted / clean-room，按 opencode 的 provider-aware 模式分发）。
- 原因：
  - 用户确认 LumenCli 为私有永久使用的私有仓库，允许对 ClaudeCodeRev 行使 Private-Project Exemption，prompt 层可以借鉴其文本。
  - 用户担心 pi 的 prompt 成熟度不足，希望借鉴 Claude Code 的 prompt 工程。
  - 用户要求 "同一能力一份 prompt 文件"，并接受 opencode 的多模型分发范式（`packages/opencode/src/session/system.ts` 的 `provider(model)` 模式）。
  - 用户定义语言规则：给人看中文、给 AI 看英文，写作特例整体中文，slash 命令名英文 + 中文提示。
- 合规依据：
  - `Docs/specs/2026-05-10-lumencli-reference-usage-policy.md` 已新增 §2 Private-Project Exemption、§3 Source 标注规则、§5 opencode 使用策略、§6 ClaudeCodeRev 在豁免下的放宽边界。
  - 决策 spec `Docs/specs/2026-05-10-lumencli-pi-agent-core-decision.md` 已新增 §3.5 组件分件清单、§5.5–5.8 Prompt Layer 与语言规则。
- 对验证门禁的影响：
  - 新增 `pnpm smoke:prompts`，验证 `getPrompt(capability, modelHandle)` 的 provider-aware 分发，进入 `smoke:all` 链。
  - 所有 prompt 文件必须带 frontmatter 的 `source` 字段，且 runtime 代码层不得出现 `source: claude-code@…`。
- 状态：策略与决策 spec 已落地，实施未启动。实施顺序按决策 spec §5.1 → §5.2 → §5.3 → §5.4 → §5.5 → §5.6 → §5.7 → §5.9 → §5.10。
- 触发豁免失效的条件：仓库转为公开、产物对外分发、引入外部协作。任一触发即进入清理流程（参见 Reference Usage Policy §6.5）。

#### 2026-05-10 Insert：多模型配置与自动切换（S1.10）

- 类型：Insert
- 原步骤：后续步骤仅到 S1.9。
- 新步骤：新增 S1.10（拆 A/B/C 三档）覆盖多 provider × 多 model 清单、能力槽位（capability slots）显式指派、CLI 交互切换、场景路由；详见 `Docs/plans/2026-05-10-lumencli-s15-s20-execution-plan.md` §3.1。
- 原因：
  - 用户已有本地 mimo 环境（`mimo-v2.5` 多模态、`mimo-v2.5-pro` 编程特化），明确要求"像 opencode 一样"支持多模型配置与切换，CLI 可交互切换，并具备自动切换能力。
  - 用户进一步澄清核心建模原则：**能力不能从模型 id 推断**。多模态不等于编程强，编程特化不等于长上下文好。每个能力必须由用户显式指派到具体模型。
  - 当前 `@lumen/config` 仅支持单 provider 单 model，是后续扩展的硬性瓶颈。
  - opencode `packages/opencode/src/session/system.ts` + `v2/session.ts` 提供成熟的模型切换事件范式（`ModelSwitched`），可作为结构参考（文本自写，代码不迁移）。
- 关键建模决定：
  - `capabilities`：用户语义指派，独立槽位（`default / coding / vision / writing / fast / long-context`），系统直查不猜测。
  - `models.*.supports`：技术约束声明（仅 `vision` / `tool-calling` / `thinking` 这类不可替代底层能力），用于槽位可分配性检查。
  - `vision` 槽无 fallback：未配置时拒绝图像输入，不做兜底。
- 合规依据：Reference Usage Policy §5（opencode 仅作多模型路由结构参考）；决策 spec §5.7 的 provider-aware prompt 分发已经预留 slot。
- 对验证门禁的影响：
  - 新增 `smoke:model-catalog`、`smoke:model-switch`、`smoke:auto-switch` 三个 smoke，覆盖加载、CLI 切换、场景路由、vision 拒绝路径。
  - `smoke:provider` 与 `smoke:writing` 在多模型场景下继续通过。
- 状态：规划已落地，实施未启动。前置依赖：P2（Agent 支持热切换 model）、P6（provider-aware prompt 分发）、S1.6（CLI permission 交互栈，供模型切换提示复用）。

#### 2026-05-10 Refine：S1.10 修订 + 新增 S1.11 子代理

- 类型：Refine + Insert
- 修订 S1.10：
  - `/model` 无参数改为**交互式选择框**，引入 `@inquirer/prompts` 作为 CLI 交互依赖（也供 S1.6 permission 确认复用）。S1.6 因此与 S1.10.B 共用交互栈。
  - 保留 `/model use <id>` 逃生门；在 `use` 模式下若模型未声明 `supports: ["vision"]`，图像输入直接拒绝并给中文提示。
  - 删除"连续 tool-call → coding"这条启发式自动路由。`coding` 槽不在自动路由表内，改为由子代理显式调度。
- 新增 S1.11 子代理任务分配（见执行计划 §3.2）：
  - 参考 Claude Code `invoke_sub_agent` 与 opencode agent 概念。
  - 定义 `AgentDefinition`（命名 agent + 模型槽 + 工具白名单 + prompt）。
  - 内置 `general-task / coding / context-gatherer / writer / vision-analyst` 五个初版子代理。
  - 子代理独立 transcript、独立 pi-agent-core Agent 实例、走同一权限引擎，只返回最终结果给主代理。
  - 主代理通过 `lumen.spawn_sub_agent` tool 委派任务。
- 原因：
  - 启发式自动识别"编程任务"可靠性不够，容易把写作中读文件的动作误判为 coding。
  - 子代理隔离模式（独立上下文、独立工具、独立模型）是 Claude Code / opencode 两条成熟路线的交集，且能和 S1.10 的能力槽位自然组合。
  - `/model` 选择框给出直观交互，是 personal CLI assistant 的基本 UX 期待。
- 合规依据：Reference Usage Policy §5（opencode 只作结构参考）、§6（ClaudeCodeRev 借鉴范式，不复制代码）。
- 对验证门禁的影响：
  - S1.10 smoke 新增 `smoke:model-switch` 覆盖交互式选择框（用 `@inquirer/prompts` testing utilities 或 keyboard stub）。
  - S1.11 新增 `smoke:sub-agent` 与 `smoke:agents`。
- 状态：规划修订已落地，实施未启动。依赖关系：S1.10 需要 P2 / P6 / S1.6；S1.11 需要 S1.10 / P3 / P4。

#### 2026-05-10 Major Refine：产品身份升级 + Runtime 切 Bun + TUI 选 OpenTUI + 参考项目 tier 重排

- 类型：Major Refine（同时影响产品身份、runtime、UI、参考策略四个维度）
- 触发：用户确认 LumenCli 定位为 **主流代码编程通用智能体 + 写作扩展**，TUI 必须，选 OpenTUI；oh-my-pi 进入 tier-1 参考。
- 变更摘要：
  - **产品身份**：从"CLI-first personal AI 助理 + 写作特色能力"升级为"主流代码编程通用智能体 + 写作等扩展"。Coding 是主干，写作是"站在巨人肩膀上"的第一个扩展。
  - **运行时**：Bun ≥ 1.3 取代 Node.js + pnpm，取代原因见下方 S1.5a 占位步骤。`engines.bun` 替代 `engines.node`。`pnpm-workspace.yaml` 替换为 bun workspaces；lockfile 切 `bun.lock`。
  - **平台**：Phase 1 只保证 **Windows x64**。其他 OS / arch 走 Reference Usage Policy §9 决策变更协议。
  - **TUI 框架**：选 `@opentui/core` + `@opentui/react` + `@opentui/keymap`。不用 solid / three。第一版只用通用特性子集。
  - **参考项目 tier-1**：pi / oh-my-pi / opencode / opentui 同级别 MIT 来源，允许借鉴 runtime + tool + prompt + UI 四层结构。
  - **ClaudeCodeRev**：Private-Project Exemption 下放宽为 prompt + UX 层借鉴来源，runtime 层不跨线。
- 新增计划步骤：
  - **S1.5a Runtime 切 Bun**（P2 之前）：完全切换 Bun，做兼容性扫描，smoke 全部在 Bun 下跑通。
  - **S1.5b TUI Foundation**（S1.5a 之后，P2 之前）：引入 OpenTUI + React，core/ui 分层，首版组件 ChatView / StatusBar / CommandBar 三件套。
- 对现有已完成步骤的影响：
  - P1（pi-ai 接入）已完成的代码不变，但 smoke 脚本要在 S1.5a 里从 `node scripts/*.mjs` 改为 `bun scripts/*.mjs`。
  - 现有 `smoke:provider` 保持 mock HTTP 路径，脚本语法 Bun 兼容无需改。
- 对验证门禁的影响：
  - `pnpm *` 所有命令在 S1.5a 完成后改为 `bun run *`。
  - `smoke:all` 新增 `smoke:tui-render`（S1.5b 出具）。
- 配套文档更新：
  - `Docs/specs/2026-05-10-lumencli-bootstrap-direction.md` §1 §4 §6 已同步产品身份与技术栈。
  - `Docs/specs/2026-05-10-lumencli-reference-usage-policy.md` 整体重写，新增 §1 产品身份、§3 Runtime 平台声明、§6 Tier-1 四项策略；oh-my-pi 与 OpenTUI 入 §6。
  - `Docs/plans/2026-05-10-lumencli-s15-s20-execution-plan.md` 新增 S1.5a / S1.5b 执行步骤（见该文件 §4 / §5）。
- 风险缓解：
  - Bun 兼容性风险：S1.5a 前做完整扫描（`@modelcontextprotocol/sdk` 等 Node 原生依赖优先验证）。
  - OpenTUI 版本风险：`package.json` 精确 pin 0.2.x，升级走独立窗口。
  - Zig 二进制平台风险：明确只保 Windows x64，其他 OS 豁免。
- 状态：文档层修订已落地（本条 + 三份 spec + 执行计划）。S1.5a 代码层切 Bun 未启动。

#### 2026-05-10 Insert：Claude 生态 Drop-in + 永久记忆 + 自我迭代占位（S1.12–S1.14）

- 类型：Insert
- 原步骤：后续步骤列到 S1.11。
- 新步骤：新增 S1.12 Claude 生态 Drop-in 兼容、S1.13 永久记忆、S1.14 自我迭代三项；S1.15 预留。执行计划 §3.3 / §3.4 / §3.5。
- 原因：
  - 用户明确要求 LumenCli 具备 opencode 那样的 Claude 技能 / 插件自动发现能力，降低迁移门槛。
  - 永久记忆与自我迭代是长期产品能力，需要先占位以便后续路线图清晰。两者在 Phase 1 不实施，但规划方向与安全边界先入文档避免未来走偏。
- 合规与安全依据：
  - Reference Usage Policy 新增 §6.5 Claude 生态 Drop-in 兼容策略。详述扫描目录清单（`~/.claude/skills/` / `.agents/skills/` / `.claude/commands/` / `.mcp.json` 等）、禁用 flag、冲突处理、source 标注。
  - S1.14 自我迭代明确硬红线：禁止修改 runtime 代码与权限策略，仅允许在资产层（prompt / skill / command）产出提议，走审阅 + rollback 流程。
- 关键设计：
  - S1.12 拆 A/B/C/D（skill drop-in / command drop-in / MCP config drop-in / 验证与文档），前置依赖 P4 + S1.7。
  - S1.13 存储倾向 SQLite + FTS5 或 `sqlite-vec`；注入路径由 `@lumen/context` 的 `buildContext` 扩展；不干扰现有短期 memory。
  - S1.14 observer / proposer / reviewer 三段流水线，proposer 走 S1.11 子代理，reviewer 走 S1.6 permission 交互栈。
- 对验证门禁的影响：
  - S1.12：新增 `smoke:claude-compat`；用 `anthropics/skills` 真实样本端到端验证。
  - S1.13：新增 `smoke:long-memory`（未来实施时落地）。
  - S1.14：新增 `smoke:self-evolution-dryrun`（未来实施时落地）。
- 状态：规划已落地，全部未实施。依赖：
  - S1.12 ← P4 + S1.7
  - S1.13 ← Phase 1 完成 + S1.10 能力槽位可协同
  - S1.14 ← S1.11 子代理 + S1.13 永久记忆 + S1.6 permission prompt

#### 2026-05-10 Insert：openai/codex 列为 tier-1 设计参考（§6.6）+ S1.13 采用 codex 两阶段记忆流水线

- 类型：Insert + Refine
- 原步骤：Reference Usage Policy tier-1 参考为四项（pi / opencode / opentui / Lumen-Rebuild），S1.13 永久记忆架构仅定"初步方向"。
- 新步骤：
  - Reference Usage Policy 新增 §6.6 `openai/codex`（Apache-2.0）作为第五个 tier-1 参考，**仅设计层**、不作为 runtime 依赖。允许借鉴 memory pipeline、apply-patch、sandbox 分层、rollout/session 模型、MCP server 端、skills 架构。
  - §4 Source 标注规则新增 `codex@<commit>, adapted` 与 `codex@<commit>, clean-room` 两个允许值。
  - §8 Anti-Pattern 新增第 11、12 条（禁止 Rust 源码翻译到 runtime；禁止未经 spec 把 `@openai/codex` 或 codex 二进制作为 runtime 子进程）。
  - 执行计划 §3.4 S1.13 永久记忆从"初步方向"升级为"采用 codex Phase 1 + Phase 2 流水线架构"，定义 state DB（SQLite）+ memory workspace（git baseline）+ consolidation 子代理（无 network / 本地写 / 禁止嵌套）具体结构。
- 原因：
  - 用户明确指出 codex **上下文管理非常卓越**，要求列入参考。实地勘察 `references/codex/codex-rs/memories/README.md` 确认 codex 两阶段流水线比 pi / opencode / ClaudeCodeRev 都更成熟（并发 claim/lease、Phase 2 git baseline + workspace diff、独立 consolidation agent）。
  - 用户关心"Rust 写的生态如何兼容"：结论是 codex 通过 `rmcp` crate + 通用 `.claude/skills/` + `.mcp.json` 协议/格式做生态兼容，语言无关；Node shim + `optionalDependencies` 按 platform 切 binary 做分发兼容。对 LumenCli 的生态路线（S1.12）不产生新负担，反而是"多家同格式"生态的活证据。
  - 用户关心"Rust 性能更好是否要切换"：结论是**不切**。CLI agent 瓶颈是 LLM 延迟（秒级），Bun 已消除大部分 Node 启动/JSON 劣势。codex 选 Rust 是为了 binary 分发 + 原生 sandbox，OpenAI 有对外分发需求；LumenCli 是私有永久使用，无此需求。TS 生态迭代红利（pi / opencode / OpenTUI 都是 TS 线）远大于 Rust 性能收益。未来若需特定原生能力（如 Windows job-object 沙箱），在独立 spec 下评估引入 Rust helper 子进程，主干仍保持 Bun + TS。
- 合规依据：
  - codex 是 Apache-2.0，允许跨语言设计借鉴 + attribution。在 Private-Project Exemption 失效时也无需清理，只需保留 NOTICE 级 attribution。
  - Reference Usage Policy §6.6 强制 source 标注与 Apache-2.0 attribution，禁止作为 runtime 依赖。
- 对验证门禁的影响：
  - S1.13 未来实施时新增 `smoke:long-memory-phase1` / `smoke:long-memory-phase2` / `smoke:long-memory-retrieve` 三个 smoke。
  - 当前窗口无 smoke 变更（纯文档）。
- 状态：文档层修订已落地（Reference Usage Policy §6.6 + §4 + §8 + 本条 Plan Mutation Log + 执行计划 §3.4 重写）。代码层无动作。
- 不改动项：
  - 不把 codex 加入 `package.json` dependencies。
  - 不 clone codex 到主仓（`references/codex` 在 `.gitignore` 内，不入远程）。
  - S1.13 仍然是 Phase 2+ 占位，不改变 Phase 1 路线。

#### 2026-05-12 Refine：正式化 Pi-Powered Runtime 架构定位 + Upstream Intake Policy

- 类型：Refine + Insert
- 触发：用户外部调研 `openclaw/openclaw`（embedded Pi runtime 样本）后确认"standalone 产品壳 + Pi-powered runtime"是 LumenCli 实际已采用且可持续的架构范式。需要把这一定位从多份 spec 的分散结论合并为单一正式 spec，并建立配套的上游吸收流程。
- 产出：
  - 新 spec `Docs/specs/2026-05-12-pi-powered-runtime-strategy.md`：一句话定位、LumenCli / Pi 能力边界、adapter 边界文件清单（7 个文件）、OpenClaw 作为外部验证样本、硬约束清单（5 条，含"Pi 类型零外泄"、"public entry 零外泄"、"adapter 文件清单固定"、"typebox 单文件约束"、"文档语境统一"）、对已完成工作的重新诠释（P1 / P2 / P3 / P1.5b 全部是 adapter 边界的分步落地）。
  - 新 spec `Docs/specs/2026-05-12-upstream-intake-policy.md`：四档节奏（Scheduled / Patch / Opportunistic / Security）、runtime tracking set（pi-ai / pi-agent-core / typebox）、design tracking set（codex / openclaw / opencode / oh-my-pi）、4 阶段升级流程（准备 / 决策 / 实施 / 记录）、设计 sweep 流程、验证门槛、回滚路径、scoped vendor 策略（三选二准入 + license/source 标注）、KPI（intake coverage + adapter-only discipline + scoped vendor hygiene）。
  - Reference Usage Policy §2 参考对象清单新增 OpenClaw 条目（架构验证样本、未本地克隆、license 待核对、不作 runtime 依赖）。
  - README 重写开头定位段、参考项目表、初始原则、当前能力、当前限制、构建决策、技术栈来源、语言规则，全部对齐新架构定位；移除 P1-P3 前的过时陈述；修正 `main.ts` → `main.tsx` 路径。
- 关键决策：
  - LumenCli 正式定义为 **"CLI-first 自定义智能体框架与产品壳，核心 agent runtime 由 Pi 驱动"**。
  - 产品层包（tools / permissions / context / memory / writing / command-system / config / prompts / mcp / cli）grep `@earendil-works` 必须返回零结果，由未来 ESLint 规则 + `smoke:boundaries` 强化。
  - adapter 文件清单固定 7 个：`pi-ai.ts` / `internal.ts` / `pi-agent-adapter.ts` / `event-mapper.ts` / `event-queue.ts` / `tool-adapter.ts` / `permission-resolver.ts`。新增触碰 Pi 类型的文件必须先在 pi-powered-runtime-strategy spec §4 登记。
  - 上游吸收采用 **dependency-first**，scoped vendor 三选二准入（上游未公开导出 + 稳定性高 + 小而完整，≤ 200 LOC），任何时间点 scoped vendor ≤ 5 项。
  - 首次 upstream intake 走完整流程的时机：Pi 0.75（或下一次 Pi 发布）后 1 周内，产出 `Docs/reports/YYYY-MM-DD-upstream-intake-pi-0.75.md` 作为校准。
- 合规依据：
  - 本次修订不改变任何 runtime 依赖（pi-ai 0.74.0 / pi-agent-core 0.74.0 / typebox 1.1.38 精确 pin 不动）。
  - 本次修订不改变 fork vs standalone 决策（仍 standalone），只把 standalone 的实际内涵从"继续自写 runtime"校准为"Pi-powered runtime + product shell"。
  - OpenClaw 作为架构参考，不触发代码借鉴；引用方式受 Reference Usage Policy §9 决策变更协议约束。
- 对验证门禁的影响：
  - 无。纯文档与 policy 修订。当前窗口不新增 smoke。
  - 未来 upstream intake 每次需通过现有 smoke:all（14 条）+ 针对行为变化新增的 smoke。
- 对未来路线的影响：
  - P4 开始，skills / session / compaction / prompt-templates 的接入自然落在 adapter 边界内，所有新 loader 放在 `@lumen/prompts` 或 `@lumen/agent-core` 内部。
  - S1.6 permission prompt UI 继续延伸现有 `permission_required` + `respondToPermission` 契约（P3 已建立），不触碰 Pi 类型。
  - 任何未来引入 Pi 新能力（例如 S1.10 多模型、S1.13 长期记忆）的实施窗口都按 upstream-intake-policy §4 流程执行。
- 状态：三份文档修订已落地（README + 两份新 spec + Reference Usage Policy）。代码层无改动。

#### 2026-05-12 Operational：首次 Upstream Intake Dry-Run + Policy 校准

- 类型：Operational（规程执行）+ Refine（policy 文本校准）
- 触发：用户指示"先来一次 upstream-intake dry-run 再 S1.6"，首次执行 `upstream-intake-policy.md` §4 流程以校准模板。
- 执行：
  - 查询 npm registry：`@earendil-works/pi-ai` / `pi-agent-core` / `pi-coding-agent` / `pi-tui` / `typebox` 全部的 `latest` 与本地 pin 相同（pi-* 为 `0.74.0` @ 2026-05-07；typebox 为 `1.1.38` @ 2026-05-06）。
  - 查询 GitHub API：`earendil-works/pi` 自 0.74.0 发布后有 ~24 个 commit，但**均未发 npm**。逐一分类：1 条 🟡（compaction 修复，待 P4 对接时取）、2 条 🟢 影响面（Bun proxy + Together AI provider）、其余为 AgentHarness / pi-coding-agent / pi-tui / docs 内部改动，对 LumenCli 表面无影响。无 🔴 breaking。
  - 决策：**Skip / defer**。理由：无 npm delta，policy §4.3 不允许从 tip of main pin。
- 产出文档：`Docs/reports/2026-05-12-upstream-intake-dry-run.md`，覆盖 policy §4.1-§4.4 + §5 learnings + §6 open tracking items。
- Policy 校准（本次修订已应用）：
  - §2.1 Runtime tracking set 表格增加"上游仓库"列，供下次 intake 直接查询不必重新推断。记录 `badlogic/pi-mono` → `earendil-works/pi` 的别名事实，避免下次 intake 再踩坑。
  - §4.1 步骤 3 增加一句提示："先核对 §2.1 表格中的上游仓库字段是否仍然有效"，给出别名迁移的真实例子。
  - §11 新增 "11.1 Dry-run 校准（2026-05-12）"，记录本次执行与学到的事实，让未来新会话在读 policy 时能直接看到"此 policy 已被校准过一次，走过的坑已经补在正文"。
- 对代码层的影响：
  - 无。未改 `package.json`，未跑 `bun install --frozen-lockfile`（因为决策 3 的准备阶段就终止，按 policy §4.2 正确路径）。
  - 未来遇到 Pi 0.75 发布或 P4 启动会重新评估 compaction fix。
- 对 KPI 的影响：
  - Policy §9.2 "Adapter-only discipline: consecutive ≥ 3 intakes with zero product-layer changes" → 当前 1/3（本次 dry-run 计入）。
- 状态：Dry-run 完成，policy 正文校准完成。下一步进入 S1.6（CLI permission prompt 模态）。

#### 2026-05-12 Implement：S1.6 CLI Permission Prompt 模态

- 类型：Implement（代码层实现）
- 触发：P3 已建立 `permission_required` 事件 + `respondToPermission` 契约，需要在 OpenTUI + React UI 层把它接成实际可交互的中文模态框。用户指示"先来一次 upstream-intake dry-run 再 S1.6"，本步紧跟 dry-run 完成后落地。
- 产出：
  - `apps/cli/src/core/view-model.ts`：新增 `ActivePermissionPrompt` 类型与 `ViewState.permissionPrompt` 字段（初值 `null`）。
  - `apps/cli/src/core/event-bus.ts`：`pumpAgentEvents` 识别 `permission_required` 事件并把 prompt 写入 store；运行收尾同步清空 `permissionPrompt`。
  - `apps/cli/src/core/actions.ts`：`ActionDispatcher.respondToPermission(requestId, decision)` 方法转发到 `LumenAgent.respondToPermission` 并立即清理 view state。core 层仍零 UI 依赖（由 `smoke:boundaries` 守护）。
  - `apps/cli/src/ui/react/PermissionModal.tsx`：全中文模态，risk 颜色映射（read 绿 / write 黄 / shell magenta / destructive 红）、参数 JSON preview（≤ 120 字截断）、键位：Enter/Y 允许 / N 拒绝（reason：用户拒绝了本次工具调用）/ Esc 取消（reason：用户按下 Esc 取消工具调用）。
  - `apps/cli/src/ui/react/App.tsx`：模态打开时屏蔽全局 `useKeyboard`（避免 Ctrl+C 误触 requestCancel 中断）；模态与 App 同层挂载，zIndex 10。
  - `scripts/smoke-permission-prompt.mjs`：端到端 smoke，`permissionMode: "askAlways"` 下 faux provider → agent beforeToolCall → event-bus → ViewStore → ActionDispatcher.respondToPermission → agent 恢复执行。覆盖 allow 与 deny 双路径，断言 tool 真跑 / 被拦截、`permissionPrompt` 最终被清空。
  - `scripts/smoke-tui-render.mjs`：扩展第二次渲染，seed 一个 fake permission prompt，断言字符帧中出现"需要授权 / fs.writeText / 允许 / 拒绝 / Esc"。
  - `package.json` / `smoke:all`：新增 `smoke:permission-prompt` 并进入链尾之前。当前 smoke:all 15 条全绿。
- 对齐已有决策：
  - 之前规划的 `@inquirer/prompts` CLI 交互依赖被 OpenTUI 原生模态取代（§S1.10 与本条 Plan Mutation Log 均已更新）。这是 P1.5b 完成后的合理收敛。
  - PermissionModal 位于 `apps/cli/src/ui/react/`，不跨包、不入 core 层。boundary smoke 验证通过。
- 对验证门禁的影响：
  - `smoke:all` 从 14 条 → 15 条（新增 `smoke:permission-prompt`）。
  - `smoke:tui-render` 渲染场景从 1 个 → 2 个（普通主界面 + 模态打开态）。
  - `smoke:boundaries` 自动覆盖新文件（apps/cli/src/core/ 不含 @opentui/react 导入）。
- 状态：代码层落地完成。S1.6 按 Blueprint §7 S12 验收标准（"write/shell 的交互式确认 UI 未完整接入"已不再适用）正式关闭。

#### 2026-05-12 Implement：S1.7 MCP Config Loader（drop-in 扫描）

- 类型：Implement（代码层实现）
- 触发：S1.6 完成后继续推进 Phase 1 路线；用户指示"继续，按你方案一步步来"。按执行计划 §3 后续步骤选 S1.7。
- 产出：
  - `packages/mcp/src/config-loader.ts`：`loadMcpServerConfigs(options)` 扫描 6 级候选路径（built-in / user-lumen / user-claude / workspace-lumen / workspace-claude / workspace-generic），按 later-wins 规则合并 `mcpServers` 字段，返回 `{ servers, entries, conflicts, skipped }` summary。
  - 关键实现点：
    - 内置轻量 JSONC 剥注释器（支持 `//` 与 `/* */`，尊重字符串边界），应对用户手改 Claude 配置时的注释残留。
    - `~/.claude.json` 里若没有 `mcpServers` 字段（Claude 用同一文件存其他设置），loader 静默跳过（`kind: "missing"`），不报错。
    - malformed JSON → `skipped` 数组，warn sink 输出警告，不抛异常。
    - 环境变量 `LUMEN_DISABLE_EXTERNAL_MCP=1` / `LUMEN_DISABLE_CLAUDE_MCP=1` 在候选路径构造阶段直接过滤。
    - 同名冲突在 `conflicts` 数组里记录 winner + losers 供调试。
  - `packages/mcp/src/index.ts` 重新导出 `loadMcpServerConfigs` 与相关类型。
  - `scripts/smoke-mcp-config.mjs`：四个场景 smoke——precedence / Claude 单独关闭 / 全部 external 关闭 / malformed JSON fallback。
  - `package.json` 新增 `smoke:mcp-config` 并进入 `smoke:all` 链（16 条 smoke，紧跟 smoke:mcp 之后）。
- 对齐合规：
  - 实现严格按 Reference Usage Policy §6.5 的扫描目录清单与优先级。
  - `@lumen/mcp` 对外类型不引用 `@earendil-works/*`（仍由 `smoke:boundaries` 守护）。
  - 所有外部 drop-in（Claude / 通用 .mcp.json）仍 **不代表信任**：loaded config 进入运行时后工具风险仍按默认走 `ask`，直到用户显式标记允许（权限引擎行为不变，S1.7 只是发现而不注入信任）。
- 对验证门禁的影响：
  - `smoke:all` 从 15 条 → **16 条**。
  - 现有 `smoke:mcp`（实际连接 mock stdio server + listTools + callTool）保留不变，覆盖运行路径；新 `smoke:mcp-config` 覆盖发现/合并路径。
- 未覆盖（留作后续）：
  - 在 CLI 启动时自动对 `loadMcpServerConfigs()` 的结果调用 `connectMcpServer` 并把 tools 注入 ToolRegistry（当前仍需手动 wire；可作为 S1.7 的小 follow-up 或并入 P4）。
  - MCP server 的状态栏展示（哪些 server 在运行、连接失败的错误提示）属于后续 UX。
- 状态：loader 层完成并测试。CLI 启动时的"auto-connect"尚未接线。下一步选 P4（skills + session + compaction + prompt-templates loader）或继续完成 S1.7 的 auto-connect 部分。

#### 2026-05-12 Implement：S1.7 MCP Auto-Connect（CLI 启动接线）

- 类型：Implement（完成 S1.7 的第二阶段）
- 触发：loader 层（93e27a1）完成后用户指示"继续"。按上一条 Plan Mutation Log 列出的 follow-up，把 loader 结果连到 agent 运行路径。
- 产出：
  - `packages/mcp/src/auto-connect.ts`：`autoConnectMcpServers({ registry, cwd, home, env, warn, dryRun, connect, timeoutMs })`。流程：loader → 对每个 server 调 `connectMcpServer` → 把产出的 `LumenTool[]` 注册进传入的 `ToolRegistry`。返回 `{ summary, connected, registeredTools, failures, close }`。
  - 容错：单个 server 连接失败 / 超时 / 工具名冲突都进 `failures` 数组，不 throw。默认 connect timeout 10s。
  - `packages/mcp/src/index.ts` 重新导出。
  - `apps/cli/package.json` + `tsconfig.json` 增加 `@lumen/mcp` + `@lumen/tools` 直接依赖与 TS project reference。
  - `apps/cli/src/main.tsx`：
    - 新辅助 `maybeAutoConnectMcp({ enable })`：构造 `AutoConnectMcpResult`，输出一行 summary 到 stdout（交互模式用户可见），把 `process.on('exit'|'SIGINT'|'SIGTERM', …)` 钩子用于清理。
    - 交互模式无条件启用（`runInteractive` 一开始就调）。
    - Headless `--once` 默认不启用，可通过 `LUMEN_MCP_AUTOCONNECT=1` 打开（保证现有 smoke 不意外触发外部子进程）。
    - 退出路径（`handleExit`）显式 await `mcp?.close()`。
  - `scripts/smoke-mcp-autoconnect.mjs`：构造一个 workspace-level `.mcp.json` 指向现有 `packages/mcp/scripts/mock-mcp-server.mjs`，调 `autoConnectMcpServers` 并验证 loader + connect + registry 注册 + `registry.call` 成功返回 `pong`，然后 close 清理。
  - `package.json` 新增 `smoke:mcp-autoconnect`，进入 `smoke:all`（17 条 smoke）。
- 合规说明：
  - 发现的 MCP tool 仍完整走 `@lumen/permissions`，风险推断由 `createMcpTool` 根据 `readOnlyHint` / `destructiveHint` / `openWorldHint` annotations 决定。发现 ≠ 信任仍然成立。
  - `smoke:boundaries` 自动覆盖新增文件（apps/cli/src/main.tsx 允许访问 `@lumen/mcp`，但不引 pi 类型）。
- 对验证门禁的影响：
  - `smoke:all` 从 16 条 → **17 条**。
- 状态：S1.7 完全闭环。下一步进入 P4（skills / session / compaction / prompt-templates loader 接入 pi-agent-core 对应组件）。

#### 2026-05-12 Implement + Scope：P4 skills + prompt-templates + session（clean-room）

- 类型：Implement + Scope adjustment
- 触发：S1.7 闭环后推进 P4。实地勘察 `@earendil-works/pi-ai@0.74.0` 与 `@earendil-works/pi-agent-core@0.74.0` 的 `dist/*.d.ts`，确认 `shouldCompact / compact / estimateContextTokens / loadSkills / loadPromptTemplates / session repo` **均未导出**到 npm（这些是 pi-mono `pi-coding-agent` / `pi-agent` 的私有模块）。
- Scope 调整：按 `upstream-intake-policy.md` §8 scoped vendor 准入条件（≤ 200 LOC + 小而完整 + 上游未公开导出），将 P4 拆为：
  - **P4.1（本条）**：clean-room 实现 skills loader + prompt-templates loader + session repo（JSONL）。完成。
  - **P4.2（留作后续）**：compaction（`shouldCompact` / `compact` / `estimateContextTokens`）。涉及 LLM summarization pass，工作量显著且应按 codex 两阶段流水线设计（见 Reference Usage Policy §6.6 + 执行计划 §3.4），不强行塞进 P4.1 窗口。
- 产出（P4.1）：
  - `packages/prompts/src/loaders/skills.ts`：7 级候选路径（builtin / user-lumen / user-claude / user-agents / workspace-lumen / workspace-claude / workspace-agents），递归扫 `SKILL.md`，later-wins，支持 `LUMEN_DISABLE_EXTERNAL_SKILLS` / `LUMEN_DISABLE_CLAUDE_SKILLS` 关闭，最小 YAML frontmatter parser，无 frontmatter 时按目录名回退。
  - `packages/prompts/src/loaders/prompt-templates.ts`：5 级候选路径，扁平 `.md`，解析 `description` / `argument-hint` / `allowed-tools`。`substituteTemplateArguments` 支持 Claude 占位符 `$ARGUMENTS` / `$1..$9` / `$@` / `${@:N}` / `$$`。
  - `packages/agent-core/src/session.ts`：`openSession` + JSONL 记录（`session_start` / `message` / `session_end`）+ `readSessionFile` / `readSessionSummary` / `replaySession` / `listSessions` / `resolveDefaultSessionDir`。默认 `%USERPROFILE%\.lumen\sessions\<id>.jsonl`；`LUMEN_SESSION_DIR` 覆盖；`mode: "workspace"` 切 `<cwd>/.lumen/sessions/`（P0.1 已定）。
  - `packages/command-system/src/index.ts`：`CommandRegistry` 新增 `get(name)` + `unregister(name)`（最小扩展，供 agent-core 覆盖 `/status`）。
  - `packages/agent-core/src/index.ts`：
    - `LumenAgentOptions` 新增 `skills` / `promptTemplates` / `session` 字段。
    - system prompt 组装里追加 `# Available Skills` 段（仅 name + description）。
    - `appendMessage` fire-and-forget 写入 session log；失败 warn 不阻塞。
    - 新增 `/skills` / `/templates` 命令，`/status` 扩展为显示 skills / templates / sessionLog 路径。
    - 重新导出 session API（类型 + helper）。
  - `apps/cli/src/main.tsx`：`createLumenAgent` 前 parallel `loadSkills` + `loadPromptTemplates`；交互模式默认打开 session（可 `LUMEN_PERSIST_SESSION=1` 在 headless 启用）；`handleExit` 关闭 sessionLog。新增 `[lumen] loaded X skill(s), Y template(s), session Z` summary line。
  - `apps/cli/package.json` + `tsconfig.json` 增加 `@lumen/prompts` 直接依赖与 TS project reference。
  - 三个新 smoke：
    - `smoke:skills`：builtin / user-lumen / user-claude / user-agents / workspace-* 六个 origin 的 precedence + env opt-out + 无 frontmatter 目录名回退 + 冲突记录。
    - `smoke:prompt-templates`：precedence + `LUMEN_DISABLE_CLAUDE_SKILLS` 回退 + 占位符 `$1 $2 $ARGUMENTS ${@:3} $$` 全部验证。
    - `smoke:session`：open/append/close 往返 + `listSessions` + LumenAgent 经 `/status` slash 命令路径自动持久化 user + assistant 两条消息 + `resolveDefaultSessionDir` 各模式。
  - `smoke:all` 从 17 → **20 条**全绿。
- 合规说明：
  - 三个 loader 在 `@lumen/prompts` 与 `@lumen/agent-core` 内 clean-room 实现，与 pi-agent-core / pi-coding-agent 源码无血缘。
  - `smoke:boundaries` 持续守护 Pi 类型零外泄。
  - Reference Usage Policy §6.5 Claude 生态 drop-in 三项（skills / commands / MCP 配置）至此全部落地。
- 状态：P4.1 完成。下一窗口选：P4.2（compaction）/ S1.10（多模型）/ S1.11（子代理）。

#### 2026-05-12 Implement：S1.10.A 多模型静态配置 + 能力槽位

- 类型：Implement（loader + validation 层）
- 触发：P4.1 后续推进；用户本机已有 mimo-v2.5（多模态）+ mimo-v2.5-pro（编程特化）两个模型，需要明确的能力槽位绑定以便 S1.10.B / S1.10.C 消费。
- 产出：
  - `packages/config/src/model-catalog.ts`：`LumenModelCatalog` 类型 + `loadModelCatalog` 四层合并（legacy-defaults / user-file / workspace-file / env-override，later-wins）+ `resolveModelForCapability` 查表（vision 无 fallback）+ JSONC 容忍 + 验证规则（default 必填、vision 必须声明 supports、未知 slot 报 error）。
  - `packages/config/src/index.ts`：re-export catalog API。
  - `scripts/smoke-model-catalog.mjs`：5 场景（legacy 种子 / file 合并 + workspace 覆盖 / env 覆盖 / 验证错误 / 缺失 default 报错）。
  - `package.json`：`smoke:model-catalog` 注册并进入 `smoke:all`（21 条 smoke）。
- 关键决策对齐：
  - **能力不从模型 id 推断**（执行计划 §3.1 的建模原则）。`capabilities.*` 必须显式声明；`models.*.supports` 是技术约束，仅用于 vision slot 可分配性校验。
  - 向后兼容：现有 `LumenConfig.provider.model + visionModel` 会自动种子出 `default` + `vision` 两个槽，既有 mimo-v2.5 / mimo-v2.5-pro 配置原地生效，无需用户手改 config。
  - `@lumen/config` 对外类型不引用 `@earendil-works/*`（smoke:boundaries 守护不变）。
- 对验证门禁的影响：
  - `smoke:all` 从 20 条 → **21 条**。
- 未覆盖（留给 S1.10.B / S1.10.C）：
  - `/model` 选择框 + CLI 切换（B）。
  - 场景自动路由（含 vision / writing / long-context）（C）。
  - runtime 真正按 slot 切换 `agent.state.model`（当前 LumenAgent 仍用单槽 modelHandle 构造）。
- 状态：S1.10.A loader 完成。下一步可选 S1.10.B（CLI 交互切换）或其他 Phase 1 步骤。

#### 2026-05-12 Insert：Fork vs Standalone 决策锁定 + Rust Helper Subprocess Policy

- 类型：Insert（两份新 spec） + 路线锁定
- 触发：用户提问"现路线 vs fork 一个参考项目改造哪个更好"，以及"如果把 codex 也列入考虑"。
- 产出：
  - 新 spec `Docs/specs/2026-05-12-fork-vs-standalone-decision.md`：把 pi / oh-my-pi / opencode / ClaudeCodeRev / codex 五个 fork 候选摊开评估，结论为"维持 standalone + 选择性借鉴"。明确四条未来重新考虑 Fork 的触发线（重复实现、适配层维护成本失控、技术栈选型改向、维护方能力改变）。
  - 新 spec `Docs/specs/2026-05-12-rust-helper-subprocess-policy.md`：定义"Bun 主 + Rust helper 子进程"的引入条件、架构约束、首批候选清单（`lumen-sandbox` 达标；`lumen-indexer` / `lumen-patcher` / `lumen-mcp-server` 暂不达标）、引入流程、回撤路径、policy 失效条件。
- 核心决策：
  - **不 fork codex 的理由不是"Rust 没用"**，而是"废掉全部现有 TS 工作 + 失去 AI 辅助编码加持 + 独立维护 Rust ≫ codex 设计本身的价值"。
  - **不 fork pi / oh-my-pi 的理由**是 UI 框架选择（OpenTUI 替代 pi-tui 要重写 40-50%）+ 产品身份与 prompt 主权冲突 + 依赖边界被贯穿。
  - **codex 的真正价值**（memory pipeline、apply-patch、sandbox、rmcp 双端）通过两条路径兑现：架构设计 = 在 TS 里重建；原生能力 = 独立 Rust helper 子进程按需引入。
- 合规依据：
  - codex 是 Apache-2.0，跨语言设计借鉴 + helper 源码 adapted 合法，需保留 attribution。
  - pi / oh-my-pi 是 MIT，fork 合法但与 LumenCli 约束冲突，故不走。
  - Reference Usage Policy §6.6 已铺好 codex 参考边界，本次修订不改变。
- 对验证门禁的影响：
  - 无。纯决策 spec。未来每个 Rust helper 落地时各自新增 `smoke:helper-<name>`，进入 `smoke:all`。
- 对未来路线的影响：
  - 本次修订不改变 Phase 1 / Phase 2+ 现有路线。
  - 提供了明确的未来决策锚点：任何关于"是否该 fork"的讨论都引用 `2026-05-12-fork-vs-standalone-decision.md`；任何关于"该不该引入 Rust"的讨论都引用 `2026-05-12-rust-helper-subprocess-policy.md`。
  - `lumen-sandbox` 作为首批达标候选，触发条件已定：S2+ 阶段用户请求"自动同意 shell 工具"或"长时间运行代理需要防护"时启动独立 spec 评估。
- 状态：两份 spec 已落地。代码层无改动。

#### 2026-05-12 Implement：S1.10.B CLI /model 交互切换 + session-level slot binding

- 类型：Implement（代码层实现）
- 触发：S1.10.A catalog loader 完成后继续推进；用户指示"继续，按方案一步步来"。
- 产出：
  - `packages/agent-core/src/public-types.ts`：新增 `model_binding_changed` 事件类型（slot / previousModelId / newModelId / allSlots）。
  - `packages/agent-core/src/index.ts`：
    - `LumenAgentOptions` 新增 `catalog?: LumenModelCatalog` 与 `home?: string`。
    - `LumenAgent` 新增 session-level bindings（`sessionBindings` / `useOverride` / `originalBindings`）。
    - 公开 API：`getCatalog` / `getEffectiveBindings` / `isUseOverrideActive` / `getUseOverrideModelId` / `switchSlot` / `useModel` / `resetBindings` / `saveSlotBinding` / `onModelChange` / `resolveSlotModel`。
    - `registerModelCommands` 替换默认 `/model` 命令，支持 7 种子命令形式。
    - `rebuildModelHandle` 在 slot 切换后重建 pi-ai model handle + 更新 runtime info。
  - `packages/agent-core/package.json` + `tsconfig.json`：新增 `@lumen/config` 依赖与 project reference。
  - `apps/cli/src/core/event-bus.ts`：`model_binding_changed` 事件更新 `runtime.model`。
  - `apps/cli/src/main.tsx`：启动时 parallel `loadModelCatalog`，传入 agent；交互模式 `onModelChange` 监听器同步 StatusBar。
  - `scripts/smoke-model-switch.mjs`：7 个场景（/model 列表 / slot 临时切换 / use override / reset / --save 持久化 / 未知模型报错 / model_binding_changed 事件发射）。
  - `package.json`：`smoke:model-switch` 注册并进入 `smoke:all`（22 条 smoke）。
- /model 命令形式：
  - `/model`（无参数）→ 列出所有已注册模型 + 当前槽位绑定
  - `/model <slot> <model-id>` → 非交互式临时切换本 session 某个槽位
  - `/model use <model-id>` → 强制 override 所有槽位（逃生门）
  - `/model --save <slot> <model-id>` → 持久化写回 `~/.lumen/config.json`
  - `/model reset` → 恢复到 config.json 原始绑定
  - `/model lock <model-id>` / `/model unlock` → S1.10.C 预留占位
- 对验证门禁的影响：
  - `smoke:all` 从 21 条 → **22 条**全绿。
  - `smoke:boundaries` 通过（`@lumen/config` 是产品层包，不含 Pi 类型）。
  - `smoke:ux` 的 `/model` 断言已适配新输出（空 catalog 时仍输出 "No model configured"）。
- 未覆盖（留给后续）：
  - OpenTUI `<select>` 交互式选择框（TUI 模态版 `/model`）：当前 `/model` 无参数走文本列表输出，交互式选择框需要 `ModelPicker.tsx` UI 组件，留给 TUI 增强窗口。
  - S1.10.C 场景自动路由（vision / writing / long-context 自动切换）。
- 状态：S1.10.B 完成。`smoke:all` 22 条全绿。HEAD: `9b9e307`。

## 10. 执行方式建议

后续每次进入实现时：

1. 先用 `executing-plans` 读取本计划。
2. 只执行一个步骤或一组强相关小步骤。
3. 每步执行前更新 `update_plan`。
4. 每步完成后运行该步验证。
5. 失败时停止，记录失败命令和原因。
6. 不在未确认的情况下提交、push 或初始化远程仓库。

## 11. 第一批建议执行顺序

推荐下一次从 S0 开始：

1. S0 工程卫生与基线收口。
2. S1 配置系统与 OpenAI-compatible provider。
3. S2 Agent event loop。
4. S3 Tool contract 与 permission engine。

原因：

- S0 保证后续修改不被构建产物污染。
- S1 让 agent 真正能调用模型。
- S2 为工具调用和 streaming 铺底。
- S3 是接本地工具和 MCP 前的安全门槛。

## 12. 参考项目使用策略

详细策略见 `Docs/specs/2026-05-10-lumencli-reference-usage-policy.md`。以下为执行摘要，任何冲突以 spec 正文为准：

- `pi`：MIT，以 npm 包形式可挑层依赖。允许接入 `@earendil-works/pi-ai` 与 `@earendil-works/pi-agent-core`（按决策 spec §3.5 的组件分件清单使用，不接入 `AgentHarness` 类本体，不接入 `pi-coding-agent`）。
- `opencode`：MIT。仅作**多模型 prompt 分发**的结构参考（`packages/opencode/src/session/system.ts` 的 `provider(model)` 模式），不整体依赖、不 vendor。
- `openai/codex`：Apache-2.0。**仅设计参考**（Rust 实现，不作 runtime 依赖）。允许借鉴 memory pipeline（S1.13 采用）、apply-patch、sandbox 分层、rollout/session 模型、MCP server 端、skills 架构。需保留 Apache-2.0 attribution。详见 Reference Usage Policy §6.6。
- `ClaudeCodeRev`：Anthropic 闭源 license 的 sourcemap 逆向产物。基于 Reference Usage Policy §2 Private-Project Exemption（前提：私有仓库 + 永久私人使用），允许在 **prompt / 文案层**借鉴并 adapt 到 `packages/prompts/assets/`；runtime / 代码层不跨线。所有借鉴文件必须 frontmatter 带 `source: claude-code@2.1.88, adapted` 或 `clean-room`。豁免失效条件见 spec §6.5。
- `Lumen-Rebuild`：允许迁移写作能力，但必须在 LumenCli 命名与包结构下重建，禁止降级为其 CLI 壳。

### 12.0 架构定位与决策锚点

**架构定位**：LumenCli = **CLI-first 自定义智能体框架与产品壳，核心 agent runtime 由 Pi 驱动**。完整定义、能力边界、adapter 文件清单、硬约束见 `Docs/specs/2026-05-12-pi-powered-runtime-strategy.md`。

**Fork vs Standalone**：完整评估见 `Docs/specs/2026-05-12-fork-vs-standalone-decision.md`。当前结论：**维持 standalone + 选择性借鉴**。该 spec 定义了未来重新考虑 Fork 的四条触发线。

**Upstream Intake**：上游依赖升级 + 设计参考源 sweep 的完整流程见 `Docs/specs/2026-05-12-upstream-intake-policy.md`。四档节奏（Scheduled / Patch / Opportunistic / Security），dependency-first + scoped vendor 三选二准入。

**Rust Helper 子进程**：见 `Docs/specs/2026-05-12-rust-helper-subprocess-policy.md`。主干永远不切 Rust；特定原生能力（首批候选 `lumen-sandbox`）按需以 stdio 子进程形式引入。

### 12.1 S1.5 pi-ai Provider 接入

占位步骤。前置：S1 已完成 OpenAI-compatible 最小 provider。

计划输入：

- 以 `@earendil-works/pi-ai` 作为 `@lumen/model-provider` 的主实现来源。
- 保留本地 mock OpenAI-compatible fallback 与对应 smoke，便于无网络 / 无 key 场景。
- CLI 配置入口保持由 `@lumen/config` 定义，pi-ai 的 provider 选择不直接暴露到 CLI flag 层，由 LumenCli 侧收敛。

退出标准：

- `packages/model-provider` 对外 API 不变，底层实现切换到 pi-ai。
- 单次 prompt 能跑通至少一个 pi-ai 支持的 provider。
- smoke 脚本结构保持可用，pi-ai 路径在缺 key 时 skipped 而非失败。
- `Docs/specs/2026-05-10-lumencli-reference-usage-policy.md` 的边界（类型不外泄、prompt 自有、权限不被绕过）在代码层得到遵守。

### 12.2 S2.0 pi-agent-core 接入决策 spike

占位步骤。前置：S2 已完成自有 event loop；S11 启动前必须结题。

计划输入：

- 阅读 `packages/agent` 在 pi 中的 tool-call / state / attachment 模型。
- 对比 `@lumen/agent-core` 现有 `AgentEvent` 与 session 模型。
- 评估接入 pi-agent-core 后：
  - 是否能把 LumenCli 的 event 结构作为 pi-agent-core 的上层适配。
  - 是否会把 pi-agent-core 的类型跨包泄漏。
  - 迁移成本与后续维护收益比。
- 产出对比文档，结论仅有两种：接入并明确封装边界；不接入并保留自写加强版。

退出标准：

- 结论写入 `Docs/specs/` 新的决策 spec。
- 若决定接入，产出 S11 前的迁移任务清单，并在 Plan Mutation Log 补记录。
- 若决定不接入，记录放弃理由以及后续再评估的触发条件。

### 12.3 S1.5+S2.0 深度重构窗口

状态：决策已落地，实施未启动。前置：本 spike 结论 spec（`Docs/specs/2026-05-10-lumencli-pi-agent-core-decision.md`）。

决策结论（摘）：

- 同时接入 `@earendil-works/pi-ai` 与 `@earendil-works/pi-agent-core`。
- 不使用 pi 的 `AgentHarness` / `skills` / `prompt-templates` / `session repo`，命令、记忆、prompt 保持 LumenCli 自有。
- 所有工具执行必须经 `@lumen/permissions`，并在 `beforeToolCall` 钩子上兜底。
- pi 类型只在 `@lumen/model-provider` 与 `@lumen/agent-core` 内部可见，不 re-export。

执行要点（正式启动实施时以决策 spec §5 为准）：

1. `@lumen/model-provider` 引入 `@earendil-works/pi-ai`，封装 `LumenModelHandle`，保留无 key fallback。
2. `@lumen/agent-core` 引入 `@earendil-works/pi-agent-core`，映射 pi 事件到 LumenCli 对外 `AgentEvent`。
3. `@lumen/tools` 增加 `toPiAgentTool` 适配器，仅在 `@lumen/agent-core` 内部使用。
4. 增加 `pnpm smoke:agent-loop` 覆盖 tool-call loop、parallel / sequential、权限拦截，并纳入 `smoke:all`。
5. README 与 `Docs/reports/phase1-verification.md` 同步更新。
6. Plan Mutation Log 追加实施完成记录。

退出标准：

- `pnpm smoke:all` 通过。
- 对外 `LumenAgent.run()` API 形状不变。
- pi-* 包的符号不出现在 `apps/cli` 与 `packages/*/src/index.ts` 的 public exports 中。
- `Docs/reports/phase1-verification.md` 增加本窗口的验证记录。

回滚策略：决策 spec §6。保持 `LumenAgent` 对外 API 不变，可换实现为自写 loop。
