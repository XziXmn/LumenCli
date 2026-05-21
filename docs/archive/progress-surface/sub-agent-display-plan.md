# Sub-agent 显示重构 · 定位与计划

> Superseded: this document predates the core-owned Claude-aligned progress workflow.
> Keep for historical context only; do not use it as the implementation source of truth.

本文档是 #2 议题"子 agent prompt 不应该塞到状态栏标题，应该作为 transcript 里 `● Task(...)` 主行"的定位结果与方案，作为长线任务的起点。

相关上游文档：

- [status-region-vs-claude.md](../../status-region-vs-claude.md) — 状态栏整体对比
- [2026-05-19-claude-task-ui-handoff.md](../../2026-05-19-claude-task-ui-handoff.md) — 当前进展与待办

## 一、定位结果（已查证）

### 1. Sub-agent 工具定义位置

文件：`packages/coding-agent/src/core/lumen-task.ts`

- 工具名 `"task"`，label `"Task"`，注册在 `lumenTaskExtension` 内（line 594-596）
- `TaskItemSchema`（line 480-488）：
  - `id`：CamelCase 短标识（max 48）
  - `description`：Short one-liner for UI display
  - `activeForm`：Optional, present-continuous label for spinner headline
  - `assignment`：Full task instructions for the sub-agent
- `renderCall`（line 715-757）：渲染 `● agentName(N tasks)`，icon 按 pending/running/success/error 切换
- `renderResult`（line 760-802）：partial 时 tree-style 进度列表；完成后 `⎿ Done (N tool uses · X tokens · Ts)` 摘要
- `SubagentProgress`（line 292-298）：内部进度结构，存 `description / activeForm / status / currentTool / toolCount / tokens / durationMs`

**关键发现**：transcript 主行的 `● Task(...)` **已经存在且工作**，不是缺失。

### 2. ExtensionContext 暴露的 sub-agent 状态

| 层 | 内容 |
|---|---|
| **已暴露** | `getTasks() → TaskUiItem[]`、`getTaskSummary() → { current, next, total, … }`、`tool_execution_*` 事件 |
| **内部未暴露** | `SubagentProgress` map（含 currentTool/tokens/duration 完整版）、`TASK_PROGRESS_CHANNEL` / `TASK_LIFECYCLE_CHANNEL`（在私有 `taskEventBus` 上） |
| **完全缺失** | `getSubAgents()` handle、sub-agent lifecycle events、output streaming、abort API |

**结论**：插件层已经能通过 `getTaskSummary().current` 拿到 sub-agent 当前状态。问题不在数据可用性。

### 3. Spinner 标题污染的真实路径

**不是** `spinner.overrideMessage`（那条仅用于 compaction/retry）。真实路径：

```
model 调用 task tool → tasks[].description 存入 SubagentProgress.description
  ↓
getSessionTaskUiItems()（lumen-task.ts:234-238）映射到
  TaskUiItem.content = description
  TaskUiItem.subject = description（同一字段！）
  TaskUiItem.activeForm = activeForm（如果 model 填了）
  ↓
getTaskSummary().current = 第一个 in-progress 项
  ↓
插件 formatCurrentHeadline()（claude-task-ui.ts:286-298）：
  overrideMessage → current.activeForm → current.subject → current.content → randomVerb
  ↓
变成 spinner 主行标题
```

**根因**：

1. schema 说 `description` 是 "Short one-liner"，但没强制截断
2. `activeForm` 是 optional，model 经常不填
3. fallback 链一路退到 `subject`/`content`（= description），把长 prompt 当 headline

## 二、Claude 是怎么做的（已查证）

参考 `references/ClaudeCodeRev/src/components/Spinner.tsx:207-217`：

```typescript
const leaderVerb =
  overrideMessage ??
  currentTodo?.activeForm ??
  currentTodo?.subject ??
  randomVerb

const effectiveVerb =
  foregroundedTeammate && !foregroundedTeammate.isIdle
    ? (foregroundedTeammate.spinnerVerb ?? randomVerb)
    : leaderVerb
```

