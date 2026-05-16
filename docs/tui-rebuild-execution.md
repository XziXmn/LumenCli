# Lumen TUI 重构执行状态

更新时间：2026-05-16（深度检测后更新执行路线）

## 目标摘要

当前 TUI 重构目标是保留 Lumen 自有启动路径与 `OpenTUI + SolidJS` 技术栈，在 `packages/lumen-tui` 内构建 Lumen 专属终端界面。界面信息空间参考 OpenCode，agent 过程可读性参考 ClaudeCodeRev，但不整体搬运两者架构。

核心架构原则：

- UI 只依赖 `TuiRuntime` 契约。
- `AgentSession` 仅作为当前首个 backend adapter。
- 缺失后端能力必须显示为 `disabled`、`partial` 或 `unimplemented`，不能伪装成可用。
- keybinding 必须集中配置，不能在组件里散落硬编码按键判断。

## 当前结论

TUI 已经从黑屏阶段推进到可启动、可输入、可渲染 session shell 的阶段。主 shell、prompt、footer、sidebar、command palette、dialog、toast、工具块、活动面板、session 操作、基础 Lumen runtime 适配已经形成闭环。

当前仍不能标记为完整完成。主要剩余工作集中在 OpenCode command catalog 全量 parity、真实 permission backend 能力、扩展工具专用渲染、LSP/MCP 实时健康状态、ClaudeCodeRev 式 background agent steering，以及完整人工键盘 walkthrough。

## 已完成内容

### 架构与入口

- 新增后端无关 `TuiRuntime` 状态与动作契约。
- 新增 `AgentSessionTuiRuntime`，把当前 `AgentSession` 适配为 TUI runtime。
- `packages/coding-agent/src/modes/tui/tui-mode.tsx` 负责创建 runtime 并调用 `runLumenTui`。
- `packages/lumen-tui/src/app.tsx` 负责启动 OpenTUI/Solid 应用。
- UI 组件不直接依赖 `AgentSession` 内部细节。
- 删除旧的 TUI adapter 类型和 session store 入口，避免双轨状态源继续扩散。

关键文件：

- `packages/lumen-tui/src/runtime/types.ts`
- `packages/lumen-tui/src/app.tsx`
- `packages/coding-agent/src/modes/tui/tui-mode.tsx`
- `packages/coding-agent/src/modes/tui/adapter/agent-session-runtime.ts`
- `packages/coding-agent/src/modes/tui/adapter/index.ts`

### 主界面 Shell

- Home 启动画面已可渲染，不再黑屏。
- Home 包含 Lumen logo、居中 prompt、footer hint、toast、startup diagnostics。
- Session shell 已包含消息区、prompt dock、footer、sidebar、dialog layer、command palette、toast layer。
- 120x32 宽屏可显示 sidebar；80x24 窄屏自动隐藏 sidebar，避免覆盖 prompt/footer。
- footer 已压缩为更接近 OpenCode 的高密度状态栏。

关键组件：

- `AppShell`
- `HomeView`
- `SessionView`
- `Footer`
- `Sidebar`
- `ToastLayer`
- `Logo`

### Prompt 输入体验

- 支持多行 prompt。
- 支持 shell mode。
- 支持 slash command catalog 与 autocomplete。
- 支持 file autocomplete。
- 支持 paste summary。
- 支持 external editor 入口。
- 支持 prompt history。
- 支持 undo/redo prefill。
- 支持 Esc interrupt、Ctrl+C cancel/exit。
- 补齐一批 OpenCode 风格编辑 keybinding alias：Ctrl+N/P、Ctrl+J、Delete、Shift+Delete、word delete、selection、visual-line、buffer movement、select-all、方向键移动等。
- 支持通过 `LUMEN_TUI_KEYBINDINGS`、`.lumen/tui-keybindings.json`、`lumen-tui-keybindings.json` 加载自定义 keybinding。

关键组件：

- `PromptBox`
- `keybindings.ts`
- `WhichKeyLayer`

### Command Palette 与 Dialog

- command palette 支持过滤、disabled entry、category、shortcut、description、command-id 搜索。
- OpenCode ready alias 已接入：`messages.copy`、`session.export`、`display_thinking`、`tool_details`。
- OpenCode backend-missing 能力以 disabled placeholder 暴露：docs、plugins、MCP control、provider login、prompt stash、model favorites、variants、session child navigation 等。
- select/input/confirm/model/agent/tool/theme/status/help/session/timeline/tree/fork/import/delete/session-info 等 dialog 已接入。
- command palette 与 select dialog 支持 Ctrl+P/N、PgUp/PgDn、Home/End。
- runtime interaction request 支持 fullscreen select/input/confirm。
- which-key overlay 可显示 leader command 与 disabled 状态。

