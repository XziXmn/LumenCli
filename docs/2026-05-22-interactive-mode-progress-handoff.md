# 2026-05-22 Interactive Mode Progress Handoff

本文件用于给下一次会话快速接手当前 `interactive-mode` / TUI 进度面与输入法稳定性工作。

## 当前结论

- `interactive-mode` 的主任务栏所有权已经基本回收到 core，主结构仍然是：
  - `header`
  - `chatContainer`
  - `promptAreaContainer`
    - `statusContainer`
    - `pendingMessagesContainer`
  - `interactionAreaContainer`
    - `editorContainer`
    - `extensionAreaContainer`
      - `widgetContainerAbove`
      - `widgetContainerBelow`
    - `footer`
- 这意味着“输入框上方任务栏 + 待发送消息区 + 固定输入框”的主骨架已经在 core 内，而不是继续交给扩展层。
- 当前这轮工作重点不是继续发明新的光标恢复技巧，而是压住“输入中文拼音时，上方动画和定时刷新抢刷界面”。

## 本轮已完成

### 1. 输入期间后台刷新保护

已新增一个输入活动保护窗口，用来在用户正在输入时暂停非关键动画刷新。

涉及文件：

- [.lumen/extensions/prompt-url-widget.ts](/D:/UGit/LumenAgent/.lumen/extensions/prompt-url-widget.ts)
- [packages/coding-agent/src/modes/interactive/interactive-mode.ts](/D:/UGit/LumenAgent/packages/coding-agent/src/modes/interactive/interactive-mode.ts)
- [packages/coding-agent/src/modes/interactive/components/tool-execution.ts](/D:/UGit/LumenAgent/packages/coding-agent/src/modes/interactive/components/tool-execution.ts)
- [packages/coding-agent/test/footer-progress-filter.test.ts](/D:/UGit/LumenAgent/packages/coding-agent/test/footer-progress-filter.test.ts)
- [packages/coding-agent/test/interactive-mode-status.test.ts](/D:/UGit/LumenAgent/packages/coding-agent/test/interactive-mode-status.test.ts)
- [packages/tui/src/tui.ts](/D:/UGit/LumenAgent/packages/tui/src/tui.ts)
- [packages/tui/src/components/loader.ts](/D:/UGit/LumenAgent/packages/tui/src/components/loader.ts)
- [packages/coding-agent/src/modes/interactive/components/countdown-timer.ts](/D:/UGit/LumenAgent/packages/coding-agent/src/modes/interactive/components/countdown-timer.ts)
- [packages/coding-agent/src/modes/interactive/components/armin.ts](/D:/UGit/LumenAgent/packages/coding-agent/src/modes/interactive/components/armin.ts)
- [packages/coding-agent/src/modes/interactive/components/daxnuts.ts](/D:/UGit/LumenAgent/packages/coding-agent/src/modes/interactive/components/daxnuts.ts)

具体做法：

- `TUI` 新增 `shouldSuppressBackgroundRenderUpdates?: () => boolean`
- `InteractiveMode` 新增输入活动窗口：
  - `INPUT_ACTIVITY_SUPPRESSION_MS = 200`
  - `inputActivitySuppressedUntil`
  - `inputActivityResumeTimer`
  - `inputActivityListenerCleanup`
- 在 `InteractiveMode` 构造里通过 `ui.addInputListener(...)` 监听原始输入，只要有输入就调用 `markInputActivity()`
- `markInputActivity()` 会：
  - 延长输入保护窗口
  - 暂停 progress surface 的 250ms 刷新循环
  - 在保护窗口结束后恢复刷新循环并补一帧
- `Loader.updateDisplay()` 在保护窗口内不再主动 `requestRender()`
- `CountdownTimer` 在保护窗口内不再主动 `requestRender()`
- `ArminComponent` / `DaxnutsComponent` 的定时动画在保护窗口内不再主动 `requestRender()`
- `TUI.requestRender()` 现在区分“前台输入触发”和“后台非输入触发”：
  - 焦点组件正在处理真实输入时，仍允许输入框自身重绘
  - 其他普通 `requestRender()` 在保护窗口内直接跳过
- `ToolExecutionComponent` 的异步图片转换回调也会尊重输入保护窗口，不再在输入期间单独抢刷
- `terminal progress`（OSC 9;4）现在也纳入输入保护窗口：
  - 输入期间先清掉终端进度 keepalive，避免即使不重绘 UI 仍持续向终端写入
  - 输入保护结束后再按当前 active 状态恢复
