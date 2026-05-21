# LumenCli pi-agent-core 接入决策 (S2.0)

日期：2026-05-10（2026-05-10 修订：组件分件清单、Runtime/Prompt 双层实施、opencode 接入多模型范式、语言规则、prompts 目录）
状态：Decision — **接入 `@earendil-works/pi-agent-core` 作为主 agent runtime**，同时接入 `@earendil-works/pi-ai` 作为 provider 源，合并 S1.5 与 S2.0 为一次深度重构。Prompt 层独立走 opencode + ClaudeCodeRev 借鉴路径。

## 0. 背景

Blueprint §12 规定 S2.0 必须在 S11 tool-call loop 启动前对 pi-agent-core 做结论性评估。当前 LumenCli 自写 event loop 已能跑单轮 prompt，但面临：

- 进入 S11 前需要 tool-call loop、streaming、并行 / 顺序工具执行、steering、follow-up、context transform 等能力。
- S1.5（pi-ai）如果只做 provider 层替换，agent-core 侧会继续自写与 pi-ai 语义并行的 event / message 模型，造成割裂。
- 用户明确要求避免两套平行实现长期共存。
- 用户判断 pi 的提示词工程成熟度低于 Claude Code，希望 prompt 层借鉴 ClaudeCodeRev。

本 spike 只读 pi / opencode / ClaudeCodeRev 源码，本 spec 的早期版本不触发代码变更。

## 1. 评估素材

### 1.1 pi-agent-core 暴露形态

`references/pi/packages/agent/src/index.ts` 同时导出：

- `Agent` 类与 `AgentOptions`（stateful runtime，transcript + event subscription + steering/follow-up 队列）。
- `agentLoop` / `agentLoopContinue` / `runAgentLoop` / `runAgentLoopContinue`（低层事件流）。
- 事件类型 `AgentEvent`、`AgentMessage`、`AgentTool`、`AgentContext`、`AgentLoopConfig`。
- Harness 层：`AgentHarness`、`execution-env`、`system-prompt`、`skills`、`prompt-templates`、`compaction` 子模块、session repo（memory / jsonl）。
- Compaction 工具：`shouldCompact`、`compact`、`generateSummary`、`estimateTokens` 等。

pi-agent-core 的 `Agent` 类与 LumenCli 当前 `LumenAgent` 的职责几乎一一对应，但语义更完整：

| 能力 | LumenCli 现状 | pi-agent-core |
| --- | --- | --- |
| 事件生命周期 | `run_start/turn_start/message_*/tool_call_*/turn_end/run_end/error` 单轮 | `agent_start/turn_start/message_{start,update,end}/tool_execution_{start,update,end}/turn_end/agent_end`，多轮循环内置 |
| Tool 执行 | 无（core tools 注册但未接入 model loop） | `executeToolCalls` 支持 parallel / sequential，带 `beforeToolCall` / `afterToolCall` hook，终止语义 `terminate` |
| Streaming | 无 | 通过 `streamAssistantResponse` 原生支持 provider 流事件（text_delta / thinking_delta / toolcall_delta） |
| Steering / Follow-up | 无 | `Agent.steer / followUp / clearAllQueues` + `PendingMessageQueue` |
| 中断 | 无 | `AbortController` 贯穿 loop、tool execute、hook |
| Context 转换 | 自写 buildContext | `transformContext` + `convertToLlm`，language-agnostic |
| Compaction | 无 | `compact / shouldCompact / estimateContextTokens` |
| Skills loader | 无 | `loadSkills`、遵循 agentskills.io 开放规范，frontmatter + SKILL.md |
| Prompt-templates loader | 无 | `loadPromptTemplates`，frontmatter + `$1 / $@ / $ARGUMENTS` 参数替换 |
| Session repo | 无 | jsonl / memory / tree storage |

### 1.2 opencode 的多模型 prompt 范式

`references/opencode/packages/opencode/src/session/system.ts` 的 `provider(model)` 函数按 `model.api.id` 模式匹配返回对应的 prompt txt：

- `gpt-4 / o1 / o3` → beast.txt
- `gpt + codex` → codex.txt
- 其他 `gpt` → gpt.txt
- `gemini-` → gemini.txt
- `claude` → anthropic.txt
- `trinity` → trinity.txt
- `kimi` → kimi.txt
- 其他 → default.txt

