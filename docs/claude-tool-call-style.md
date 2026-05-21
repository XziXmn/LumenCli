# Claude Tool Call Style Parameters

## 目的

本文档专门记录 Claude Code 工具调用在 transcript 中的**精确样式参数**：

- 缩进
- 折叠态
- 主行 / 次行结构
- `⎿` 的使用位置
- grouped / collapsed 的句式规则

它是 [claude-output-style.md](claude-output-style.md) 的补充文档。前者定义目标风格，本文档记录可以直接落地到实现里的参数与规则。

## 参考来源

本参数文档基于 `references/ClaudeCodeRev/src/` 中以下文件确认：

### 主渲染链
- `references/ClaudeCodeRev/src/components/Message.tsx`
- `references/ClaudeCodeRev/src/components/MessageRow.tsx`
- `references/ClaudeCodeRev/src/components/MessageResponse.tsx`
- `references/ClaudeCodeRev/src/components/messages/AssistantToolUseMessage.tsx`
- `references/ClaudeCodeRev/src/components/messages/GroupedToolUseContent.tsx`
- `references/ClaudeCodeRev/src/components/messages/CollapsedReadSearchContent.tsx`

### 状态点 / 折叠 / 工具 UI
- `references/ClaudeCodeRev/src/components/ToolUseLoader.tsx`
- `references/ClaudeCodeRev/src/utils/groupToolUses.ts`
- `references/ClaudeCodeRev/src/utils/collapseReadSearch.ts`
- `references/ClaudeCodeRev/src/tools/FileReadTool/UI.tsx`
- `references/ClaudeCodeRev/src/tools/GrepTool/UI.tsx`
- `references/ClaudeCodeRev/src/tools/BashTool/UI.tsx`
- `references/ClaudeCodeRev/src/tools/AgentTool/UI.tsx`

---

## 一、块间距参数

### 1. transcript 主块前间距

Claude 的 assistant / user / tool 相关消息块，默认采用：

- `marginTop={addMargin ? 1 : 0}`

也就是：

- **块前固定 1 行空白**

这是 Claude transcript 的基础垂直节奏，不是 0，也不是 2。

### 适用位置

典型位置：

- `AssistantToolUseMessage.tsx:156`
- `AssistantThinkingMessage.tsx:43,55`
- `AssistantTextMessage.tsx:203`
- `UserPromptMessage.tsx:102`
- `MessageRow.tsx:199`

### 可迁移结论

Lumen 如果要贴近 Claude：

- transcript 块之间统一按 **1 行 top margin** 处理
- 不要在 tool 主行和其结果 summary 之间再额外插大片空白

---

## 二、tool 主行参数

Claude 的单工具调用主行结构只有四个元素：

1. 左侧状态列
2. bold 工具标题
3. 同一行括号摘要
4. 可选 tag

对应：

- `AssistantToolUseMessage.tsx:161-201`

### 1. 左侧状态列宽度

Claude 为左侧 dot / loader 保留固定列宽：

- `minWidth={2}`

典型位置：

- `AssistantToolUseMessage.tsx:164-180`
- `CompactSummary.tsx:25`
- `Messages.tsx:987`

### 可迁移参数

- **状态列宽 = 2 列**

这样可以保证 tool rows 左侧垂直对齐。

### 2. 标题样式

工具标题默认：

- **bold**
- 默认无背景色
- 不是统一绿色

位置：

- `AssistantToolUseMessage.tsx:181-191`

### 3. 摘要样式

摘要不是次行 subtitle，而是直接跟在标题后：

- 与标题同行
- 普通字重
- 放在括号内

位置：

- `AssistantToolUseMessage.tsx:193-197`

### 可迁移结论

更像 Claude 的结构应该是：

- `● Read(file.ts)`
- `● Bash(npm test)`
- `● Search(pattern: "todo", path: "src")`

而不是：

- 第一行标题
- 第二行摘要
- 第三行结果

---

## 三、状态点参数

Claude 的状态点在 `ToolUseLoader.tsx:12-37`。

### 1. 图形