关键组件：

- `CommandPalette`
- `DialogLayer`
- `SelectDialog`
- `InputDialog`
- `ConfirmDialog`
- `WhichKeyLayer`

### 消息流与工具渲染

- 支持 user、assistant、system 消息显示。
- 支持 text、thinking、status、error、code、diff。
- 支持工具状态：running、pending、success、error、aborted。
- 支持 shell/read/write/edit/grep/glob/find/ls/web/task/todo/ask_user 等摘要。
- 支持 unknown 或 extension-provided tools 的结构化 Args/Details fallback。
- 支持 read/search/list 连续工具合并为紧凑活动行。
- 支持 diff 展示。
- 支持 ask_user visual result block。
- abort 后 running tool、activity、background task 会立即标为 aborted，后续 completion 不会覆盖 aborted 状态。

关键组件：

- `MessageList`
- `MessagePart`
- `ToolBlock`

### Agent 过程可读性

- background `task`/`subagent` tool 会提升到 coordinator-style process panel。
- Process panel 显示 permission waiting、queued prompt/command、background task。
- Activity dialog 可查看 tools、background agents、permission waits、queued work。
- background agent panel 明确标注 read-only，并展示 disabled steering/task-abort affordance。
- long-running shell/tool 显示 elapsed time 与 output line count。

关键组件：

- `ProcessPanel`
- `ActivityDialog`
- `Sidebar`

### Lumen 功能适配

- prompt submit 已接入 runtime。
- streaming assistant、thinking、tool parts 已映射到 TUI parts。
- shell mode 已接入。
- abort 已接入。
- compact、retry、copy、export、share、unshare 已有入口。
- model、agent、theme、tools toggle 已有 dialog 或 command 入口。
- session list/switch/new/fork/import/delete/tree/timeline/session-info 已有入口。
- ask_user、input、select、confirm 统一到 dialog/interaction contract。
- LSP/MCP 状态有 partial discovery：可显示 configured/available/active counts 和 MCP config file/server count。

### 测试与文档

- 新增 `packages/coding-agent/test/agent-session-tui-runtime.test.ts`。
- 新增 `packages/coding-agent/test/lumen-askuser.test.ts`。
- 新增 `docs/tui-opencode-parity.md` 作为 parity checklist。
- `packages/coding-agent/CHANGELOG.md` 已记录 TUI runtime、UI shell、keymap、dialog、command parity、ask_user regression 等变化。

## 未完成内容

### P0 剩余

- 完整人工键盘 walkthrough 尚未完成，需要覆盖 command palette、dialogs、tree navigation、undo/redo、ask_user、shell mode。
- Pixel-level resize parity 还未穷尽，尤其是窄屏、极长文本、复杂 dialog 叠加场景。
- ~~OpenCode command catalog 尚未全量归档和逐项映射~~ 已完成（2026-05-16）：全部 OpenCode CommandMap 命令 ID 已逐项映射为 ready alias 或 disabled placeholder。

### P1 剩余

- permission backend 仍未达到 OpenCode parity：
  - allow-once
  - allow-always
  - reject-with-message
  - backend rejected-permission transcript
- rich permission block 需要等通用 permission backend 能力补齐后再增强。
- task steering/action 还没有达到 ClaudeCodeRev coordinator agent panel 的完整交互能力。
- extension-provided tools 目前主要依赖结构化 fallback，尚未为每类扩展工具建立专用渲染器。

### P2 剩余

- 长会话虚拟滚动还未完整实现。
- session tree 可视化还可继续增强。
- LSP/MCP 仍是 config discovery 和局部状态，缺少真实 runtime health。
- 主题系统还有增强空间。
- 鼠标交互与 hover polish 尚未系统完成。
- 80x24、120x32、窄屏 resize 的组合验证还需要扩展。

## 当前验证状态

最近一次已执行验证（2026-05-16 深度检测）：

```powershell
npm run check
```

结果：通过。Biome 检查 711 文件无修复，tsgo 无错误，browser-smoke 通过，web-ui check 通过。

```powershell
cd packages/coding-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/agent-session-tui-runtime.test.ts
```

结果：通过，8 个测试全部通过（1360ms）。

```powershell
cd packages/coding-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lumen-askuser.test.ts
```

