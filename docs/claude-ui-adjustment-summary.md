# Claude UI Adjustment Summary

## 目的

本文档汇总当前围绕 Claude 风格 transcript / tool call / queued 区 / working 状态栏所做的调研结论、已确认参数、现状问题、拟改文件，以及在继续动代码前需要你确认的决策点。

它不是最终样式规范，也不是实现计划，而是一份**阶段性决策文档**。

相关文档：

- [claude-output-style.md](D:/UGit/LumenAgent/docs/claude-output-style.md)
- [claude-tool-call-style.md](D:/UGit/LumenAgent/docs/claude-tool-call-style.md)
- [pluginized-task-ui-plan.md](D:/UGit/LumenAgent/docs/pluginized-task-ui-plan.md)
- [output-flow-rebuild.md](D:/UGit/LumenAgent/docs/output-flow-rebuild.md)

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

详见 [claude-tool-call-style.md](D:/UGit/LumenAgent/docs/claude-tool-call-style.md)。当前已确认的核心参数：

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

### 4. Claude 的 queued 区和 working 状态栏都使用同一类“从属结构”

#### working 状态栏
Claude 的 spinner 主区：

- 第一行：主状态行（verb + elapsed + tokens + thinking）
- 第二行：通过 `MessageResponse` 展示 Tip / Next / budget

对应：

- `references/ClaudeCodeRev/src/components/Spinner.tsx:414-431`

也就是第二行不是手写缩进字符串，而是直接复用 `MessageResponse` 语法。

#### queued / pending 风格
Lumen 当前 queued 区自己拼：

- `Queued 1 · 1 steer`
- `↳ Steer: ...`
- `↳ Alt+Up to edit all queued messages`

而不是 Claude 的 `MessageResponse` 样式，所以看起来明显偏离。

---

## 二、当前 Lumen 已经做过但需要回看/收敛的改动

### 1. dynamic-status 插件已存在

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

- Tip 次行是手工拼的 `"  ⎿ Tip: ..."`
- 不是 Claude 那种 `MessageResponse` 结构
- token / tip 出现策略仍然比较简化
- working 主行与次行的层级还不够像 Claude

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

- 有一轮把标题调成了 accent，导致在你主题里偏绿
- 这不符合 Claude 的标题策略
- 有一轮把层级压得太小太灰，导致工具调用整体显得过小
- batch / collapsed 还没有完全转成 Claude 的“句子化 + `⎿` 次行”结构

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

### 2. working 状态栏样式不对

当前实现位置：

- `.lumen/extensions/dynamic-status.ts`

问题：

- Tip 次行不是 `MessageResponse` 结构
- 主行与次行仍是字符串拼接，不是 Claude 的层级语法
- 现在更像“扩展做的状态提示”，而不是 Claude 自带 spinner 区

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
- `.lumen/extensions/dynamic-status.ts`

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

### 仍需优化的点

1. Tip 次行改成 Claude 风格从属行结构，而不是手拼字符串
2. token / elapsed / tip 的出现策略更接近 Claude
3. working 行是否保持稳定高度，要单独决定
4. 颜色层级再克制一点，不要像扩展 HUD

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

1. queued 区改成 Claude 语法
2. tool summary / batch / collapsed 改成主行 + `⎿` 次行

### 第二优先级

3. 再回头精修 dynamic-status 插件

### 第三优先级

4. 最后才考虑是否进一步动主消息流

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

### 3. dynamic-status 插件：

- **A. 先只修 Tip 次行结构**
- **B. 连 token / elapsed / tip 出现策略一起重做**

建议：先选 **A**。

---

## 八、当前状态（供决策）

### 已完成

- Claude 工具调用精确参数文档：`docs/claude-tool-call-style.md`
- Claude 总体输出风格文档：`docs/claude-output-style.md`
- 当前阶段决策汇总：本文档

### 已明确暂停

- 不继续尝试给 user message 强加 `❯`
- 暂不继续盲调颜色
- 暂不在未确认前直接改 queued / working 样式

### 下一步最合理的动作

不是继续写代码，而是：

1. 你看完这份文档
2. 选定 queued / tool / dynamic-status 的优先级和边界
3. 我再按你确认的边界动手