- 核心图形是 `BLACK_CIRCLE`
- macOS: `⏺`
- 非 macOS: `●`

来源：

- `references/ClaudeCodeRev/src/constants/figures.ts:4`

### 2. 状态语义

- unresolved / in-progress: 闪烁 dim dot
- queued: dim dot（通常由上层直接画）
- success: 绿色 dot
- error: 红色 dot

位置：

- `ToolUseLoader.tsx:19-35`
- `AssistantToolUseMessage.tsx:166-180`

### 3. 动画方式

Claude 的工具 loader 不是大 spinner，而是：

- **一个圆点闪烁 / 隐藏**

也就是很轻的活动信号，而不是重型 loading 图标。

### 可迁移结论

如果 Lumen 要贴近 Claude：

- 工具主行左侧应优先是 **状态点体系**
- 绿色主要属于“成功状态点”，不是标题本身

---

## 四、`⎿` 从属行参数

`MessageResponse` 是 Claude 工具调用视觉层级里最重要的组件之一。

位置：

- `references/ClaudeCodeRev/src/components/MessageResponse.tsx:18-25`

### 1. 标准从属行前缀

标准 `MessageResponse` 的前缀是：

- `'  ' + '⎿ '`

也就是视觉上等于：

- **`"  ⎿ "`**

### 2. 可迁移参数

- 左缩进：**2 空格**
- 符号：`⎿`
- 符号后：**1 空格**
- 总前缀宽度约：**4 列**

### 3. 使用场景

Claude 把这些都画成从属行：

- `⎿ Running…`
- `⎿ Waiting for permission…`
- `⎿ Auto classifier checking…`
- `⎿ Read 42 lines`
- `⎿ Found 8 files`

典型位置：

- `AssistantToolUseMessage.tsx:205-231`
- `FileReadTool/UI.tsx:121-149`
- `GrepTool/UI.tsx:65-72`
- `BashTool/UI.tsx:144-170`

### 4. 高度

大量从属行都使用：

- `MessageResponse height={1}`

也就是默认目标是：

- **单行高度**

不轻易扩成大块正文。

---

## 五、collapsed hint / hook 参数

Claude 的 collapsed read/search 组默认态有第二行 hint，但它**不是普通 MessageResponse**，而是手工 gutter。

位置：

- `CollapsedReadSearchContent.tsx:596-608`
- `CollapsedReadSearchContent.tsx:610-615`

### 1. hint 前缀

collapsed hint / hook 行前缀是：

- **`"  ⎿  "`**

也就是：

- 2 空格
- `⎿`
- 2 空格

### 2. 与标准 MessageResponse 的差异

- 标准从属行：`"  ⎿ "`
- collapsed hint：`"  ⎿  "`

collapsed hint 比普通从属响应多 1 个空格，视觉上更像“提示行 / 最近目标”，而不是“结果行”。

### 可迁移结论

Lumen 里如果区分：

- 工具结果 summary
- collapsed group 的 latest hint

那两者的 gutter 不应该完全一样。

---

## 六、collapsed / grouped 的默认结构

### 1. grouped tool use

grouped tool use 的来源：

- `references/ClaudeCodeRev/src/utils/groupToolUses.ts:54-99`
- `GroupedToolUseContent.tsx:34-70`

grouped 主要用于支持 grouped renderer 的工具，当前典型是 AgentTool，不是所有工具都 grouped。

### grouped 的视觉原则

- 第一行：聚合标题（例如 `Running 3 agents…`）
- 下方：每个子项的简短进度
- 不等于“把多个 tool row 原样堆叠”

### 2. collapsed read/search

来源：

- `references/ClaudeCodeRev/src/utils/collapseReadSearch.ts:754-868`
- `references/ClaudeCodeRev/src/components/messages/CollapsedReadSearchContent.tsx:573-608`

### 第一行参数

collapsed 第一行包含：

1. 左侧状态位（活动时 loader，非活动时占位）
2. 句子化聚合摘要
3. expand hint（尾部）

左侧仍然保持：

- **2 列状态宽度**

