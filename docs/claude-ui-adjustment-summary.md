# Claude UI Adjustment Summary

## 目的

本文档汇总当前围绕 Claude 风格 transcript / tool call / queued 区 / working 状态栏所做的调研结论、已确认参数、现状问题、拟改文件，以及在继续动代码前需要你确认的决策点。

它不是最终样式规范，也不是实现计划，而是一份**阶段性决策文档**。

相关文档：

- [claude-output-style.md](claude-output-style.md)
- [claude-tool-call-style.md](claude-tool-call-style.md)
- [archive/progress-surface/pluginized-task-ui-plan.md](archive/progress-surface/pluginized-task-ui-plan.md)
- [output-flow-rebuild.md](output-flow-rebuild.md)

---

## 一、已确认的事实

### 1. Claude 的工具调用不是“彩色标题卡片”

根据 `references/ClaudeCodeRev/src/` 的实际实现，Claude 工具调用更接近一种 transcript 语法：

- 主行：状态点 + bold 标题 + 同行摘要
- 次行：`⎿` 从属响应（Running / Waiting / Result summary）
- grouped / collapsed：优先句子化摘要，而不是工具名列表

关键实现：

- `references/ClaudeCodeRev/src/components/messages/AssistantToolUseMessage.tsx`
- `references/ClaudeCodeRev/src/components/ToolUseLoader.tsx`
- `references/ClaudeCodeRev/src/components/MessageResponse.tsx`
- `references/ClaudeCodeRev/src/components/messages/CollapsedReadSearchContent.tsx`

### 2. Claude 的精确参数已经确认

详见 [claude-tool-call-style.md](claude-tool-call-style.md)。当前已确认的核心参数：

- transcript 块前间距：**1 行**
- tool 主行左状态列宽：**2 列**
- 普通从属行前缀：**`"  ⎿ "`**
- collapsed hint 前缀：**`"  ⎿  "`**
- collapsed 默认态：**句子化 active/done 语态**
- 工具主行 loader：**状态点体系**，不是重型 spinner

### 3. Claude 的标题默认不发绿

普通 Read / Grep / Bash 等工具标题默认：

- bold
- 无背景色
- 非统一绿色

颜色主要属于：

- 左侧状态点（成功绿 / 错误红 / 进行中 dim）
- 少数特殊带背景工具（例如 AgentTool），不是普遍规则

这意味着：

- 把普通工具标题做成绿色 accent，不像 Claude

### 4. Claude 的 queued 区和 spinner / task / todo 使用同一类“从属结构”

#### spinner 主区
Claude 的 spinner 主区：

- 第一行：主状态行（verb + elapsed + tokens + thinking）
- 第二行：通过 `MessageResponse` 展示 Tip / Next / budget

对应：

- `references/ClaudeCodeRev/src/components/Spinner.tsx:414-431`

也就是第二行不是手写缩进字符串，而是直接复用 `MessageResponse` 语法。

#### spinner 不是独立的通用状态栏

Claude 源码里，spinner 主文案优先级是：

- `overrideMessage`
- `currentTodo.activeForm`
- `currentTodo.subject`
- `randomVerb`

对应：

- `references/ClaudeCodeRev/src/components/Spinner.tsx:206-217`

这意味着：

- Claude 的 spinner 直接附着在 todo/task 语义上
- 它不是一个可以被简化为固定 `Working…` 的通用 loading 行
- `activeForm / subject` 是状态栏正确性的核心输入

#### expanded tasks 是 spinner 区的展开态

Claude 在 `expandedView === 'tasks'` 时，spinner 区下方直接渲染：

- `<MessageResponse><TaskListV2 tasks={tasksV2} /></MessageResponse>`

对应：

- `references/ClaudeCodeRev/src/components/Spinner.tsx:408-412`

这意味着：

- expanded task/todo list 不是独立 widget 优先
- 它是 spinner / task / todo 一体视图的展开态
- working、expanded list、footer toggle 必须作为同一套东西设计

#### queued / pending 风格
Lumen 当前 queued 区自己拼：

- `Queued 1 · 1 steer`
- `↳ Steer: ...`
- `↳ Alt+Up to edit all queued messages`

而不是 Claude 的 `MessageResponse` 样式，所以看起来明显偏离。

---

## 二、当前 Lumen 已经做过但需要回看/收敛的改动

### 1. dynamic-status 插件已存在，但它不是最终形态

位置：

- `.lumen/extensions/dynamic-status.ts`

它已经具备：

- Claude verb 池
- elapsed
- token 计数
- thinking effort
- 中文 Tip
- 两行 working message

但当前仍有明显偏差：

- 它把 spinner 当成可以单独加工的 working 条
- 没有和 Claude 的 `activeForm / subject / randomVerb` 优先级对齐
- Tip 次行是手工拼的 `"  ⎿ Tip: ..."`
- 不是 Claude 那种 `MessageResponse` 结构
- token / tip 出现策略仍然比较简化
- working 主行与次行的层级还不够像 Claude

