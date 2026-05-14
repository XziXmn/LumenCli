# LumenCli Reference Usage Policy

日期：2026-05-10（多次修订累积。最新一次：新增 openai/codex 作为 tier-1 设计参考，覆盖上下文管理 / memory 流水线 / patch 工具 / sandbox 设计）

## 0. 目的

明确 `references/` 下参考项目与直接 runtime 依赖在 LumenCli 中的使用边界，避免：

- 把参考项目变成隐性底层。
- 混用多来源代码导致 license 状态不可追溯。
- 让 LumenCli 的产品身份被参考项目的定位拖走。

本策略与 `Docs/specs/2026-05-10-lumencli-bootstrap-direction.md` 对齐，是后者的细化。

## 1. 产品身份（修订锚点）

LumenCli 定位为 **主流代码编程的通用智能体**，在此 runtime 基础上叠加写作助手、个人任务助理、记忆协作等扩展能力。Coding 是主干，写作是"站在巨人肩膀上"的第一个扩展。

这一产品身份决定了以下策略选择：

- **coding 相关工具、prompt、权限 UX 的借鉴**从"禁止跨线"放宽为"主动借鉴 tier-1 来源"。
- **写作扩展**保持独立 package，接入主干通过命令系统与 capability slot（见 `Docs/plans/2026-05-10-lumencli-s15-s20-execution-plan.md` §3.1）。
- **技术栈随 tier-1 参考项目对齐**：Bun 运行时、OpenTUI 终端渲染、pi-agent-core runtime 内核。

## 2. 参考对象清单

仓库内存在以下本地参考源码（均由 `.gitignore` 排除，不提交到远程）：

- `references/pi` — MIT
- `references/oh-my-pi` — MIT，`can1357/oh-my-pi`，pi 的深度定制 fork
- `references/opencode` — MIT
- `references/opentui` — MIT，TUI 框架
- `references/codex` — Apache-2.0，`openai/codex`，Rust 实现的 coding agent（仅作设计参考，不作为 runtime 依赖）
- `references/ClaudeCodeRev` — Anthropic 闭源 license 的 sourcemap 逆向产物
- Lumen-Rebuild 作为外部来源，仓库内不直接存放，仅通过迁移路径引用
- `openclaw/openclaw` — **架构验证样本**（未本地克隆），证明"Pi-powered runtime + 自定义产品/框架层"路线的生产级可行性。license 状态待在首次 upstream-intake sweep 中核对。不作 runtime 依赖、不作代码借鉴。详见 `Docs/specs/2026-05-12-pi-powered-runtime-strategy.md` §5。

不是同类资源，必须分别定策略。

## 3. Runtime 平台声明

### 3.1 Bun 运行时

LumenCli 从 S1.5a 起切换到 **Bun ≥ 1.3** 作为唯一运行时。

- 选择理由：Bun 原生支持 `.ts`、`bun:ffi`、快速启动，是 OpenTUI / opencode / oh-my-pi / pi 的主流运行时。
- 包管理器：Bun workspaces，取代 pnpm workspace。
- `engines.bun: ">=1.3.0"` 替代原 `engines.node`。
- Node 兼容性仍然保留作为库级兼容目标（pi-agent-core / MCP SDK 等都是 Node 原生包），但不以 Node 为 runtime 验证路径。

### 3.2 Windows x64 一等公民

Phase 1 只**保证 Windows x64 平台可用**。

- 所有 smoke、手工验证、文档示例只在 Windows x64 + Bun 1.3+ 验证通过。
- `@opentui/core-win32-x64` 是默认预编译 native。
- 其他 OS（macOS arm64/x64、Linux x64、Linux arm64）留作 S2+ 阶段扩展，届时按 Reference Usage Policy §10 决策变更协议走新 spec。

## 4. Source 标注规则

所有从参考项目借鉴内容的文件必须在文件 frontmatter 或顶部注释里携带 `source` 字段，便于未来 triage：

```yaml
---
name: plan
source: lumencli-original
---
```

