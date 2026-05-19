# Pluginized Task UI Plan

## 目的

把 Lumen 的 Claude 风格 `spinner / task / todo / queued` 路线重新定清楚，并明确采用：

- **单个插件统一表现层**
- **core 提供完整所需语义 API**
- **不做“只实现一个最小 task 状态栏”的简化版本**

这里的目标不是做一个泛化 `working` HUD，也不是只做 `task` 而忽略 `todo`。

目标是：

> **把 Claude 源码里的 spinner + todo/task + expanded tasks + queued 关系，按 `API + 插件` 方式完整搬到 Lumen。**

相关文档：

- [claude-output-style.md](D:/UGit/LumenAgent/docs/claude-output-style.md)
- [claude-tool-call-style.md](D:/UGit/LumenAgent/docs/claude-tool-call-style.md)
- [claude-ui-adjustment-summary.md](D:/UGit/LumenAgent/docs/claude-ui-adjustment-summary.md)
- [output-flow-rebuild.md](D:/UGit/LumenAgent/docs/output-flow-rebuild.md)

---

## 一、Claude 源码里的真实结构

这部分只记录参考实现里已经确认的事实，不做推测。

### 1. spinner 不是独立的通用状态栏

Claude 的 spinner 主文案不是固定 `Working…`。

`references/ClaudeCodeRev/src/components/Spinner.tsx` 中：

```ts
const leaderVerb =
  overrideMessage ??
  currentTodo?.activeForm ??
  currentTodo?.subject ??
  randomVerb
```

也就是说主文案优先级是：

1. `overrideMessage`
2. 当前 todo/task 的 `activeForm`
3. 当前 todo/task 的 `subject`
4. 随机 verb

结论：

- spinner **挂在 todo/task 语义之上**
- 没有 task/todo 语义，就没有 Claude 那种主文案
- 把它简化成固定 `Working…` 会直接偏离源码

### 2. 第二行不是自由发挥，而是固定 `MessageResponse`

Claude 的 spinner 第二行通过 `MessageResponse` 承载：

- `Next: ${nextTask.subject}`
- `Tip: ${effectiveTip}`
- `budgetText`

对应：

- `references/ClaudeCodeRev/src/components/Spinner.tsx:414-431`
- `references/ClaudeCodeRev/src/components/MessageResponse.tsx:11-31`

也就是：

- 第二行必须服从统一的 `  ⎿ ` gutter
- `Next / Tip / budget` 不是单独的小面板
- 它们是 spinner 主行的从属响应

### 3. expanded task list 是 spinner 区的一种展开态

Claude 在 `expandedView === 'tasks'` 时，spinner 区下方直接渲染：

```tsx
<MessageResponse>
  <TaskListV2 tasks={tasksV2} />
</MessageResponse>
```

对应：

- `references/ClaudeCodeRev/src/components/Spinner.tsx:408-412`

结论：

- expanded task/todo list 不是独立 widget 概念优先
- 它首先是 spinner 区的一种展开形态
- 这意味着 working / task list / footer toggle 需要看成一套东西

### 4. task 与 todo 在 Claude 里都为 spinner 提供语义

Claude 参考里至少有两条相关链路：

1. `Task` 体系
   - `references/ClaudeCodeRev/src/utils/tasks.ts`
   - 字段含 `subject`、可选 `activeForm`

2. `TodoWriteTool` 约束
   - `references/ClaudeCodeRev/src/tools/TodoWriteTool/prompt.ts`
   - 明确要求每个 todo 同时提供：
     - `content`：祈使句
     - `activeForm`：现在进行式

结论：

- Claude 的 spinner 不是“只附着 task”
- 也不是“todo 只影响展开列表”
- `todo/task` 共同决定 spinner 的主文案、next 提示、展开列表

### 5. queued 虽然独立于消息流，但语法要贴近 spinner / tool response

从现有文档与 reference 行为可确认：

- queued 不应被重新塞进 transcript 主消息流
- queued 的表现要使用和 `MessageResponse` 接近的从属语法，而不是另起一个自定义面板体系

所以：

- queued 可以保持在输入框上方
- 但它的文案层级和 gutter 不能脱离 Claude 整体语法

---

## 二、对 Lumen 的直接设计结论

### 1. 这个插件不是“task 状态栏插件”

`.lumen/extensions/claude-task-ui.ts` 的目标必须是：

> **Claude 风格的 spinner / task / todo / queued 统一插件**

它至少要统一：

1. working / spinner 主区
2. spinner 从属行（Next / Tip / budget）
3. expanded task/todo list
4. prompt-side queued 区
5. footer / prompt 附近的 task/todo toggle 与概况

### 2. 不能把 spinner 语义留给插件猜

如果插件只能拿到：

- `content`
- `status`

那它只能做近似，不可能严格按 Claude 源码渲染。

