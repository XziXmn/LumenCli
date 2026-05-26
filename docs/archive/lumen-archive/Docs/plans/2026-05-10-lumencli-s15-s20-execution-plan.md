# LumenCli S1.5+S2.0 深度重构执行计划

日期：2026-05-10
状态：Ready to execute
范围：合并后的 S1.5+S2.0 深度重构 + S11–S15 后续步骤的重新编排
依赖文档：
- `Docs/plans/2026-05-10-lumencli-phase1-agent-mvp-blueprint.md`
- `Docs/specs/2026-05-10-lumencli-pi-agent-core-decision.md`
- `Docs/specs/2026-05-10-lumencli-reference-usage-policy.md`

## 0. 前置规划决策（P0）

执行前需要把以下 12 条在回顾中识别的遗漏逐一锁定。每条给出推荐选项与理由。进入实施前这些决策必须定稿。

### P0.1 Session 持久化路径

- **决策**：默认 `%USERPROFILE%\.lumen\sessions\<session-id>.jsonl`；允许 `LUMEN_SESSION_DIR` 覆盖；工作区模式下额外支持 `.lumen/sessions/` 就地存储。
- **理由**：和 memory 路径保持一致的 `.lumen` 命名空间；用户目录作为默认是 personal assistant 的自然落点；工作区模式为未来 `.novel` 项目预留。

### P0.2 `smoke:provider` 的 mock 方案

- **决策**：保留当前 mock HTTP server 方案作为主路径，不改 faux provider。
- **理由**：pi-ai 的 faux provider 需要深入 pi-ai 内部 API，而 mock HTTP server 已经验证 LumenCli → pi-ai → OpenAI-compatible 的完整栈，覆盖率更高。pi-ai faux 作为未来补充 smoke。

### P0.3 typebox 依赖边界

- **决策**：`@lumen/tools` 的 `LumenTool` 保留 JSON-Schema 风格的 `parameters` 对象（`{ type: "object", properties: {...} }`）。typebox 只在 `@lumen/agent-core` 内部的 `toPiAgentTool` 适配层使用，用 typebox 的 `Type.Any()` + 运行时 schema 包装即可。
- **理由**：让 `@lumen/tools` 保持与 MCP / OpenAI tool spec 同构，不绑 typebox；适配成本压在 agent-core 内部。

### P0.4 Context 注入路径

- **决策**：双轨分工。
  - **系统性规则与工作区摘要**（AGENTS.md / LUMEN.md / cwd summary）进 `systemPrompt`，通过 `base/system.en.md` + 动态拼接。
  - **Recent messages 与 memory 摘要**进 `transformContext` 钩子，作为 AgentMessage 注入。
- **理由**：pi-agent-core 的 `transformContext` 设计意图就是 "inject external context / prune old messages"；规则类 prompt 应该固定在 system，messages 类 context 适合动态裁剪。

### P0.5 Error 事件映射

- **决策**：
  - pi-agent-core 的 `turn_end` 里 `message.stopReason === "error" | "aborted"` → LumenCli `error` 事件 + `message_delta`（错误原因作为 assistant 文本）+ `run_end`。
  - Provider 抛错或 tool 抛错由 pi-agent-core 内部捕获并编码为 `stopReason: "error"`，不再单独处理。
  - LumenCli 不新增独立 error path，错误走正常 message 流让 CLI 渲染一致。
- **理由**：pi-agent-core 已经把错误正规化为 assistant 消息结构，LumenCli 不应该再在上层绕过去。

### P0.6 Skills / prompt-templates 扫描路径与优先级

- **决策**：
  - **Skills 扫描顺序**：`packages/prompts/assets/skills/`（内置）< `~/.lumen/skills/`（用户全局）< `<cwd>/.lumen/skills/`（工作区）。同名以后者覆盖。
  - **Prompt-templates 扫描顺序**：`packages/prompts/assets/*` 内置 + `~/.lumen/prompts/*` 用户全局 + `<cwd>/.lumen/prompts/*` 工作区。同名以后者覆盖。
- **理由**：工作区覆盖用户覆盖内置是 CLI 工具的通行惯例。

### P0.7 Slash 命令 vs Natural prompt 分流

- **决策**：保留当前分流。
  - `/xxx` 形式：不进 pi-agent-core `Agent`，直接由 `@lumen/command-system` 执行，可选择通过 `agent.completeCommandPrompt` 调用模型产出单轮文本（不走 tool-call loop）。
  - 其他输入：进 pi-agent-core `Agent.prompt()`，完整 tool-call loop。
- **理由**：slash 命令的 UX 契约是确定性、可预期的；不应该被 tool-call loop 影响。

### P0.8 Memory 与 Session 关系

- **决策**：Phase 1 范围内两者完全独立。
  - Memory = JSONL，跨会话 profile / preference / summary，继续用现有路径。
  - Session = pi-agent-core jsonl session repo，单次会话 transcript。
  - 不在 Phase 1 做自动对接。预留 `LumenSession.onEnd` 钩子，后续阶段可以在 session 结束时生成摘要写 memory。
- **理由**：避免在重构窗口里叠加数据模型改动。

### P0.9 依赖体积警告落地

- **决策**：
  - README 新增"依赖体积说明"小节，披露 pi-ai 会拉入多家 provider SDK。
  - 不在 Phase 1 做裁剪版 fork。
  - 后续若用户反馈体积痛点，按 Reference Usage Policy 走独立 spec 决策。
- **理由**：Phase 1 先披露，不延迟主工作。

### P0.10 `.novel` 与新 prompt 目录对齐

- **决策**：
  - 写作 pack 继续保留 `@lumen/writing` 包，但内部 prompt 文本迁移到 `packages/prompts/assets/writing/*.zh.md`。
  - `.novel` 项目检测作为 `@lumen/context` 的扩展模块，读取到的项目信息进 `transformContext`。
  - `.novel` 专属 prompt 放在 `packages/prompts/assets/writing/novel/` 子目录，按需加载。
- **理由**：保持 `@lumen/writing` 作为命令入口，prompt 作为资产分离，避免再发明一套"写作专属 prompt loader"。

### P0.11 CLI Permission Prompt 位置（原 S12）

- **决策**：
  - `@lumen/permissions` 的 `decide` 产出 `ask` 决策时，pi-agent-core `beforeToolCall` 钩子里抛出 `PermissionRequiredError`。
  - `@lumen/agent-core` 捕获该错误，emit 一个新事件 `permission_required`，然后等待 CLI 回调（通过 `agent.respondToPermission(decision)`）。
  - `apps/cli` 订阅 `permission_required` 事件，弹出中文确认提示，调 `respondToPermission`。
  - 这条路径走 async resolver 模式，不阻塞 event loop。
- **理由**：把 UI 决策和权限引擎解耦；agent-core 只负责暴露事件和接收结果。

### P0.12 S11–S15 重新编排

原 phase1-verification.md 建议的 S11–S15 与新架构对齐后：

- 原 S11 tool-call loop：**并入 S1.5+S2.0**，被 pi-agent-core 吸收。
- 原 S12 CLI permission prompt：改为 **S1.6**，在 S1.5+S2.0 完成后立刻做。
- 原 S13 MCP config loader：改为 **S1.7**。
- 原 S14 `.novel` 最小上下文：改为 **S1.8**。
- 原 S15 测试框架：改为 **S1.9**，升级为"引入 vitest，替换 smoke 脚本中的重复 build"。

本执行计划覆盖 S1.5+S2.0，以及规划 S1.6–S1.9 的入口；不在本窗口内实施 S1.6–S1.9。

---

## 1. 执行阶段概览

| 阶段 | 范围 | 对应决策 spec | 预估粒度 |
| --- | --- | --- | --- |
| P0 | 前置规划决策（本章） | 本文件 §0 | 已在本文件定稿 |
| P1 | Runtime Layer - pi-ai provider 封装 | 决策 spec §5.1 | **已完成** |
| **P1.5a** | **Runtime 切 Bun + 完整兼容性扫描** | **本文件 §2a** | **1-2 轮** |
| **P1.5b** | **TUI Foundation（OpenTUI + React + core/ui 分层）** | **本文件 §2b** | **2-3 轮** |
| P2 | Runtime Layer - agent-core 内核替换与事件映射 | 决策 spec §5.2 | 2 轮 |
| P3 | Runtime Layer - tool 适配 + 权限 hook | 决策 spec §5.3 | 1 轮 |
| P4 | Runtime Layer - session / compaction / skills / prompt-templates 接入 | 决策 spec §5.4 | 2 轮 |
| P5 | Prompt Layer - 目录结构与基础 prompt 文件 | 决策 spec §5.5 §5.6 | 2 轮 |
| P6 | Prompt Layer - provider-aware 分发 | 决策 spec §5.7 | 1 轮 |
| P7 | 语言规则全面应用 | 决策 spec §5.8 | 1 轮 |
| P8 | Smoke 更新（含 TUI smoke） | 决策 spec §5.9 | 1 轮 |
| P9 | 文档同步与 Plan Mutation Log | 决策 spec §5.10 | 1 轮 |
| P10 | 汇总验证（smoke:all） | 决策 spec §7 | 1 轮 |

顺序原则：P1.5a 必须最先（所有后续阶段都在 Bun 上验证）；P1.5b 在 P1.5a 之后、P2 之前（P2 的 Agent event 映射到 CLI UI 事件需要 TUI 在位）。

---

## 2. 阶段详细任务

每条任务都给出：Goal、Subtasks、Verify、Exit Criteria、Rollback。

### P1 Runtime Layer - pi-ai provider 封装（已完成）

**状态**：**已完成 ✓**。当前 `@lumen/model-provider` 已内部使用 pi-ai，`smoke:all` 通过。本节保留作为历史记录；实施细节略。

本阶段产出：