允许的 `source` 值：

- `lumencli-original` — 完全自有。
- `pi-agent-core@<version>, adapted` — 从 pi 适配。
- `pi-tui@<version>, adapted` — 从 pi-tui 适配（若启用 pi-tui）。
- `oh-my-pi@<commit>, adapted` — 从 oh-my-pi 适配。
- `opencode@<commit>, adapted` — 从 opencode 适配。
- `opentui@<version>, adapted` — 从 opentui 示例或组件适配。
- `codex@<commit>, adapted` — 从 openai/codex 设计参考适配（Apache-2.0，允许跨 prompt / 架构 / 协议三层）。
- `codex@<commit>, clean-room` — 读过 codex 源码后的 paraphrase 实现。
- `claude-code@2.1.88, adapted` — 从 ClaudeCodeRev 借鉴改写。
- `claude-code@2.1.88, clean-room` — 读过 ClaudeCodeRev 后的 paraphrase 实现，不含原文。
- `lumen-rebuild, migrated` — 从 Lumen-Rebuild 迁移。

规则：

- runtime / 代码层**不允许**出现 `claude-code@…` 的 source 值。
- prompt / tool-description / permission-text / command-metadata 层的 ClaudeCodeRev 借鉴必须走 `adapted` 或 `clean-room`。
- 多来源混合时用逗号分号并列：`source: pi-agent-core@0.74.0, adapted; claude-code@2.1.88, clean-room`。

## 5. Private-Project Exemption

LumenCli 当前是**私人永久使用**的项目，仓库为私有仓库。在这一条件下，策略做如下豁免：

- 允许把 ClaudeCodeRev 作为 **prompt 与 UX 设计参考**，借鉴其 prompt 文本、tool description 文案、permission 提示措辞到 LumenCli 自有 prompt 文件中，不限于"只读学习"。
- 豁免仅覆盖 **prompt / 文案层**，不覆盖 runtime / 类 / 辅助代码层。runtime 层来源仅限 MIT 参考项目（pi / oh-my-pi / opencode / opentui）或自写。
- 豁免以仓库保持私有为前提。一旦触发以下任一条件，豁免自动失效，必须清理或重写相关 prompt：
  - 仓库转为公开。
  - 构建产物分发到第三方（npm publish、binary release、云端 SaaS 部署）。
  - 引入外部贡献者并签订包含"全部代码 MIT 授权"的协议。
- 豁免的存在不改变 runtime 层规则：runtime 依赖只能来自 MIT 参考项目，不得来自 ClaudeCodeRev。

## 6. Tier-1 Reference Strategy（MIT / Apache-2.0 参考项目）

以下五个 permissive-license 项目是 LumenCli 的 tier-1 借鉴/依赖来源，**能力层级允许涵盖 runtime、tool、prompt 三层**。它们互相之间也存在交集与重合（pi → oh-my-pi → opencode 都是 Mario Zechner 的 pi 生态衍生；codex 是独立 OpenAI 实现），策略上同级对待但边界各异。

### 6.1 pi / oh-my-pi

| 项目 | License | 维护者 | 在 LumenCli 的角色 |
| --- | --- | --- | --- |
| pi | MIT | Mario Zechner（`earendil-works/pi-mono`） | runtime 依赖上游。`@earendil-works/pi-ai` + `@earendil-works/pi-agent-core` 是 LumenCli agent 内核。 |
| oh-my-pi | MIT | Can Boluk（`can1357/oh-my-pi`） | pi 的深度 fork，含更多 coding 特化工具、子代理、LSP、hashline edit。主要作为**代码借鉴**来源，不作 npm 依赖。 |

**允许的复用层次**（pi）：

