# LumenCli

`LumenCli` 是一个 **CLI-first 的自定义智能体框架与产品壳，核心 agent runtime 由 Pi 驱动**（`@earendil-works/pi-ai` + `@earendil-works/pi-agent-core`）。在 runtime 主干上叠加写作助手、个人任务助理、记忆协作等扩展能力。

- **架构定位**：Lumen product shell + Pi-powered runtime。详见 `Docs/specs/2026-05-12-pi-powered-runtime-strategy.md`。
- **主干**：对标 Claude Code / opencode / codex 的通用 coding agent。
- **扩展**：写作助手（`/plan`、`/draft`、`/review`、`/revise`、`.novel` 项目协议）、个人记忆与任务助理。
- **CLI + TUI** 是当前主入口（OpenTUI + React）；桌面端、常驻助手界面等 UI 形态属于后续阶段。

详细产品方向与参考策略见：
- `Docs/specs/2026-05-10-lumencli-bootstrap-direction.md`
- `Docs/specs/2026-05-10-lumencli-reference-usage-policy.md`
- `Docs/specs/2026-05-12-pi-powered-runtime-strategy.md`
- `Docs/specs/2026-05-12-fork-vs-standalone-decision.md`
- `Docs/specs/2026-05-12-upstream-intake-policy.md`
- `Docs/specs/2026-05-12-rust-helper-subprocess-policy.md`

## 平台与运行时

- **运行时**：Bun ≥ 1.3（单一运行时，替代 Node + pnpm）。
- **平台**：Phase 1 仅保证 **Windows x64**。macOS / Linux 等留待后续阶段评估。
- **终端**：Windows Terminal 或 PowerShell 7+ / cmd（需启用 VT mode）。

## 安装

1. 安装 Bun 1.3+：

   ```powershell
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

   安装后打开新 PowerShell，`bun --version` 应返回 1.3.x。

2. 克隆仓库后：

   ```powershell
   bun install
   bun run build
   ```

## 快速开始

启动交互式 TUI：

```powershell
bun run dev:cli
```

常用操作：

- 输入 `/` 弹出命令列表（方向键选择，Enter 确认）
- **Tab** 切换主代理（Build ↔ Plan）
- `/model` 切换主模型（弹窗选择）
- `/model preset list` 查看路由预设
- `/model status` 查看各子系统当前路由到哪个模型
- `/agent` 查看可用代理（主代理 + 子代理）
- Ctrl+C 中断当前 run，Ctrl+D 退出

单次 prompt 模式（适合脚本调用）：

```powershell
bun --conditions development apps/cli/src/main.tsx --once "你好"
```

## 与 Lumen-Rebuild 的关系

`Lumen-Rebuild` 是小说写作工作台和本地优先写作协议的重要来源，尤其是：

- `.novel` 项目协议
- project memory / continuity 能力
- 写作命令 `/plan`、`/draft`、`/review`、`/revise`
- agent kernel、command system、prompt asset 的既有设计

但 LumenCli 不等同于 Lumen-Rebuild CLI。写作是它的第一个特色扩展，不是产品边界。

## 参考项目

本地参考源码（均由 `.gitignore` 排除，不提交到远程）：

| 目录 | License | 角色 |
| --- | --- | --- |
| `references/pi` | MIT | **Runtime 主线**：`@earendil-works/pi-ai` + `@earendil-works/pi-agent-core` 作为核心 agent runtime。 |
| `references/oh-my-pi` | MIT | pi 深度 fork，coding 工具 / 子代理设计借鉴来源 |
| `references/opencode` | MIT | 多模型路由 / session / coding prompt 架构参考 |
| `references/opentui` | MIT | TUI 框架（`@opentui/core` + `@opentui/react` + `@opentui/keymap`） |
| `references/codex` | Apache-2.0 | **设计参考**：memory pipeline / apply-patch / sandbox / MCP 双端（不作 runtime 依赖） |
| `references/ClaudeCodeRev` | Anthropic 闭源逆向 | Private-Project Exemption 下的 prompt / UX 设计参考 |

**架构验证样本**：`openclaw/openclaw`（未本地克隆）采用同构"Pi-powered runtime + 自定义产品层"架构，作为 LumenCli 路线的外部验证。详见 `Docs/specs/2026-05-12-pi-powered-runtime-strategy.md` §5。

详见 Reference Usage Policy。

## 初始原则

- **Pi-powered runtime + Lumen product shell**：Lumen 掌控 CLI / TUI / 命令 / 权限 / 上下文 / 记忆 / 写作 / prompt 策略；Pi 掌控 event loop / streaming / tool-call / provider。两者只在 `@lumen/model-provider` 与 `@lumen/agent-core` 的 adapter 文件接触。
- 主干采用 tier-1 MIT 项目的成熟设计（"站在巨人肩膀上"）。
- 写作扩展优先复用 `Lumen-Rebuild` 的成熟设计。
- **Pi 类型零外泄**：产品层包（tools / permissions / context / memory / writing / command-system / config / prompts / mcp / cli）grep `@earendil-works` 必须返回零。
- 所有借鉴与迁移必须在文件 frontmatter 标注 `source`，便于 triage。
- Upstream Intake 按 `Docs/specs/2026-05-12-upstream-intake-policy.md` 的 Scheduled / Patch / Opportunistic / Security 四档节奏执行。

## 当前工程骨架

Bun workspaces + TypeScript project references：

```text
apps/
  cli/                CLI 入口（Bun 运行时）+ TUI（OpenTUI + React）