### 第二行参数

如果 active 且有 hint：

- 使用 `"  ⎿  "`
- 右边显示最近路径 / pattern / command

### 可迁移结论

collapsed 组不应该默认输出：

- `Read ×3, Grep ×2, List ×1`

更像 Claude 的写法是：

- `Searching for 2 patterns, reading 3 files…`
- `Searched for 2 patterns, read 3 files`
- `⎿ src/core/tool.ts`

---

## 七、折叠态句式规则

Claude 的折叠态不是工具名列表，而是自然语言句式。

来源：

- `references/ClaudeCodeRev/src/utils/collapseReadSearch.ts:959`
- `references/ClaudeCodeRev/src/utils/collapseReadSearch.ts:1025-1028`

### 句式参数

- active：`Searching for`, `Reading`, `Listing`, `Running`
- done：`Searched for`, `Read`, `Listed`, `Ran`

### 规则

1. active / done 使用不同语态
2. 默认一句话聚合
3. 最新 hint 单独一行
4. 只有展开态才回放组内每条 item

---

## 八、expand hint 参数

Claude 的 `CtrlOToExpand` 默认贴在摘要主行尾部，而不是独立成行。

典型位置：

- `GrepTool/UI.tsx:66-71`
- `LSPTool/UI.tsx:89-94`
- `CollapsedReadSearchContent.tsx:588-590`

### 可迁移结论

如果 Lumen 需要“可展开提示”：

- 应放在主摘要行末尾
- 不应默认再起第三行

---

## 九、颜色与层级，不是参数但属于规则

Claude 的工具调用之所以不像“绿色标题 + 灰摘要”，原因是层级主要来自：

1. 左侧状态点
2. 标题 bold
3. 摘要 normal
4. `⎿` 从属行
5. dimColor 次级语气

不是由大面积颜色差决定。

### 标题背景色

普通工具标题默认**没有背景色**。

只有当工具实现 `userFacingNameBackgroundColor()` 时才会出现背景色，当前典型是 AgentTool：

- `Tool.ts:523-527`
- `AgentTool/UI.tsx:1013-1024`

也就是说：

- 普通 Read / Grep / Bash 不应天然做成绿色 badge 或彩色标签

---

## 十、Lumen 可直接采用的参数表

### 主 transcript
- 块前间距：**1 行**

### tool 主行
- 左状态列：**2 列**
- 标题：**bold**
- 摘要：**同行 normal**
- 主行默认无 `⎿`

### 普通从属行
- 前缀：**`"  ⎿ "`**
- 高度：优先 **1 行**

### collapsed hint / hook 行
- 前缀：**`"  ⎿  "`**
- 比普通从属行多 1 个空格

### collapsed / batch 默认态
- 第一行：句子化摘要
- 第二行：latest hint
- active / done 用不同语态

### 状态点
- 以 `●` / `⏺` 为核心
- success / error 用颜色区分
- 不用重型 spinner 作为工具主行活动标识

---

## 十一、对 Lumen 的直接实现建议

如果后续要继续往 Claude 靠，优先顺序建议是：

1. 把 tool 主行统一成：状态点 + 标题 + 同行摘要
2. 把 tool 结果 / permission / progress 统一改成 `⎿` 从属行
3. 把 collapsed / batch 改成句子化 active/done 语态
4. 区分 `MessageResponse` 与 collapsed hint 的 gutter 宽度
5. 减少标题颜色存在感，把层级还给字重、缩进和结构

---

## 十二、当前这份文档解决什么问题

这份文档的作用不是定义“最终 Lumen 一定长什么样”，而是把 Claude 这套工具调用 transcript 的**可执行参数**固定下来，避免后续讨论时继续凭感觉调：

- 缩进到底是几格
- `⎿` 后面是 1 格还是 2 格
- 主行标题和摘要要不要分两行
- collapsed 默认是列表还是句子
- 工具 loader 是 spinner 还是状态点

这些问题，在 Claude 参考实现里其实都有稳定答案。本文档把它们提取出来，方便后续直接落地到 Lumen。