- `@earendil-works/pi-ai`：允许作为 provider 主实现接入。覆盖多 provider、OAuth、streaming、tool-call 结构化消息。
- `@earendil-works/pi-agent-core`：允许接入作为 agent runtime 内核。导出的独立模块（session repo、compaction、prompt-templates loader、skills loader）允许按需使用。
- `@earendil-works/pi-tui`：暂不接入（选择 OpenTUI 作为 TUI 框架）。作为输入事件 / 键位设计参考。
- `@earendil-works/pi-coding-agent`：不作为依赖，但**允许借鉴其 coding 工具设计、prompt 结构**到 LumenCli 自写实现。
- `@earendil-works/pi-web-ui`：不接入。不在当前产品路线。

**允许的复用层次**（oh-my-pi）：

- `@oh-my-pi/pi-coding-agent` / `@oh-my-pi/pi-tui` / `@oh-my-pi/pi-agent-core` 等：**不作为 npm 依赖**（与 pi 上游冲突），但可以作为代码/设计参考，借鉴其扩展工具（hashline edit、LSP 集成、浏览器工具、swarm-extension 子代理）的实现思路与 prompt 模式。
- 所有借鉴入 LumenCli 的代码带 `source: oh-my-pi@<commit>, adapted` 标注。

**强制边界**：

- **interface 反向**：pi 包的类型、枚举、类不跨出 LumenCli 的边界包。
  - pi-ai 只在 `packages/model-provider` 内部被 import。
  - pi-agent-core 只在 `packages/agent-core` 内部被 import。
- **版本 pin**：pi 迭代节奏快（当前 0.74.x），`package.json` 使用精确版本或 tilde 范围，不使用 caret 自动升级。升级在独立窗口评估。
- **权限不被绕过**：无论 pi-ai 产生的 tool-call，还是 pi-agent-core 管理的工具注册，最终执行必须经过 `@lumen/permissions`。不允许"pi 自己调过了所以跳过 LumenCli 权限校验"的路径。
- **prompt 自有**：system prompt、slash command prompt、writing pack prompt 由 `packages/prompts/assets/` 产出，不调用 pi / oh-my-pi 内置的 coding-agent prompt。
- **fallback 留存**：本地 mock OpenAI-compatible server 与 smoke 脚本必须保留。即便 pi-ai 成为主 provider，smoke 流程不依赖外网和真实 API key。
- **命名不混用**：包名保持 `@lumen/*`。不允许模仿 `pi-` 前缀或 `@earendil-works/*` / `@oh-my-pi/*` 命名。

**禁止项**：

- 不 fork pi 或 oh-my-pi 仓库到主项目，不复制源码到 `packages/`（借鉴必须 adapted）。
- 不把 pi 的内部 module 路径直接暴露给 `apps/cli`。
- 不把 pi 的 tool 定义直接接成 LumenCli 的默认工具集，必须经由 LumenCli 的 ToolRegistry 重新声明权限元数据。

### 6.2 opencode

| 项目 | License | 维护者 | 在 LumenCli 的角色 |
| --- | --- | --- | --- |
| opencode | MIT | `anomalyco/opencode`（sst 相关） | coding agent 产品本体。主要作为**架构 + prompt + UX 参考**。 |

**允许方式**：

- **多模型切换结构参考**：`packages/opencode/src/session/system.ts` 的 `provider(model)` 模式是 LumenCli `packages/prompts` 的直接参考。
- **Session 事件模型**：`v2/session.ts` 的 `ModelSwitched` / `AgentSwitched` 事件是 LumenCli session 层的设计参考。
- **Coding 工具 prompt**：opencode 的 tool description 文案可作为 adapted 来源。
- **多 provider 适配思路**：与 pi-ai 搭配参考。

**强制边界**：

- opencode 是 coding agent 产品本体，**不整体依赖、不 vendor、不 fork**。
- 从 opencode 迁移的代码片段必须带 `source: opencode@<commit>, adapted` 标注。
- 不把 opencode 的 **Effect / SolidJS UI / SST 部署体系**带入 LumenCli。LumenCli UI 走 OpenTUI + React。

**禁止项**：

- 不把 opencode 或其 SDK 加入 `package.json` 的 dependencies。
- 不使用 opencode 的 brand 命名（opencode、OpenCode 等）出现在 LumenCli 主界面。