- `packages/model-provider/src/pi-ai.ts`、`types.ts`、`openai-compatible.ts`。
- `packages/config/src/index.ts` 升级为多字段 `LumenProviderConfig`，含本地默认 mimo-v2.5 配置。
- smoke 脚本升级为支持 streaming 的 mock OpenAI-compatible server（`scripts/lib/mock-openai.mjs` 抽取共享）。

Verify 命令（历史记录）：

```powershell
pnpm build
pnpm typecheck
pnpm smoke:all
```

注：P1.5a 完成后，所有 Verify 命令将从 `pnpm` 迁移到 `bun run`。

---

### P1.5a Runtime 切换到 Bun

**Goal**：把 LumenCli 从 Node + pnpm 完全切换到 Bun ≥ 1.3，保持所有现有功能与 smoke 通过；建立 Windows x64 一等公民基线。

**前置任务（必须在动代码前完成）**：

1. **Bun 兼容性扫描**（不动代码）：
   - 扫描所有直接 dependencies：`@earendil-works/pi-ai`、`@modelcontextprotocol/sdk`、未来将引入的 `@opentui/*`、`@earendil-works/pi-agent-core` 等。
   - 对每个 dep 在 Bun 下做冒烟 import：`bun -e "import '<dep>'"`，记录成功 / 失败 / warning。
   - 扫描结果写入 `Docs/reports/2026-05-10-bun-compat-scan.md`：列出每个 dep 的 Bun 兼容状态、已知问题、regression mitigation。
   - 扫描覆盖 Node builtins 使用：`node:fs/promises`、`node:child_process`、`node:readline/promises`、`node:http`、`node:crypto`。Bun 都兼容，但需要逐一确认。
2. **Bun 版本锁定**：确认本机 Bun ≥ 1.3.0。如果未装，先装 Bun，否则所有后续工作卡住。

**Subtasks**（前置扫描通过后开始）：

1. 根 `package.json`：
   - 删除 `"packageManager": "pnpm@..."`。
   - 新增 `"engines": { "bun": ">=1.3.0" }`，删 `engines.node`。
   - 删除 `"devDependencies.tsx"`（Bun 原生吃 `.ts`）。
   - 把所有 `scripts.*` 从 `pnpm --filter ...` / `pnpm run ...` 改为 `bun run --cwd ...` 形式。
   - 把所有 `scripts.*` 里的 `node scripts/*.mjs` 改为 `bun scripts/*.mjs`。
2. 删除 `pnpm-workspace.yaml` 与 `pnpm-lock.yaml`。
3. 在根 `package.json` 加 `"workspaces": ["apps/*", "packages/*"]`（Bun 原生支持）。
4. 各子包 `package.json`：
   - 把 `scripts.dev` 从 `tsx --conditions development src/main.ts` 改为 `bun --conditions development src/main.ts`。
   - `scripts.build` 保持 `tsc -b`（Bun 能跑 tsc）。
5. `apps/cli/package.json`：确认 `bin.lumen: "./dist/main.js"` 在 Bun 下可执行。
6. `scripts/*.mjs` 中使用 `spawn pnpm` / `cmd.exe /d /s /c pnpm...` 的地方改为 spawn `bun`。
7. `.gitignore` 不变（`node_modules/` 在 Bun workspaces 下仍用）。
8. 生成 `bun.lock`：执行 `bun install` 一次，提交 lockfile。

**Verify**：

```powershell
bun install
bun run build
bun run typecheck
bun run smoke:all
```

**Exit Criteria**：

- 所有 smoke 在 Bun 下通过，行为与 Node + pnpm 时完全一致。
- `package.json` 无 `pnpm` 字样，无 `tsx` 依赖，无 `node scripts/`。
- `Docs/reports/2026-05-10-bun-compat-scan.md` 已落地并记录所有依赖 Bun 兼容状态。
- README 更新安装章节，明确要求 Bun 1.3+ 与 Windows x64。

**Rollback**：

- 保留 `backup/pnpm-node-baseline` git 分支，切回分支即恢复。
- lockfile / workspace 改动集中提交，便于整体 revert。

**风险**：

- Bun Windows 支持虽成熟，但某些 native addon 可能出现意外（例如 `@earendil-works/pi-ai` 依赖的 `undici`、`openai` SDK 在 Bun 下的行为需验证）。
- `@modelcontextprotocol/sdk` 在 Bun 下可能有 ESM resolver 差异。
- 所有风险在前置兼容性扫描中优先暴露。

---

### P1.5b TUI Foundation（OpenTUI + React + core/ui 分层）

**Goal**：用 OpenTUI + React 替换当前 readline shell，建立 `apps/cli/src/core` 与 `apps/cli/src/ui` 的严格分层，输出第一版 `ChatView` / `StatusBar` / `CommandBar` 三件套，支持流式输出与单轮命令渲染。

**依赖**：P1.5a 已完成（Bun 就位）。

**进度**：

- **步骤 0 环境探活（✅ 完成 2026-05-10）**：
  - `apps/cli` 引入 `@opentui/core@0.2.6`、`@opentui/react@0.2.6`、`@opentui/keymap@0.2.6`、`react@19.2.6`。
  - `apps/cli/src/tui-hello.tsx` 最小 probe 在 Bun + Windows x64 下成功渲染，React state + `setInterval` 定时 tick + `useKeyboard` Esc 退出全部正常。
  - CJK（中文）与 Unicode 标点渲染通过（终端 pipe 抓取会乱码，直接查看正常）。
  - 现有 `smoke:all` 在新增依赖后仍然全绿。
  - Zig native addon 通过 `@opentui/core` 内部 `platform/ffi.ts` + `bun:ffi` 成功加载（无需单独安装 `@opentui/core-win32-x64`；Bun 自动解析 optionalDependencies 的平台目标）。
  - 结论：技术栈链路（Bun 1.3.13 → `@opentui/react` → `@opentui/core` → Zig → Windows terminal）可用。
- **步骤 1 core/ 层数据结构（✅ 完成 2026-05-12）**：
  - `apps/cli/src/core/view-model.ts`：`ViewStore` pub-sub + `ViewState` + `ChatMessage` / `ToolCallLog` / `RuntimeInfo` 不可变 helper（`appendMessage` / `updateMessage` / `appendToolLog` / `finishToolLog`）。
  - `apps/cli/src/core/event-bus.ts`：`pumpAgentEvents` 把 `AgentEvent` 流吐到 `ViewStore`，错误统一编码为 `status.error`。
  - `apps/cli/src/core/actions.ts`：`ActionDispatcher` 承载 `setInput` / `historyPrev` / `historyNext` / `submit` / `requestCancel`。
  - `apps/cli/src/core/key-bindings.ts`：`mapKey` 把 raw `KeyEvent` 映射为 `LumenKeyAction`（逻辑键名），不依赖任何渲染框架。
  - `apps/cli/src/core/**` **零 `@opentui/*` / `react` 依赖**，由 `smoke:boundaries` 静态扫描保障。
- **步骤 2 ui/react/ 骨架（✅ 完成 2026-05-12）**：
  - `apps/cli/src/ui/react/use-view-store.ts`：React `useSyncExternalStore` 适配 `ViewStore`。
  - `apps/cli/src/ui/react/ChatView.tsx`：消息 / 工具日志交错展示，流式打字机通过 `streaming + ▍` 光标模拟。
  - `apps/cli/src/ui/react/StatusBar.tsx`：显示运行状态 / 模型 / 提供者 / 工作目录。
  - `apps/cli/src/ui/react/CommandBar.tsx`：OpenTUI `<input>` + dispatcher 对接，空闲时 focused，运行中灰掉。
  - `apps/cli/src/ui/react/App.tsx`：根组件，挂载三件套 + `useKeyboard` 捕获全局逻辑键（cancel / history / quit）。
  - `apps/cli/src/main.tsx` 新入口：`--once` headless 路径保持旧行为（smoke 不启动 Zig），`--tui-probe` 保留；其余走 OpenTUI 交互模式（lazy import 确保 headless 不载 native）。
  - 原 `apps/cli/src/main.ts` 已删除；`bin.lumen` 仍指向 `dist/main.js`。
- **步骤 3 smoke + 边界规则（✅ 完成 2026-05-12）**：
  - `scripts/smoke-boundaries.mjs`：静态扫描 `apps/cli/src/core/**` 与 `packages/**` 下所有 `.ts/.tsx/.mts/.cts` 文件，禁止 `@opentui/*` / `react` / `react-dom` / `ink` import。ESLint 进来前由此脚本把关。
  - `scripts/smoke-tui-render.mjs`：`@opentui/react/test-utils.testRender` headless 渲染 `<App>` 一次，断言 char frame 含 `欢迎使用 LumenCli` / `模型` / `mock-model` / `lumen` 四个片段。
  - 根 `package.json` 增加 `@opentui/core` / `@opentui/react` / `react` 为 root devDependencies，使 `scripts/*.mjs` 直接可解析这些包；无运行时副作用（apps/cli 仍声明自己的依赖）。
  - `smoke:all` 链路新增 `smoke:boundaries`（首位）与 `smoke:tui-render`（末位）。
  - Verify 结果：`bun run smoke:all` 全绿（含 boundaries + tui-render + 所有原有 12 条）。
  - 残留：React 19 `act()` warning 由 `test-utils.testRender` 输出，不影响断言；未来换成 vitest + `react` act 包装时解决。

**Subtasks**：

1. 引入 OpenTUI 依赖（精确版本 pin）：
   - `@opentui/core`
   - `@opentui/react`
   - `@opentui/keymap`
   - `react >= 19.2.0`
   - `react-reconciler >= 0.33.0`（opentui react 的 peer dep）
