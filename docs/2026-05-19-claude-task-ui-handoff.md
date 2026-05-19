# Claude Task UI Handoff

## 背景

当前分支：`feat/output-flow-rebase`

基线提交：

- `7e65af44`
- `feat(output): scaffold Claude-style output flow rebuild`

本轮目标延续的是 Claude 风格 `spinner / task / todo / queued` 一体插件化统一，严格以：

- [pluginized-task-ui-plan.md](/C:/Users/moo/.codex/worktrees/3828/LumenAgent/docs/pluginized-task-ui-plan.md)
- [claude-ui-adjustment-summary.md](/C:/Users/moo/.codex/worktrees/3828/LumenAgent/docs/claude-ui-adjustment-summary.md)

为准。

## 当前已完成

### 1. spinner 语义已补到 API + core producer

`TaskUiItem` 现在已有：

- `subject`
- `activeForm`

`SpinnerUiState` 现在已有：

- `overrideMessage`
- `tip`
- `budgetText`
- `elapsedMs`
- `outputTokens`
- `isThinking`
- `lastThinkingDurationMs`

同时已经对外暴露：

- `SpinnerBudgetUsage`
- `getSpinnerBudgetUsage()`

### 2. working 主文案已不再退化成固定 `Working`

当前插件 `.lumen/extensions/claude-task-ui.ts` 的主文案遵循：

1. `overrideMessage`
2. `current.activeForm`
3. `current.subject`
4. `randomVerb`

这条优先级已经与参考文档保持一致。

### 3. core 已有真实 spinner 运行时 producer

`interactive-mode.ts` 已经不再只给插件一个空壳 working 状态，而是会产出真实 spinner 语义，包括：

- compaction hooks 期间的 override
- compacting / auto-compacting override
- retrying override
- elapsed
- output tokens
- thinking / thought-for
- request payload 推导出的 `budgetText`

其中真实系统态 override 已覆盖：

- `Running PreCompact hooks…`
- `Running PostCompact hooks…`
- `Compacting conversation`
- `Auto-compacting conversation`
- `Auto-compacting after overflow`
- `Retrying request (n/m)`

### 4. task / todo 已接入统一 spinner 语义

`task` 和 `todo` 两条链路都已可提供：

- `subject`
- `activeForm`

并且 `current / next` 已走统一 task summary 视图，不再只剩 task 或只剩 todo 的半套语义。

### 5. queued richer command model 已补强

当前 `QueuedUiMessage` 已有：

- `kind`
- `delivery`
- `mode`
- `priority`
- `text`
- `preExpansionText`
- `customType`
- `hasImages`
- `display`
- `isMeta`
- `origin`
- `source`
- `skipSlashCommands`

已接通的真实 producer 包括：

- extension queued prompt
- rpc queued prompt
- raw slash queued prompt
- `nextTurn` queued prompt
- queued 消费后自动移除

### 6. 插件层已统一的 UI

当前默认态已经主要由 `.lumen/extensions/claude-task-ui.ts` 负责：

- queued prompt-side 区
- working / spinner 主区
- footer task summary
- expanded task/todo list

expanded task/todo list 当前作为 spinner 区展开态存在，没有回退进 transcript。

### 7. transcript 工具摘要行已直接按 Claude 骨架收了一轮

已改：

- [assistant-tool-summary.ts](/C:/Users/moo/.codex/worktrees/3828/LumenAgent/packages/coding-agent/src/modes/interactive/components/assistant-tool-summary.ts)
- [assistant-tool-batch-summary.ts](/C:/Users/moo/.codex/worktrees/3828/LumenAgent/packages/coding-agent/src/modes/interactive/components/assistant-tool-batch-summary.ts)
- [collapsed-tool-group.ts](/C:/Users/moo/.codex/worktrees/3828/LumenAgent/packages/coding-agent/src/modes/interactive/components/collapsed-tool-group.ts)

当前已具备：

- 左侧 `●` 状态点
- bold 标题
- `⎿` 次级行
- 更接近 Claude 的次级亮度层级

## 仍留在 core 的内容

这些仍然不是插件负责：

- task / todo / queued 数据源
- queued 容器生命周期
- transcript 主消息流
- spinner 运行时语义生产
- 最小扩展 API

## 当前仍不像 Claude 的地方

### 1. tip 仍不是 Claude 完整 scheduler

虽然已从 fake tip 收紧到真实触发条件：

- 30s 长时运行提示
- 30min `/clear` 提示
- context pressure 提示

并新增了 `spinner.tipsEnabled` 设置开关，但它仍不是 Claude 源码里的完整 tip scheduler。

**待做（2026-05-19 追加）：tip 改成多池 + 按会话状态调度，不再是定死 3 条**

参考 `references/ClaudeCodeRev/src/components/Spinner.tsx:337-349` 的 tip 优先级模型：

- 优先级（高→低）：context tips → clear tip（30 分钟后）→ btw tip（30 秒后且首次）→ custom `spinerTip` prop
- 抑制条件：`settings.spinnerTipsEnabled === false`、`nextTask` 存在（改显示 "Next: …"）、context tips 激活
- EmergencyTip 是独立通道，由远端动态配置，每条按文本 hash 去重（`lastShownEmergencyTip`）