### 6.3 OpenTUI（Runtime 依赖）

| 项目 | License | 维护者 | 在 LumenCli 的角色 |
| --- | --- | --- | --- |
| opentui | MIT | `anomalyco/opentui`（sst 团队） | **Runtime 依赖**：LumenCli 的 TUI 渲染框架。 |

**允许的直接依赖**：

- `@opentui/core`：Zig native 核心 + TS binding。必用（transitive，但显式声明）。
- `@opentui/react`：React reconciler。LumenCli UI 层主要用这个。
- `@opentui/keymap`：跨平台键盘映射。必用。

**不接入**：

- `@opentui/solid`：选了 React，不叠 Solid。
- `@opentui/three`：3D 终端渲染，LumenCli 不需要。
- `@opentui/examples`：不作为依赖，但 `references/opentui/packages/examples` 作为 UX 设计参考。

**强制边界**：

- OpenTUI API 只在 `apps/cli/src/ui/**` 下使用，不跨到 `packages/*` 核心层。
- `apps/cli/src/core/**` 禁止 import `@opentui/*`（通过 ESLint `no-restricted-imports` 锁定）。
- 自写组件遵循 `core/ui` 分层（详见 Blueprint S1.5b）。第一版只用通用特性子集（Box / Text / Input / 基础键盘事件 / 简单 modal），不用 OpenTUI 专属高级特性（three 渲染、GPU compositing）。

**版本 pin**：OpenTUI 仍在 0.x 快速迭代期，`package.json` 用精确版本，不使用 caret。

### 6.4 Lumen-Rebuild（写作扩展来源）

**允许迁移的能力**：

- `.novel` 项目协议的最小上下文读取。
- project memory / continuity 数据模型。
- `/plan`、`/draft`、`/review`、`/revise` 写作命令语义。
- 写作相关 prompt asset 的组织方式。

**迁移要求**：

- 迁移结果位于 `packages/writing` 及未来可能新增的写作相关包，不进入 `agent-core`、`tools`、`permissions` 等通用层。
- 命名与类型在 LumenCli 空间重建，不保留 `Lumen-Rebuild` 内部命名。
- 迁移过程中如发现 Lumen-Rebuild 已有能力超出 Phase 1 范围，延后到 `.novel` 专项阶段，不在 Phase 1 强行并入。

**禁止项**：

- 不让 LumenCli 降级为 Lumen-Rebuild 的 CLI 壳。
- 不迁移 Lumen-Rebuild 桌面 / Obsidian 工作台代码到 LumenCli。

### 6.5 Claude 生态 Drop-in 兼容策略

LumenCli 主动兼容 Claude Code / opencode / 通用 `.agents` 生态的资产布局，使用户在这些工具上积累的 skills、slash commands、MCP 配置可以**零迁移**直接在 LumenCli 内生效。

**背景**：opencode `packages/opencode/src/skill/index.ts` 的 `discoverSkills` 函数已经证明"扫描多家 agent 产品通用目录"是可持续的生态兼容策略。LumenCli 采用相同结构。

**扫描目录清单**（按优先级，后者覆盖前者）：