2. 建立 `apps/cli/src/core/**` 分层（所有 UI 无关逻辑）：
   - `view-model.ts`：session state + 派生的 UI 状态（messages / streaming flag / current model / tool logs）。
   - `event-bus.ts`：订阅 `LumenAgent` 事件、转换为 `ViewEvent`。
   - `actions.ts`：所有用户动作（submitPrompt / switchModel / approveTool / cancel）。
   - `key-bindings.ts`：逻辑键名 → 动作，不含 raw keypress 解析。
3. 建立 `apps/cli/src/ui/react/**`（第一 UI 实现）：
   - `App.tsx`：根组件，挂载 ChatView / StatusBar / CommandBar，处理 `permission_required` 模态。
   - `ChatView.tsx`：聊天流 + 流式打字机渲染（用 React state + `useDeferredValue` 保持输入响应）。
   - `StatusBar.tsx`：显示当前 model / session / permissionMode / token 估算。
   - `CommandBar.tsx`：slash 命令补全 + 普通 prompt 输入（方向键历史、Ctrl+C 中断）。
   - `ModelPicker.tsx`：`/model` 选择框（方向键 + 回车）。
   - `PermissionModal.tsx`：write / shell 授权模态（中文文案，Esc 取消 / Enter 批准 / N 拒绝）。
4. 建立 ESLint `no-restricted-imports` 规则：
   - `apps/cli/src/core/**` 禁止 import `@opentui/*` / `react` / `ink`。
   - `packages/**/src/**` 禁止 import `@opentui/*` / `react`。
5. 重写 `apps/cli/src/main.ts`：
   - 启动 `@opentui/react` 的 root container。
   - 组装 core/ 与 ui/react/，根组件传入 core/ 的 action dispatcher。
6. 首版只用 OpenTUI 通用特性子集：
   - Box / Text / Input / 基础键盘事件 / 简单 modal。
   - 不用 three / solid / GPU compositing / 自定义 reconciler 特性。
7. 新增 smoke `smoke:tui-render`：
   - headless 模式渲染一次 ChatView + StatusBar + CommandBar，断言输出含中文、断言方向键事件被处理。
   - 使用 `@opentui/react/test-utils`（参考 `references/opentui/packages/react/src/test-utils.ts`）。

**Verify**：

```powershell
bun run build
bun run typecheck
bun run dev:cli
bun run smoke:tui-render
bun run smoke:all
```

**Exit Criteria**：

- 启动 `lumen` 进入 OpenTUI 驱动的交互 shell，输入普通 prompt 能看到流式打字机输出、状态栏、命令栏。
- `/help`、`/status`、`/tools` 等 slash 命令在 TUI 下正常显示。
- `/model` 弹出选择框可用方向键切换。
- ESLint 规则生效：在 `apps/cli/src/core/**` 写 `import "@opentui/core"` 会被拒绝。
- `smoke:tui-render` 通过。
- README 更新启动流程截图或文字说明。

**Rollback**：

- 保留 `backup/readline-ui-baseline` git 分支。
- 如果 TUI 在 Windows Terminal / cmd / PowerShell 某条路径卡死，可回退到 readline 模式暂时使用，并记录 bug。

**风险**：

- OpenTUI 在 Windows 某些终端（旧 cmd、非 ANSI 控制台）可能渲染异常，Phase 1 明确只保证 **Windows Terminal + Windows PowerShell 7+ / cmd（VT mode 开启）** 下可用，其他环境豁免。
- Windows CJK 宽度渲染：OpenTUI 依赖 `string-width`，基本兼容，但要手工验证中文混合 emoji 的宽度计算。
- React 19 + react-reconciler 0.33 在 Bun 下可能有 transitive ESM 问题，前置扫描覆盖。

---

### P2 Runtime Layer - agent-core 内核替换与事件映射

**Goal**：`@lumen/agent-core` 内部用 pi-agent-core `Agent`，对外 `LumenAgent.run()` 形状不变。

**Subtasks**：

1. `packages/agent-core/package.json` 增加 `@earendil-works/pi-agent-core` 依赖（精确版本 `0.74.0`）。
2. 新建 `packages/agent-core/src/event-mapper.ts`：
   - 输入：pi-agent-core `AgentEvent`。
   - 输出：LumenCli `AgentEvent`。
   - 映射规则见 P0.5 与决策 spec §5.2。
3. 重写 `packages/agent-core/src/index.ts` 的 `LumenAgent`：
   - 内部持有 pi-agent-core `Agent` 实例。
   - `systemPrompt` 由 `buildSystemPromptViaPrompts()` 产出（P5 实现，P2 阶段先用静态字符串占位）。
   - `run(input)` 变为：
     - slash 分流仍走 `CommandRegistry`（P0.7）。
     - natural prompt 走 `agent.prompt(input)`，事件经 mapper 转发。
   - 新增 `permission_required` 事件类型、`respondToPermission(requestId, decision)` 方法（P3 使用）。
4. `completeCommandPrompt` 改为使用 pi-ai `streamSimple` 的非 tool 调用形式或单独 provider 路径，保留单轮语义（P0.7）。

**Verify**：

```powershell
pnpm build
pnpm typecheck
pnpm smoke:cli
pnpm smoke:provider
```

**Exit Criteria**：

- `LumenAgent.run()` 的 `AsyncGenerator<AgentEvent>` 契约与现在完全一致（`run_start / turn_start / message_start / message_delta / message_end / tool_call_start / tool_call_end / turn_end / run_end / error`）。
- pi-agent-core 类型不出现在 `packages/agent-core/src/index.ts` 的 exports 中。
- `apps/cli` 代码除了 provider 初始化外无需修改。

**Rollback**：

- 保留 git 分支 `backup/agent-core-pre-pi`，回滚只需切分支。

---

### P3 Runtime Layer - tool 适配 + 权限 hook

**状态**：**✅ 完成 2026-05-12**。

**Goal**：LumenCli 工具经 pi-agent-core tool-call loop 执行，权限拦截统一走 `@lumen/permissions`。

**已交付**：

- `packages/agent-core/src/tool-adapter.ts`：
  - `LumenToolArgsSchema = Type.Record(Type.String(), Type.Any())` 把 typebox 限制在本文件内，LumenTool 仍保持 JSON-Schema 风格的 `Record<string, unknown>` 原生签名（兑现 P0.3 决策）。
  - `toPiAgentTool` / `toPiAgentTools` 把 LumenTool 转换为 pi-agent-core `AgentTool<TSchema>`，execute 直接调 `tool.call()`（跳过 `ToolRegistry.call` 避免双重权限检查）。
  - `createBeforeToolCallHook` 在 pi-agent-core 的 `beforeToolCall` 中：
    - `allow` → 放行
    - `deny` → 返回 `{ block: true, reason }`，pi-agent-core 发 tool error result
    - `ask` → 创建 `permission_required` 事件 + 等待 resolver，`signal.abort` 时自动拒绝
- `packages/agent-core/src/permission-resolver.ts`：
  - `PermissionPromptResolver`：pending map + `create/respond/abortAll`。
- `packages/agent-core/src/public-types.ts`：新增 `permission_required` 事件类型。
- `packages/agent-core/src/index.ts`：
  - `LumenAgent.respondToPermission(requestId, decision)` 公开方法。
  - `runWithPiAgent` 构造 piTools + beforeToolCall hook 并注入 piAgent。
  - 运行收尾 `permissionResolver.abortAll("Run completed.")` 兜底。
  - 公开导出 `PermissionPromptDecision` 类型。
- `packages/agent-core/src/pi-agent-adapter.ts`：`createLumenPiAgent` 支持透传 `beforeToolCall` / `afterToolCall` 参数。
- `packages/agent-core/package.json`：新增 `typebox: 1.1.38` 精确版本，仅在 tool-adapter 内部使用。
- `scripts/smoke-agent-loop.mjs`：
  - **Scenario A（happy path）**：faux provider 产出 `fs.readText` tool call → 权限引擎自动允许（read-only）→ 真读磁盘 → 返回内容 → 第二轮 assistant text。断言事件序列 `run_start → turn_start → message_start → tool_call_start → tool_call_end → message_end → turn_end → run_end`，权限引擎被调用 ≥1 次，最终 response 含文件内容。
  - **Scenario B（denied path）**：`permissionMode: "denyDangerous"` 下触发 `shell.run` call，beforeToolCall 返回 `block: true`，tool_call_end 内容包含 "denied/blocked/not permitted" 字样。
- `package.json`：`smoke:agent-loop` 注册并进入 `smoke:all` 链。

**Verify 结果**：`bun run smoke:all` 全绿（含 boundaries / cli / provider / permissions / tools / mcp / context / memory / writing / ux / pi-agent / agent-run / **agent-loop** / tui-render，共 14 条）。

**未覆盖（交给后续阶段）**：

- MCP 工具注册经过同一 adapter 路径：当前 MCP 工具仍走 `packages/mcp` 原有链路，P3 只覆盖 core tools。S1.7 MCP config loader 实施时顺带接入。
- `afterToolCall` 钩子：保留透传接口，Phase 1 无使用者。

---