结论：

- 后续不应继续把 `.lumen/extensions/dynamic-status.ts` 作为目标插件
- 应把 spinner / task / todo / queued 统一收进 `.lumen/extensions/claude-task-ui.ts`

### 2. user message 做过一轮紧凑化尝试

涉及文件：

- `packages/coding-agent/src/modes/interactive/components/user-message.ts`

过程里尝试过：

- 添加 `❯` 前缀
- 收紧 bubble
- 调整上下留白

但结论已经明确：

- **`❯` 强加进去很怪，应撤回**

这意味着：

- 用户消息不应继续硬模仿某个字符前缀
- 应优先保持紧凑、稳定、整体块感

### 3. tool summary / batch / collapsed 做过一轮颜色和层级实验

涉及文件：

- `packages/coding-agent/src/modes/interactive/components/assistant-tool-summary.ts`
- `packages/coding-agent/src/modes/interactive/components/assistant-tool-batch-summary.ts`
- `packages/coding-agent/src/modes/interactive/components/collapsed-tool-group.ts`

当前明确的问题：

- 之前有一轮把标题调成了 accent，导致在你主题里偏绿
- 这不符合 Claude 的标题策略
- 之前有一轮把层级压得太小太灰，导致工具调用整体显得过小
- 目前主行已补左侧 `●` 状态点，标题也已收回 bold 非统一强调色
- 当前剩余偏差更多在 transcript 整体 tool_use / tool_result 语义，而不是单个主行组件的基础骨架

---

## 三、当前最不像 Claude 的地方

### 1. queued 区样式不对

当前实现位置：

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts:3873-3900`

问题：

- 使用 `Queued 1 · 1 steer`
- 次行用 `↳ ...`
- 提示也用 `↳ ...`
- 整体是“自定义队列块”，不是 Claude 的 transcript 语法

这和 Claude 的风格差异非常明显。

### 2. spinner / working 状态栏样式不对

当前实现位置：

- `.lumen/extensions/claude-task-ui.ts`

问题：

- 如果主文案被简化成固定 `Working`，就已经偏离 Claude 源码
- 如果主文案不来自 `activeForm / subject`，插件只能猜，无法严格对齐
- 当前主文案优先级和统一 task/todo 语义已经基本接上
- 当前 `elapsed / output tokens / thinking / thought for Ns` 已由 core 提供运行时语义，插件主要负责消费和渲染
- expanded task/todo list 现已收回 spinner 区展开态，不再和 queued 作为同级 prompt widget 混放
- 当前剩余最大偏差在：
  - `budgetText` 还不是 Claude 的显式 turn budget
  - `tip` 还不是完整 tip scheduler
  - expanded list 虽已 richer，但还不是 `TaskListV2` 级组件

### 3. tool 调用仍然不够像“主行 + `⎿` 次行”

虽然已经确认了 Claude 参数，但 Lumen 这三个组件还没有完全按这个模型重写：

- `assistant-tool-summary.ts`
- `assistant-tool-batch-summary.ts`
- `collapsed-tool-group.ts`

### 4. user message 不应继续用额外前缀字符硬模仿

当前结论是：

- `❯` 放弃
- 重点回到紧凑 spacing 和稳定 bubble

---

## 四、如果继续做，真正需要改哪些文件

这里分三层。

### A. 低风险样式层

主要改组件，不动主事件流：

- `packages/coding-agent/src/modes/interactive/components/user-message.ts`
- `packages/coding-agent/src/modes/interactive/components/footer.ts`
- `packages/coding-agent/src/modes/interactive/components/assistant-tool-summary.ts`
- `packages/coding-agent/src/modes/interactive/components/assistant-tool-batch-summary.ts`
- `packages/coding-agent/src/modes/interactive/components/collapsed-tool-group.ts`
- `.lumen/extensions/claude-task-ui.ts`

这一层可以做：

- 撤回 `❯`
- 收紧 spacing
- 去掉绿色标题
- 改成 `⎿` 结构
- working Tip 改成更接近 Claude

### B. 中风险结构层

开始动 queued 区与状态表现：

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts:3873-3900`

这一层需要重写 queued/pending 区的组织方式，使其更接近：

- 主摘要 + `⎿` 次行
- 而不是 `↳` 自定义队列框

### C. 高风险主消息流层

如果真要把 Claude 的 tool_use / tool_result 语义完整复刻，则最终必须回到：

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts:2699`
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts:2723`
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts:2824`
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts:3168`

原因：Claude 的工具视觉不是单组件完成，而是：

- assistant tool_use
- user tool_result
- 再靠 `MessageResponse` 结构拼成一个整体