**Claude 的 fallback 链与 Lumen 完全一致**——也会退到 `subject`。区别在于防线设计：

1. **`subject` 是 task 短标题**（由 `TaskCreateTool` 设置，schema 与命名都强约束短文本），不是 sub-agent 的 prompt
2. **sub-agent 的完整 prompt 走 `assignment`/`instructions` 字段**，从不进入 UI 文案链
3. **leader idle + teammates running 时直接切静态文案**（Spinner.tsx:288-307）：
   ```
   ✽ Idle · teammates running
   ```
   完全替换动画 spinner，不再尝试 fallback 到任何 task 文案
4. **查看某个 teammate 时，主行用该 teammate 的 `spinnerVerb`**——一个 spawn 时随机分配的动词（`spawnInProcess.ts:171`），不是 prompt
5. `activeForm` 由 `TaskCreateTool` / `TaskUpdateTool` 显式设置

**Claude 设计意图**：spinner 主行**永远不显示 prompt/description 长文本**。靠 schema 约束 + fallback 终点（randomVerb）+ idle 静态文案三道防线。

## 三、修复方案

### 方案 D+（推荐，但待确认）

**插件层修改**（`.lumen/extensions/claude-task-ui.ts`）：

1. 改 `formatCurrentHeadline` fallback 链：
   ```diff
   - overrideMessage → current.activeForm → current.subject → current.content → randomVerb
   + overrideMessage → current.activeForm → randomVerb
   ```
   去掉 `subject` / `content` 两级 fallback。语义更对：没有 `activeForm` 说明 task 没提供动态文案，不该用 description 当 spinner。

2. 新增 leader idle 静态文案分支：
   - 触发条件：有 task running 但 spinner 没有 `isThinking`、`outputTokens` 没在涨、`elapsedMs` 没在累积主 agent 那一侧
   - 显示：`✽ Idle · tasks running`（中文化或保留原文待定）
   - 替换整个 spinner 动画行（不只是文字），与 Claude 一致

**Core 端不动**（保留 `description`/`assignment` schema，保留 `SubagentProgress` 结构）。

**Transcript 主行不动**（`renderCall` 已经是 `● agentName(N tasks)` 格式，已经对了）。

### 方案 D+ 未覆盖的部分

参考 [status-region-vs-claude.md](../../status-region-vs-claude.md) 第五节"Sub-agent 显示穿越多个区域"，Claude 把 sub-agent 信息撒在三处：

| 区域 | Claude | Lumen 现状 | 方案 D+ 是否解决 |
|---|---|---|---|
| Spinner 主行（不显示 prompt） | ✓ | ✗（被 description 污染） | ✓ |
| Spinner 副行（TeammateSpinerTree） | ✓ | ✗（无） | ✗ |
| Footer pill（@agent 彩色 pill） | ✓ | ✗（无） | ✗ |
| Transcript 主行（`● Task(...)`） | ✓ | ✓（已有） | n/a |
| Transcript 子项（progress tree） | ✓ | ✓（已有） | n/a |

**方案 D+ 只解决 spinner 主行污染**，不补 spinner 副行 teammate tree 和 footer pill。后两者是更大的工作量。

## 四、长线任务的开放问题（待用户确认）

按工作量从小到大列：

### Q1. spinner idle 静态文案的触发条件用什么信号？

候选：

- (a) `summary.current` 存在（有 task running）但 `spinner.outputTokens` 在最近 N 秒没增长 → idle
- (b) Core 端新增 `spinner.leaderState: "working" | "idle-with-children"` 字段，由 producer 直接判定
- (c) 完全在插件层用启发式（elapsedMs 增长但 outputTokens 不增长 + isThinking 为 false）

(b) 最干净但要动 core；(c) 不动 core 但容易误判。

### Q2. 中文化 vs 保留 `Idle · tasks running` 原文？