- **P4 Runtime Layer - session / compaction / skills / prompt-templates 接入**：**部分完成 2026-05-12**（session + skills + prompt-templates 已落地；compaction 留给 P4.2 follow-up）。关键事实：npm 上 `@earendil-works/pi-ai@0.74.0` 和 `@earendil-works/pi-agent-core@0.74.0` **不导出** `shouldCompact / compact / estimateContextTokens / loadSkills / loadPromptTemplates` —— 这些符号是 pi-mono 内部 (`pi-coding-agent` / `pi-agent` 的私有模块)，未发布。按 upstream-intake-policy §8 scoped vendor 准入条件（≤200 LOC + 小而完整 + 上游未公开导出），对 skills / prompt-templates / session 三项在 LumenCli 内做 clean-room 实现。

  **已交付**：
  - `packages/prompts/src/loaders/skills.ts`：`loadSkills({ cwd, home, builtinDir, env, warn, maxDepth })` 扫描 7 级候选路径（builtin / user-lumen / user-claude / user-agents / workspace-lumen / workspace-claude / workspace-agents），递归查 `SKILL.md`，later-wins 合并；支持 `LUMEN_DISABLE_EXTERNAL_SKILLS` / `LUMEN_DISABLE_CLAUDE_SKILLS` 关闭；YAML frontmatter 最小解析（字符串 / 数字 / 布尔）；无 frontmatter 时按目录名回退为 slug。
  - `packages/prompts/src/loaders/prompt-templates.ts`：`loadPromptTemplates({ ... })` 扫描 5 级候选路径（builtin / user-lumen / user-claude / workspace-lumen / workspace-claude），扁平 `<name>.md`，parse frontmatter（`description` / `argument-hint` / `allowed-tools`）。`substituteTemplateArguments(body, argString)` 支持 Claude 风格占位符：`$ARGUMENTS` / `$1` .. `$9` / `$@` / `${@:N}` / `$$` 转义。
  - `packages/agent-core/src/session.ts`：`openSession({ dir, sessionId, cwd, mode, env, home })` 写 JSONL。默认路径 `%USERPROFILE%\.lumen\sessions\<session-id>.jsonl`；`LUMEN_SESSION_DIR` 覆盖；`mode: "workspace"` 切 `<cwd>/.lumen/sessions/`。`appendMessage` / `append` 串行化写入避免乱序；`close` 写 `session_end`。辅助：`listSessions` / `readSessionFile` / `readSessionSummary` / `replaySession` / `resolveDefaultSessionDir`。
  - `packages/command-system/src/index.ts`：`CommandRegistry` 新增 `get(name)` 与 `unregister(name)`（P4 `/status` 覆盖需要）。
  - `packages/agent-core/src/index.ts`：`LumenAgentOptions` 新增 `skills` / `promptTemplates` / `session` 字段。`LumenAgent` 新增对应字段，system prompt 组装里追加 `# Available Skills` 段，`appendMessage` 自动 fire-and-forget 写入 session log。新增 `/skills` 与 `/templates` 命令；`/status` 扩展为显示 skills / templates / sessionLog 路径。
  - `apps/cli/src/main.tsx`：在 `createLumenAgent` 前 parallel `loadSkills` + `loadPromptTemplates`；交互模式默认打开 session log（可通过 `LUMEN_PERSIST_SESSION=1` 在 headless 启用），退出时 `handleExit` 显式 `await sessionLog.close()`。
  - 三个新 smoke：`smoke:skills` / `smoke:prompt-templates` / `smoke:session`，各覆盖 precedence + opt-out 环境变量 + 占位符替换 + 读写往返等场景。
  - `smoke:all` 20 条全绿。

  **未覆盖（留给 P4.2）**：
  - **compaction**：`shouldCompact` / `compact` / `estimateContextTokens` 需要 LLM summarization pass，是 P4 最重的部分。留作独立 spec 与独立实施窗口，复用 `@lumen/context` 边界。届时可参考 codex Phase 1 / Phase 2 流水线（Reference Usage Policy §6.6）做分层设计，而非直接照搬 pi-agent-core 私有实现。

  **合规说明**：三个 loader 均在 `@lumen/prompts` 与 `@lumen/agent-core` 内部清洁实现，与 pi-agent-core / pi-coding-agent 源码无直接血缘，`smoke:boundaries` 通过。Reference Usage Policy §6.5 Claude 生态 drop-in 兼容项（skills + commands + MCP 配置）至此三项全部落地。

---

### P5 Prompt Layer - 目录结构与基础 prompt 文件

**Goal**：建立 `packages/prompts/assets/` 目录，产出第一批 prompt 文件。

**Subtasks**：

1. 创建目录：
   ```
   packages/prompts/assets/
     base/
     tools/
     permission/
     writing/
     cli-zh/
     skills/            # 内置 skill 目录（可空）
   ```
2. 基础 prompt 文件（含 frontmatter `source` 字段）：
   - `base/system.en.md`（source: claude-code@2.1.88, adapted，主 system prompt）。
   - `tools/fs-readText.en.md` / `fs-writeText.en.md` / `fs-list.en.md` / `project-search.en.md` / `shell-run.en.md`（source: claude-code@2.1.88, adapted）。
   - `permission/block-write.en.md` / `block-shell.en.md` / `block-unknown.en.md`（source: claude-code@2.1.88, adapted）。
   - `writing/plan.zh.md` / `draft.zh.md` / `review.zh.md` / `revise.zh.md`（source: lumen-rebuild, migrated 或 lumencli-original）。
   - `cli-zh/help.zh.md` / `status.zh.md` / `commands.zh.md` / `permission-prompt.zh.md` / `errors.zh.md`（source: lumencli-original）。
3. 每个文件使用 XML-ish 结构（英文标签 + 内容按语言），遵循决策 spec §5.8 的约定。
4. 新建 `packages/prompts/src/registry.ts`：
   - `getPrompt(capability: string, modelHandle?: LumenModelHandle): Promise<string>`。
   - 默认实现：按 `capability.<provider>.en.md` → `capability.en.md` → `capability.zh.md`（写作特例）顺序查找。
   - frontmatter 解析复用 pi-agent-core 的 skill / prompt-template 解析器。

**Verify**：

```powershell
pnpm build
pnpm typecheck
# 新增手工 smoke：
node -e "import('@lumen/prompts').then(m => m.getPrompt('base/system')).then(console.log)"
```

**Exit Criteria**：

- 每个 prompt 文件都有合规的 frontmatter `source` 字段（通过 lint 或 script 检查）。
- `getPrompt` 对未知 capability 抛出清晰错误。
- `packages/writing` 的命令处理改为读取 `writing/*.zh.md` 而不是硬编码字符串。

**Rollback**：

- `packages/writing` 恢复硬编码字符串；`packages/prompts` 的 registry 保留但不被 agent-core 调用。

---

### P6 Prompt Layer - provider-aware 分发

**Goal**：按 `modelHandle.api.id` 自动选择对应 provider 的 prompt 变体，参照 opencode 的 `provider(model)` 模式。

**Subtasks**：

1. 在 `packages/prompts/src/registry.ts` 实现 `selectPromptFile(capability, modelId)`：
   - match `claude` → `<capability>.claude.en.md`
   - match `gpt` → `<capability>.gpt.en.md`
   - match `gemini` → `<capability>.gemini.en.md`
   - 其他 → `<capability>.en.md`
2. 仅为 `base/system` 先产出 provider 变体（其他 capability 有需要时再加）：
   - `base/system.claude.en.md`
   - `base/system.gpt.en.md`
   - `base/system.gemini.en.md`
3. 写作特例硬编码不做分发：`writing/*.zh.md` 永远单文件。
4. 扫描和缓存 prompt 文件列表，避免每次调用都 IO。

**Verify**：

```powershell
pnpm build
pnpm typecheck
pnpm smoke:prompts   # P8 阶段会新增
```

**Exit Criteria**：

- 使用 Claude 系列模型时 `base/system` 命中 `.claude.en.md`；OpenAI 系列命中 `.gpt.en.md`；其他命中默认 `.en.md`。
- 写作特例不受 provider 影响。

**Rollback**：

- `selectPromptFile` 退回只返回默认 `<capability>.en.md`。

---

### P7 语言规则全面应用

**Goal**：按决策 spec §5.8 把现有硬编码的 CLI 文案全部落到中文，把现有硬编码的 tool / prompt 文本统一到英文（写作除外）。

**Subtasks**：

1. 统一 CLI 中文化：
   - `apps/cli/src/main.ts` 的提示文本、错误包装改为中文，或者改为调 `@lumen/prompts` 的 `cli-zh/*.zh.md`。
   - 所有 `/help`、`/status`、`/config`、`/model`、`/tools` 输出的中文化（已经大部分是，复核一遍）。
2. 统一 tool description 英文化：
   - `packages/tools/src/index.ts` 的 `summary` / `description` 复核，全部英文。
   - 适配层读取 `packages/prompts/assets/tools/<tool-name>.en.md` 作为给 AI 的 description（若存在）。
3. 写作命令保持中文：`packages/writing` 不做改动，但 prompt 文本从 `writing/*.zh.md` 加载。
4. Slash 命令 usage / summary 中文化：
   - `@lumen/command-system` 的 `LumenCommand.summary / usage` 统一中文。
   - 命令名保持英文。

**Verify**：

```powershell
pnpm build
pnpm typecheck
pnpm smoke:ux       # 主要覆盖这一阶段
pnpm smoke:writing
```

**Exit Criteria**：

- 跑 `pnpm --filter @lumen/cli dev -- --once /help` 输出全部是中文（命令名英文除外）。
- tool description 在 provider payload 中全部是英文。
- 写作命令输出是中文。

**Rollback**：

- 分文件回退，不影响其他阶段。

---

### P8 Smoke 更新

**Goal**：新增 `smoke:agent-loop` 与 `smoke:prompts`，更新现有 smoke 断言。

**Subtasks**：

1. 新增 `scripts/smoke-agent-loop.mjs`：
   - 用 pi-ai faux provider + 注册一个 fake tool。
   - 触发一次 tool-call loop：模型请求工具 → 工具返回 → 模型总结。
   - 断言事件序列包含 `turn_start / message_start / tool_execution_start / tool_execution_end / message_end / turn_end` 多轮。
   - 断言权限引擎被调用过。
2. 新增 `scripts/smoke-prompts.mjs`：
   - 调 `getPrompt('base/system', ...)`，切换 modelHandle 的 `api.id` 为 `gpt-4o` / `claude-3-5-sonnet` / `gemini-2.0`，断言命中文件不同。
   - 写作 capability 断言总是命中 `.zh.md`。
   - 断言所有 `.md` 文件 frontmatter 有 `source` 字段。
