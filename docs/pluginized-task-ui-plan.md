# Pluginized Task UI Plan

## 目的

定义一条可持续推进的路线：

- 用**单个插件**统一承载 Claude 风格的 task / todo UI
- 只在 core 补最小 API，让插件接管表现层
- 尽量减少后续与 upstream 的冲突面

这里的 task / todo UI 指：

- working / dynamic-status 下的当前任务、下一步、Tip
- footer 或 prompt 周边的 task 入口 / task 概况
- 展开态的完整任务列表
- queued 区的 Claude 风格化呈现

它不试图一次性重写整个 transcript 主消息流。

相关文档：

- [claude-output-style.md](D:/UGit/LumenAgent/docs/claude-output-style.md)
- [claude-tool-call-style.md](D:/UGit/LumenAgent/docs/claude-tool-call-style.md)
- [claude-ui-adjustment-summary.md](D:/UGit/LumenAgent/docs/claude-ui-adjustment-summary.md)
- [output-flow-rebuild.md](D:/UGit/LumenAgent/docs/output-flow-rebuild.md)

---

## 一、问题定义

当前 Lumen 想靠插件统一 Claude 风格 task/todo UI，遇到的核心矛盾是：

### 1. 插件已经能控制“外围 UI”

当前 extension API 已有：

- `setWorkingMessage()`
- `setWorkingIndicator()`
- `setStatus()`
- `setFooter()`
- `setWidget()`
- `custom()`
- `hasPendingMessages()`
- `getContextUsage()`
- `setToolsExpanded()`

可见：

- `packages/coding-agent/src/core/extensions/types.ts:141-176`
- `packages/coding-agent/src/core/extensions/types.ts:274`
- `packages/coding-agent/src/core/extensions/types.ts:318-322`

所以：

- working / footer / widget / overlay 这些外围层，插件已经能接住

### 2. 但插件还拿不到完整 task/todo/queued 控制权

当前最关键的缺口：

#### queued 区仍然是 core 私有实现