这是成熟的"一份 prompt 文件 + 按 provider/model 分发"模式，直接对应用户要求"同一个能力留一份 prompt 文件"和"多模型优化切换"。LumenCli 借鉴该分发**结构**，prompt **文本**独立产出。

### 1.3 ClaudeCodeRev 的 prompt 成熟度

ClaudeCodeRev 是 `@anthropic-ai/claude-code@2.1.88` 的 sourcemap 还原，system prompt、tool description、permission prompt 经过 Anthropic 生产打磨。基于 Reference Usage Policy §2 的 Private-Project Exemption，允许在 prompt 层借鉴，runtime 层不跨线。

### 1.4 依赖形状

`packages/agent` 的运行时依赖：

- `@earendil-works/pi-ai ^0.74.0`
- `typebox ^1.1.24`
- `ignore ^7.0.5`
- `yaml ^2.8.2`

pi-ai 自身依赖列表较重（Anthropic / AWS Bedrock / Google GenAI / Mistral SDK + `openai` + `undici`），这是已知的体积代价。pi-agent-core 本体没有额外 native addon。

### 1.5 类型边界

`Agent` 的对外 API 大量引用 `Model<any>`、`Message`、`AssistantMessage`、`ToolResultMessage`、`Tool<TParameters>` 等 pi-ai 类型。要在 LumenCli 边界保持"pi 类型不外泄"，必须在 `packages/agent-core` 内做一层封装（见 §4）。

## 2. 选项 A：不接入，自写加强版

含义：维持 `@lumen/agent-core` 自写 event loop，仅接入 pi-ai 作为 provider。Tool-call loop、streaming、steering、parallel/sequential 等全部自建。

### 2.1 收益

- LumenCli 类型完全自有，封装成本最低。
- 没有 pi 节奏绑定。

### 2.2 成本

- S11–S15 每条都要重新实现一次已经在 pi-agent-core 里经过生产检验的逻辑。按 pi agent-loop.ts 当前 ~600 行（含事件顺序、abort、parallel pre-flight 与结果排序等细节），工程量显著。
- 长期会产生与 pi-ai 模型类型平行的"LumenCli tool call / assistant message"中间表示，引入二次转换成本。
- 已知限制清单里（当前 baseline 报告的）"tool-call loop / streaming / write-shell 交互确认 / compaction"条目都要自己兜底。

### 2.3 结论

只适合 LumenCli 坚决不接受 pi 类型进入 agent-core 的场景。当前策略允许封装后接入，此选项代价不对称，放弃。

## 3. 选项 B：接入 `@earendil-works/pi-agent-core` 作为主 agent runtime

含义：`@lumen/agent-core` 内部使用 `Agent` 类或低层 `runAgentLoop` 作为底座，LumenCli 继续对外暴露 `LumenAgent` / `AgentEvent` 接口。pi-ai 作为唯一 provider 源。

### 3.1 收益

- 一步拿到 tool-call loop、streaming、parallel / sequential、steering、follow-up、abort、compaction、skills loader、prompt-templates loader、session repo 一整套。
- 消灭 S1.5（pi-ai）和 S2.0（pi-agent-core）分两步带来的并行实现割裂期。
- 与 pi 上游维护节奏直接对齐，后续新 provider / 新 tool 语义无须自维护。
- LumenCli 的 event 结构仍可作为 pi-agent-core 的上层适配（二者事件集语义相近）。

### 3.2 成本

- 深度重构：`LumenAgent` 要改写成 `Agent` 的上层适配层，`AgentEvent` 要映射自 pi-agent-core 事件。
- 需要显式封装：`Model<any>` 从 `@lumen/model-provider` 返回，不让 pi-ai 类型跨出该包。对外仍以 `LumenModelHandle`（新抽象）表示。
- 需要显式桥接：LumenCli 权限引擎必须通过 `beforeToolCall` / `afterToolCall` 钩子拦截所有工具执行，包含 MCP 工具。
- 需要测试覆盖：确保 event 映射、tool 权限拦截、provider 失败路径不退化。

### 3.3 封装边界

为确保 pi 类型不外泄，包内接口：

- `@lumen/model-provider`
  - 仅依赖 `@earendil-works/pi-ai`。
  - 导出 `LumenModelHandle`（不透明类型，内部含 `Model<any>` 与解析 apiKey 的函数）。
  - 导出 `createLumenModel(config): LumenModelHandle`，`loadLumenModelConfig(env): LumenModelConfig`。
