# Claude Output Style Spec

## 目的

本文档定义 Lumen 在 `pi-tui` 基线上重建 Claude 风格输出流时的目标样式。

它不是工程实现方案，而是视觉与语义上的“目标状态”说明。  
工程分层、回基线范围、实施阶段见：

- [output-flow-rebuild.md](output-flow-rebuild.md)
- [claude-tool-call-style.md](claude-tool-call-style.md) — Claude 工具调用的精确缩进 / 折叠 / `⎿` 参数

## 参考来源

本规范基于本地参考实现整理，主要来源：

- `references/ClaudeCodeRev/src/components/Messages.tsx`
- `references/ClaudeCodeRev/src/components/Message.tsx`
- `references/ClaudeCodeRev/src/components/MessageRow.tsx`
- `references/ClaudeCodeRev/src/components/MessageResponse.tsx`
- `references/ClaudeCodeRev/src/components/messages/AssistantTextMessage.tsx`
- `references/ClaudeCodeRev/src/components/messages/AssistantThinkingMessage.tsx`
- `references/ClaudeCodeRev/src/components/messages/AssistantToolUseMessage.tsx`
- `references/ClaudeCodeRev/src/components/messages/GroupedToolUseContent.tsx`
- `references/ClaudeCodeRev/src/components/messages/CollapsedReadSearchContent.tsx`
- `references/ClaudeCodeRev/src/components/PromptInput/PromptInput.tsx`
- `references/ClaudeCodeRev/src/components/PromptInput/PromptInputFooter.tsx`
- `references/ClaudeCodeRev/src/components/CoordinatorAgentStatus.tsx`
- `references/ClaudeCodeRev/src/tools/BashTool/UI.tsx`
- `references/ClaudeCodeRev/src/tools/FileReadTool/UI.tsx`
- `references/ClaudeCodeRev/src/tools/FileWriteTool/UI.tsx`
- `references/ClaudeCodeRev/src/tools/FileEditTool/UI.tsx`
- `references/ClaudeCodeRev/src/tools/GrepTool/UI.tsx`
- `references/ClaudeCodeRev/src/tools/GlobTool/UI.tsx`
- `references/ClaudeCodeRev/src/tools/AgentTool/UI.tsx`

## 核心原则

### 1. transcript 优先，不是执行日志优先

Claude 风格的主视角是“assistant 正在完成一个回合”，不是“系统正在打印一堆事件”。

因此：

- assistant 文本、thinking、tool use、tool result 应属于同一回合语义
- 长期状态不应反复写入消息流
- 默认展示摘要，而不是默认展示原始执行细节

### 2. 摘要优先，细节后置

默认用户应该看到：

- 做了什么
- 现在做到哪一步
- 是否完成

而不是：

- 命令全文
- 大段 read 内容
- 完整 grep 命中列表
- 每个 todo 状态块的完整重复转储

### 3. 视觉压缩服务于语义压缩

间距、图标、折叠不是装饰，而是为了把多步工具执行压成“可扫描”的对话流。

## 屏幕结构

Claude 风格终端可视上分成三层：

1. transcript 主区
2. prompt 区
3. prompt 周边状态区

其中：

- transcript 负责“这一轮发生了什么”
- prompt 周边负责“现在系统处于什么状态”

不应把 prompt 周边长期状态反复灌入 transcript。

## Transcript 规则

### 用户消息

用户消息应该是强可识别、但不过度抢眼的起点。

要求：

- 明确的用户起始标记
- 单条消息内部紧凑
- 多行消息仍保持一个整体块
- 不做卡片式浮层

不要求完全复制 Claude 的具体字符，但要满足：

- 一眼能看出这是用户输入
- 与 assistant/tool 行的层级明显不同

### assistant 正文

assistant 正文应表现为“主叙述流”。

要求：

- 使用统一正文宽度和缩进
- 有明确的起始标记
- 正文块之间的空隙小于系统消息和大工具块之间的空隙
- 不出现大片无语义空白

正文应优先保留阅读连续性，不被工具块频繁打断。

## Thinking 规则

Claude 风格 thinking 不应在主视图中大量铺开。

### 默认态

默认应显示为一条轻量提示，而不是完整推理内容。

推荐形态：

- `∴ Thinking`
- 或同等语义的单行提示
- 附带展开提示

### 展开态

当用户进入 transcript / verbose / expand 语境时，thinking 才展开。

展开态要求：

- thinking 标题单独一行
- 内容左缩进
- 颜色弱于正文
- 与正文之间有明确但克制的间隔

### 生命周期

thinking 需要满足：

- streaming 阶段可见
- 结束后不应无故消失
- 没有正文、只有 tool 的回合里，thinking 也不能被误删
- transcript 模式可以只显示最近一个 thinking，避免历史 thinking 污染浏览

## Tool Use 规则

### 单个 tool use 行

单个 tool use 行由三部分组成：