Lumen 整体偏中文，但 spinner 动画行历史上是英文+省略号风格（`Cogitating…`）。如果 idle 文案中文化，会和 randomVerb 风格不一致。

候选：

- (a) `等待中 · 子任务进行中`（全中文，与 Lumen 总体一致）
- (b) `Idle · tasks running`（与 Claude 一致，与 randomVerb 风格一致）
- (c) `闲置 · N 个子任务运行中`（带数量，更具信息量）

### Q3. 要不要补 footer pill 与 spinner 副行 teammate tree？

这两块是 Claude 显示 sub-agent 的"主战场"，方案 D+ 没覆盖。要补的话工作量：

- footer pill：插件层可做，但需要 footer 支持横向滚动 / 左右分栏（当前是段拼接）
- spinner 副行 teammate tree：插件层可做，但需要在 expanded view 状态机里增加 `teammates` 视图，按 Ctrl+T 循环切换

Lumen 可能不需要做到 Claude 那么完整（Lumen 子 agent 用法更轻），所以这是设计取向问题。

### Q4. Core 是否需要新增 sub-agent API？

如果 Q3 选择补 pill 与 tree，且 Q1 选 (b)，则需要：

- `ExtensionContext.getSubAgents()` → 返回完整 `SubagentProgress[]`（不是 `TaskUiItem` 那个简化版）
- 把 `TASK_PROGRESS_CHANNEL` / `TASK_LIFECYCLE_CHANNEL` 暴露到 `pi.events`
- 新增 `subagent_start` / `subagent_progress` / `subagent_end` 事件类型

如果 Q3 选择不补，则只需 (a) 或 (c) 就够了，core 不动。

### Q5. activeForm 缺失时的兜底要不要主动改 prompt？

Claude 的 `TaskCreateTool` schema 是否强制 `activeForm` required？如果是，Lumen 也应该跟着改成 required（当前是 optional）。这会减少 fallback 触发概率，但属于"修源头"。

## 五、推荐执行顺序（待用户确认后启动）

1. **先做方案 D+**（Q1/Q2 确认后即可动手，最小改动，能立刻消除主行污染）
   - 改 `claude-task-ui.ts:formatCurrentHeadline` fallback 链
   - 加 leader idle 静态文案分支
   - 不动 core
2. **再决定是否做 Q3**（footer pill + spinner teammate tree）
   - 如果做，先回答 Q4 是否要扩 core API
   - 如果不做，#2 议题在方案 D+ 完成后即视为关闭
3. **可选 Q5**（activeForm required 化）
   - 修源头，降低 fallback 触发率
   - 但会让现有不带 activeForm 的 task 直接报错，要评估影响面

## 六、本轮已完成（不在长线任务范围）

- ✅ #3 隐藏 budgetText 行（`.lumen/extensions/claude-task-ui.ts:335-339` 注释，core producer 保留）
- ✅ #4 状态栏整体对比文档（`docs/status-region-vs-claude.md`）
- ✅ #1 handoff 文档加 tip 多池/按会话状态调度待办（`docs/2026-05-19-claude-task-ui-handoff.md`）
- ✅ 本文档（#2 定位 + Claude 做法 + 方案 + 开放问题）

## 七、Q1-Q5 推荐答案与理由

### Q1 → (c) 纯插件层启发式，不动 core

判定条件：`summary` 有 running task + `!isThinking` + `outputTokens` 连续 2 个 refresh cycle（500ms）没涨 → idle。

**理由**：插件已有 250ms refresh loop + `WorkingState` 对象，可以追踪 `lastOutputTokens`。唯一误判场景是"leader 在跑长 bash 同时有 task running"——但 Lumen 当前不支持 parallel tool calls，不会发生。如果将来不可靠再升级到 (b)。

### Q2 → (b) 保留英文 `Idle · tasks running`

**理由**：spinner 动画行历来是英文（randomVerb 是 "Cogitating…" / "Brewing…"），中文混进去视觉割裂。Lumen 中文化集中在 prompt、文档、状态消息，spinner 行是另一个视觉层级。