| 位置 | 用途 | 扫描模式 |
| --- | --- | --- |
| `packages/prompts/assets/skills/` | LumenCli 内置 skills | `**/SKILL.md` |
| `packages/prompts/assets/commands/` | LumenCli 内置 slash commands | `*.md` |
| `~/.lumen/skills/` | 用户全局 LumenCli skills | `**/SKILL.md` |
| `~/.lumen/commands/` | 用户全局 LumenCli commands | `*.md` |
| `~/.claude/skills/` | Claude Code 全局 skills（drop-in 兼容） | `**/SKILL.md` |
| `~/.claude/commands/` | Claude Code 全局 commands（drop-in 兼容） | `*.md` |
| `~/.agents/skills/` | 通用 agent 生态 skills（drop-in 兼容） | `**/SKILL.md` |
| `<cwd>/.lumen/skills/` | 工作区 LumenCli skills | `**/SKILL.md` |
| `<cwd>/.lumen/commands/` | 工作区 LumenCli commands | `*.md` |
| `<cwd>/.claude/skills/` | 工作区 Claude Code skills（drop-in 兼容） | `**/SKILL.md` |
| `<cwd>/.claude/commands/` | 工作区 Claude Code commands（drop-in 兼容） | `*.md` |
| `<cwd>/.agents/skills/` | 工作区通用 agent skills（drop-in 兼容） | `**/SKILL.md` |
| `packages/prompts/assets/mcp.json` | 内置 MCP server 定义（如有）| JSON |
| `~/.lumen/mcp.json` | 用户全局 MCP servers | JSON |
| `~/.claude/mcp.json` 或 `~/.claude.json` | Claude Code MCP 配置（drop-in 读取） | JSON |
| `<cwd>/.lumen/mcp.json` | 工作区 MCP servers | JSON |
| `<cwd>/.mcp.json` | 通用 MCP server 声明（多家 agent 约定） | JSON |

**兼容格式**：

- **Skills**：Anthropic `anthropics/skills` 仓库规范的 `SKILL.md`（YAML frontmatter 至少含 `name` + `description`；正文 Markdown）。LumenCli 自有 skill 也用同一格式。
- **Slash commands**：Claude Code 规范的 `<command-name>.md`，文件名 = 命令名，`$ARGUMENTS` / `$1` / `$@` / `${@:N}` 占位符替换。允许可选 frontmatter（`description` / `argument-hint` / `allowed-tools`）。
- **MCP 配置**：Claude Code `.claude/mcp.json` 与通用 `.mcp.json` 采用相同对象结构 `{"mcpServers": {"<name>": {"command": "...", "args": [...], "env": {...}}}}`，LumenCli 直接读取。

**冲突解决**：

- 同名 skill / command：**后扫目录优先**，但必须 log warning。
- 用户可通过环境变量禁用外部 drop-in：
  - `LUMEN_DISABLE_EXTERNAL_SKILLS=1` 关所有外部 skills
  - `LUMEN_DISABLE_CLAUDE_SKILLS=1` 只关 `.claude/` 路径
  - `LUMEN_DISABLE_EXTERNAL_COMMANDS=1` 关外部 commands
  - `LUMEN_DISABLE_EXTERNAL_MCP=1` 关外部 MCP 配置文件
- 配置文件（`~/.lumen/config.json`）里可单独覆盖每个 flag。

**强制边界**：

- **Skill / command 执行仍走 LumenCli 权限引擎**。Drop-in 的 skill 只是 prompt 资产，不能绕过 `@lumen/permissions` 的决策。
- **MCP 配置 drop-in 不代表信任**。外部 MCP config 里的 tool 仍按 risk 推断走 `ask` 路径，直到用户显式标记允许。
- **不发布到外部目录**。LumenCli 只**读**这些目录，不写入、不修改、不创建。即使用户主动请求，也只写到 `~/.lumen/` 下。
- **向后兼容**。当 Anthropic / opencode 变更 SKILL.md / commands 规范时，LumenCli 保持向后兼容旧格式至少 3 个月。破坏性变更走 Reference Usage Policy §10 决策变更协议。

**source 标注**：

- LumenCli 自写的 skill / command：`source: lumencli-original`。
- 从 ClaudeCodeRev 借鉴改写的：`source: claude-code@2.1.88, adapted`（受 §5 Private-Project Exemption 限制）。
- 从 anthropics/skills 直接使用的：**不拷贝到 LumenCli 仓库**，用户把它们放到 `~/.claude/skills/` 或 `~/.lumen/skills/`，LumenCli 运行时读取，不进 git 历史。

**实现阶段**：