- `setSpinnerBanner()` 已改成走输入保护感知的刷新路径，避免重试倒计时经由 banner 更新重新抢刷界面
- 本仓库当前唯一实际启用的 `aboveEditor` 被动 widget（`prompt-url-widget`）已下移到 `belowEditor`
  - 这样默认配置下，输入框上方更集中为“任务栏 + 待发送消息区”
- `attachMainLayout()` 已继续收口：
  - `taskbar + pending` 已收进统一的 `promptAreaContainer`
  - `editor + 下方扩展区 + footer` 已收进统一的 `interactionAreaContainer`
  - 当前顶层顺序为：
  - `chat -> promptArea(taskbar + pending) -> interactionArea(editor + extensionArea + footer)`

### 2. TUI 回归测试

已补一个最小回归测试，验证后台动画在抑制状态下不会继续触发终端写入。

涉及文件：

- [packages/coding-agent/test/ime-progress-surface-debug.ts](/D:/UGit/LumenAgent/packages/coding-agent/test/ime-progress-surface-debug.ts)
- [packages/tui/test/tui-render.test.ts](/D:/UGit/LumenAgent/packages/tui/test/tui-render.test.ts)

新增测试：

- `TUI background render suppression`
  - `skips loader-driven redraws while background updates are suppressed`
  - `still renders focused input changes while background updates are suppressed`
  - `blocks non-input redraws after focused input while background updates are suppressed`
- `InteractiveMode` 输入活动窗口
  - `requestRenderUnlessInputSuppressed skips redraws while input activity is active`
  - `markInputActivity defers redraw until suppression window ends, then restores refresh loop`
- `InteractiveMode` core progress surface 行为
  - `renderWorkingArea prefers the core progress surface over the fallback loader`
  - `renderWorkingArea clears the taskbar area when no active surface or details remain`
  - `agent_end clears the core progress surface state so the taskbar can disappear`
- `InteractiveMode` 主布局骨架
  - `attaches the core-owned surface in the expected top-to-bottom order`
  - 当前顺序已更新为：`chat -> promptArea(taskbar + pending) -> interactionArea(editor + extensionArea(widgetAbove + widgetBelow) + footer)`
  - 默认 `setWidget()` 现在落到下方扩展区上半部，不再触碰输入框上方主链
- `InteractiveMode` banner / queued 语义
  - `setSpinnerBanner prefers the input-aware render helper over direct ui.requestRender`
  - `updatePendingMessagesDisplay keeps queued commands out of the main transcript container`
- `InteractiveMode` widget / footer 边界
  - `setExtensionWidget keeps belowEditor widgets out of the pending message slot`
  - `footer-progress-filter` 继续验证 ui/queue 等主动进度状态不会泄漏到 footer
  - `setExtensionFooter swaps the footer inside interactionAreaContainer`
- `InteractiveMode` terminal progress 行为
  - `syncTerminalProgressIndicator disables terminal progress while input suppression is active`
  - `syncTerminalProgressIndicator restores terminal progress after input suppression ends`
  - `agent_start routes terminal progress through the input-aware helper`
  - `compaction lifecycle routes terminal progress through the input-aware helper`
- 本仓库默认扩展布局
  - `prompt-url-widget` 已改为 `belowEditor`，不再占用输入框上方主链路
- 手工 IME 验证 harness
  - `ime-progress-surface-debug.ts` 提供真实 `ProcessTerminal` 的可切换场景
  - 其容器模型也已对齐到当前 runtime：
    - `transcript -> promptArea(taskbar + pending) -> interactionArea(editor + extensionArea + footer)`
  - 用于本地手工观察 taskbar / pending / footer / retry / reconnect / approval / ask-user 在输入期的表现

## 当前未提交改动

`git diff --stat` 结果：

- `packages/coding-agent/src/modes/interactive/components/armin.ts`
- `packages/coding-agent/src/modes/interactive/components/countdown-timer.ts`
- `packages/coding-agent/src/modes/interactive/components/daxnuts.ts`
- `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- `.lumen/extensions/prompt-url-widget.ts`
- `packages/coding-agent/test/ime-progress-surface-debug.ts`
- `packages/coding-agent/test/footer-progress-filter.test.ts`
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/test/interactive-mode-status.test.ts`
- `packages/tui/src/components/loader.ts`
- `packages/tui/src/tui.ts`
- `packages/tui/test/tui-render.test.ts`

