# LumenCli Pi-Powered Runtime Strategy

日期：2026-05-12
状态：Decision — **LumenCli 正式定位为"CLI-first 自定义智能体框架与产品壳，核心 agent runtime 由 Pi 驱动"**。
依赖文档：
- `Docs/specs/2026-05-10-lumencli-pi-agent-core-decision.md`
- `Docs/specs/2026-05-10-lumencli-reference-usage-policy.md`
- `Docs/specs/2026-05-12-fork-vs-standalone-decision.md`
- `Docs/specs/2026-05-12-rust-helper-subprocess-policy.md`
- 配套 spec：`Docs/specs/2026-05-12-upstream-intake-policy.md`

## 0. 目的

把 LumenCli 与 Pi 的架构关系一次性讲清楚，供未来所有新会话、代码评审、重构决策引用。本 spec 不改变任何已落地行为，只固化已实际采用的架构定位和边界。

## 1. 一句话定义

> LumenCli is a CLI-first custom agent framework and product shell powered by Pi as the core agent runtime.
>
> LumenCli 是一个 CLI-first 的自定义智能体框架与产品壳，核心 agent runtime 由 Pi 驱动。

这**不是**：

- Pi 换皮或 fork。
- 从零自研 runtime。
- 把 Pi 的类型系统直接暴露到产品层。

这**是**：

- Lumen 自己的产品边界 + 框架契约 + 自写 UX + 中文规则体系，**保持完整**。
- Pi 作为 runtime 内核（event loop、streaming、tool-call 循环、session、provider 抽象）**被嵌入**而不是被继承。
- Pi 变化被限制在 adapter 边界层（`@lumen/model-provider` + `@lumen/agent-core` 内部）内吸收。

## 2. 为什么正式化这条定位

之前几份 spec 各自处理了一块：

- `lumencli-pi-agent-core-decision.md` 决定"接入 pi-agent-core 而非自写 loop"。
- `lumencli-reference-usage-policy.md` 定义"pi 作为 npm 依赖，类型不外泄"。
- `fork-vs-standalone-decision.md` 证明"不整体 fork pi / oh-my-pi / codex"。

但没有一份 spec 把这三个事实**合成一个架构定位**。结果是：新会话每次都要从多个角度重新推导；新人读到"pi 作为依赖"时不理解 Pi 在 runtime 里的实际主导地位；读到"standalone"时又误以为一切都是自写。

本 spec 合成：Pi 是 runtime 主线；Lumen 是产品壳与框架契约；adapter 边界层是两者的唯一接触面。

## 3. 能力边界（职责分摊）

### 3.1 LumenCli 掌控

- **CLI / TUI 层**：`apps/cli/src/main.tsx` + `apps/cli/src/ui/react/**`（OpenTUI + React）。
- **Core 层**（UI 无关、框架无关）：`apps/cli/src/core/**`（ViewStore / ActionDispatcher / event-bus / key-bindings）。
- **命令系统**：`@lumen/command-system` 的 CommandRegistry、slash 命令约定、中文 summary / 英文命令名规则。
- **写作扩展**：`@lumen/writing` 的 `/plan /draft /review /revise` + `.novel` 协议（未来 S1.8）。
- **上下文组装**：`@lumen/context` 的 AGENTS.md / LUMEN.md / 工作区摘要 / recent messages / memory 注入。
- **权限引擎**：`@lumen/permissions` 的决策逻辑与用户可见 UX。
- **记忆**：`@lumen/memory`（短期 JSONL），未来 `@lumen/long-term`（Phase 2+，采用 codex 两阶段流水线）。
- **MCP 配置**：`@lumen/mcp` 的配置加载、drop-in 兼容（`.claude/mcp.json` / `.mcp.json`）。
- **Prompt 策略**：`@lumen/prompts` 的 asset 组织、language rules（中文 UI / 英文 AI / 写作中文）、provider-aware 分发。
- **对外类型契约**：
  - `AgentEvent`（`@lumen/agent-core/public-types.ts`）—— 产品层与 agent-core 的唯一事件协议。
  - `LumenTool / ToolRegistry`（`@lumen/tools`）—— 工具定义与执行契约。
  - `LumenCommand / CommandRegistry`（`@lumen/command-system`）。
  - `PermissionEngine / PermissionDecision`（`@lumen/permissions`）。
  - `AgentMessage / AgentSession`（`@lumen/shared-schema`）。
  - `PermissionPromptDecision`（`@lumen/agent-core`）。

以上类型**绝不**依赖 `@earendil-works/pi-*`。

### 3.2 Pi 掌控或优先驱动