- `@lumen/agent-core`
  - 依赖 `@earendil-works/pi-agent-core`（runtime）与 `@lumen/model-provider`（types opaque）。
  - 内部实例化 `Agent`，订阅其事件，重映射为 LumenCli 对外的 `AgentEvent`。
  - 暴露的 public API 保持：`LumenAgent.run(input): AsyncGenerator<AgentEvent>`、`handleInput`、内置命令注册、context 注入。
- `@lumen/tools`
  - 继续维护 `LumenTool`。增加一层适配器 `toPiAgentTool(tool): AgentTool<any>`，在 `@lumen/agent-core` 内部使用。LumenCli 侧 tool 作者不感知 pi-ai schema。
- `@lumen/permissions`
  - 不变。通过 pi-agent-core 的 `beforeToolCall` 钩子强制拦截。任何未决定为 `allow` 的 tool 都应在钩子内 `block: true`。

### 3.4 风险与缓解

- 依赖体积：pi-ai 依赖 Anthropic / AWS / Google / Mistral SDK。缓解：在 LumenCli README 显式说明；未来若体积成为问题，按 policy 评估裁剪版 fork，本决策不变。
- 版本节奏：pi 发版快。缓解：`package.json` 使用精确版本（不用 caret），设置月度升级窗口。
- API 稳定性：`AgentEvent` 当前已相对稳定。缓解：在 `@lumen/agent-core` 内做事件映射层，若 pi 事件形状发生破坏性变化，仅需调整映射层。
- Harness 耦合：pi-agent-core 提供的 `AgentHarness` 包含 skill / prompt-template / session repo 等 coding-agent 风格抽象。缓解：**不使用** `AgentHarness` 类本体；单件（skills loader、prompt-templates loader、session repo、compaction、system-prompt builder）按需使用。
- 类型泄漏：开发过程中可能不小心 re-export pi 类型。缓解：code review 兜底，后续考虑 ESLint `no-restricted-imports`。

### 3.5 组件分件清单

基于读源码结果，对 pi-agent-core 的每个导出单件逐一评估，而不是整体接入或整体拒绝：

| 组件 | 决策 | 理由 |
| --- | --- | --- |
| `Agent` / `runAgentLoop` / `runAgentLoopContinue` | **接入** | 主 runtime，成熟的 event loop + tool-call + streaming |
| session repo（jsonl / memory / tree storage） | **接入** | 通用 transcript 持久化，LumenCli 当前缺失 |
| compaction（`shouldCompact` / `compact` / `generateSummary` / `estimateContextTokens`） | **接入** | 通用上下文窗口管理，S6 context assembler 可直接用 |
| prompt-templates loader（`loadPromptTemplates` / `formatPromptTemplateInvocation` / `substituteArgs`） | **接入** | 参数化 Markdown 加载，通用，LumenCli `/plan /draft /review /revise` 可改造成模板 |
| skills loader（`loadSkills` / `formatSkillInvocation`） | **接入** | 遵循 agentskills.io 开放约定，LumenCli 的用户可扩展能力的直接支点 |
| system-prompt builder | **参考，不直接用** | pi 的实现偏 coding-agent 风格；LumenCli 自写更轻量版本，参考其组装顺序 |
| `AgentHarness` 类本体 | **不接入** | 把 skill / prompt-template / session / compaction / tree 导航 / tools 切换打包成 opinionated coding-agent 壳，会让 LumenCli 滑向 pi-lite |
| `pi-coding-agent` 包 | **不接入** | coding agent 产品本体，与 LumenCli personal assistant 定位冲突 |
| `pi-tui` | **暂不接入** | Phase 1 readline 足够 |
| `pi-web-ui` | **不接入** | 非当前路线 |

## 4. 决策

**采用选项 B**，并附 §3.5 的组件分件清单。

把 S1.5（pi-ai）与 S2.0（pi-agent-core）合并为一次执行窗口，记为 **S1.5+S2.0 深度重构**。同时引入两条独立工作流：

- **Runtime Layer**：pi-ai + pi-agent-core 六件套（Agent、session、compaction、prompt-templates loader、skills loader、tool 适配）。
- **Prompt Layer**：`packages/prompts/assets/` 下的 Markdown 资产，按 opencode 的 provider-aware 分发模式组织，内容借鉴 ClaudeCodeRev（Private-Project Exemption 下）或 LumenCli 自写。