Lumen 现状：
- `spinner.tip` 是单一字段，由 core 单点决定，没有"池+优先级"概念
- 副行渲染阈值是 `elapsed >= 5_000`（`claude-task-ui.ts:341`），过低
- 没有"首次/重复"判定（btw 那种"用过就不再提示"逻辑）

落地建议：
- core 端 `SpinnerUiState` 增加 `tipCandidates: { id; text; condition; priority }[]` 而不是单 `tip`
- 由插件层做最终选择（这样新 tip 不用动 core）
- 触发条件下沉到 core producer 用真实信号判定（elapsed、用户行为计数、context window 占比）

### 2. budget 仍不是 Claude 完整 turn budget

当前 `budgetText` 已来自真实 request payload output ceiling，并在进度足够时可带 ETA，但还不是 Claude 的完整 turn budget 表达。

**已隐藏（2026-05-19）：插件层 `claude-task-ui.ts:335-339` 已注释 budgetText 渲染**，core producer 保留。未来重启用时取消注释即可。原因：当前 `Target: 156 / 32,000 (0% used)` 这类输出信息密度低、视觉打扰大。

### 3. expanded task/todo list 还不是 `TaskListV2` 级实现

当前它已经是 spinner 区展开态，也比之前更低存在感，但仍比 Claude 的 `TaskListV2` 更轻。

### 4. queued 仍未补齐完整 Claude queued command 语义

当前主要缺口仍是：

- `pastedContents`
- `bridgeOrigin`

### 5. sub-agent prompt 被错误塞进 spinner override（2026-05-19 追加）

子 agent 调用时，子 agent 的 prompt 文本目前会通过 `spinner.overrideMessage` 路径污染状态栏标题。正确做法（参考 Claude）：

- transcript 主行渲染 `● Task(prompt 摘要)` + `⎿ Running… (N tool uses · X tokens)`（参考 `references/ClaudeCodeRev/src/components/AgentProgressLine.tsx`）
- footer 渲染 `@agent` pill（参考 `references/ClaudeCodeRev/src/components/tasks/BackgroundTaskStatus.tsx`）
- spinner 副行渲染 `TeammateSpinerTree`（按 Ctrl+T 循环切换到该视图）
- spinner override **不**承载子 agent prompt

落地前需先回答：
- core 是否已暴露 sub-agent 状态？（当前 `SpinnerUiState` 里没有；可能需要新加 `getSubAgents()` API）
- transcript 主行的 sub-agent `renderCall` 在哪个工具定义里？需先定位
- footer 是否需要左右分栏才能放 pill？（Lumen 当前 footer 是"插件 setStatus 段拼接"，没有分栏）

详细对比见 [status-region-vs-claude.md](D:/UGit/LumenAgent/docs/status-region-vs-claude.md)。

## 这轮顺手修掉的仓库级阻塞

为恢复正常提交链路，本轮额外修了两个仓库级问题：

1. `tsconfig.extensions.json`
   - 补到 `ES2024`
   - 解决 `packages/tui/src/utils.ts` 的 regex `v` flag 报错

2. `packages/web-ui/tsconfig.json` 与 `packages/web-ui/example/tsconfig.json`
   - 补齐 monorepo 源码路径映射与 `DOM.Iterable`
   - 解决 `npm run check` / pre-commit 时 `@earendil-works/pi-ai`、`@earendil-works/pi-agent-core` 等模块无法解析的问题

## 最后一次验证

本轮已重新通过：

- `npx tsc --noEmit -p tsconfig.extensions.json`
- `cd packages/web-ui && npm run check`
- `npm run check`

此前已通过且仍与当前改动相关的定向验证包括：

- `packages/coding-agent/test/interactive-mode-status.test.ts`
- `packages/coding-agent/test/lumen-task.test.ts`
- `packages/coding-agent/test/suite/agent-session-queue.test.ts`
- `packages/coding-agent/test/suite/regressions/2026-spinner-budget-usage.test.ts`
- `packages/coding-agent/test/suite/regressions/2027-compaction-hooks-events.test.ts`
- `packages/coding-agent/test/rpc-prompt-response-semantics.test.ts`
- `npx tsgo --noEmit`

## 下个 Claude 建议接手顺序

1. 继续补真实 queued command 语义：
   - `bridgeOrigin`
   - `pastedContents`
2. 继续把 expanded task/todo list 往 richer `TaskListV2` 方向推进
3. 再评估是否需要继续微调 working 第二行的 `Next / Tip / budget` 呈现层级
4. 除非插件/API 明确表达不了，否则不要回到 transcript 主消息流做大改

## 提交边界提醒

- 不要把 `.lumen/extensions/prompt-url-widget.ts` 的无关改动混进 Claude task UI 提交
- queued 必须继续保留在输入框上方
- working 主文案不要退回固定 `Working`
- 不要把 fake static tip 再伪装成 Claude tip
- 不要把 expanded task/todo list 退回字符串摘要块