3. 更新 `package.json` 的 `scripts.smoke:all`，加入两个新 smoke。
4. 更新现有 smoke 断言：
   - `smoke:tools` 覆盖新的 tool-call 路径（经 pi-agent-core）。
   - `smoke:permissions` 覆盖 `permission_required` 事件路径。

**Verify**：

```powershell
pnpm build
pnpm typecheck
pnpm smoke:agent-loop
pnpm smoke:prompts
pnpm smoke:all
```

**Exit Criteria**：

- `pnpm smoke:all` 在新结构下完整通过。
- CI 失败率为 0（本地执行 3 次稳定通过）。

**Rollback**：

- 新 smoke 失败时单独禁用，不阻塞其他 smoke。

---

### P9 文档同步与 Plan Mutation Log

**Goal**：所有已完成工作在文档层面固化。

**Subtasks**：

1. 更新 `README.md`：
   - 新增"依赖体积说明"章节（P0.9）。
   - 命令清单和能力清单反映新架构（tool-call loop、streaming、skills、prompt-templates 等）。
   - 已知限制更新（原 "尚未实现 tool-call loop" 移除；新增 "MCP config loader / .novel 专项 / 测试框架 尚未接入"）。
2. 更新 `Docs/reports/2026-05-10-lumencli-baseline.md`：
   - 追加 S1.5+S2.0 完成记录。
3. 更新 `Docs/reports/phase1-verification.md`：
   - 新增"S1.5+S2.0 深度重构验证"章节。
   - 下一阶段建议改为 S1.6 / S1.7 / S1.8 / S1.9。
4. 更新 `Docs/plans/2026-05-10-lumencli-phase1-agent-mvp-blueprint.md` §9.1：
   - 追加"2026-05-10 Complete：S1.5+S2.0 深度重构实施完成"记录。

**Verify**：

- 人工校对文档，确认所有 spec / report / plan / README 相互一致。
- 运行 `pnpm smoke:all` 最后一次，确认没因文档改动误碰代码。

**Exit Criteria**：

- 所有文档交叉引用不断链。
- Plan Mutation Log 对应追加条目。
- README 能让新会话独立接手。

**Rollback**：

- 文档改动可独立回退，不影响代码。

---

### P10 汇总验证

**Goal**：release gate。

**Subtasks**：

1. `pnpm clean && pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm smoke:all`。
2. 手工 smoke：
   - 真实 OpenAI-compatible key 跑一次 tool-call loop（读 README、搜 LumenCli）。
   - 中文 `/help`、`/status` 输出检查。
   - `/plan 写一段雨夜重逢` 写作命令输出检查。
3. 检查 `node_modules` 体积（记录到 verification 报告）。

**Verify**：

```powershell
pnpm smoke:all
pnpm --filter @lumen/cli dev -- --once /help
pnpm --filter @lumen/cli dev -- --once /status
```

**Exit Criteria**：

- `pnpm smoke:all` 通过。
- 手工 smoke 符合预期。
- Phase 1 verification 报告记录本窗口验证结果。

---

## 3. 后续步骤（S1.6–S1.15）占位

本执行计划完成后立刻进入，但不在本窗口实施：

- **S1.6 CLI Permission Prompt**：**✅ 完成 2026-05-12**。`apps/cli/src/core/view-model.ts` 新增 `ActivePermissionPrompt` 与 `ViewState.permissionPrompt` 字段；`event-bus.ts` 把 `permission_required` 事件写入 store，`pumpAgentEvents` 结束时清空 prompt；`ActionDispatcher.respondToPermission` 转发给 `LumenAgent.respondToPermission` 并同步清理 view state；`apps/cli/src/ui/react/PermissionModal.tsx` 负责 Chinese 模态渲染（Enter/Y 允许 / N 拒绝 / Esc 取消），`App.tsx` 在模态打开时屏蔽全局 keymap。`smoke:permission-prompt` 覆盖 allow/deny 双路径；`smoke:tui-render` 扩展到对 modal 渲染的断言。smoke:all 链路扩展为 15 条。
- **S1.7 MCP Config Loader**：**✅ 完成 2026-05-12（loader + auto-connect）**。从 `~/.lumen/mcp.json` 加载 MCP server 配置，扩展到兼容 Claude Code `~/.claude/mcp.json` / `.claude.json` 与通用 `.mcp.json`（见 Reference Usage Policy §6.5）。`packages/mcp/src/config-loader.ts` 导出 `loadMcpServerConfigs`，候选路径按 6 级优先级扫描（built-in → user-lumen → user-claude → workspace-lumen → workspace-claude → workspace-generic），同名后扫胜出，支持 `LUMEN_DISABLE_EXTERNAL_MCP` / `LUMEN_DISABLE_CLAUDE_MCP` 环境变量关闭 drop-in，JSONC `//` 与 `/* */` 注释容忍，malformed JSON 进 `skipped` 列表不抛异常。`packages/mcp/src/auto-connect.ts` 的 `autoConnectMcpServers({ registry })` 把 loader 结果串到 `connectMcpServer` 并注入 ToolRegistry，单个 server 失败不阻塞整体启动（结果里带 `failures` 列表）；`apps/cli/src/main.tsx` 在交互模式自动调用，headless 默认不触发（除非 `LUMEN_MCP_AUTOCONNECT=1`），退出时通过 exit / SIGINT / SIGTERM 钩子清理子进程。`smoke:mcp-config` 覆盖发现路径，`smoke:mcp-autoconnect` 覆盖 loader → connect → 注册 → 实际 callTool 的端到端路径。
- **S1.8 `.novel` 最小上下文**：`@lumen/context` 新增 `.novel` 项目检测，writing pack 读取项目信息。
- **S1.9 测试框架**：引入 vitest，把现有 smoke 脚本逐步转为单元测试，`smoke:all` 里的 `pnpm build` 依赖降低。
- **S1.10 多模型配置与自动切换**：参考 opencode，支持多 provider × 多 model 清单、CLI 交互切换、按能力槽位路由（见下方 §3.1）。
- **S1.11 子代理（sub-agent）任务分配**：参考 Claude Code 的 `invoke_sub_agent` 与 opencode 的 agent 概念，让主代理可以 spawn 专门的子代理处理隔离子任务（见下方 §3.2）。
- **S1.12 Claude 生态 Drop-in 兼容**：一次性把 skills / commands / MCP 的外部目录扫描落地，见 Reference Usage Policy §6.5。参考 opencode `packages/opencode/src/skill/index.ts` 的 `discoverSkills` 实现。详细规划见下方 §3.3。
- **S1.13 永久记忆功能（Long-term Memory，Phase 2+ 占位）**：详见下方 §3.4。
- **S1.14 自我迭代功能（Self-Evolution，Phase 2+ 占位）**：详见下方 §3.5。
- **S1.15 备用号位**：预留给未来补插，不分配具体能力。

每一步都应独立记录 spec 与 Plan Mutation Log。

### 3.1 S1.10 多模型配置与自动切换（规划）

**背景**：

- 当前 `@lumen/config` 只支持单一 provider + 单一 model。用户已有本地 mimo 环境（mimo-v2.5 多模态、mimo-v2.5-pro 编程特化），并有未来扩展到 Claude / GPT / Gemini 的预期。
- opencode 的 `packages/opencode/src/session/system.ts` + `v2/session.ts` 已经把模型切换做成 session 级事件与 per-provider prompt 变体绑定。
- LumenCli 在 Phase 1 决策 spec §5.7 已经铺好 provider-aware prompt 分发结构，为模型切换留了位置。

**核心建模原则**：**能力不从模型 id 推断，由用户显式指派**。

- 多模态不等于编程强；编程特化不等于长上下文好。不同能力是独立维度，不能从模型名猜。
- LumenCli 定义固定能力槽位；每个槽位由用户显式绑定到某个已注册模型。
- 系统仅做"槽位 → 模型"的直查，不做"模型 id → 能力"的推断。

**能力槽位清单**（初版，后续可扩展）：

| 槽位 | 用途 | Fallback |
| --- | --- | --- |
| `default` | 通用对话、写作、一般任务 | 必填，无 fallback |
| `coding` | 写代码、重构、编辑 | fallback 到 `default` |
| `vision` | 图片/文件理解 | **无 fallback**；未配置时拒绝图像输入 |
| `writing` | `/plan /draft /review /revise` | fallback 到 `default` |
| `fast` | 低成本/快路径（意图分类、补全） | fallback 到 `default` |
| `long-context` | 上下文超长场景 | fallback 到 `default` |

**配置形态**（`~/.lumen/config.json`，允许 JSONC）：

```jsonc
{
  // 模型清单：每个条目是一个可用模型资源
  "models": {
    "mimo-v2.5": {
      "providerId": "openai-compatible",
      "baseUrl": "http://192.168.31.160:8007/v1",
      "apiKeyEnv": "LUMEN_MIMO_KEY",
      "contextWindow": 128000,
      // mimo-v2.5 是多模态模型
      "supports": ["vision"]
    },
    "mimo-v2.5-pro": {
      "providerId": "openai-compatible",
      "baseUrl": "http://192.168.31.160:8007/v1",
      "apiKeyEnv": "LUMEN_MIMO_KEY",
      "contextWindow": 128000
      // mimo-v2.5-pro 是编程特化，不声明 vision
    }
  },
  // 能力槽位分配：显式指定哪个槽用哪个模型
  "capabilities": {
    "default": "mimo-v2.5-pro",
    "coding":  "mimo-v2.5-pro",
    "vision":  "mimo-v2.5",
    "writing": "mimo-v2.5-pro",
    "fast":    "mimo-v2.5-pro",
    "long-context": "mimo-v2.5-pro"
  }
}
```

**两条严格分离**：

- `models.*.supports`：技术约束（该模型能否承担某些不可替代的底层能力，如 `vision` / `tool-calling` / `thinking`）。仅用于"能不能分配到对应槽"的合法性校验。
- `capabilities.*`：用户语义指派。系统不关心模型名字里是不是 `pro`、不扫描 id。用户说它强，它才被分配。