## 5. 合并后的执行计划要点（S1.5+S2.0）

以下条目作为后续正式启动实施时的 update_plan 基础。本 spec 落地时不立刻执行代码。

### 5.1 Runtime Layer: pi-ai provider 封装

**状态**：已完成（P1）。详见 `Docs/reports/2026-05-10-lumencli-baseline.md` P1 进展。

1. `@lumen/model-provider` 引入 `@earendil-works/pi-ai` 作为依赖。
2. 封装 `LumenModelHandle` 与 `createLumenModel(config)`。pi-ai 类型不跨出该包。
3. `LumenModelConfig` 继续由 `@lumen/config` 产出，增加 `provider`、`apiKeyEnv`、`baseUrl`、`model` 向 pi-ai `getModel` / stream options 的映射。
4. 保留本地 mock provider 作为 `smoke:provider` 的无 key fallback（实现方式：pi-ai 的 `faux` provider，或继续保留当前 mock HTTP server 方案，取决于实现 simpler）。

### 5.2 Runtime Layer: agent-core 内核替换

**状态**：**P2 完成**（P2.1 + P2.2 + P2.3 都已实施）。默认仍走 legacy 路径，`LUMEN_USE_PI_AGENT=1` 切换到 pi-agent-core 路径。稳定后会在未来阶段把默认值切换并移除 legacy 路径。

实施子步骤：

- **P2.1 适配层（完成）**：
  - `packages/agent-core` 引入 `@earendil-works/pi-agent-core@0.74.0` + `@earendil-works/pi-ai@0.74.0`。
  - `packages/model-provider/src/internal.ts` 暴露 `getPiAgentBinding(handle)`；通过 `./internal` subpath export，主 `index.ts` 不污染。
  - `packages/agent-core/src/pi-agent-adapter.ts` 的 `createLumenPiAgent` 构造 pi-agent-core `Agent`。
  - `scripts/smoke-pi-agent.mjs` 端到端验证通过（LumenModel → Agent → streaming → 事件）。
- **P2.2 事件映射与 LumenAgent 契约（完成）**：
  - `packages/agent-core/src/event-queue.ts` + `event-mapper.ts` + `public-types.ts`。
  - `LumenAgent.runWithPiAgent` 接入；`scripts/smoke-agent-run.mjs` 验证事件序列与 transcript。
- **P2.3 completeCommandPrompt 切 pi-agent 单轮（完成）**：
  - `completeCommandPromptWithPiAgent`：headless pi Agent 单轮，不污染主 session。
  - `smoke:writing` 验证老路径；真实 mimo-v2.5 + `/draft` 端到端验证新路径。

1. `@lumen/agent-core` 引入 `@earendil-works/pi-agent-core`。
2. 内部实例化 `Agent`，`convertToLlm` 默认使用内置 `defaultConvertToLlm`。
3. 订阅 pi-agent-core 事件，映射为 LumenCli 对外 `AgentEvent`：
   - `agent_start` → `run_start`
   - `turn_start` → `turn_start`
   - `message_start` → `message_start`
   - `message_update` → `message_delta`（按 `assistantMessageEvent.type` 取 delta）
   - `message_end` → `message_end`
   - `tool_execution_*` → `tool_call_*`
   - `turn_end` → `turn_end`
   - `agent_end` → `run_end`
4. `LumenAgent.run()` 对外形状不变（保留 AsyncGenerator）。

### 5.3 Runtime Layer: 工具与权限桥接

1. `@lumen/tools` 增加 pi-agent-core 适配层：`toPiAgentTool(lumenTool): AgentTool<any>`，仅在 `@lumen/agent-core` 内部使用。
2. 适配层 `execute` 内部：先查 `@lumen/permissions` 的 `decide`，`allow` 之外一律抛错（pi-agent-core 会转为 tool error）。
3. `Agent` 实例配置 `beforeToolCall` 兜底：即使工具适配层漏了，`beforeToolCall` 再次检查权限，`ask` 与 `deny` 统一返回 `block: true`。
4. MCP 工具也走同一条路径。

### 5.4 Runtime Layer: session & compaction & skills 接入

