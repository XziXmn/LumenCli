# 状态栏 / 工作区对比：Lumen 当前 vs Claude Code

对比对象：

- **Lumen 当前**：`.lumen/extensions/claude-task-ui.ts` + core 端 `SpinnerUiState` / `TaskUiSummary` / `QueuedUiState` producer
- **Claude 基线**：`references/ClaudeCodeRev/src/components/Spinner.tsx` 系列 + `PromptInput/PromptInputFooter*` + `BackgroundTaskStatus` + `PromptInputQueuedCommands`

只比较"working / spinner 区 + footer 状态栏 + queued 区"这三块，不涉及 transcript 渲染。

## 总体布局对照

Claude 的纵向布局（自上而下）：

```
[transcript]

✻ Cogitating… (thinking · 45s · ↓ 3.2k tokens)        ← spinner 主行
   ⎿ <expanded view 之一: teammates / tasks / next / tip / budget>

> queued user message 1                              ← queued 区
> queued user message 2

[input]
─────────────────────────────────────────────────────
⚡ auto · @main @res · esc to interrupt   Remote ●    ← footer
[custom statusLine 输出]
```

Lumen 当前布局（自上而下）：

```
[transcript]

⠋ headline… (3s · ↓ 1.2k tokens · thinking)           ← spinner 主行
   ⎿ Next: …  /  Tip: …                              ← spinner 副行
   ⎿ <expanded tasks 列表，仅 expanded 时>            ← working details

[pending row / pending content]                    ← queued 区
[input]
[below-editor extension area]
─────────────────────────────────────────────────────
[footer: 由 setStatus("task-ui", …) 等组装]           ← footer
```

形态接近，但每一块语义都有差距。

## 一、Spinner 主行（动画那一行）

| 维度 | Claude | Lumen 当前 | 差距 |
|---|---|---|---|
| 动画字符 | `· ✢ ✳ ✶ ✻ ✽` 来回（macOS）；reduced-motion 静态 `●` 慢闪 | Braille `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` 顺序循环 | 风格不同；Braille 在中文等宽字体里 OK，但少了"反向回弹"和 reduced-motion 兜底 |
| 字符颜色 | 正常 = `claude` 主题色；3 秒无新 token 后平滑过渡到红色（stalled） | 固定 `accent` 色 | **缺 stalled→红色的视觉反馈** |
| 动画间隔 | 120ms | 80ms | 略快，可接受 |
| 文字效果 | GlimmerMessage：shimmer 高光扫过文字；按 mode 切换方向/速度（requesting↔responding）；tool-use 整体 sin 波闪烁 | `theme.bold(theme.fg("accent", …))` 静态加粗 | **完全没有 shimmer / pulse**，spinner 主行是静止的 |
| 文字内容 | 当前 task `activeForm` ‖ `subject` ‖ 随机动词（CLAUDE_SPINNER_VERBS） | 同样的 fallback 链；override 由 `spinner.overrideMessage` 提供 | 一致 |
| 括号状态 | `(thinking)` 带 sin-wave 发光（3s 后启动）；结束后 `(thought for Ns)`；elapsed `1m 23s`（30s 后或 verbose 时显示）；`↓ 12.3k tokens`（带平滑计数动画）；`↑/↓` 箭头按 mode 切换；effort 后缀；teammate 模式 `(esc to interrupt @x)` | `(3s · ↓ 1.2k tokens · thinking)`：elapsed 在 `>=3s` 后出现；token 同时显示；thinking 文字静态 | **token 数没动画递增**；**`thinking` 没有发光**；**没有 `↑/↓` 方向区分**；**没有"30s 后才出 elapsed"的渐进披露** |
| 模式区分 | `requesting / responding / tool-use / tool-input / thinking` 五种模式各有视觉 | 没有 mode 概念，只有 `isThinking` 一个布尔 | **缺 mode 模型**：requesting vs responding vs tool-use 在 Lumen 里看不出来 |
| Idle 提示 | leader idle + teammates running 时：`✻ Idle · teammates running`（静态 dim，禁用 stalled 红色） | 无 sub-agent 概念（同节问题） | 缺 |

### 主行小结

Lumen 主行是"够用的单帧 spinner + 静态文字 + 一组括号统计"。Claude 主行是"**动画语法本身在传达状态**"——shimmer 方向、pulse、stall→红、token 计数动画都是有信息量的。差距按"有无信息量"排序：