1. 状态点
2. user-facing tool name
3. 简短参数摘要

形式应接近：

- `● Read(path/to/file)`
- `● Bash(npm run check)`
- `● Search(pattern: "todo", path: "src")`

要求：

- user-facing name 统一、稳定
- 参数摘要只保留最关键的辨识信息
- 不在默认态里展示大段原始参数 JSON

### 状态点

状态点的语义：

- 未完成时：中性/活动态
- 成功时：完成态
- 错误时：错误态

不要把整行都做成高对比 loading 动画，重点是让用户快速扫过当前“哪些还在跑”。

### tool progress

tool progress 应出现在 tool use 行下方，且以 `MessageResponse` 风格的次级响应行承载。

推荐形态：

- `⎿ Running…`
- `⎿ Waiting for permission…`
- `⎿ Auto classifier checking…`

progress 行是对上方 tool use 的补充，而不是新消息。

## Tool Result 规则

### 默认只显示摘要

tool 完成后，默认应显示一行结果摘要。

示例目标：

- `⎿ Read 42 lines`
- `⎿ Found 12 matches across 3 files`
- `⎿ Wrote 18 lines to src/foo.ts`
- `⎿ Done (4 tool uses · 1234 tokens · 4.2s)`

### 不在默认态暴露大结果正文

默认态不应该直接展示：

- 全部 read 内容
- 全部 grep 结果
- 全部 bash 输出
- 大型 diff

这些内容应在：

- verbose
- transcript expand
- 专门详情视图

中查看。

### `MessageResponse` 语义

所有工具结果摘要应使用统一的“挂靠式”视觉层级：

- 上一行是 tool use
- 下一行是 `⎿` 响应

`⎿` 不是装饰符，而是“这是上一行工具调用的结果”的视觉协议。

## 连续读搜折叠

Claude 风格里，连续 read/search/repl 操作会被折叠成一个独立语义组。

### 默认态

默认显示一句摘要：

- `Reading 3 files, searching 2 patterns…`
- `Read 3 files, searched 2 patterns`

并带一条 hint：

- `⎿ src/core/tool.ts`
- `⎿ "todo"`

### verbose / expanded

在 verbose 或 expanded 模式里，再展开组内每个 tool use。

### 语义要求

- active 时使用现在时
- completed 时使用过去时
- hint 只显示最近且最有辨识度的一项

## Agent / Task 规则

多代理或子任务不应只表现为“调用了 task 工具”。

默认态应表现为：

- 一条总摘要
- 下方列出活跃 agent 的简短进度行

参考语义：

- `Running 3 agents…`
- `⎿ reviewer: checking tests`
- `⎿ planner: wrote 2 notes`

完成态应摘要化：

- `Done (4 tool uses · 1234 tokens · 4.2s)`

## Todo / 长期状态规则

todo、goal、background task、permission wait 属于长期状态，不应持续刷进 transcript。

要求：

- transcript 中只出现“更新摘要”
- 实时状态放到底栏或 prompt 附近
- 完整列表通过显式命令查看

这条规则优先于“把所有状态都可见”。

## Footer 与 Prompt 周边规则

### footer

Claude 风格 footer 应低存在感。

要求：

- 只承载轻量持续状态
- 不做重 HUD
- 不与正文争抢注意力

适合放在 footer 的内容：

- todo 概要
- model / mode
- 少量 extension status

不适合放在 footer 的内容：

- 大段任务树
- 复杂 diff
- 多行详细 tool output

### prompt 周边状态

Claude 风格把很多“正在发生什么”放在 prompt 周边，而不是消息流：

- background tasks
- coordinator / teammates
- permission mode
- queue 状态

如果要接近 Claude，这层必须后移到 prompt 附近。

## 间距规则

### 总原则

默认垂直节奏应更紧，重点空白只给：

- 用户消息与 assistant 回合之间
- assistant 回合之间
- 大型系统分隔线

### 不应出现的情况

- tool use 与 tool result 之间再加大片空白
- assistant thinking 和 tool row 被无语义空白隔开
- todo/tool 状态块每次都像独立卡片一样落入消息流

## 非目标

以下内容不是第一阶段目标：

- 逐字符完全复刻 Claude 的视觉样式
- 复刻 Claude 内部专有的小模型 tool batch summary 服务
- 复刻所有 transcript 搜索、hover、鼠标细节

第一阶段目标是先把：

- 结构
- 语义层级
- 默认摘要策略
- 长期状态位置

做对。

## 验收清单

当以下条件满足时，可认为“Claude 风格样式”达到第一阶段目标：

- assistant 回合内 text / thinking / tool use / tool result 语义统一
- thinking 默认轻量提示，展开态清晰
- 连续 read/search 默认折叠
- tool result 默认摘要化
- todo 不再反复刷整张表到 transcript
- footer / prompt 周边承载长期状态
- transcript 垂直节奏明显收紧