1. 新增 `@lumen/session`（或放在 `@lumen/agent-core` 内部子模块），内部使用 pi-agent-core 的 jsonl session repo。对外暴露 `LumenSession` 抽象，pi 类型不外泄。
2. `@lumen/context` 使用 pi-agent-core 的 `estimateContextTokens` 与 `shouldCompact`，在接近上限时调用 `compact`。
3. 新增 skills loader 入口：默认扫描 `~/.lumen/skills/` 与工作区 `.lumen/skills/`，`SKILL.md` 遵循 agentskills.io frontmatter 约定。
4. 新增 prompt-templates loader 入口：扫描 `packages/prompts/assets/`（内置）与 `~/.lumen/prompts/`（用户覆盖）。

### 5.5 Prompt Layer: 目录结构

```
packages/prompts/assets/
  base/
    system.en.md                 # 基础 system prompt（英文，多 provider 默认）
    system.claude.en.md          # 针对 Claude 家族优化（可选，按 §5.7 分发）
    system.gpt.en.md             # 针对 GPT 家族优化（可选）
    system.gemini.en.md          # 针对 Gemini 家族优化（可选）
  tools/
    fs-readText.en.md            # 每个工具一份 description（英文）
    fs-writeText.en.md
    fs-list.en.md
    project-search.en.md
    shell-run.en.md
  permission/
    block-write.en.md            # 权限 hook 给 AI 的 reason 文本（英文）
    block-shell.en.md
    block-unknown.en.md
  writing/                       # 写作特例：全中文
    plan.zh.md
    draft.zh.md
    review.zh.md
    revise.zh.md
  cli-zh/                        # 给人看的 CLI 文案（中文）
    help.zh.md                   # /help 输出
    status.zh.md                 # /status 输出模板
    commands.zh.md               # slash 命令 usage / 参数说明集合
    permission-prompt.zh.md      # 给用户看的权限确认文案
    errors.zh.md                 # CLI 错误消息模板
```

每个 `.md` 文件 frontmatter：

```yaml
---
name: <identifier>
source: lumencli-original | pi-agent-core@0.74.0, adapted | claude-code@2.1.88, adapted | claude-code@2.1.88, clean-room | opencode@<commit>, adapted
description: <short description>
---
```

### 5.6 Prompt Layer: 借鉴来源

- `base/*` 与 `tools/*`：主要从 ClaudeCodeRev adapt，按目标 provider 调整。
- `permission/*` 给 AI 看的 reason：借鉴 ClaudeCodeRev permission 文案，clean-room 改写为 LumenCli 措辞。
- `writing/*`：从 Lumen-Rebuild 的写作 prompt 迁移，全中文。
- `cli-zh/*`：全部 LumenCli 自写（中文）。
- provider-optimized 变体（`*.claude.en.md / *.gpt.en.md / *.gemini.en.md`）：参考 opencode 的 `provider(model)` 分发模式实现，**一份能力只要有多 provider 差异时才分文件**；无差异的能力只有一份 `.en.md`。

### 5.7 Prompt Layer: Provider-Aware 分发

参考 opencode `session/system.ts`，在 `packages/prompts` 中实现：

```ts
function selectPromptFile(capability: string, modelId: string): string {
  // 1. try capability/<capability>.<provider>.en.md by model.api.id match
  //    (claude / gpt / gemini / kimi …)
  // 2. fallback to capability/<capability>.en.md
}
```

- LumenCli 拥有哪些 provider 分支由 `packages/prompts/assets/` 下实际存在的文件决定，不硬编码在代码里。
- 写作特例（`writing/*`）不做 provider 分支，一律走中文单文件。
- 分发逻辑在 `packages/prompts` 内部完成，`packages/agent-core` 只调用 `getPrompt(capability, modelHandle): Promise<string>`。

### 5.8 语言规则

| 目标 | 语言 | 例子 |
| --- | --- | --- |
| 给人看的 CLI 输出（帮助、错误、确认提示、状态） | 中文 | "将要写入 D:\foo\bar.md，是否确认？" |
| 给人看的命令 summary / usage / 参数说明 | 中文 | `/status — 查看当前会话状态` |
| 给人看的 Docs / README | 中文 | 现有状态 |
| 给 AI 看的 system prompt | 英文 | `You are Lumen, a CLI-first personal AI assistant...` |
| 给 AI 看的 tool description | 英文 | `Read a UTF-8 text file within the workspace root.` |
| 给 AI 看的 tool parameter description | 英文 | `path: Absolute or workspace-relative path.` |
| 给 AI 看的 permission hook 返回文本 | 英文 | `Tool blocked: write requires user confirmation.` |
| **写作特例**（system prompt + tool description + prompt template） | **中文** | 所有 `writing/*.md` |
| Slash 命令名 | 英文 | `/plan` `/draft` `/status` |
| Slash 命令参数名 | 英文 | `--kind` `--base-url` |

