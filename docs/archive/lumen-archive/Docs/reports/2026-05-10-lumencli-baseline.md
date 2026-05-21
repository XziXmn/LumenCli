# LumenCli Baseline Report

日期：2026-05-10

## 当前状态

`LumenCli` 已建立为独立 CLI-first personal AI agent 项目，并已连接远程仓库：

- 远程仓库：`https://github.com/XziXmn/LumenCli.git`
- 当前分支：`main`
- 初始提交：`3f7d630 chore: 初始化 LumenCli 工程骨架`

## 已完成基线

- pnpm workspace。
- TypeScript project references。
- 最小 CLI 入口：`apps/cli`。
- 最小 agent runtime：`packages/agent-core`。
- 命令系统、prompt、memory、tools、writing、shared schema 的初始包边界。
- Phase 1 Blueprint：`Docs/plans/2026-05-10-lumencli-phase1-agent-mvp-blueprint.md`。
- 初始构建方向规格：`Docs/specs/2026-05-10-lumencli-bootstrap-direction.md`。

## 当前验证命令

```powershell
pnpm clean
pnpm build
pnpm typecheck
pnpm smoke:cli
pnpm smoke:provider
pnpm smoke:permissions
pnpm smoke:tools
pnpm smoke:mcp
pnpm smoke:context
pnpm smoke:memory
pnpm smoke:writing
pnpm smoke:ux
pnpm smoke:all
```

## S0 / S1 进展

- S0 已补安全清理脚本：`scripts/clean.mjs`。
- S0 已补 CLI smoke：`pnpm smoke:cli`。
- S1 已新增 `packages/config`，支持 `LUMEN_API_KEY`、`LUMEN_BASE_URL`、`LUMEN_MODEL` 与 CLI override。
- S1 已新增 `packages/model-provider`，支持 OpenAI-compatible `/chat/completions` 非流式调用。
- S1 已补 `pnpm smoke:provider`，使用本地 mock OpenAI-compatible server 验证 CLI provider 路径。
- S2 已将 agent-core 升级为事件流模型，CLI 通过 `message_delta` 渲染 assistant 输出。
- S3 已新增 `packages/permissions`，定义 permission mode、risk、capability 与 allow/deny/ask 决策。
- S3 已扩展 tool contract，工具 metadata 包含 risk、capabilities、readOnly、destructive、openWorld。
- S3 已补 `pnpm smoke:permissions`，验证 read-only 工具自动允许与未知工具拒绝路径。
- S4 已接入 core tools：`fs.readText`、`fs.list`、`fs.writeText`、`project.search`、`shell.run`。
- S4 已补 `pnpm smoke:tools`，验证 read/search 自动允许、write/shell 默认需要确认、显式 allow 后 shell 可执行。
- S5 已新增 `packages/mcp`，支持 stdio MCP server 连接、`listTools`、`callTool`，并将 MCP tool 映射为 Lumen tool contract。
- S5 已补 `pnpm smoke:mcp`，使用本地 mock MCP stdio server 验证工具发现、权限决策与调用路径。
- S6 已新增 `packages/context`，读取 `AGENTS.md`、`LUMEN.md`、`.lumen/context.md`、工作区概览、recent messages 与 memory。
- S6 已将 context assembler 接入 agent provider system prompt。
- S6 已补 `pnpm smoke:context`，验证规则文件、工作区摘要、recent messages 与 memory 注入。
- S7 已将 memory 扩展为 JSONL 持久化，默认路径为用户目录 `.lumen/memory.jsonl`，并支持 `LUMEN_MEMORY_PATH` 覆盖。
- S7 已接入 `/remember --kind <kind> <content>` 与 `/memory --kind <kind>`。
- S7 已补 `pnpm smoke:memory`，验证跨进程持久化与 CLI memory 命令。
- S8 已将 writing command pack 接入模型完成函数，`/plan`、`/draft`、`/review`、`/revise` 在 provider 可用时调用 LLM，不可用时保留 fallback。
- S8 已补 `pnpm smoke:writing`，使用本地 mock provider 验证 `/draft` 调用模型路径。
- S9 已补 CLI runtime introspection 命令：`/tools`、`/config`、`/model`。
- S9 已补 `pnpm smoke:ux`，验证工具列表、配置摘要、模型状态和帮助入口。
- S10 已补 `pnpm smoke:all` 和 `Docs/reports/phase1-verification.md` 作为 release gate。
- CLI 普通 prompt 在未配置 provider 时会输出明确配置错误；slash command 不依赖 provider。