结果：通过，3 个测试全部通过（4ms）。

### 2026-05-16 深度代码审计结论

- 所有 `tui-rebuild-execution.md` 声称的文件、组件、测试均已验证存在且内容匹配。
- `TuiRuntime` 契约完整覆盖 prompt submit、abort、model/agent/theme selection、session operations、tool toggles、LSP/MCP partial status。
- keybindings 集中管理，支持外部配置加载，无组件内硬编码按键判断。
- 无 TODO/FIXME/HACK 标记，无断裂引用，无 broken imports。
- OpenCode command catalog 覆盖率约 85%，缺失项已在后续执行路线中逐项列出。
- adapter 文件（`agent-session-runtime.ts`）约 2300 行，单文件较大但结构清晰，暂不需要拆分。
- `tui-mode.tsx` 通过相对路径跨包引用 `lumen-tui`，属于 pre-publish 状态的正常做法。

历史上已完成的 smoke 覆盖包括：

- `cd packages/coding-agent; bun run src/cli.ts --tui` 可启动并保持运行。
- 80x24 与 120x32 tmux capture。
- command palette 查询 `docs` 显示 disabled 文档入口。
- command palette 支持 Ctrl+N 与 PgDn 导航。
- `/docs` slash autocomplete 显示 disabled/backend-missing。
- `display_thinking` command-id 查询可找到 ready alias。
- shell mode 执行 `echo lumen-tui-smoke` 并渲染 shell tool block。
- tree dialog、activity dialog、status dialog、permission status、session-info dialog 均有 tmux capture 验证。

## 当前工作区状态

当前仍是未提交工作区，包含 TUI 重构相关改动、测试与文档。尚未执行 commit 或 push。

主要改动范围：

- `packages/lumen-tui/src/runtime/`
- `packages/lumen-tui/src/components/`
- `packages/lumen-tui/src/app.tsx`
- `packages/coding-agent/src/modes/tui/`
- `packages/coding-agent/src/core/lumen-askuser.ts`
- `packages/coding-agent/src/core/extensions/loader.ts`
- `packages/coding-agent/src/extension-api.ts`
- `packages/coding-agent/test/agent-session-tui-runtime.test.ts`
- `packages/coding-agent/test/lumen-askuser.test.ts`
- `docs/tui-opencode-parity.md`
- `docs/tui-rebuild-execution.md`

## 参考来源

Kimi Code CLI Wire 协议参考：

- `references/kimi-cli/src/kimi_cli/wire/types.py` — 30+ Wire 事件/请求类型定义
- `references/kimi-cli/src/kimi_cli/wire/protocol.py` — WireHub 接口
- `references/kimi-cli/src/kimi_cli/wire/file.py` — JSONL 持久化
- `references/kimi-cli/src/kimi_cli/wire/root_hub.py` — Root Hub（多消费者分发）
- `references/kimi-cli/src/kimi_cli/soul/kimisoul.py` — wire_send() 调用模式
- `references/kimi-cli/src/kimi_cli/approval_runtime/runtime.py` — 统一审批 + Future 等待
- `references/kimi-cli/src/kimi_cli/hooks/engine.py` — Hooks 引擎（server + wire 双源）
- `references/kimi-cli/src/kimi_cli/background/manager.py` — 后台任务 + auto-trigger

OpenCode 主要参考：

- `references/opencode/packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`
- `references/opencode/packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`
- `references/opencode/packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx`
- `references/opencode/packages/opencode/src/cli/cmd/tui/routes/session/footer.tsx`
- `references/opencode/packages/opencode/src/cli/cmd/tui/routes/session/permission.tsx`
- `references/opencode/packages/opencode/src/cli/cmd/tui/config/keybind.ts`

ClaudeCodeRev 主要参考：

- `references/ClaudeCodeRev/src/components/Message.tsx`
- `references/ClaudeCodeRev/src/components/messages/AssistantToolUseMessage.tsx`
- `references/ClaudeCodeRev/src/components/messages/GroupedToolUseContent.tsx`
- `references/ClaudeCodeRev/src/components/messages/CollapsedReadSearchContent.tsx`
- `references/ClaudeCodeRev/src/components/ToolUseLoader.tsx`
- `references/ClaudeCodeRev/src/components/VirtualMessageList.tsx`
- `references/ClaudeCodeRev/src/components/CoordinatorAgentStatus.tsx`
- `references/ClaudeCodeRev/src/components/PromptInput/PromptInput.tsx`

## 后续执行路线