- P4 skills / prompt-templates loader 阶段同步实现基础扫描（内置 + `~/.lumen/*` + `<cwd>/.lumen/*`）。
- S1.7 MCP config loader 阶段实现 MCP 配置 drop-in（`~/.claude/mcp.json` / `.mcp.json`）。
- 完整 Claude / agents drop-in 支持作为 **P4 的独立子步骤 P4.X** 实施，不阻塞其他阶段。

### 6.6 openai/codex（设计参考，Apache-2.0）

**定位**：**仅作为设计与架构参考**。codex 是 Rust 实现的 coding agent，不进入 LumenCli runtime 依赖图，但其 memory 流水线、patch 工具、sandbox 设计、MCP 反向暴露等设计是 tier-1 级别的借鉴对象，尤其是上下文管理与长期记忆。

| 项目 | License | 维护者 | 在 LumenCli 的角色 |
| --- | --- | --- | --- |
| codex | Apache-2.0 | OpenAI（`openai/codex`） | **设计参考**：memory pipeline、apply-patch、sandbox、MCP server、rollout/session 模型。 |

**为什么单独一节（不并入 opencode / pi）**：

- 语言不同（Rust vs TS），不能共享代码。但 Apache-2.0 license 在私有使用下跨语言借鉴设计完全合法（带 attribution 即可）。
- codex 的上下文管理（两阶段 memory 流水线 + SQLite state DB + git baseline + consolidation 子代理）**比 pi / opencode / ClaudeCodeRev 更成熟**，是 LumenCli S1.13 永久记忆的首选参考。
- codex 把自己既做 MCP client 又做 MCP server（`codex mcp-server`），这个对称能力值得 LumenCli 在 S2+ 阶段吸收。
- Rust 分发模式（Node shim + `optionalDependencies` 按 platform 切 binary）是未来 LumenCli 如果要跨到 Rust 子组件时的落地范本。

**允许借鉴的设计维度**：

- **Memory pipeline（优先级最高）**：`codex-rs/memories/` 的 Phase 1 + Phase 2 两阶段设计。详见 `references/codex/codex-rs/memories/README.md`。Phase 1 = per-rollout 抽取（SQLite claim/lease + 并发 + backoff + 结构化输出 raw_memory / rollout_summary / rollout_slug）。Phase 2 = 全局 consolidation（git baseline + workspace diff + 独立 consolidation 子代理，无 network、本地写权限）。LumenCli S1.13 直接按此架构实施。
- **Apply-patch 工具**：`codex-rs/apply-patch/` 的 patch-based 文件编辑协议。比朴素 Edit 工具更结构化，对 diff 场景更安全。LumenCli 在 P3 或 S1.11 coding 子代理阶段可作为工具设计参考。
- **Sandbox 分层**：`codex-rs/sandboxing/` + `linux-sandbox` + `windows-sandbox-rs` + `bwrap` + `execpolicy` 的多平台沙箱策略（read-only / workspace-write / danger-full-access 三档）。LumenCli permission 引擎的决策分档可以对齐。
- **Rollout / session 模型**：`codex-rs/rollout/` + `codex-rs/state/` 的 session 持久化与 claim/lease 并发控制。`codex exec --ephemeral` 的 non-interactive 无落盘模式是 LumenCli headless 单轮路径的命名/语义参考（LumenCli 当前在 P2.3 已实现同样语义）。
- **MCP server 端**：`codex mcp-server` 命令把 codex 自身作为 tool 暴露给别的 agent。S2+ 阶段 LumenCli 可考虑类似能力。
- **Skills 架构**：`codex-rs/skills/` + `codex-rs/core-skills/` 两 crate 分层，skills 作为 prompt 资产而非代码，是"多家 agent 同格式"生态的第三个样本（前两个：Claude Code、opencode）。

**不借鉴的维度**：