1. **缺 stalled→红色**（最重要，用户最需要的反馈：agent 卡住了）
2. **缺 mode 区分**（requesting/responding/tool-use 视觉不同）
3. **缺 thinking 发光**和 token 动画递增（次要，纯美观）
4. **缺 reduced-motion 兜底**（无障碍）

## 二、Spinner 副行（expanded view / next / tip / budget）

Claude 在主行下面**只显示一种**，按 `expandedView` 状态切换：

- A) **TeammateSpinerTree**（`expandedView === 'teammates'` 且有 teammates）
- B) **TaskListV2**（`expandedView === 'tasks'` 且有 tasks）
- C) **Next / Tip 单行**（默认）
- D) **Budget**（ant-only 实验）

Lumen 当前在副行同时塞了：

- `Next: …`（如果有 next task）
- `Tip: …`（如果 elapsed >=5s 且没有 next）
- `Budget: …`（已被 #3 关闭）
- `expanded tasks` 列表（通过 `setWorkingDetails` 渲染在 working 区域里）

| 维度 | Claude | Lumen 当前 | 差距 |
|---|---|---|---|
| 视图切换 | 单视图，状态机式（`expandedView` 互斥） | 同时显示 next + tip + tasks 详情 | **没有"互斥视图"概念**；信息会同时堆积 |
| Tip 内容 | 只有 3 条硬编码 + 1 条 `spinerTip` prop：clear（30 分钟后）、btw（30 秒后，从未用过 /btw）、custom；emergency tip 由远端动态配置 | 单一 `spinner.tip` 字段，由 core 决定 | **tip 池=1**，且不是按"会话状态"调度（这就是 #1 待办） |
| Tip 触发 | clear: elapsed >=30min；btw: elapsed >=30s 且首次 | elapsed >=5s 就显示 | 阈值过低；缺"首次/重复"判定 |
| Next 来源 | `nextTask` prop（pending 任务的 subject） | `summary.next.subject ?? next.content` | 一致 |
| Tasks 展开 | `Ctrl+T` 循环切换 expandedView：tasks → teammates → hide | `tasks-ui` 命令切换 `tasksExpanded` 布尔 | **没有循环切换**，只有"开/关"；没有 teammates 视图 |
| Budget | ant-only 实验；显示 `Target: X / Y (Z%) · ~Nm` | 已隐藏（#3 完成） | 一致（都不显示） |

### 副行小结

最大差距是**视图切换语义**：Claude 的 expandedView 是状态机（互斥单选），Lumen 是"叠加显示"。如果 next + tip 同时可显示，Claude 选 next 优先，Lumen 在某些状态会两者都隐藏（`if (next) … else if (spinner?.tip && elapsed >= 5_000) …`，这部分逻辑是对的，已经是互斥）。

但 expanded tasks 那一层是**叠加在副行之上**的（通过 `setWorkingDetails`），跟 next/tip 行**同时存在**——这点跟 Claude 不一样，Claude expanded 时副行就只剩 task list，不再显示 next/tip。

代码位置：`claude-task-ui.ts:332` —

```ts
if (showExpandedTasksInSpinnerRegion) return firstLine;  // 此时只返回主行
```

——这一行其实已经做对了：expanded 时副行不显示 next/tip。所以**视图互斥这块 Lumen 已经实现了**，只是少了 teammates 视图。

## 三、Footer / 状态栏

Claude footer 分左右：

**左侧**（`PromptInputFooterLeftSide`）按优先级显示一项：

1. Exit message: "Press Ctrl+D again to exit"
2. Pasting indicator
3. Vim mode: `-- INSERT --`
4. Mode 指示: `⚡ auto mode on (shift+tab to cycle)`
5. **Background task pills**: `@main @researcher @implementer · shift + ↓ to expand`
6. Team status / PR badge
7. **Hints**（按当前状态选一条）：
   - `esc to interrupt`（loading 时）
   - `ctrl+x ctrl+k to stop agents`
   - `ctrl+t to show tasks / teammates / hide`（循环）
   - `? for shortcuts`（默认）
   - `hold Space to speak`

**右侧**：API key 状态、auto-updater、IDE info、MCP 状态、bridge/remote 控制连接指示。

**StatusLine**（自定义）：执行用户配置的 shell 命令（`settings.statusLine.command`），渲染 ANSI 输出，输入是 JSON（model / workspace / cost / context window / rate limits / vim / session / agent / remote / worktree）。