### 下一步 0：Wire 协议层引入（与 TUI 改造同步）

**背景**：参考 Kimi Code CLI 的 Wire 协议设计，在 agent 核心和 UI 之间引入事件流解耦层。这不是推翻当前 TUI 架构，而是在 `TuiRuntime` 契约之下增加一个结构化事件传输层，为后续 Web UI、IDE 插件、远程驱动预留能力。

**设计原则**：
- Wire 层是 `TuiRuntime` 的底层传输，不替代 `TuiRuntime` 契约
- 当前 TUI 仍通过 `TuiRuntime` 消费事件，Wire 只是事件的结构化来源
- Wire 事件可序列化为 JSONL，支持 session replay 和 trace 可视化
- 渐进式引入：先定义类型，再逐步替换 adapter 中的 ad-hoc 事件传递

**执行计划**：

| 步骤 | 内容 | 预估 |
|------|------|------|
| 0.1 | 定义 `packages/coding-agent/src/core/wire/types.ts` — Wire 事件类型（TurnBegin/End, StepBegin/End, ContentPart, ToolCall, ToolResult, StatusUpdate, ApprovalRequest/Response, SteerInput, Notification） | 2h |
| 0.2 | 定义 `packages/coding-agent/src/core/wire/protocol.ts` — WireHub 接口（publish/subscribe/replay） | 1h |
| 0.3 | 实现 `packages/coding-agent/src/core/wire/file.ts` — JSONL 文件持久化（session trace） | 1h |
| 0.4 | 在 `AgentSessionTuiRuntime` 中接入 WireHub，将现有 streaming 事件转为 Wire 事件发布 | 3h |
| 0.5 | TUI 组件通过 `TuiRuntime` 消费 Wire 事件（MessageList、ToolBlock、ProcessPanel 等） | 2h |
| 0.6 | 实现 Steer Input：Wire 层支持 `SteerInput` 事件，TUI prompt 在 agent 运行中可注入消息 | 3h |
| 0.7 | 实现 Background Auto-trigger：Wire 层发布 `Notification` 事件，TUI 检测到后自动触发新 turn | 2h |

**与现有 TUI 的关系**：
- `TuiRuntime` 契约不变，只是内部实现从直接回调改为 Wire 事件驱动
- `AgentSessionTuiRuntime` 成为 Wire 事件的生产者和消费者桥梁
- 未来如果要做 Web UI，只需新增一个 Wire 消费者，不需要改 agent 核心

**参考实现**：
- `references/kimi-cli/src/kimi_cli/wire/types.py` — 事件类型定义
- `references/kimi-cli/src/kimi_cli/wire/protocol.py` — Hub 接口
- `references/kimi-cli/src/kimi_cli/wire/file.py` — JSONL 持久化
- `references/kimi-cli/src/kimi_cli/soul/kimisoul.py` — Soul 中 wire_send() 调用模式

### 下一步 1：收敛 command catalog parity（最终审计）

2026-05-16 深度检测结论：OpenCode `CommandMap` 共约 100 个命令 ID，Lumen `defaultCommands` 已注册约 85+ 个（ready + disabled）。覆盖率约 85%。

**缺失的 OpenCode 命令 ID（需补 disabled placeholder）：**

| 命令 ID | 类别 | 说明 |
|---------|------|------|
| `which-key.group.previous` | System | which-key 分组导航 |
| `which-key.group.next` | System | which-key 分组导航 |
| `which-key.scroll.up` | System | which-key 滚动 |
| `which-key.scroll.down` | System | which-key 滚动 |
| `which-key.page.up` | System | which-key 翻页 |
| `which-key.page.down` | System | which-key 翻页 |
| `which-key.home` | System | which-key 跳首 |
| `which-key.end` | System | which-key 跳尾 |
| `dialog.mcp.toggle` | Agent | MCP dialog 内 toggle |
| `dialog.plugins.install` | System | plugin dialog 内安装 |
| `permission.prompt.fullscreen` | Agent | permission 全屏切换（功能已有，命令未注册） |

**已覆盖但属于 input/prompt 编辑动作（不需要进 command palette）：**

所有 `input_*`、`history_*`、`prompt.autocomplete.*`、`dialog.select.*` 系列命令属于组件内部 keybinding，不需要注册为 palette 命令。当前 Lumen 通过 `DEFAULT_PROMPT_KEYBINDINGS` 和 `DEFAULT_DIALOG_KEYBINDINGS` 已覆盖这些编辑动作。

**执行计划：**