- **Rust 代码本体**：不拷贝、不移植、不翻译。LumenCli 坚持 Bun + TypeScript。
- **Effect/SolidJS 风格代码**：codex 不是 TS，不存在这个问题。
- **OpenAI 专属 provider 路径**：codex 以 OpenAI API 为一等公民，内部 provider 抽象偏 OpenAI-centric。LumenCli 通过 pi-ai 获得多 provider 覆盖，不走 codex 的 provider-info crate 路径。
- **Rust 分发体系**：Node shim + platform binary 的分发模式对 LumenCli 当前不适用（LumenCli 是私有永久使用，无需分发）。作为未来可能引入 Rust 子组件（如本地 sandbox helper）时的参考，不立即采纳。

**强制边界**：

- **source 标注**：任何借鉴自 codex 的设计必须在文件头 / commit message / spec 中标注 `source: codex@<commit>, adapted` 或 `clean-room`。
- **不作为 runtime 依赖**：不把 `@openai/codex` npm 包加入 `package.json`，不 spawn `codex` 命令作为子进程（除非显式作为外部 MCP server 连接，那是用户配置，不是 LumenCli 默认）。
- **Apache-2.0 attribution**：任何 adapted 来源的大段设计文档（如 memory pipeline 实现 spec）必须在文件头保留对 openai/codex Apache-2.0 license 的引用说明，形如 `portions adapted from openai/codex (Apache-2.0), commit <sha>`。
- **privacy/license 未来演化**：Apache-2.0 在公开或商业分发场景下依然合法（不像 ClaudeCodeRev 的 §5 豁免），Private-Project Exemption 失效时 codex 来源无需清理。但仍需保留 NOTICE 级别的 attribution。

**Rust 性能议题（决策记录）**：

- 用户提问"Rust 性能更好"是否应切换技术栈。结论：**不切**。
- 理由摘要：(a) CLI agent 瓶颈是 LLM 延迟（秒级），runtime 的毫秒级差异不可感知。(b) Bun 已消除大部分 Node 启动/JSON 劣势，冷启动 30-60ms。(c) codex 选 Rust 是为了 binary 分发 + 原生 sandbox，OpenAI 有对外分发需求；LumenCli 无此需求。(d) TS 生态的即时迭代红利（pi / opencode / OpenTUI 都是 TS 线）远大于 Rust 性能收益。
- 未来若需 Rust 的特定能力（如 Windows job-object 沙箱），**在独立 spec 下评估引入 Rust helper 子进程**，主干仍保持 Bun + TS。

**实施挂钩**：

- S1.13 永久记忆（`Docs/plans/2026-05-10-lumencli-s15-s20-execution-plan.md` §3.4）：直接按 codex Phase 1 + Phase 2 架构设计。
- P3 / S1.11：apply-patch 工具作为代码编辑工具的设计备选。
- S2+ 未来：sandbox 分层、MCP server 端、rollout 并发控制可逐一引入。

## 7. ClaudeCodeRev 使用策略（Private Exemption 下）

### 7.1 背景

`references/ClaudeCodeRev` 的 README 与 `package.json` 自陈：

- 来自 `@anthropic-ai/claude-code@2.1.88` 的 sourcemap 还原。
- 1902 份 TS 源文件 + 142 个 stub + 29 份 skill 文档 + 4 个 classifier prompt。
- License：`SEE LICENSE IN README.md`，指向 Anthropic 原始闭源条款。

### 7.2 允许方式

基于 §5 Private-Project Exemption，在私有使用前提下允许：

- 把其 system prompt、tool description、permission prompt 文案作为 **prompt 层**的参考来源，adapt 后写入 `packages/prompts/assets/`。
- 借鉴其权限模式、allowed tools、tool annotation、slash command 元数据、MCP host 调用模式、system / developer / skill 分层 prompt 的设计思路。
- 借鉴其 coding 工具（Read / Edit / Write / Bash / Grep / WebFetch 等）的描述风格与 prompt 组织。
- 借鉴其 React + reconciler 的 UI 组件组织思路（供 OpenTUI + React 实现参考）。

### 7.3 强制边界