Lumen 当前 footer：通过 `ctx.ui.setStatus(key, text)` 注册若干段，最终由 footer 组件拼接：

- `task-ui`: `"<done>/<total> tasks · show/hide tasks"` ← 本插件
- 其他插件：`tps`（tokens/sec）、`dynamic-status`、`prompt-url-widget` 等

| 维度 | Claude | Lumen 当前 | 差距 |
|---|---|---|---|
| 优先级模型 | 状态机式互斥（一次显示一项） | 多 key 并列拼接 | Lumen 是"段拼接"，Claude 是"按状态选一项" |
| Mode 指示 | `⚡ auto mode on` 等明确呈现 | 没有专门的 mode 指示段 | **缺 permission mode 显示**（需查 core 是否暴露） |
| Hints | `esc to interrupt` / `ctrl+t to show tasks` 按状态切换 | 当前只有 `show tasks / hide tasks` 静态文本嵌在 task-ui 段里 | **缺 hint 状态机**：loading 时应该是 `esc to interrupt`，idle 是 `? for shortcuts`，等等 |
| Sub-agent pills | `@name @name` 彩色 pill 横排，可滚动 | **完全没有** | sub-agent 在 footer 不可见（这是 #2 议题的另一面） |
| 自定义 statusLine | shell 命令 + JSON 输入 + ANSI 渲染 | 通过 extension API（`pi.on("session_start"…) → ctx.ui.setStatus(…)`） | Lumen 走的是 TS 扩展，不是 shell hook；功能等价但门槛高 |
| 右侧通知区 | 独立右对齐区域（API key/MCP/IDE/Remote） | 没有左右分栏，所有 status 段挤在一起 | **缺左右分栏**；缺连接状态指示器 |

### Footer 小结

Lumen footer 是"插件 setStatus 段拼接"，扩展性强但**没有状态机优先级**。最大差距：

1. **没有 hint 状态机**——loading/idle/agents-running 应该自动换 hint
2. **没有 sub-agent pills**——不知道有谁在跑
3. **没有左右分栏**——通知类（连接、token 速率）和操作类（hint）混在一起
4. **没有 mode 指示**——auto/plan/normal 看不见

## 四、Queued 区

| 维度 | Claude | Lumen 当前 | 差距 |
|---|---|---|---|
| 渲染位置 | spinner 与 input 之间，`marginTop=1` | core `bottomPane.pendingRow/pendingContent`，位于 taskbar 之后、input 之前 | 一致 |
| 渲染形式 | 用 `<Message>` 组件渲染成 user message bubble，看起来跟 transcript 历史一样 | 自定义 `ClaudeQueuedWidgetComponent`：dim 标题 + `⎿` 列表 | **风格不一样**：Claude 是"假装已经发出去了"的消息气泡，Lumen 是"列表式预览" |
| 总数标题 | 无（每条 queued 自己作为消息出现） | `1 queued command` / `N queued commands` | Lumen 多一行总览，Claude 没有 |
| 隐藏逻辑 | viewing teammate transcript 时隐藏；idle_notification 过滤；meta 命令默认隐藏；task notification 上限 3 + overflow | 显示所有 steering+followUp，截断到 `MAX_QUEUED_ITEMS=4` | **缺类型过滤**（idle_notification / meta） |
| Bash 命令 | `<bash-input>` 包裹，单独样式 | tag 形式 `[image]/[meta]/[raw]/[priority]` | 元数据呈现思路不同 |
| 上限 + 溢出 | task notification 类 max=3，溢出合成 "+N more tasks completed" | 全类型 max=4，溢出 "+N more queued commands" | 一致思路 |

### Queued 小结

视觉风格上，Claude 让 queued 看起来"已经在 transcript 里了"，Lumen 让 queued 看起来"在等待区"。**两种都合理**——Claude 的让 queue 与 history 视觉连续，Lumen 的让 queue 与 history 明显分离。这不是"缺什么"，是设计取向不同。

唯一真正的功能差距：**没过滤 idle_notification / meta 类**。

## 五、Sub-agent 显示（穿越多个区域）

这是本次最重要的差距类别，单独列。Claude 把 sub-agent 信息撒在三处：

1. **Spinner 副行**（TeammateSpinerTree）：
   ```
   ╒═ team-lead · 5.2k tokens · shift + ↑/↓ to select
   ├─ @researcher: Reading files… · 3 uses · 1.2k tokens
   └─ @implementer: Editing src/foo.ts… · 7 uses · 4.5k tokens
   ```