- **Model 抽象与 provider 实现**：`@earendil-works/pi-ai` 提供 OpenAI-compatible / Anthropic / Google / Mistral / AWS Bedrock 等的 provider 路径、OAuth、streaming、token 估算。
- **Agent event loop**：`@earendil-works/pi-agent-core` 的 `Agent` 类——负责 prompt → LLM → tool-call → tool execute → next turn 的完整生命周期。
- **Streaming**：provider → agent 的 text_delta / thinking_delta / toolcall_delta 事件流。
- **Tool-call loop**：validate args → beforeToolCall hook → execute → afterToolCall hook → tool result → next turn。
- **Session 持久化**（未来 S1.6+）：pi-agent-core 的 session repo（jsonl / memory / tree 变体）。
- **Compaction**（未来 S1.13 + P4）：`shouldCompact / compact / estimateContextTokens`。
- **Skills / prompt-templates loader**（未来 P4）：pi-agent-core 的 `loadSkills / loadPromptTemplates`，扫描路径由 LumenCli 指定。
- **Abort / retry / timeout**：pi-agent-core 的 AbortController 贯穿 + provider 的 maxRetries / maxRetryDelayMs。

## 4. Adapter 边界层（唯一接触面）

Pi 与 LumenCli 两个宇宙的接触**必须**经过以下文件。任何新增接触路径都需要独立 spec 审批。

| 接触面 | 位置 | 职责 |
| --- | --- | --- |
| Model binding | `packages/model-provider/src/pi-ai.ts` | 把 LumenProviderConfig 封装成 `LumenModelHandle`，Pi 的 `Model<any>` 藏在 symbol-keyed slot 里。 |
| Package-internal subpath | `packages/model-provider/src/internal.ts` + `"./internal"` export | 仅供 `@lumen/agent-core` 内部 import，提取 PiAgentBinding（包含 `PiModel<any>` + `resolveApiKey`）。不走 public entry。 |
| Pi agent adapter | `packages/agent-core/src/pi-agent-adapter.ts` | `createLumenPiAgent()` 构造 pi-agent-core `Agent` 实例，绑定 model + tools + hooks。 |
| Event mapper | `packages/agent-core/src/event-mapper.ts` | pi `AgentEvent` → LumenCli `AgentEvent` 的单向转换。`PiAgentEvent` 类型**只**在这里可见。 |
| Event queue | `packages/agent-core/src/event-queue.ts` | 把 pi-agent-core 的 subscribe 回调转为 AsyncIterable。 |
| Tool adapter | `packages/agent-core/src/tool-adapter.ts` | `toPiAgentTool` / `createBeforeToolCallHook`。**typebox 只在此文件出现**。 |
| Permission resolver | `packages/agent-core/src/permission-resolver.ts` | async latch：permission_required 事件等待用户决定。 |

**硬约束**：

- `@lumen/agent-core` 对外（通过 `dist/index.d.ts`）**绝不**导出 `@earendil-works/pi-*` 的类型。已验证通过 P2、P3 两轮。
- `@lumen/model-provider` 对外只导出 `LumenModelHandle`（opaque）+ `ModelProvider`（legacy path）。不导出 `PiModel<any>`。
- 产品层包（`@lumen/tools` / `@lumen/permissions` / `@lumen/context` / `@lumen/memory` / `@lumen/writing` / `@lumen/command-system`）**完全**不识别 Pi 存在。把这些包的 `package.json` 与源码 grep `@earendil-works` 应返回零结果。
- `apps/cli/src/core/**` 与 `apps/cli/src/ui/**` 也完全不识别 Pi 存在。由 `smoke:boundaries` + 未来 ESLint 保障。

## 5. 外部验证：OpenClaw 的 embedded Pi runtime

用户独立调研 `openclaw/openclaw`（commit `0793775a6671fa5768427dbfb494c7184704d8ca`，只读分析，未构建），发现 OpenClaw 采用**同构架构**：

- OpenClaw 是一个自定义智能体产品与 Gateway 平台，**不是** Pi 换皮。
- 但底层 runtime 主线是 embedded Pi：直接依赖 `@earendil-works/pi-agent-core` / `pi-ai` / `pi-coding-agent` / `pi-tui`。
- OpenClaw 自己拥有：session management、discovery、tool wiring、channel delivery、sandbox、subagent、approval prompt、product-owned system prompt / tool summaries。
- OpenClaw 的 runner 直接使用 `createAgentSession` / `SessionManager`。
- OpenClaw 自己写 `pi-tool-definition-adapter.ts` 把内部工具转成 Pi tool definitions，并在执行前接 hook/policy。
- OpenClaw 在 Pi 外层加了若干健壮性 wrapper：tool name trim、malformed tool-call repair、tool argument repair、idle timeout、provider-specific stream wrapper。

这证明"Pi-powered runtime + 自定义产品/框架层 + adapter/policy 边界"是**已有生产级样本**的路线，不是 LumenCli 的孤例。