Claude spinner 需要的不是单纯“当前任务文本”，而是至少：

- `subject`
- `activeForm`

并且 `current` / `next` 都要有这些字段。

所以：

- 这条路线必须是 **core 暴露完整语义 API**
- 不是插件自己从 `content` 猜 verb

### 3. todo 必须作为一等输入，而不是附带兼容

既然 Claude 的 spinner 本来就和 todo 系统耦合，Lumen 里也不能再写成：

- task 是主体系
- todo 只是补充

正确目标应是：

- `getTasks()` 返回给插件的是 **统一后的 spinner 任务视图**
- 来源可以同时包含：
  - session task
  - session todo

插件不该再区分“这是 task 还是 todo 的 UI”。

它只关心：

- 当前项是谁
- 下一项是谁
- 展开态列表顺序是什么
- 每项的 `subject` / `activeForm` / `status` 是什么

---

## 三、Required API（不是“最小 API”）

这部分不是为了省事，而是为了把 Claude 这套关系表达完整。

### A. 统一任务语义读取 API

插件必须能稳定读取完整 spinner 语义：

```ts
type TaskUiItem = {
  id: string
  content: string
  subject?: string
  activeForm?: string
  status: "pending" | "in_progress" | "completed" | "abandoned" | "running" | "failed" | "aborted"
  group?: string
  meta?: string
}

type TaskUiSummary = {
  total: number
  completed: number
  inProgress: number
  pending: number
  failed: number
  abandoned: number
  current?: TaskUiItem
  next?: TaskUiItem
}
```

对应扩展上下文：

```ts
ctx.getTasks(): TaskUiItem[] | undefined
ctx.getTaskSummary(): TaskUiSummary | undefined
```

要求：

- `current` / `next` 必须来自统一后的 task+todo 视图
- `current.activeForm` 可为空，但如果存在，插件必须优先使用
- `next.subject` 必须可用于 `Next:` 行

### B. queued 接管 API

插件必须能接管 queued 区：

```ts
ctx.ui.setQueuedVisible(visible: boolean): void
ctx.getQueuedMessages(): {
  steering: QueuedMessage[]
  followUp: QueuedMessage[]
} | undefined
```

要求：

- queued 保留在输入框上方
- 不重新融入 transcript
- 但由插件统一它的层级、gutter、文案节奏
- 当前已补到 richer queued command 语义：
  - `delivery`
  - `mode`
  - `priority`
  - `preExpansionText`
  - `customType`
  - `hasImages`
  - `display`
  - `isMeta`
  - `origin`
  - `source`
  - `skipSlashCommands`
- 当前这些字段里，已有真实 producer 的包括：
  - `delivery`
  - `priority`
  - `preExpansionText`
  - `customType`
  - `hasImages`
  - `display`
  - `isMeta`
  - `origin`
  - `source`
  - `skipSlashCommands`
- 当前仍未补到完整 Claude queued command 的主要缺口：
  - `pastedContents`
  - `bridgeOrigin`

### C. expanded task/todo 视图状态 API

插件必须拿到 Claude 那种展开态切换能力：

```ts
ctx.ui.getTasksExpanded(): boolean
ctx.ui.setTasksExpanded(expanded: boolean): void
ctx.ui.toggleTasksExpanded(): void
```

注意：

- 这不是工具输出展开
- 是 spinner / task / todo 一体视图的展开态

### D. spinner 表现 API

插件现有可用：

- `setWorkingMessage()`
- `setWorkingDetails()`
- `setWorkingIndicator()`
- `setStatus()`
- `setWidget()`
- `setSpinnerState()`
- `getSpinnerState()`

这部分可以继续作为 Claude spinner 的表现承载层。

但前提是：

- 主文案来源于 `subject/activeForm`
- 不是插件自己退化成通用 loading 文案

另外，若要避免插件自己维护运行时推导，core 还需要直接提供 spinner 运行语义：

```ts
type SpinnerUiState = {
  overrideMessage?: string
  tip?: string
  budgetText?: string
  elapsedMs?: number
  outputTokens?: number
  isThinking?: boolean
  lastThinkingDurationMs?: number
}
```

要求：

- `elapsedMs / outputTokens / isThinking / lastThinkingDurationMs` 尽量由 core 统一生产
- `overrideMessage` 不应只停留在 API 定义，需要至少覆盖系统态 producer
- `budgetText` 若无法达到 Claude 的显式 turn budget，也应来自真实运行配置，而不是伪装成别的百分比指标
- `budgetText` 最好优先来自真实 request payload 中的输出上限，而不是仅使用模型静态上限近似值

---

## 四、插件职责

`.lumen/extensions/claude-task-ui.ts` 最终应负责以下完整行为。

### 1. Working / spinner 主区

插件负责：

- 读取 `current.activeForm ?? current.subject ?? fallbackVerb`
- 输出主行
- 在主行里组织：
  - elapsed
  - output tokens
  - `thinking`
  - `thought for Ns`