合计：

- 19 tracked files changed
- 769 insertions
- 69 deletions
- plus 4 new files:
  - `docs/2026-05-22-interactive-mode-progress-handoff.md`
  - `docs/ime-manual-check.md`
  - `ime-progress-surface-debug.ps1`
  - `packages/coding-agent/test/ime-progress-surface-debug.ts`

## 本轮验证结果

### 已通过

1. `node --test --import tsx packages/tui/test/tui-render.test.ts`
   - 通过
   - 当前共 `22` 个测试全部通过
   - 包含新增的 `TUI background render suppression` 三个回归测试

2. `npx tsx ../../node_modules/vitest/dist/cli.js --run test/edit-tool-no-full-redraw.test.ts test/interactive-mode-status.test.ts test/claude-task-ui.test.ts test/lumen-todo.test.ts test/lumen-task.test.ts test/footer-progress-filter.test.ts`
   - 通过
   - `6` 个测试文件
   - 当前为 `95` 个测试全部通过

3. `npx tsc -p tsconfig.extensions.json --noEmit`
   - 通过

4. `npm run check`
   - 通过

5. `./lumen-test.ps1 -c`
   - 通过
   - 当前仍然只是通用工具 smoke，不覆盖中文输入法现场

## 还没完成的部分

### 1. 这还不是最终的“上下分区彻底解耦”

当前做的是“输入期间抑制后台动画刷新”，不是彻底把“上方正文区”和“下方交互区”做成 Codex 那种终端层级分区。

也就是说：

- 现在更像“先把最容易导致拼音闪烁的后台定时刷新压住”
- 还没有真正把 TUI 改造成 Codex 那种“历史正文往上沉淀、底部视口固定”的模型

### 2. 还缺真实中文输入法现场验证

虽然定向测试和类型检查已过，但下面这些仍然缺真实手工验证：

- 工作流持续输出时，PowerShell / Windows Terminal 中输入中文拼音
- 输入法候选窗是否还会在正文区闪
- 输入位置是否始终留在真实输入框
- 重试态、等待确认态、等待输入态同时出现时是否会重新抢刷
- 子代理并行、todo/task 并行、queued command 并发出现时，是否仍能保持“正文区只留消息流、任务栏独占主动进度”
- 可直接先跑：
  - `npx tsx packages/coding-agent/test/ime-progress-surface-debug.ts`
  - `.\ime-progress-surface-debug.ps1`
  - 在脚本里切到中文输入法，使用 `Ctrl+N` 切换审批 / 等待输入 / 重试 / 重连 / 并行 / 完成等场景做现场观察
- 现场验证步骤见：
  - [docs/ime-manual-check.md](/D:/UGit/LumenAgent/docs/ime-manual-check.md)

### 3. 可能还需要纳入保护的定时源

本轮已覆盖：

- loader
- progress surface refresh loop
- countdown timer
- armin / daxnuts 动画
- spinner banner 刷新

但如果后续还发现输入期闪烁，需要继续搜：

- 其他 `setInterval` + `requestRender()` 组件
- 通过外部状态变化频繁触发的 UI 刷新路径
- 是否还有少数必须保留的 `requestRender(true)` / overlay 切换路径恰好发生在 IME 输入期

## 下一次会话建议顺序

1. 先用当前未提交改动启动一次真实手工验证
   - 重点测“流式输出中输入中文拼音”
   - 不要先继续大改布局

2. 如果闪烁明显缓解
   - 再继续推进更深层的“上方正文区 / 下方固定交互区”结构化重构
   - 目标仍然是更接近：
     - Claude 的分层外观
     - Codex 的固定交互区思路

3. 如果闪烁仍存在
   - 继续沿“后台刷新源收口”方向查
   - 不要回到“保存/恢复真实光标”的错误路线

## 重要提醒

- 当前工作树不是干净的；当前相关 diff 已扩到 19 个已跟踪文件 + 4 个新增文件
- `setWidget` 的公开语义文档也已开始对齐当前实现：
  - `aboveEditor` / `belowEditor` 现在应理解为“输入框下方扩展区”的上下两个 slot
  - 不再把 `aboveEditor` 理解为“输入框上方主链路”
- 不要推送到 `pi` 上游
- 不要用破坏性 git 操作
- 这份文档对应的是当前本地 `main`