**边界约定**：

1. 错误消息：用户看到的一律中文。底层 `Error.message` 保留英文，CLI 捕获后在 `apps/cli` 做中文包装。
2. Memory entries：用户用中文 `/remember` 存下来就是中文；context assembler 注入时不翻译，原样注入。
3. Log / debug：纯英文，便于搜索和与 pi 上游日志对齐。
4. MCP 工具 description：MCP server 自己给什么语言就是什么语言，LumenCli 不翻译。但 LumenCli 权限提示文本（包 MCP 工具触发的那条）按"给人看"规则走中文。
5. 写作特例的边界：只覆盖 writing command pack 相关的 prompt。写作流程内调用的通用 tool（如 `fs.writeText`）仍用英文 tool description。
6. XML-ish 结构：英文 prompt 沿用 Claude Code 风格的 XML-ish 标签（`<context>` / `<rule>` 等），写作特例的中文 prompt 也保留 XML 结构但**标签名用英文**（如 `<character>` `<scene>`），内容走中文，便于后续切换模型时结构不改。

### 5.9 Smoke & 文档

- `smoke:cli` 保持不变。
- `smoke:provider`：mock OpenAI-compatible server 不变，但让 `@lumen/model-provider` 通过 pi-ai 的 OpenAI-compatible api 连它；若成本过高则改用 pi-ai `faux` provider。
- 新增 `smoke:agent-loop`：使用 faux provider + fake tool，验证 tool-call loop、parallel 与 sequential 两条路径、权限拦截。
- 新增 `smoke:prompts`：验证 `getPrompt(capability, modelHandle)` 在不同 provider 下能正确命中文件，frontmatter 解析正常，写作 prompt 不做 provider 分发。
- 现有 `smoke:permissions / smoke:tools / smoke:mcp / smoke:context / smoke:memory / smoke:writing / smoke:ux` 保留，覆盖 tool-call 路径的断言更新。
- README / `Docs/reports/phase1-verification.md` 同步更新能力与限制。

### 5.10 守则

- 严禁从 `@lumen/agent-core/src/index.ts` re-export `@earendil-works/pi-agent-core` 或 `@earendil-works/pi-ai` 的符号。
- 严禁在 `apps/cli` 直接 import pi-* 或 opencode 相关的包。
- 严禁使用 pi 的 `AgentHarness`；单件（skills / prompt-templates / session / compaction / system-prompt）可以单独 import，但要封装。
- 所有 prompt 文件必须带 frontmatter 的 `source` 字段，值符合 Reference Usage Policy §3。
- runtime 代码层严禁出现 `source: claude-code@…`，违反即必须立即重写。

## 6. 回滚策略

若落地后发现 pi-agent-core 行为对 LumenCli 不合适：

- 保留 `LumenAgent` 对外 API 不变的前提下，换实现为自写 loop。
- 因为权限拦截、tool 适配、event 映射都在 LumenCli 边界包内，回滚窗口期不牵动 CLI 与 writing pack。
- Prompt Layer 与 Runtime Layer 独立，Runtime 回滚不触发 prompt 层重写。
- 回滚本身会触发新的 Plan Mutation Log 记录与 spec 变更。

## 7. 对验证门禁的影响

- `pnpm smoke:all` 必须在 S1.5+S2.0 完成后依然通过。
- 新增 `pnpm smoke:agent-loop` 与 `pnpm smoke:prompts` 进入 `smoke:all`。
- 所有现有 smoke 如因 tool-call loop 行为变化需要更新断言，按实际运行结果重写。

## 8. 后续动作

- 本文件即为 Blueprint §12.2 退出标准要求的"结论性 spec"。
- 下一次进入实施时，按 §5 作为 update_plan 的起点，单步推进。建议顺序：§5.1 → §5.2 → §5.3 → §5.4 → §5.5 → §5.6 → §5.7 → §5.9 → §5.10。
- 本 spike 不触发代码变更。