packages/
  agent-core/         agent runtime、session、代理系统、子代理 runner、
                      内置命令注册、Pi-agent 适配器
  command-system/     命令注册、解析、执行模型
  config/             provider/model 配置 + RoutingEngine + PresetStore
  context/            AGENTS.md / LUMEN.md / 工作区摘要 / memory / .novel 项目注入
  memory/             memory store 抽象，JSONL 持久化
  mcp/                MCP stdio client + config loader + auto-connect
  model-provider/     provider 实现（当前接入 @earendil-works/pi-ai）
  permissions/        权限引擎（PermissionMode × decide）
  prompts/            prompt asset 入口 + skills / templates loader
  shared-schema/      共享基础类型
  tools/              本地 core tools
  writing/            小说写作命令，后续迁移 Lumen-Rebuild 能力
scripts/              24 条 smoke 脚本与共享 helpers
references/           只读参考项目（gitignored）
Docs/                 plans / specs / reports
```

## 开发命令

所有命令在 Bun 下运行：

```powershell
bun install
bun run build
bun run typecheck
bun run dev:cli
bun run smoke:all
```

单独跑某一类 smoke（全列表见 `package.json` 的 `scripts.smoke:*`）：

```powershell
bun run smoke:cli
bun run smoke:boundaries
bun run smoke:model-catalog
bun run smoke:model-switch
bun run smoke:context
bun run smoke:tui-render
# ... 总计 24 条
```

### OpenAI-compatible provider 自定义配置

默认 `packages/config` 指向本机 mimo-v2.5-pro（编程特化）的 baseUrl / model，但 **API key 不写入源码**，必须通过环境变量或 CLI 参数提供。覆盖环境变量：

```powershell
$env:LUMEN_API_KEY="..."
$env:LUMEN_BASE_URL="https://api.openai.com/v1"
$env:LUMEN_MODEL="<openai-compatible-model>"
bun --conditions development apps/cli/src/main.tsx --once "用一句话介绍你自己"
```

禁用本地默认配置（用于 smoke 或切换到无 key 模式）：

```powershell
$env:LUMEN_DISABLE_LOCAL_DEFAULTS="1"
```

## 当前能力

- **Provider**：OpenAI-compatible 接入（通过 `@earendil-works/pi-ai`），支持 streaming。
- **默认配置**：本机 mimo-v2.5-pro（编程特化，主模型）+ mimo-v2.5（多模态，vision）。
- **多模型系统**：用户通过 `/model` 选择主模型（简洁列表，像 opencode），高级用户可在 `~/.lumen/config.json` 定义 `presets` 预设模板来按子系统（coding/vision/writing/fast/long-context）路由不同模型。Vision 自动降级：主模型不支持 vision 时自动找 vision-capable 模型。
- **Agent 系统**：两层分工，对标 opencode。主代理 Build（全权限）和 Plan（只读分析）可通过 **Tab 键**切换；子代理 Task（隔离执行）和 Explore（只读搜索）由主代理通过 `lumen.task` tool 调度。用户可在 `~/.lumen/agents/*.md` 扩展自定义代理（YAML frontmatter + prompt body 格式）。
- **Agent runtime**：Pi-powered（`@earendil-works/pi-agent-core`），含完整 event loop、tool-call loop、streaming；对外通过 `LumenAgent.run()` 发 `run_start / turn_start / message_* / tool_call_* / permission_required / primary_model_changed / preset_activated / turn_end / run_end / error` 事件。
- **TUI**：OpenTUI + React（ChatView / StatusBar / CommandBar + 命令建议弹窗 + 模型选择器 + 权限模态）。`apps/cli/src/core/**` 与 `apps/cli/src/ui/react/**` 严格分层，`core/` 零 UI 依赖（由 `smoke:boundaries` 强制）。状态栏显示 `○ 就绪 │ build │ model-id │ ~/cwd`。
- **Core tools**：`clock.now`、`fs.readText`、`fs.list`、`fs.writeText`、`project.search`、`shell.run`、`lumen.task`（子代理调度），通过 `toPiAgentTool` adapter 注入 Pi runtime。
- **Permission contract**：按 risk / readOnly / destructive / openWorld 决策。主代理的 permission 定义在切换时生效（Plan 模式自动 denyDangerous，拒绝 write/shell）。ask 决策触发 `permission_required` 事件 + PermissionModal（Enter/Y 允许 / N 拒绝 / Esc 取消）+ `respondToPermission(requestId, decision)` 回调。
- **MCP stdio client + config loader + auto-connect**：从 6 级候选路径（`~/.lumen` / `~/.claude` / workspace / generic `.mcp.json`）发现配置，兼容 Claude Code drop-in 格式；交互模式启动时自动连接并注入 `ToolRegistry`，退出时通过 exit / SIGINT / SIGTERM 清理子进程。`LUMEN_DISABLE_EXTERNAL_MCP` / `LUMEN_DISABLE_CLAUDE_MCP` 可关闭外部源。
- **Context assembler**：读取 `AGENTS.md` / `LUMEN.md` / `.lumen/context.md` / 工作区摘要 / recent messages / memory / `.novel` 项目信息（检测到 `.novel/` 时自动注入标题 / 简介 / 手稿文件列表）。
- **JSONL memory**：默认 `~/.lumen/memory.jsonl`，支持 `LUMEN_MEMORY_PATH` 覆盖。
- **Writing command pack**：`/plan`、`/draft`、`/review`、`/revise` 可调用 provider（走 Pi 的 headless 单轮路径），provider 缺失时 fallback。
- **CLI 命令**：`/help`、`/status`、`/tools`、`/config`、`/model`、`/model preset`、`/model status`、`/agent`、`/skills`、`/templates`、`/memory`、`/remember`、`/plan`、`/draft`、`/review`、`/revise`。输入 `/` 弹出命令建议（方向键选择 + Enter 确认）。
- **Skills + prompt templates + agents loader**：扫描 `~/.lumen/` / `~/.claude/` / `~/.agents/` 和工作区同名目录下的 skills / commands / agents markdown 文件，later-wins 合并；`LUMEN_DISABLE_EXTERNAL_SKILLS` / `LUMEN_DISABLE_CLAUDE_SKILLS` / `LUMEN_DISABLE_EXTERNAL_AGENTS` 可关闭。
- **Session repo**：JSONL 记录 `session_start` / `message` / `session_end`；默认 `%USERPROFILE%\.lumen\sessions\<id>.jsonl`，`LUMEN_SESSION_DIR` 可覆盖。交互模式默认启用，headless `--once` 需 `LUMEN_PERSIST_SESSION=1` 打开。

## 当前限制

- **上下文 compaction** 已有 Phase 1 最小实现（token 估算 + 早期消息摘要 + 保留最近消息），但 LLM summarizer 仍为 deterministic fallback；codex 风格两阶段长期记忆流水线仍是 Phase 2+。
- `.novel` 专项的 artifact 写回和连续性检查尚未做（当前只有项目信息注入，已覆盖 S1.8 基础部分）。
- 永久记忆（codex 两阶段流水线）为 Phase 2+ 占位（S1.13）。
- 自我迭代（observer / proposer / reviewer）为 Phase 2+ 占位（S1.14）。
- vitest 测试框架已接入；当前仍保留 24 条 smoke 脚本，部分脚本会各自 spawn build，后续可优化执行速度。
- Rust native host、Tauri、二进制分发均为后续阶段；Rust helper 子进程在特定能力（sandbox）满足准入条件时按独立 spec 引入。
- 仅 **Windows x64** 验证通过；其他 OS/arch 未纳入 Phase 1。

## 依赖体积说明

`@earendil-works/pi-ai` 会拉入多家 provider SDK（Anthropic / AWS Bedrock / Google GenAI / Mistral 等），导致 `node_modules` 体积较大。这是换取"多 provider 开箱即用"的合理代价。未来如果需要裁剪，将按 Reference Usage Policy 走独立 spec 决策。

## 构建决策

### 架构定位

LumenCli = **自定义智能体框架 + 产品壳**（CLI / TUI / 命令 / 权限 / 上下文 / 记忆 / 写作 / prompt 策略 / 中文规则），**Pi 作为核心 agent runtime**（event loop / streaming / tool-call / provider / session / compaction）。两者只在 `@lumen/model-provider` 与 `@lumen/agent-core` 的 adapter 文件接触。详见 `Docs/specs/2026-05-12-pi-powered-runtime-strategy.md`。

### 技术栈来源

- **Bun** 取代 Node + pnpm：快速启动、原生 TS、`bun:ffi` 支持 OpenTUI 原生加载。
- **`@earendil-works/pi-ai`**（已接入）：tier-1 MIT 依赖，提供多 provider、OAuth、streaming、tool-call 结构化消息。
- **`@earendil-works/pi-agent-core`**（已接入，P2 + P3）：tier-1 MIT 依赖，Pi 的 agent runtime 内核（event loop、tool-call loop、steering、compaction）。
- **`@opentui/core` + `@opentui/react`**（已接入，P1.5b）：tier-1 MIT 依赖，Zig 原生终端渲染引擎。
- **ClaudeCodeRev**（Private-Project Exemption 下）：prompt / UX 设计参考；不作 runtime 依赖，不复制源码。
- **`openai/codex`**（Apache-2.0，仅设计参考）：memory pipeline / apply-patch / sandbox / MCP 双端 / skills 架构。Rust 代码不迁移。
- **`openclaw/openclaw`**（架构验证样本，未作 runtime 依赖）：证明"Pi-powered runtime + 自定义产品层"路线的生产级可行性。
- **Lumen-Rebuild**：写作扩展迁移来源。

### TypeScript + Bun，Rust 后置

第一阶段使用 Bun + TypeScript 构建 agent brain + product shell；Rust 作为独立 helper 子进程**按需**引入（见 `Docs/specs/2026-05-12-rust-helper-subprocess-policy.md`），不改主干语言。主干永远不切 Rust。