如果不改主消息流，只能接近，不能完全等价。

---

## 五、状态栏插件需不需要再优化

### 结论

- **需要优化**
- 但它不是最该优先动的地方

### 当前插件已有能力

- verb 池
- elapsed
- token
- thinking effort
- 中文 Tip
- `overrideMessage`
- expanded tasks 作为 spinner 区展开态
- queued 保持在输入框上方但不进入 transcript
- expanded task/todo 已走独立 spinner details 承载
- queued 已走独立 prompt-side 组件承载
- expanded task/todo 已不再依赖字符串 fallback，开始由组件直接理解 task state 渲染
- queued 也已不再只是 latest 摘要块，而是开始具备 queued item 列表感

### 仍需优化的点

1. `budgetText` 进一步接近 Claude 的显式 turn budget 语义
2. `tip` 进一步接近 Claude 的完整调度策略
3. expanded task/todo list 进一步接近 `TaskListV2` 级 richer 组件，而不是当前的轻量 details 组件
4. queued 进一步接近 Claude queued command 模型，而不是当前的 prompt-side 列表组件
5. working 行颜色层级继续微调，避免扩展 HUD 感

补充：

- 当前 core 默认 `tip` 已不再拿 task toggle 或 queued 概况冒充 Claude tip
- 默认 tip 现在已接入更真实的触发：
  - 30s 长时运行提示
  - 30min `/clear` 提示
  - context-pressure 提示
- 并新增 `spinner.tipsEnabled` 设置开关
- 但它仍不是 Claude 源码里的完整 tip scheduler，这一点仍然是剩余差距
- queued 当前也已不是纯文本块，已开始携带 richer command 语义：
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
- 当前 queued 仍未对齐 Claude 完整 `QueuedCommand` 的主要缺口：
  - `pastedContents`
  - `bridgeOrigin`

### 但为什么不优先

因为当前偏差更大的其实是：

- queued 区
- tool call 主行 / 次行结构

状态栏插件现在已经“可用”，只是“不够像 Claude”；
queued 和 tool rows 则是“结构还没对齐”。

---

## 六、当前建议的后续顺序

如果继续推进，我建议顺序是：

### 第一优先级

1. 先把 spinner / task / todo 语义关系对齐 Claude 源码
2. queued 区改成 Claude 语法
3. tool summary / batch / collapsed 改成主行 + `⎿` 次行

### 第二优先级

4. 再回头精修 footer 与 prompt-side toggle

### 第三优先级

5. 最后才考虑是否进一步动主消息流

---

## 七、待你确认的问题

继续改之前，有几个点需要你确认。

### 1. queued 区是：

- **A. 继续保留独立 queued 区，只是把样式改成 Claude 语法**
- **B. 尽量后移/弱化 queued 区，不再让它像独立小面板**

### 2. tool call 这轮目标是：

- **A. 只改样式骨架，先做到“像 Claude”**
- **B. 连 tool_use / tool_result 的主消息流语义也一起动**

建议：先选 **A**。

### 3. spinner 插件路线：

- **A. 继续把它当 working 条单独微调**
- **B. 明确改成 Claude 的 spinner + task/todo 一体插件**

建议：选 **B**。

---

## 八、当前状态（供决策）

### 已完成

- Claude 工具调用精确参数文档：`docs/claude-tool-call-style.md`
- Claude 总体输出风格文档：`docs/claude-output-style.md`
- 当前阶段决策汇总：本文档
- `SpinnerUiState` 已补到可承载：
  - `overrideMessage`
  - `tip`
  - `budgetText`
  - `elapsedMs`
  - `outputTokens`
  - `isThinking`
  - `lastThinkingDurationMs`
- `SpinnerBudgetUsage` / `getSpinnerBudgetUsage()` 已接入 request payload 预算提取链
- core 已能为 spinner 提供真实系统态 producer：
  - `Running PreCompact hooks…`
  - `Running PostCompact hooks…`
  - `Compacting conversation`
  - `Auto-compacting conversation`
  - `Retrying request (n/m)`
- `assistant-tool-summary / assistant-tool-batch-summary / collapsed-tool-group` 已补 Claude 风格左侧 `●` 状态点和更接近 Claude 的次级亮度层级
- 自动化验证现状：
  - `interactive-mode-status.test.ts` 当前可运行且通过
  - `2026-spinner-budget-usage.test.ts` 当前可运行且通过
  - `2027-compaction-hooks-events.test.ts` 当前可运行且通过

### 已明确暂停

- 不继续尝试给 user message 强加 `❯`
- 暂不继续盲调颜色
- 暂不在未确认前直接改 queued / working 样式

### 下一步最合理的动作

不是继续写代码，而是：

1. 你看完这份文档
2. 选定 queued / tool / spinner-task-todo 插件的优先级和边界
3. 我再按你确认的边界动手