**S1.10 范围拆分（三档，择机执行）**：

#### S1.10.A 多模型静态配置 + 能力槽位

**✅ 完成 2026-05-12**（loader + validation 层；CLI 交互切换留给 S1.10.B，自动路由留给 S1.10.C）。

- `packages/config/src/model-catalog.ts`（新）：
  - `LumenModelEntry` / `LumenModelCatalog` / `CapabilitySlot` / `ModelSupportFlag` 类型定义。
  - 六个固定 slot：`default / coding / vision / writing / fast / long-context`（与执行计划 §3.1 表格一致）。
  - `loadModelCatalog({ env, cwd, home, legacy })` 分四层合并，later-wins：
    1. **legacy defaults**：从现有 `LumenConfig.provider.model + visionModel` 种子出 `default` 与 `vision` 槽（保持向后兼容，既有的 mimo-v2.5 + mimo-v2.5-pro 配置原地可用）。
    2. **user-file**：`~/.lumen/config.json`。
    3. **workspace-file**：`<cwd>/.lumen/config.json`。
    4. **env-override**：`LUMEN_MODEL + LUMEN_BASE_URL + LUMEN_API_KEY` 注入一个 default 槽模型。
  - 支持 JSONC（`//` / `/* */` 注释），与 `@lumen/mcp` loader 行为对齐。
  - 验证规则：`capabilities.default` 必填且指向已存在模型；`capabilities.vision` 若绑定必须指向声明 `supports: ["vision"]` 的模型；未知 slot 名报 error（不阻塞启动，但 diagnostics 浮出）。
  - `resolveModelForCapability(catalog, slot)`：非 vision slot 未绑定时 fallback 到 default；**vision 无 fallback**（未配置时返回 undefined，供上层拒绝图像输入）。
- `packages/config/src/index.ts` re-export catalog API。
- `scripts/smoke-model-catalog.mjs`：5 个场景（legacy 种子 / file 合并 + workspace 覆盖 / env 覆盖 / 验证错误 / 缺失 default 报错）。
- `smoke:all` 从 20 条 → **21 条**全绿。

**未覆盖**：

- **S1.10.B CLI 交互切换**：`/model` 选择框、`/model <slot> <id>` 非交互式切换、`/model use <id>` 逃生门、`/model --save` 写回、`/model reset` / `lock` / `unlock`。需要 OpenTUI `<select>` 组件 + `model_binding_changed` session 事件。
- **S1.10.C 场景自动切换**：输入含图片 → vision、/plan/draft/review/revise → writing、上下文估算 → long-context 等路由。需要 pi-agent-core 的 `prepareNextTurn` 钩子以及上下文 token 估算（后者依赖 P4.2 compaction）。
- **runtime 真正消费 catalog**：当前 `LumenAgent` 仍用 `modelHandle` 单槽构造；S1.10.B 时把 `LumenModelCatalog` 传入 agent，按 slot 切换 `agent.state.model`。

#### S1.10.B CLI 交互切换

**✅ 完成 2026-05-12**（/model 命令全套子命令 + session-level slot binding + model_binding_changed 事件 + smoke:model-switch 7 场景；OpenTUI `<select>` 交互式选择框留给 TUI 增强窗口）。

- `/model` 命令升级：
  - `/model`（无参数）：**弹出交互式选择框**（见下方 CLI 交互依赖说明），列出所有已注册模型，键盘方向键选择，回车确认。顶部分组展示：
    - 当前 session 的槽位绑定（default / coding / vision / writing / fast / long-context）。
    - 所有已注册模型（高亮标注被哪些槽位引用）。
    - 选中一项后进入二级选择："改变哪个槽位" / "设为所有槽位（相当于 `use`）"。
  - `/model <slot> <model-id>`：非交互式，直接临时改变本 session 某个槽位的绑定，不写回文件。
  - `/model --save <slot> <model-id>`：持久化写回 `~/.lumen/config.json.capabilities[slot]`。
  - `/model use <model-id>`：**逃生门**。强制 override 所有槽位，一次性全走这个模型（debug / 单模型任务）。
    - 若在 `use` 下用户输入含图片但当前模型未声明 `supports: ["vision"]`，CLI 在输入校验阶段直接拒绝，给中文错误："当前处于 `use` 模式，模型 `<id>` 不支持图像输入。运行 /model reset 恢复槽位绑定。"
  - `/model reset`：恢复到 config.json 里的 capabilities 绑定，清除 use override。
  - `/model lock <model-id>` / `/model unlock`：锁定 / 解锁自动路由（见 S1.10.C）。
- 新增 session 事件 `model_binding_changed`（参考 opencode `ModelSwitched`），`LumenAgent` 暴露给 CLI，切换后续 turn 使用新绑定。
- Session transcript 里记录切换事件，供回放。

**CLI 交互依赖（已对齐实际实现）**：

- S1.6 permission confirm UI 已改用 **OpenTUI `PermissionModal`**（`apps/cli/src/ui/react/PermissionModal.tsx`，S1.6 完成时落地），取代早期"引入 `@inquirer/prompts`"的设计（readline-first 时代的方案）。
- S1.10 的 `/model` 选择框将复用 OpenTUI `<select>` 原生组件 + 同一 React UI 层，不再需要额外的 CLI 交互依赖。
- 保留的 policy：任何模态交互封装在 `apps/cli/src/ui/react/` 下，不跨包泄漏；核心引擎层不感知 UI。

#### S1.10.C 场景自动切换（capability 路由）

基于 **槽位路由**，不是 id 猜测。coding 槽不在自动路由范围内（由 S1.11 子代理显式调度）：

| 触发条件 | 路由到槽位 | 说明 |
| --- | --- | --- |
| 输入含图片/附件 | `vision` | 未配置时拒绝 |
| Slash 是 `/plan /draft /review /revise` | `writing` | 写作命令显式触发 |
| 上下文估算超过当前模型 `contextWindow * 0.8` | `long-context` | 按 token 估算 |
| 内部意图分类 / 短 completion / 工具描述摘要 | `fast` | 由内部调用方显式请求 |
| 其他 | `default` | 兜底 |

- `coding` 槽**不在自动路由表**。coding 任务应通过 S1.11 子代理调度（主代理 spawn 一个绑定 coding 槽的子代理），而不是由主代理基于启发式（如"连续 tool-call 次数"）自动切。
- 理由：启发式容易误判（一个写作任务里可能有多次 fs.readText，不代表它是 coding）。子代理显式调度是更强信号，也和 Claude Code / opencode 的任务分配范式对齐。
- 路由实现在 `packages/model-provider` 的 `selectCapability(hint): CapabilitySlot`。
- 由 pi-agent-core 的 `prepareNextTurn` 钩子在每轮之间查一次，如果槽位和当前模型绑定变化，则切换 `agent.state.model`。
- `vision` 槽无 fallback：路由判断需要 vision 但未配置该槽时，直接在 `beforeToolCall` / 输入校验阶段拒绝并给中文错误。
- 用户可通过 `/model lock <model-id>` 锁定，暂停自动切换；`/model unlock` 恢复。
- 全局开关：`LUMEN_AUTO_SWITCH=off`。

**对 P6 prompt-provider 分发的影响**：

- 模型切换后，`@lumen/prompts` 的 `selectPromptFile(capability, modelHandle)` 自然选到新 provider 变体的 prompt。
- 不需要在 S1.10 重复 prompt 分发逻辑。
- 注意 "capability" 在这里有两重含义，要在代码里区分命名：
  - **prompt capability** = prompt 文件语义标识（如 `base/system`、`tools/fs.readText`）。
  - **model capability slot** = `default / coding / vision / writing / fast / long-context`。
  - 建议在代码里用 `promptCapability` vs `modelSlot`，避免混淆。

**前置依赖**：

- P2 完成（LumenAgent 用 pi-agent-core Agent，`state.model` 可热切换）。
- P6 完成（provider-aware prompt 分发生效）。
- S1.6 完成（permission prompt 机制建立，模型切换提示沿用同一 CLI 交互栈）。

**不在 S1.10 范围内**：

- 同一 session 内多模型并行（模型 A tool-call、模型 B 对话）。这是 multi-agent，延后。
- 模型成本预算与自动降级。延后。
- 跨 provider 的 token usage 归一化。留待成本统计阶段再做。
- 根据模型**质量得分**（benchmark）自动选模。太容易引入偏见，不做。

**验证门禁**：

- 新增 `smoke:model-catalog`：
  - 构造 catalog.json，验证槽位加载、`vision` 可分配性校验、非法 slot 报错、损坏文件 fallback。
  - 验证 `LUMEN_API_KEY` + `LUMEN_MODEL` 环境变量能注入 catalog 的 `default` 槽。
- 新增 `smoke:model-switch`：
  - `/model` 列出。
  - `/model <slot> <id>` 临时切换生效。
  - `/model --save` 写回文件（临时目录）。
  - `/model reset` 恢复。
- 新增 `smoke:auto-switch`：
  - 构造带图片的 prompt → 命中 `vision` 槽。
  - `vision` 未配置时拒绝并给中文错误。
  - `/draft` 命令 → 命中 `writing` 槽。
  - 上下文膨胀超 80% → 命中 `long-context` 槽。
  - `LUMEN_AUTO_SWITCH=off` → 所有路由回退到 `default`。
- 现有 `smoke:provider` / `smoke:writing` 在多模型场景下继续通过。

### 3.2 S1.11 子代理任务分配（规划）

**背景**：

- Claude Code 的 `invoke_sub_agent` / Task tool 把专门任务（context-gathering、code-review、test-writing 等）委派给隔离的子代理，子代理拥有独立上下文、独立工具权限、可独立选择模型，返回结果给主代理。
- opencode 的 "agent" 概念把 systemPrompt / tools / model 绑定成命名 agent，在 session 内可切换或嵌套。
- S1.10 修订里把 `coding` 槽的自动路由删除，改为由子代理显式调度。S1.11 是这个决策的承接。