## 已知限制

- OpenAI-compatible provider 已接入；尚未在本机用真实外部 API key 验证。
- 尚未接入流式模型输出。
- 尚未实现 tool-call loop。
- 权限系统已有基础 contract；尚未接入真实 write/shell 工具确认交互。
- MCP stdio client 已有最小实现；尚未接入用户配置文件和 CLI `/tools` 展示。
- context assembler 已有通用入口；尚未接入 `.novel` 专项上下文。
- memory 已有 JSONL 持久化；尚未迁移到 SQLite 或接入自动摘要。
- 写作命令已接入模型路径；尚未接入 `.novel` 专项上下文和 artifact 写回。
- CLI 仍是最小 readline shell，尚未做完整 TUI。

## 忽略与产物策略

- `references/` 仅作为本地参考源码，不提交。
- `node_modules/`、各级 `dist/`、`*.tsbuildinfo` 不提交。
- `pnpm clean` 只清理当前 workspace 内明确列出的构建产物目录。

## P1 进展（2026-05-10）

- `@lumen/model-provider` 接入 `@earendil-works/pi-ai` 0.74.0 作为底层 provider，保留 `createOpenAiCompatibleProvider` 作为向后兼容 wrapper。
- `@lumen/config` 升级为 `LumenProviderConfig` 结构，新增 `providerId`、`visionModel` 字段，内置本地 mimo-v2.5 默认值。
- smoke 脚本升级为支持 streaming 的 OpenAI-compatible mock server（`scripts/lib/mock-openai.mjs` 抽取共享），以适配 pi-ai 默认 streaming 请求。
- `smoke:all` 全绿。真实 mimo-v2.5 端点端到端验证通过。

## P1.5a 进展（2026-05-10，Bun 切换）

- 运行时由 Node 22 + pnpm 10.18 完全切换到 **Bun 1.3.13**。
- `package.json`：`engines.bun: ">=1.3.0"`、删 `packageManager`、删 `tsx` 依赖；根 `workspaces: ["apps/*", "packages/*"]`。
- 删除 `pnpm-lock.yaml`、`pnpm-workspace.yaml`；生成 `bun.lock`。
- 所有 `scripts.*` 命令改为 `bun` 前缀（`bun run build` / `bun scripts/*.mjs` / `bun --conditions development ...`）。
- `scripts/lib/run-cli.mjs` 抽取为共享 helper，统一 spawn `bun`。
- 四个 smoke 脚本（`smoke-memory` / `smoke-writing` / `smoke-ux` / `smoke-openai-compatible`）改用新 helper。
- `.gitignore` 加 `.bun-cache/`。
- Bun 兼容性扫描（见 `Docs/reports/2026-05-10-bun-compat-scan.md`）全绿，所有 Node builtins + `@earendil-works/pi-ai` + `@modelcontextprotocol/sdk` 在 Bun 下通过。
- `bun run smoke:all` 全绿。真实 mimo-v2.5 端到端验证通过。

## 当前验证命令（P1.5a 后）

```powershell
bun run clean
bun run build
bun run typecheck
bun run smoke:cli
bun run smoke:provider
bun run smoke:permissions
bun run smoke:tools
bun run smoke:mcp
bun run smoke:context
bun run smoke:memory
bun run smoke:writing
bun run smoke:ux
bun run smoke:all
```

## 忽略与产物策略（P1.5a 后）

- `references/` 仅作为本地参考源码，不提交。
- `node_modules/`、各级 `dist/`、`*.tsbuildinfo`、`.bun-cache/` 不提交。
- `bun run clean` 只清理 workspace 内明确列出的构建产物目录。
- `bun.lock` **提交**（相当于 Bun 版 pnpm-lock.yaml）。

## P1.5b 进展（2026-05-10，OpenTUI 环境探活）

- `apps/cli` 引入 `@opentui/core@0.2.6` / `@opentui/react@0.2.6` / `@opentui/keymap@0.2.6` / `react@19.2.6`。
- `apps/cli/src/tui-hello.tsx` 最小 probe 在 Bun 1.3.13 + Windows x64 下渲染通过：border、padding、flex、`<text>` 彩色 span、React state tick、`useKeyboard` 退出全部正常。
- Zig native addon 经由 `@opentui/core/platform/ffi.ts` + `bun:ffi` 自动加载。
- CJK 渲染通过。
- 现有 `smoke:all` 在新增依赖后仍然全绿。
- 结论：OpenTUI + React + Bun + Windows x64 链路可用。