### 5.1 引用约束

OpenClaw 不是 LumenCli 的 tier-1 运行时依赖源。在本 spec 中只作为**架构验证参考**（reference case），不触发代码级借鉴。若未来要借鉴 OpenClaw 某个具体子系统的实现（例如 tool name trim wrapper），走 Reference Usage Policy §9 决策变更协议，在那份 spec 里新增 tier 或专项 source 标注值。

在 OpenClaw 的仓库被克隆到 `references/openclaw/` 之前（如果确实要），避免在 LumenCli 代码中直接引用"OpenClaw 源码说……"。当前 spec 使用"OpenClaw 作为架构样本证明路线可行"这一层次。

## 6. 与其他 spec 的关系

- `lumencli-pi-agent-core-decision.md`：提供了"为什么选 pi-agent-core"的决策过程。本 spec 承接其结论并升级为产品级定位。
- `lumencli-reference-usage-policy.md`：定义了 `@earendil-works/pi-*` 作为 npm 依赖的 license / 类型 / 版本 pin 边界。本 spec 不改变这些边界，只明确 Pi 在 runtime 中的主导地位。
- `fork-vs-standalone-decision.md`：证明了"不 fork pi / oh-my-pi / codex"的决策。本 spec 是那份 decision 的**正向陈述**：不 fork 的条件下，Pi 到底承担什么。
- `upstream-intake-policy.md`（新）：定义 Pi 版本升级 + OpenClaw / codex 设计吸收的实际流程。
- `rust-helper-subprocess-policy.md`：定义 Pi 做不到或做不好的特定能力如何通过 Rust helper 引入。

## 7. 硬约束清单（强制）

以下是本 spec 引入的可执行约束，未来新代码必须满足：

1. **Pi 类型零外泄**：在 `@lumen/tools`、`@lumen/permissions`、`@lumen/context`、`@lumen/memory`、`@lumen/writing`、`@lumen/command-system`、`@lumen/config`、`@lumen/prompts`、`@lumen/shared-schema`、`@lumen/mcp`、`apps/cli` 的所有源码里，`grep -rE "@earendil-works"` 必须返回零结果。
2. **public entry 零外泄**：`@lumen/model-provider` 与 `@lumen/agent-core` 的 `src/index.ts` 导出的类型签名，展开后不含任何 `@earendil-works/*` 命名空间的类型。子路径导出（如 `/internal`）只供同仓内部使用。
3. **Adapter 文件清单固定**：新增任何触碰 Pi 类型的文件，必须先在本 spec §4 表格里登记。意外增加的 adapter 文件需通过 spec 补登或删除。
4. **typebox 单文件约束**：`typebox` import 只允许出现在 `packages/agent-core/src/tool-adapter.ts`。未来若需扩展，走独立 spec。
5. **文档语境统一**：提到 Pi 时用"Pi-powered runtime"或"底层 runtime 由 Pi 驱动"。不再使用可能混淆的"只是一个依赖"或"换皮"说法。

## 8. 对已完成工作的重新诠释（不改代码）

以下是把已有落地成果按本 spec 的新定位重新标注（不改代码，只改叙述）：

- **P1（pi-ai 接入）** = Adapter 边界的 model binding 建立。
- **P2（agent-core 内核替换）** = Adapter 边界的 event mapper + agent runner 建立。
- **P3（tool adapter + permission hook）** = Adapter 边界的 tool adapter + hook 建立，Pi tool-call loop 完整接通产品层权限引擎。
- **P1.5b（TUI Foundation）** = Product shell 的 UI 层就位，`core/` 与 `ui/react/` 分层、与 Pi 零接触。

这些不是"逐步接入依赖"，是"逐步搭建 Pi-powered runtime + Lumen product shell 架构的 adapter 边界"。

## 9. 不在范围内

- 改变 P3 之后的既有代码。
- 定义 Phase 2+ 的记忆 / 沙箱 / 自我迭代具体实施细节（它们在各自的 spec 里）。
- 引入 OpenClaw 作为 runtime 依赖或 vendor 源。

## 10. 失效条件

本 spec 的定位**不永久有效**。出现以下情况时需重新评估：

1. Pi 项目维护状态显著恶化（例如上游 ≥ 3 个月无修复或发生破坏性变更无迁移文档）。
2. Pi 版本大升级引入不可吸收的 API 破坏，且 LumenCli 已在 Phase 2+。
3. LumenCli 产品形态或平台基线变更（例如转向桌面端 / 纯 Rust / 多人维护 / 公开分发），触发 `fork-vs-standalone-decision.md` §6 的重新评估流程。

任一成立时，本 spec 与 `fork-vs-standalone-decision.md` / `upstream-intake-policy.md` 联动更新。