### Q3 → 暂不补，但 Spinner teammate tree 列入 Phase D 规划

**理由**：
- Lumen sub-agent 用法轻（通常 1-2 个 task，不是 Claude 那种 5+ teammates 编队）
- Footer pill 需要 pi-tui 层支持左右分栏 + 横向滚动，改动面大
- 方案 D+ 已经消除最痛的"标题被污染"问题
- Spinner teammate tree 用户已要求列入规划（见 Phase D）

### Q4 → 不动 core（现阶段）

**理由**：Phase A-C 不需要新 core API。如果后续 Phase D 推进 teammate tree，再评估是否扩 `getSubAgents()`。

### Q5 → 不改 schema，接受 randomVerb 作为兜底

**理由**：D+ 去掉 subject/content fallback 后，没有 activeForm 的 task 退到 randomVerb（"Cogitating…"），这是正确行为——spinner 主行本来就不该承载 task 描述信息，transcript 的 `● Task(...)` 主行才是。强制 required 会破坏现有 task 调用，收益不大。

## 八、调整路线（基于 status-region-vs-claude.md）

### Phase A — 最小改动，消除当前 bug（仅插件层）

| # | 改动 | 对应差距 | 文件 |
|---|---|---|---|
| A1 | `formatCurrentHeadline` 去掉 subject/content fallback | Sub-agent 标题污染 | `claude-task-ui.ts` |
| A2 | 新增 leader idle 静态文案分支（`Idle · tasks running`） | Sub-agent 标题污染 | `claude-task-ui.ts` |
| A3 | Queued 区去掉 tag 罗列（`[priority][image][meta][origin][source][raw]`），只保留 delivery label + text | 乱加 #1 视觉噪音 | `claude-task-ui.ts` |
| A4 | Queued 区过滤 `isMeta` 类消息 | 缺失 #8 | `claude-task-ui.ts` |

预计改动：~30 行，无 core 变更。

### Phase B — Spinner 信息密度提升（插件层 + 可能微量 core）

| # | 改动 | 对应差距 |
|---|---|---|
| B1 | Stalled→红色：spinner 字符在 `outputTokens` 3 秒不涨时从 accent 切到 error 色（如不支持渐变则直接切色） | 缺失 #3 |
| B2 | Tip 多池 + 按会话状态调度（在插件层维护 tip 池，不动 core） | 缺失 #2 |
| B3 | Spinner mode 区分（requesting/responding/tool-use 视觉不同），需 core 暴露 `spinner.mode` | 缺失 #5 |
| B4 | **Token 计数平滑动画递增**（参考 Claude `useAnimatedNumber` 平滑过渡） | Spinner 动画对照表 |

B3 是 Phase B 唯一需要动 core 的点（加一个 enum 字段）。预计改动：B1 ~15 行、B2 ~60 行、B3 ~40 行插件 + core enum、B4 ~30 行。

### Phase C — Footer 架构升级（pi-tui 层 + 插件层）

| # | 改动 | 对应差距 | 依赖 |
|---|---|---|---|
| C1 | Footer 左右分栏：左=操作区（hint/mode），右=通知区（tps/连接状态） | 缺失 #7 | pi-tui 层 `setStatus(key, text, { align: "left" \| "right" })` |
| C2 | Hint 状态机：loading→`esc to interrupt`、idle→`? for shortcuts`、tasks-running→`ctrl+t to show tasks` | 缺失 #4 | C1 |
| C3 | Mode 指示：`⚡ auto` / `📋 plan` / `normal` | 缺失 #6 | C1，需 core 暴露 permission mode |

预计改动：C1 是 pi-tui 架构改动 ~100 行，C2-C3 各 ~30-50 行插件。

### Phase D — Sub-agent 显示完整化 + 视觉精修（条件触发）

触发条件：sub-agent 实际用量上来（用户日常会同时跑 3+ sub-agent），或 Phase A-C 完成后用户体感仍不够。