当前 queued UI 直接写在：

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts:3873-3900`

它内部直接操作：

- `pendingMessagesContainer`
- `updatePendingMessagesDisplay()`

这些都没暴露给插件。

#### task/todo 没有稳定只读 API 给插件

当前 extension API 没有：

- `ctx.getTasks()`
- `ctx.getTodos()`
- `ctx.getTaskSummary()`

所以插件如果要统一任务 UI，目前只能：

- 从 tool result 里自己拼
- 读内部状态/文件
- 或依赖不稳定实现细节

这些都不适合作为长期方案。

#### 没有任务视图切换 API

插件当前没有像这样的稳定接口：

- `ctx.ui.toggleTasksView()`
- `ctx.ui.setTasksExpanded(true|false)`
- `ctx.ui.getTasksExpanded()`

所以即便插件能画任务列表，也很难像 Claude 那样把“默认态 / 展开态”统一成一个自然的交互模型。

---

## 二、目标边界

本方案的目标不是“所有 UI 都插件化”，而是：

> **Task / todo 的表现层插件化，core 只保留数据与最小控制接口。**

也就是：

### 由插件负责

1. working 主状态
   - 当前任务
   - next task
   - tip
   - elapsed / tokens / thinking

2. task 入口 / 概况
   - footer / prompt 周边的简要 task summary

3. 展开态任务列表
   - widget / overlay / custom view

4. queued 区的 Claude 风格 UI
   - 前提是 core 提供可接管能力

### 由 core 负责

1. task/todo 数据源
2. queued 消息数据源
3. task view 的最小切换能力
4. 内置实现的隐藏 / 接管口子

这样可以做到：

- Claude 风格 task UI 的视觉和逻辑，主要集中在一个插件里
- core 不承担太多样式分叉
- upstream merge 时，冲突面主要集中在少量 API 补口而不是整块 UI 逻辑

---

## 三、最小 core API 清单

这是我建议补到 core 的最小接口集合。

### A. 只读 task/todo API

#### 目标

让插件稳定读取：

- 当前 task 列表
- 当前 in-progress task
- 当前 next task
- task completion 概况

#### 建议接口

在 `ExtensionContext` 上补：

```ts
getTasks(): TaskItem[] | undefined
getTaskSummary(): {
  total: number
  completed: number
  inProgress: number
  pending: number
  current?: TaskItem
  next?: TaskItem
} | undefined
```

#### 为什么是最小补口

插件真正需要的不是完整内部 store，而是：

- 当前任务是谁
- 下一步任务是谁
- 展开态列表长什么样

如果只给这层只读摘要，就足够驱动：

- dynamic-status
- footer task 概况
- expanded task widget

而不必把整个任务状态系统暴露给插件。

---

### B. queued 区可隐藏 / 可接管 API

#### 当前问题

queued 区现在是 core 私有绘制：

- `interactive-mode.ts:3873-3900`

插件无法：

- 隐藏它
- 接管它
- 替换成 Claude 风格结构

#### 建议接口

最小方案：

```ts
ctx.ui.setQueuedVisible(visible: boolean): void
ctx.getQueuedMessages(): {
  steering: QueuedMessage[]
  followUp: QueuedMessage[]
}
```

更进一步的方案：

```ts
ctx.ui.setQueuedRenderer(
  renderer: ((data: QueuedState, ui: ExtensionUIContext) => string[] | undefined) | undefined
): void
```

#### 建议优先级

优先先做：

- `setQueuedVisible(false)`
- `getQueuedMessages()`

这样插件就能：

- 关掉内置 queued 区
- 用 widget / status / custom view 自己画

这已经足够统一大部分 Claude 风格 queued 呈现。

---

### C. task view toggle API

#### 当前问题

Claude 的 todo 不只是数据，还和“默认态 / 展开态”切换绑定。

Lumen 如果要用插件统一这部分，插件需要一个稳定的任务展开开关，而不是自己猜 UI 状态。

#### 建议接口

```ts
ctx.ui.getTasksExpanded(): boolean
ctx.ui.setTasksExpanded(expanded: boolean): void
ctx.ui.toggleTasksExpanded(): void
```

注意：

- 这不是 transcript 工具展开（`setToolsExpanded`）
- 是专门针对 task/todo 视图的开关

#### 为什么重要

没有这层，插件就只能：

- 一直把任务列表挂出来
- 或自己维护一套平行状态

这两种都不自然。

---

## 四、插件内应该统一哪些内容

当上述最小 API 到位后，一个插件（比如 `.lumen/extensions/claude-task-ui.ts`）可以统一管理这些内容。

### 1. Working / dynamic-status

基于：

- `setWorkingMessage()`
- `setWorkingIndicator()`
- `getTaskSummary()`

统一实现：

- 当前 in-progress task 驱动主行 verb
- next task / tip 作为次行
- elapsed / tokens / thinking / effort
- 中文 Tip 文案

### 2. Footer / prompt 周边 task 入口

基于：

- `setStatus()`
- `setFooter()`
- `getTaskSummary()`

统一实现：

- `tasks 2/5`
- `show tasks / hide tasks`
- task completion 概况

### 3. 展开态任务列表

基于：

- `setWidget()` / `custom()`
- `getTasks()`
- `getTasksExpanded()` / `setTasksExpanded()`

统一实现：

- 完整任务列表
- 与默认态 working / footer 的联动

### 4. queued 区

基于：

- `setQueuedVisible(false)`
- `getQueuedMessages()`

统一实现：

- Claude 风格 queued 主摘要
- `⎿` latest queued item
- `⎿` edit hint

这样 queued 也能纳入同一个插件控制。

---

## 五、为什么这条路更适合合并 upstream

### 1. core 只补最薄的一层能力

不是把 Claude 样式写死进 core，而是只加：

- 数据读取
- 视图开关
- 内置 UI 的可隐藏/可接管口

### 2. 视觉与交互策略都集中在插件

这样：

- Claude 风格 task/todo UI 改动集中
- upstream 改 interactive-mode 内部实现时，只要 API 不变，插件层还能继续工作

### 3. 冲突面比“直接改 core UI”小很多

直接把 Claude 风格 task UI 写在 core：

- 每次 upstream 改 queued / footer / working / transcript，都会冲突

改成插件 + 薄 API：

- 冲突主要集中在 API 设计点
- 大部分样式差异留在插件中

---

## 六、推荐落地顺序

### Phase 1：先补最小 API

建议顺序：

1. `getTaskSummary()` / `getTasks()`
2. `setQueuedVisible(false)` + `getQueuedMessages()`
3. `getTasksExpanded()` / `setTasksExpanded()` / `toggleTasksExpanded()`

### Phase 2：单插件统一默认态

插件先统一：

- dynamic-status
- footer task 概况
- next task / current task

### Phase 3：插件接管 queued 区

在 core 支持隐藏内置 queued 区后：

- 用插件输出 Claude 风格 queued 摘要

### Phase 4：插件提供展开态 task 视图

- widget / overlay / custom view
- 与 footer / working 状态联动

---

## 七、暂时不要做的事

为了保持风险可控，当前不建议：

1. 一开始就改主 transcript 流去硬塞 todo
2. 让插件直接碰 `pendingMessagesContainer` 这种内部对象
3. 为了省 API 设计而让插件去读不稳定内部状态
4. 把 task/todo 全部做成 footer 常驻大块 HUD

---

## 八、最终建议

如果目标是：

> “Claude 风格的 task/todo UI 尽量统一在插件里，同时最大化 upstream merge 友好性”

那推荐的正式策略就是：

> **插件统一表现层，core 只补最小只读与接管 API。**

这不是“纯插件零 core 改动”，但它是最现实、最稳、最适合长期维护的路线。

---

## 九、可以直接转成持续性 goal 的核心句子

后续持续任务的核心目标可以写成：

- 为 Lumen 补最小 task/todo/queued 只读与接管 API
- 用单个插件统一 Claude 风格的 task / todo / queued / working UI
- 除非 API 表达力不够，否则不把 Claude 风格样式继续写死在 core

这三句就是后续所有实现决策的边界。