- **runtime 不跨线**：不把 ClaudeCodeRev 的任何源码（class、function、模块、辅助代码、React 组件实现）带入 `packages/*` 或 `apps/*` 的 runtime 或工具实现层。runtime 层遇到需求时走 pi / oh-my-pi / opencode / opentui 或 clean-room 重写。
- **source 必须标注**：任何借鉴自 ClaudeCodeRev 的 prompt / 文案文件必须在 frontmatter 带 `source: claude-code@2.1.88, adapted` 或 `clean-room`。未标注视为违规。
- **classifier prompt 与 skill docs 禁止直接复制**：ClaudeCodeRev 中 29 份 skill 文档和 4 个 classifier prompt 是 Anthropic moat，即便在私有豁免下也要求 clean-room，不得原文 / 轻改后使用。
- **品牌术语不进 LumenCli 主界面**：不把 Claude Code 的 slash 命令名、skill 命名原样出现在用户可见界面。可以复用"skill / agent / tool"这类通用 agent 词汇。
- **Anthropic-only 模式文案**：含明显 Claude 专属指令（例如针对 Claude 特定训练数据的 workaround）的段落不照搬，需按目标模型重写。

### 7.4 禁止项

- 不作为 npm 依赖、git submodule 或 vendor 目录被主仓引用。
- 不执行其 build 脚本、stub 生成脚本作为主仓流程的一部分。
- 不为绕开 runtime 边界，用改名 / 改注释的方式把 ClaudeCodeRev 源码包装成 LumenCli 原创。

### 7.5 豁免失效时的清理

如果 §5 的豁免失效（仓库公开、对外分发、引入外部协作），必须：

1. 列出所有 `source: claude-code@…` 标注的文件。
2. 全部重写为 `source: lumencli-original` 或 `source: claude-code@…, clean-room`（后者需真正的 paraphrase）。
3. 更新本策略，去掉 §5 的豁免条款。

## 8. Anti-Pattern 清单

后续执行或评审时必须避免：

1. 在没有 adapter 的情况下，把 `@earendil-works/pi-ai`、`@earendil-works/pi-agent-core`、`@opentui/*` 的类型直接 re-export 到 `packages/agent-core` 的公开导出或 `apps/cli` 的 core 层。
2. 把 ClaudeCodeRev 的源码以改名 / 改注释 / 拆包的方式带入 runtime 层。
3. 借鉴 ClaudeCodeRev / pi / oh-my-pi / opencode / opentui / codex 但忘记 `source` 标注。
4. 把多个参考项目的代码混入同一文件而不做 `source` 分隔。
5. 在 pi / OpenTUI 升级时未经评审就自动跟 latest，导致 LumenCli 行为被动漂移。
6. 因为 "private exemption" 放松而让 runtime 层开始吸收 ClaudeCodeRev 的代码。
7. 把 opencode 的 Effect / SolidJS 体系带入 LumenCli 的 Bun + React 栈。
8. 把 OpenTUI 的 three / solid 包装依赖混进来。
9. 未经 §10 决策变更协议直接启用 macOS / Linux 平台。
10. 把 oh-my-pi 或 opencode 直接作为 npm 依赖加入 `package.json`。
11. 把 openai/codex 的 Rust 源码翻译为 TS 移植到 LumenCli runtime（设计借鉴 ≠ 代码翻译）。
12. 未经独立 spec 直接把 `@openai/codex` npm 包或 `codex` 二进制作为 runtime 子进程启动。

## 9. 决策变更协议

本策略的任何放松或收紧，必须：

1. 在 `Docs/specs/` 下新增变更 spec，引用本文件。
2. 在 `Docs/plans/` 中对应的 Blueprint Plan Mutation Log 补记录。
3. 若涉及：
   - ClaudeCodeRev 边界（Private-Project Exemption 的扩张或收紧）
   - pi / OpenTUI 破坏性升级
   - 新平台启用（macOS / Linux / 其他 arch）
   - 引入新的 tier-1 参考项目
   - 切换运行时（Bun → Node / Deno）
   必须显式说明理由与影响范围。