但插件**不再负责猜测当前任务语义本身**。

### 2. Spinner 从属行

插件负责：

- `Next: ${next.subject}`
- `Tip: ...`
- 未来如需要可接 `budget`

并且必须统一为 Claude 的 `MessageResponse` 语法，而不是随意手拼别的层级。

### 3. Expanded task/todo list

插件负责：

- 展开态时展示统一后的 task/todo 列表
- 该列表是 spinner 区的展开形态
- 不是独立“功能 widget 优先”的 HUD
- 优先通过 spinner details 的独立承载层渲染，而不是退化成主行多行字符串
- 当前实现应继续朝“独立 details 组件理解 task state 并渲染”收敛，而不是长期保留字符串 fallback

### 4. Footer / prompt toggle

插件负责：

- task/todo 概况
- `show tasks / hide tasks` 一类入口
- 低存在感承载，不做 HUD 化

### 5. Queued prompt-side 区

插件负责：

- queued 主摘要
- queued item 列表的低存在感表达
- steer / follow-up 区分
- 多条 queued 的折叠表达
- 优先通过 prompt-side 独立组件承载，而不是长期保留简单字符串摘要
- 当前实现已进一步开始区分：
  - `nextTurn` vs `followUp`
  - `prompt` vs `custom`
  - `interactive` vs `extension` vs `rpc`
  - raw slash queued prompt
  - pre-expansion text vs final text

但必须保持：

- 在输入框上方
- 不进入 transcript
- 语法与 spinner / `MessageResponse` 体系同源

---

## 五、core 与插件的边界

### core 负责

1. task/todo 数据源
2. task/todo 语义字段维护
   - `subject`
   - `activeForm`
3. queued 数据源与生命周期
4. expanded state
5. working / footer / widget 的基础承载能力
6. spinner 运行时语义生产
   - `elapsedMs`
   - `outputTokens`
   - `isThinking`
   - `lastThinkingDurationMs`
7. 系统态 spinner override producer
   - compaction hooks
   - compacting
   - retrying
8. 默认 `budgetText` / `tip` producer
9. request payload budget 捕获与对外暴露
   - `SpinnerBudgetUsage`
   - `getSpinnerBudgetUsage()`

当前默认 `tip` producer 已收紧为“真实触发优先”：

- 不再把 `show tasks / hide tasks` 或 queued 提示伪装成 Claude 的 `Tip:`
- 当前已补到带真实时间阈值的默认 producer：
  - 30s 长时运行提示
  - 30min `/clear` 提示
  - 高上下文占用提示
- 并补了 `spinner.tipsEnabled` 设置开关
- 更完整的 Claude tip scheduler 仍然是后续差距，不应冒充已经等价

### 插件负责

1. Claude 风格 spinner 文案与结构
2. Claude 风格 task/todo 展开态视图
3. Claude 风格 queued prompt-side 呈现
4. footer / prompt-side 的低存在感组织

### 明确不允许的简化

后续实现中，不应再接受以下“简化版”方向：

1. 把 spinner 主文案简化成固定 `Working…`
2. 只做 task，不把 todo 接到同一插件语义里
3. 把 expanded task list 当成独立 widget，而不是 spinner 展开态
4. 让插件只拿 `content` 再自行猜 Claude 文案
5. 把 queued 再做成另一套自定义小面板语言

---

## 六、推荐落地顺序

### Phase 1：先把 API 语义补完整

顺序：

1. `TaskUiItem.subject`
2. `TaskUiItem.activeForm`
3. `getTaskSummary().current / next` 对齐完整语义
4. `todo` 路径能真正产出 `activeForm`
5. queued / expanded state API 保持可用

### Phase 2：按 Claude 源码重做插件 working 主区

要求：

- 不再写死 `Working`
- 严格按 `activeForm > subject > fallbackVerb`
- 第二行严格按 `Next / Tip / budget`
- expanded tasks 时，spinner 区下方优先承载 task list，而不是继续混入 `budget / Next / Tip`
- 当缺少真实 request budget 时，`budgetText` 可以缺席，不应伪装为静态近似值

### Phase 3：把 expanded task/todo list 完整挂到同一插件

要求：

- spinner 区展开态
- 低存在感
- 作为 spinner 区展开态，而不是另一个体系

### Phase 4：queued 与 footer 一起收口

要求：

- queued 保持独立位置
- 语法并入 Claude spinner 体系
- footer 不 HUD 化

---

## 七、最终策略

正式结论不是：

> “做一个最小 task 插件，剩下以后再说”

而是：

> **用单个插件统一 Claude 风格 spinner / task / todo / queued UI；core 为这套完整关系提供所需 API 与语义字段。**

这条路线仍然是 `API + 插件`，但它不是“最小化版本”，而是对 Claude 源码结构的完整对齐。