**核心建模**：

- `AgentDefinition`：命名 agent 的定义。字段：`id`、`displayName`、`systemPrompt`（或引用 prompt 文件）、`modelSlot`（绑定到 S1.10 的能力槽位）、`allowedTools`（白名单）、`description`（给主代理看）。
- `SubAgentCall`：主代理通过专用 tool `lumen.spawn_sub_agent` 调用，参数 `{ agentId, task, contextHints? }`。
- **隔离边界**：
  - 子代理有**独立 transcript**，不污染主代理 history。
  - 子代理使用 pi-agent-core 的另一个 `Agent` 实例，共享 memory / context assembler，不共享 session 队列。
  - 子代理执行完，**只把最终 assistant message 作为 tool-result 返回给主代理**。
  - 子代理的 tool-call 日志仍然可追踪（进 session transcript 的独立 sub-agent tree），但主代理 history 里只看到"调了 sub-agent，得到结果 X"。

**内置 agent 定义**（初版）：

| agent id | modelSlot | 典型用途 | 工具白名单 |
| --- | --- | --- | --- |
| `general-task` | `default` | 通用委派任务 | 全部 read-only |
| `coding` | `coding` | 写代码、重构、编辑 | fs.* + project.search + shell.run（按权限引擎约束） |
| `context-gatherer` | `fast` | 扫代码、找相关文件 | fs.readText + fs.list + project.search |
| `writer` | `writing` | 写作段落、修订 | 只读 + 可选 fs.writeText（需 permission） |
| `vision-analyst` | `vision` | 分析图片、截图解读 | 只读 |

所有 agent 定义放在 `packages/agents/assets/<agent-id>.md`（frontmatter + prompt body），加载顺序与 skills / prompt-templates 一致（内置 < 用户 < 工作区）。

**S1.11 拆分**：

- **S1.11.A 子代理运行时**：
  - 新增 `@lumen/sub-agent` 包（或在 `@lumen/agent-core` 内部模块）。
  - 实现 `SubAgentRunner.run(agentDef, task, parentContext)`。
  - 每个子代理独立 `pi-agent-core Agent` 实例，走同一套 permission hook。
  - 子代理返回值结构：`{ summary: string, toolCalls: AgentToolCall[], artifacts?: unknown }`。
- **S1.11.B 主代理集成**：
  - 新增内置 tool `lumen.spawn_sub_agent`，参数 `{ agentId, task, contextHints? }`。
  - Tool description（英文，写入 `packages/prompts/assets/tools/spawn-sub-agent.en.md`）告诉主代理什么时候应该委派、每个 agent 擅长什么。
  - Agent 定义注册表供主代理发现可用子代理。
- **S1.11.C CLI 可见性**：
  - 在 `tool_execution_*` 事件里区分 `sub-agent` 调用，CLI 渲染成折叠块："🔹 子代理 coding 正在执行…"。
  - 用户可展开查看子代理的内部 tool-call 日志。
  - `/agents` 新命令列出所有可用 agent 定义。

**与 S1.10 的关系**：

- S1.11 依赖 S1.10 的能力槽位：`AgentDefinition.modelSlot` 指向槽位而非具体模型，用户改 capabilities 会自动传导到子代理。
- `coding` 子代理自然走 `coding` 槽位绑定的模型。

**不在 S1.11 范围内**：

- 子代理之间互相调用（嵌套深度 > 1）。Phase 1 只允许主代理 → 子代理一层。
- 并行子代理（主代理同时 spawn 多个）。延后。
- 子代理间共享状态。明确不做。

**前置依赖**：

- S1.10 完成（能力槽位 + 模型切换机制）。
- P3 完成（permission hook，子代理的 tool-call 走同一引擎）。
- P4 完成（skills / prompt-templates loader，AgentDefinition 复用同一套加载约定）。

**验证门禁**：

- 新增 `smoke:sub-agent`：
  - 注册一个 fake `context-gatherer`，主代理通过 `spawn_sub_agent` 调用。
  - 断言子代理独立 transcript、只返回最终结果给主代理、权限引擎被调用。
  - 断言 `coding` 子代理自动使用 `coding` 槽位的模型。
- 新增 `smoke:agents`：`/agents` 列出所有 agent 定义。

### 3.3 S1.12 Claude 生态 Drop-in 兼容（规划）

**背景**：opencode 的 `packages/opencode/src/skill/index.ts` 已经给出一套成熟的"多家 agent 产品目录统一扫描"方案。LumenCli 直接采用同构模式，让用户在 Claude Code / 通用 `.agents` 生态上累积的资产零迁移可用。

**范围**：

- **Skills drop-in**：扫描 `.claude/skills/` / `.agents/skills/` 等外部目录，识别 `SKILL.md`（YAML frontmatter + Markdown 正文），并入 LumenCli 的 skill registry。
- **Slash commands drop-in**：扫描 `.claude/commands/` 等外部目录，识别 `<name>.md`，注册为 LumenCli 自定义 slash 命令。支持 `$ARGUMENTS` / `$1` / `$@` / `${@:N}` 占位符。
- **MCP 配置 drop-in**：在 S1.7 基础上扩展，额外扫描 `~/.claude/mcp.json` / `~/.claude.json` 的 `mcpServers` 字段、`<cwd>/.mcp.json`。
- **禁用 flag**：`LUMEN_DISABLE_EXTERNAL_SKILLS` / `LUMEN_DISABLE_CLAUDE_SKILLS` / `LUMEN_DISABLE_EXTERNAL_COMMANDS` / `LUMEN_DISABLE_EXTERNAL_MCP`。
- **冲突处理**：同名后扫目录优先，log warning。

**关键约束**（来自 Reference Usage Policy §6.5）：

- 外部 skill / command 的执行仍走 LumenCli 权限引擎。
- MCP 配置 drop-in 不代表默认信任，tool risk 仍按 `ask` 对待直到用户标记允许。
- LumenCli 不写入外部目录，仅读取。

**拆分**：

- **S1.12.A skill loader drop-in**：扩展 P4 skills loader 的目录扫描，支持 `.claude/skills/` / `.agents/skills/`。
- **S1.12.B command loader drop-in**：扫描 `.claude/commands/`，生成 LumenCommand 注册到 CommandRegistry。
- **S1.12.C MCP config drop-in**：扩展 S1.7 loader，支持多来源 JSON 合并。
- **S1.12.D 验证 & 文档**：用 Claude 官方 `anthropics/skills` 仓库里的一个 skill 做端到端验证。

**前置依赖**：P4（skills/prompt-templates loader 基础）+ S1.7（MCP config loader 基础）。

**验证门禁**：

- 新增 `smoke:claude-compat`：构造一个 `~/.claude/skills/hello/SKILL.md` 与 `~/.claude/commands/ping.md`，启动 LumenCli 验证 skill 被加载、`/ping` 命令生效、`LUMEN_DISABLE_CLAUDE_SKILLS=1` 下被跳过。
- 从 `anthropics/skills` 取一个真实 skill（如 `frontend-design`）drop-in 后 `/status` 能看到 skill 列表。

### 3.4 S1.13 永久记忆功能（Long-term Memory, Phase 2+ 占位）

**状态**：**Phase 2+ 占位规划**。本条仅定方向，具体实施推迟到 P10 完成后的独立窗口。首选参考 **openai/codex 的两阶段记忆流水线**（详见 `references/codex/codex-rs/memories/README.md`）。

**目标**：LumenCli 具备跨 session 的持久记忆能力，模型可以在新会话里引用旧会话中的事实、用户偏好、项目历史，不依赖每次都重建上下文。

**与现有 `@lumen/memory` 的关系**：

- 现有 `@lumen/memory` 是**短期记忆 / 偏好存储**，JSONL，key-value 风格，按 kind 分类（preference / goal / project / writing / summary）。
- S1.13 永久记忆是**长期的、可检索的、带时间衰减与重要度排名的知识库**，不是简单追加 JSONL。
- 两者并存：短期 memory 继续管用户偏好与 session 摘要；永久记忆管事实与知识。

**采用架构（来自 openai/codex 适配）**：

LumenCli S1.13 采用 codex 的**两阶段后台流水线**范式（`source: codex@<commit>, adapted`，Apache-2.0 attribution），不发明新架构：

- **后台触发**：根 session 启动时异步触发，仅在满足"非 ephemeral、memory 特性开启、非子代理 session、state DB 可用"时运行。
- **Phase 1 — Rollout Extraction（per-session）**：
  - 从 LumenCli 的 session 存储（`~/.lumen/sessions/`）扫出最近的 eligible session。
  - 合格条件：交互式来源、落在配置年龄窗口内、足够 idle（避免总结仍在进行的会话）、未被其他 worker 占用、总量在启动 scan/claim 上限内。
  - 每个 session 并发喂给模型（带并发上限），产出结构化字段：
    - `raw_memory`：详细记忆（长文本）
    - `session_summary`：紧凑摘要
    - `session_slug`（可选）：短标签
  - Secret redaction（屏蔽 key / token / 邮箱等敏感值）。
  - Job 状态写回 state DB：`succeeded` / `succeeded_no_output` / `failed`（带 backoff + retry）。
  - **关键机制**：每个 job 在 state DB 里走 claim/lease 模式，避免并发重复工作。