| # | 改动 | 对应差距 | 依赖 |
|---|---|---|---|
| D1 | **Spinner teammate tree**：副行显示 `╒═ leader / ├─ @worker · Reading… · 3 uses · 1.2k tokens` 树状视图 | 缺失 sub-agent 显示主战场 | 需 core 扩 `getSubAgents()` 暴露完整 `SubagentProgress[]`（含 currentTool/tokens/duration） |
| D2 | ExpandedView 状态机：Ctrl+T 在 `tasks` / `teammates` / `hide` 间循环切换 | 缺失视图互斥模型 | D1 |
| D3 | Sub-agent footer pill `@worker @reviewer`（彩色，active 高亮） | 缺失 sub-agent footer 显示 | C1 + D1 |
| D4 | **Shimmer / GlimmerMessage 文字动画**：spinner 主行文字 shimmer 高光扫过，按 mode 切换方向（requesting 快、responding 慢、tool-use pulse） | Spinner 主行视觉对照表 | B3（mode 字段）；需评估 terminal ANSI 兼容性 |
| D5 | Spinner 字符风格切换：`· ✢ ✳ ✶ ✻ ✽` 来回（Claude 风），可选；当前 Braille 也可保留 | Spinner 动画风格 | 无 |
| D6 | Reduced-motion 兜底：检测到 `NO_COLOR` 或类似环境时切换到静态 `●` 慢闪 | 无障碍 | 无 |

预计改动：D1 需 core API 扩展（中等改动）+ 插件层 tree 渲染（~80 行）；D4 是 Phase D 最重的视觉工作（~100 行 + 兼容性测试）。

### 不做 / 已驳回

| 改动 | 理由 |
|---|---|
| Queued 改成 message bubble 风格 | 设计取向差异，Lumen "列表预览"风格合理 |
| 自定义 statusLine shell hook | Lumen 走 TS 扩展通道，功能等价（详见下节） |
| activeForm required 化（Q5） | 破坏现有 task 调用，收益不抵成本 |

## 九、自定义 statusLine shell hook 是什么

**一句话**：让用户用一行 shell 命令决定状态栏右侧显示什么。

**机制**：

1. 用户在 `settings.statusLine.command` 里配一条 shell 命令（如 `~/scripts/my-status.sh`）
2. Claude 每次刷新状态栏（300ms 防抖），就执行这条命令
3. 把当前会话状态以 JSON 输入给该命令的 stdin：model、cwd、token 用量、cost、rate limits、vim mode、worktree 等
4. 命令把要显示的内容输出到 stdout（**支持 ANSI 颜色码**）
5. Claude 直接把这个 ANSI 字符串渲染到状态栏

**举例**：

```bash
#!/bin/bash
input=$(cat)
model=$(echo "$input" | jq -r '.model.display_name')
cost=$(echo "$input" | jq -r '.cost.total_usd')
echo -e "\033[36m$model\033[0m | \$$cost"
```

效果：状态栏右侧显示 `Sonnet 4.6 | $0.32`（model 名青色）。

**为什么 Claude 有这个东西**：

- 状态栏需求每个用户都不一样（git 分支 / token 速率 / K8s context / …）
- UI 不可能"配置每一种可能"
- shell 是程序员的通用 DSL，给一个 stdin/stdout 通道，用户自己写脚本就能扩出任何东西

**Lumen 不需要这个的原因**：

- Lumen 走 TS extension（`pi.on(…) → ctx.ui.setStatus(…)`），扩展性已经够
- shell hook 是给"不会写 TS 的用户"的兜底通道
- Claude 用户群大，需要 shell hook 兜底；Lumen 用户群小且都是开发者，TS extension 就够
- 多一个 shell 通道意味着多一个安全面（命令注入、命令性能、跨平台 PowerShell vs bash）

如果将来 Lumen 用户群扩大且出现"非开发者用户也想自定义状态栏"的场景，再考虑加 shell hook。现阶段不做。