步骤 1–3 未启动，待 P2 完成后再回到 TUI 主线。

## P2 进展（2026-05-10，P2.1 agent-core 适配层）

- `packages/agent-core` 引入 `@earendil-works/pi-agent-core@0.74.0` 与 `@earendil-works/pi-ai@0.74.0`。
- 新建 `packages/model-provider/src/internal.ts` + `./internal` subpath export，让 `@lumen/agent-core` 能取到 `LumenModelHandle` 背后的 pi Model + apiKey resolver，同时不污染公开 `index.ts`。
- 新建 `packages/agent-core/src/pi-agent-adapter.ts`：`createLumenPiAgent({ modelHandle, systemPrompt, tools, ... })` 返回一个已绑定 provider 的 pi-agent-core `Agent`，供 LumenAgent 内部使用。pi-* 类型只在本文件可见。
- 新增 `scripts/smoke-pi-agent.mjs`，端到端验证：LumenModel → pi-agent-core Agent → streaming assistant turn → 事件序列。
- `smoke:all` 追加 `smoke:pi-agent`，全链路全绿。
- P2.1 验证了 pi-agent-core npm 包公开 API (`Agent / agentLoop / runAgentLoop / runAgentLoopContinue / agentLoopContinue / streamProxy`) 足以驱动 LumenCli 内核；`AgentHarness` 及 skills/compaction/session/prompt-templates 等 harness 模块未导出，P4 阶段按需自写或从 pi 源码 adapt。
- 参考 oh-my-pi 和 opencode 的接入方式后，确认 LumenCli 的 `beforeToolCall` + `@lumen/permissions` 路径与 pi-agent-core 兼容（hook 返回 `Promise<BeforeToolCallResult>`，可 await）。

P2.2（事件映射 + LumenAgent 契约）与 P2.3（slash 分流）未启动。

## P2.2 进展（2026-05-10，事件映射 + LumenAgent pi-agent 路径）

- 新建 `packages/agent-core/src/event-queue.ts`：push → pull bridge（pi `agent.subscribe()` → LumenCli `AsyncGenerator<AgentEvent>`）。
- 新建 `packages/agent-core/src/event-mapper.ts`：`PiAgentEventMapper` 单 run 状态机，映射 pi 事件到 LumenCli 对外 `AgentEvent`；把 pi `AssistantMessage.content` 的 text/thinking/toolCall 扁平化为 LumenCli `content: string`；text_delta 映射为 `message_delta`。
- 新建 `packages/agent-core/src/public-types.ts`：把 `AgentEvent` 类型拆出，供 mapper / adapter 内部复用。
- `LumenAgent`：
  - 新增 `modelHandle?` 和 `usePiAgent?` options。
  - `resolveUsePiAgent()` 支持 explicit + `LUMEN_USE_PI_AGENT` 环境变量。
  - `runWithPiAgent(runId, input)`：构造临时 pi Agent，subscribe + queue + async yield。
  - 旧 `modelProvider.complete` 路径作为默认回退保留。
- `apps/cli/src/main.ts` 同时构造 `modelProvider` + `modelHandle` 传给 LumenAgent。
- 新增 `scripts/smoke-agent-run.mjs`，纳入 `smoke:all`。
- 真实 mimo-v2.5 验证：默认 legacy 路径和 `LUMEN_USE_PI_AGENT=1` 新路径都产出正常中文回复。

## P2.3 进展（2026-05-10，completeCommandPrompt 切 pi-agent 单轮）

- `LumenAgent.completeCommandPrompt` 在 `usePiAgent && modelHandle` 下走新 `completeCommandPromptWithPiAgent`：headless pi Agent 跑一次，session 不污染；旧 `modelProvider.complete` 路径仍作为回退保留。
- 通过 `flattenAssistantText` 把 pi `AssistantMessage.content` 扁平化为纯文本返回给 slash 命令。
- `smoke:writing` 验证老路径；`LUMEN_USE_PI_AGENT=1` + `/draft 雨夜重逢` 端到端走 mimo-v2.5 验证新路径。
- `smoke:all` 全绿。

P2 整体完成。下一步 P3（tool 适配 + 权限 hook）。