2. **Footer pill**（BackgroundTaskStatus）：
   ```
   @main @researcher @implementer · shift + ↓ to expand
   ```
   彩色 pill；active 高亮；idle dim 排到末尾；当前 viewing 加粗；选中反相。

3. **Transcript 内**（TaskAssignmentMessage）：
   ```
   ╭──────────────────────────────╮
   │ Task #3 assigned by team-lead   │
   │ Implement the auth module       │
   │ Description text here…          │
   ╰──────────────────────────────╯
   ```

以及 AgentProgressLine（非 in-process agent，比如 AgentTool 后台跑的）：
```
   ├─ AgentType (description) · 3 tool uses · 1.2k tokens
   │  ⎿ Reading config files…
```

Lumen 当前：

- **Spinner 副行**：完全没有 sub-agent 视图
- **Footer**：完全没有 pill
- **Transcript**：sub-agent 调用走的是普通 tool 的 `renderCall/renderResult`；目前**子 agent prompt 被错误地塞到了 spinner override**，导致状态栏标题被污染（这是 #2 议题）

正确的做法（按 Claude 模型）：

1. 子 agent prompt → transcript 主行 `● Task(prompt 摘要)` + `⎿ Running… (N uses · X tokens)`
2. 子 agent 状态 → footer pill `@agent`
3. 子 agent 详情 → spinner 副行的"teammate 视图"（按 Ctrl+T 循环切到）

Lumen 现在三处都没有，且把信息错放到了主行 spinner override 里。

## 总结：缺什么 + 乱加什么

### 真正缺失（按重要性排序）

1. **Sub-agent 在 transcript / footer / spinner 三处都没显示**（#2 的根因）
2. **Tip 池=1，且不按会话状态调度**（#1 待办）
3. **Spinner 主行没有 stalled→红色反馈**（用户最需要的"卡住"信号）
4. **Footer 没有 hint 状态机**（loading vs idle vs agents-running 不切换 hint）
5. **Spinner 没有 mode 区分**（requesting/responding/tool-use 视觉相同）
6. **Footer 没有 mode 指示**（auto/plan 看不见）
7. **Footer 没有左右分栏**（通知和操作混在一起）
8. **Queued 没有 idle_notification/meta 过滤**

### 乱加（Lumen 多出来、Claude 没有的）

1. **Queued 区的总数标题行 + tag 罗列**（`[priority][image][meta][origin][source][raw]`）：Claude 让 queued 看起来跟普通消息一样；Lumen 把元数据全暴露成 tag，**视觉噪音重**
2. **Spinner 副行同时显示 next + tip 的 fallback 顺序是 next→tip**：跟 Claude 一致，但 Lumen 还另外用 `setWorkingDetails` 在副行之外**叠加 expanded tasks 列表**——这部分在 expanded 时已正确排他（`claude-task-ui.ts:332` 的 early return），但在 transcript 模式下还有重复信息的可能
3. **Budget 行**（已通过 #3 关闭）

### 设计取向差异（不是 bug，是选择）

- Queued 视觉：Lumen "等待区列表" vs Claude "假装已发出"
- Footer 组装：Lumen "插件段拼接" vs Claude "状态机互斥"
- 自定义 statusLine：Lumen "TS 扩展" vs Claude "shell hook"

这三处不需要改，但 footer 状态机化是**重构 hint/mode/sub-agent pill 的前提**——只要还是"段拼接"模型，就装不下"按状态切 hint"的逻辑。

## 后续动作建议

按用户已确认的执行顺序：

- ✅ #3 hide budget 行（已完成）
- 📋 #4 本对比文档（即本文件）
- ⏭ #1 handoff 文档加 tip 多池+按会话状态调度待办
- ⏭ #2 sub-agent transcript/footer/spinner 三层重构（最重，需先界定边界）

#2 真正落地前还需要回答：

- Lumen core 是否已暴露 sub-agent 状态？（`SpinnerUiState` 里没有；可能需要新加 `getSubAgents()`）
- Footer 的左右分栏是 pi-tui 层的事还是插件层？（如果是 pi-tui 层，改动面大；如果是插件层，可以做 `setStatus` 的 placement 参数）
- transcript 主行 `● Task(...)` 的 `renderCall` 在哪里？（sub-agent 工具的位置；需要先定位）

这些是 #2 开始动手前要先弄清楚的事。