1. 在 `openCodeSystemPlaceholders()` 中补齐 8 个 `which-key.*` 导航命令的 disabled placeholder。
2. 在 `defaultCommands` 中补 `dialog.mcp.toggle`、`dialog.plugins.install`、`permission.prompt.fullscreen` 三个 disabled placeholder。
3. 补齐后运行 `npm run check`。
4. 在 `tui-opencode-parity.md` 中将 `[ ] Full OpenCode command catalog parity` 标记为完成。

### 下一步 2：完成手动键盘 walkthrough

必须覆盖的场景矩阵：

| 场景 | 验证方式 | 状态 |
|------|----------|------|
| command palette 查询、执行、disabled entry | tmux capture | 已有部分 |
| select dialog 导航（Ctrl+P/N, PgUp/PgDn, Home/End） | tmux capture | 已有部分 |
| input dialog 输入与提交 | tmux capture | 未验证 |
| confirm dialog 确认与拒绝 | tmux capture | 未验证 |
| model/agent/theme/tool toggle dialogs | tmux capture | 未验证 |
| session tree/timeline/new/fork/switch/delete | tmux capture | tree 已有 |
| undo/redo prompt prefill | tmux capture | 未验证 |
| shell mode 执行与渲染 | tmux capture | 已有 |
| ask_user select/input/confirm | tmux capture | 未验证 |
| abort/interruption 中断 | tmux capture | 未验证 |
| leader which-key overlay 全部 entry | tmux capture | 已有部分 |
| external editor 流程 | tmux capture | 未验证 |

**执行计划：**

1. 在 MSYS2 tmux 中逐项执行上述场景。
2. 每个场景 capture 后确认无 crash、无布局溢出、无功能断裂。
3. 发现问题立即修复，修复后重新 capture。
4. 全部通过后在 parity checklist 中标记 `[x] Manual keyboard walkthrough`。

### 下一步 3：补 permission 与 background agent 后端能力

当前状态：

- `TuiPermissionActionStatus` 已定义 `"ready" | "disabled" | "unimplemented"` 三态。
- `permissionActions()` 已返回 `allow-once`、`allow-always`、`reject-with-message` 为 `unimplemented`。
- UI 已正确显示 unimplemented 状态。

**后端需要补齐的能力：**

1. `AgentSession` 或 `ExtensionRunner` 需要暴露 permission request/response 协议。
2. 需要支持 allow-once（单次放行）、allow-always（持久放行规则）、reject-with-message（带理由拒绝）。
3. 后端补齐后，adapter 中 `permissionActions()` 将对应 action 从 `unimplemented` 切为 `ready`。
4. UI 无需改动，只需 adapter 层状态变化。

**ClaudeCodeRev coordinator agent panel 增强：**

- 当前 `ProcessPanel` 和 `ActivityDialog` 已展示 background task 状态。
- 缺少：task steering（向 background agent 发送指令）、task abort（中止特定 background agent）。
- 需要 `TuiRuntime` 新增 `steerBackgroundTask(taskId, instruction)` 和 `abortBackgroundTask(taskId)` 方法。
- UI 层 `ActivityDialog` 需要从 read-only 升级为可交互。

### 下一步 4：增强长会话与复杂输出

| 项目 | 优先级 | 依赖 |
|------|--------|------|
| 虚拟滚动（>100 条消息性能） | P2 | OpenTUI ScrollBox 虚拟化支持 |
| 长 diff 折叠与展开 | P2 | 无 |
| 大工具输出截断与 "Show more" | P2 | 无 |
| resize 验证矩阵（80x24, 120x32, 60x20, 200x50） | P2 | 无 |
| session tree 可视化增强（连线、颜色） | P2 | 无 |
| LSP/MCP 实时 health（连接状态、延迟） | P2 | LSP client 暴露 health API |
| 主题系统增强（自定义调色板） | P3 | 无 |
| 鼠标交互与 hover polish | P3 | OpenTUI mouse event 支持 |

## 完成判定

只有同时满足以下条件后，才可以把整体目标标记为完成：

- `npm run check` 通过。
- 修改过的测试文件均已按 package root 运行并通过。
- TUI smoke 在 80x24 与 120x32 均可启动、输入、执行命令、退出。
- OpenCode command catalog 已完成逐项审计。
- 所有缺失能力均明确 disabled/partial/unimplemented。
- command palette、dialog、prompt、sidebar、footer、message list、tool block、activity panel 均完成手动 walkthrough。
- 文档中的未完成项已关闭，或明确转为后续 milestone。