- **Phase 2 — Global Consolidation（serialized）**：
  - 先拿**全局单写锁**，保证同时只有一个 consolidation 在跑。
  - 按 `last_usage` / `usage_count` / `generated_at` 排序选 top-N Phase 1 输出。
  - 同步到 `~/.lumen/long-term/` 的文件工件：
    - `raw_memories.md`（合并的原始记忆，按 thread-id 稳定升序排序避免 diff churn）
    - `session_summaries/`（每个选中 session 一份摘要文件）
    - `SKILL.md` / `memory_summary.md`（consolidation agent 的输出）
  - `~/.lumen/long-term/` 初始化为 git baseline（`.git/` 子目录），每次 consolidation 前后对比 workspace diff。
  - 裁剪过期 session summary、过期 extension 资源文件。
  - 若 workspace 无变化直接结束；有变化则：
    - Spawn 专门的 **consolidation 子代理**（S1.11 子代理架构复用），独立 transcript。
    - 给子代理 `phase2_workspace_diff.md` 作为上下文。
    - 子代理权限：**无 approvals、无 network、仅本地写**，且禁止再嵌套 spawn 子代理（防止递归）。
    - 心跳 heartbeat 保持 job lease。
    - 完成后重置 memory git baseline，删除临时 diff 文件。
- **两阶段为何分离**：Phase 1 可并发扩展跨多 session；Phase 2 序列化保证 artifact 一致性。

**存储后端选型**：

- **State DB**：SQLite（`~/.lumen/state.db`），承载 Phase 1 job queue、claim/lease、watermark、selection 元数据。
- **Memory workspace**：文件系统 `~/.lumen/long-term/`，带 git baseline。artifact 以 Markdown 为主（raw_memories.md / session_summaries/*.md / MEMORY.md）。
- **检索**：一期先用 SQLite FTS5 全文 + tag 过滤，语义检索（`sqlite-vec` 或外部嵌入）作为二期可选。不强依赖嵌入模型，保证本地可用。

**数据结构**（Phase 1 产出字段）：

```typescript
interface Phase1MemoryRecord {
  thread_id: string;           // 对应 session id
  raw_memory: string;          // 模型产出的详细记忆
  session_summary: string;     // 紧凑摘要
  session_slug?: string;       // 短标签
  generated_at: string;        // ISO timestamp
  last_usage?: string;         // 最近一次被 Phase 2 选中的时间
  usage_count: number;         // 被 Phase 2 选中的次数
  selected_for_phase2: boolean;
  source_updated_at: string;   // 原 session 最后修改时间
}
```

**注入路径（读路径）**：

- `@lumen/context` 的 `buildContext` 增加 "检索相关记忆" 步骤，基于当前 user prompt + 最近消息走 FTS5 / 关键词查询。
- 模型主动请求时通过 tool `memory.recall(query)` 调出（走 permissions `ask`）。
- 系统级固定注入：`~/.lumen/long-term/MEMORY.md` 作为 system prompt 扩展片段（若存在）。

**写入路径**：

- 自动路径：Phase 1 + Phase 2 后台流水线（默认 on，可通过 `LUMEN_LONG_TERM_MEMORY=off` 关闭）。
- 手动路径：
  - `/remember --long <content>`：用户显式写入 raw_memories.md。
  - 模型 tool `memory.remember_long(content, tags)`：走 permission `ask`。

**隐私 & 安全**：

- 永久记忆走用户目录 `~/.lumen/long-term/`，不进项目仓库。
- Secret redaction 强制在 Phase 1 生成后、入 DB 前执行（key / token / 邮箱 / IP 过滤）。
- Consolidation 子代理禁用网络、禁用 spawn 子代理。
- audit log：`~/.lumen/long-term/audit.log` 记录每次 Phase 1 / Phase 2 run 的 job 状态、watermark、claim/release。

**参考来源优先级**：

1. **openai/codex**（首选，Apache-2.0）：`codex-rs/memories/` 两阶段流水线全量参考。
2. `mem0ai/mem0` / `rememberall/rememberall`（补充）：检索 API 设计参考。
3. Claude Code 的 `/memorize` + memory tool（借鉴 UX，不借鉴实现）。
4. Anthropic claude.ai memory feature 公开文档。

**前置依赖**：

- Phase 1 完成（runtime + tool call loop + skills）。
- S1.11 子代理完成（consolidation 子代理是 S1.11 架构的消费者）。
- S1.10 完成（consolidation 子代理绑定 `default` 或专门的 `consolidation` 槽位，需要能力槽位机制）。
- P4 context assembler 可扩展。

**不在范围内**：

- 多 user 记忆隔离。LumenCli 永久私人使用，单 user。
- 云端同步。留待 Phase 3+。
- 记忆导出为公开知识库。

**验证门禁**（未来实施时）：

- 新增 `smoke:long-memory-phase1`：模拟 3 个 session → Phase 1 并发抽取 → state DB 状态正确（succeeded + records 写入）。
- 新增 `smoke:long-memory-phase2`：Phase 1 产出齐备 → Phase 2 consolidation → `~/.lumen/long-term/raw_memories.md` 正确合并、git diff 可见。
- 新增 `smoke:long-memory-retrieve`：写入 → 跨进程重启 → `memory.recall(query)` 命中 → context 注入生效。
- 端到端：用户告诉 agent 一个事实 → 下次会话能正确引用。

### 3.5 S1.14 自我迭代功能（Self-Evolution, Phase 2+ 占位）

**状态**：**Phase 2+ 占位规划**。本条仅定方向，具体实施推迟到 P10 完成后的独立窗口，并在启动前补充**完整的安全 spec**。

**目标**：LumenCli 具备在用户授权下"观察使用模式 → 改进自身 prompt / skills / commands / 工具配置"的自我优化能力。**不是**让它修改自己的源代码。

**边界（硬红线）**：

- **永远不允许**自主修改 `packages/` 下的 runtime 代码。
- **永远不允许**自主修改 `@lumen/permissions` / `@lumen/tools` 的权限策略。
- **允许**的自我迭代仅限于**资产层**：
  - 生成 / 修订 prompt 文件（`~/.lumen/prompts/*.md`）
  - 生成 / 修订 skill 文件（`~/.lumen/skills/*/SKILL.md`）
  - 生成 / 修订 slash command 文件（`~/.lumen/commands/*.md`）
  - 建议调整 config.json 的能力槽位绑定（提交建议，需用户 `/approve` 确认）
- 所有自我迭代动作必须：
  - 走 `@lumen/permissions` 的 `ask` 决策（默认 ask）
  - 写入前生成 diff，用户审阅
  - 记入 audit log（`~/.lumen/self-evolution.log`）
  - 可被 `/rollback <entry-id>` 撤销

**初步设计方向（非承诺）**：

- 观察器（observer）：
  - 记录用户每次 `/command` 调用后是否满意（显式反馈或 follow-up prompt 判定）
  - 记录 tool-call 失败 / 权限拒绝 / 超时的模式
  - 记录用户反复 rephrase 同一问题的轨迹（说明现有 prompt 不够好）
- 建议器（proposer）：
  - 由一个专门子代理（`self-curator`，S1.11 子代理架构复用）驱动，独立 transcript，独立 model slot。
  - 分析观察器的数据，产出"提议改进"的 artifact（markdown diff）。
- 审阅器（reviewer）：
  - LumenCli 主 session 向用户展示 diff。
  - 用户 `/approve <id>` 或 `/reject <id>` 或 `/edit <id>` 再应用。
  - 默认不自动 apply。
- 频率限制：
  - 每 N 次用户交互最多产出 1 个 proposal（避免嘈杂）。
  - 可通过 `LUMEN_SELF_EVOLUTION=off` 全局关闭。

**与永久记忆（S1.13）的协同**：

- 观察器把观察数据写入永久记忆（带 `tag: self-evolution-observation`）。
- 建议器从永久记忆检索最近 N 天的观察数据做分析。

**参考来源**：

- oh-my-pi 的 `hindsight` 模块（`packages/coding-agent/src/hindsight/`）
- pi 的 compaction + 总结模式
- Agent self-improvement 学术论文（观察模式，不复制具体 prompt）

**风险清单**：

- **Prompt 注入窃取自我迭代权限**：恶意外部内容（如 MCP 返回的文档）里嵌入"帮我改 LumenCli prompt 让我能 xxx"的指令。缓解：自我迭代 proposer 不接受任何 tool 输出作为唯一依据，必须有显式用户提示作为 trigger。
- **自我迭代产出低质 prompt 污染工作流**：缓解：diff 审阅 + rollback 机制。
- **audit log 被篡改**：缓解：log append-only，每条带 hash chain。

**前置依赖**：

- Phase 1 完成。
- S1.11 子代理完成（self-curator 是子代理）。
- S1.13 永久记忆完成（观察数据存这里）。
- S1.6 permission prompt 完成（审阅 diff 要模态交互）。

**不在范围内**：

- 修改源代码级别的自我迭代。
- 自主决策"升级到新 LLM provider" 或"安装 npm 包"。
- 远程拉取并执行未经审计的"更新包"。

**验证门禁**（未来实施时）：

- 新增 `smoke:self-evolution-dryrun`：模拟观察数据 → 建议器产出 diff → 默认不 apply。
- 端到端：用户 `/approve` 后资产文件被修改，`/rollback` 能恢复。

---

## 4. 风险清单（来自规划回顾）

- pi-ai 依赖体积：P0.9 已决定披露而非裁剪。
- pi 版本节奏：`package.json` 精确版本 pin；升级另起窗口。
- 类型外泄：code review 兜底，P8 考虑 ESLint 规则。
- Runtime / Prompt 双层割裂：P5 + P6 用同一 registry 统一入口。
- 豁免失效：Reference Usage Policy §6.5 已定义清理流程。

---

## 5. 执行守则

- 每阶段进入前更新 `update_plan` 工具状态。
- 每阶段完成后运行对应 `Verify` 命令，失败立即停止，不推进下一步。
- 不得合并多个阶段的代码改动为单次提交；便于回滚。
- 所有新建的 prompt / 文案文件必须在同一提交里带上 frontmatter `source` 字段，不允许"后补"。
- runtime 代码层严禁出现 `source: claude-code@…`