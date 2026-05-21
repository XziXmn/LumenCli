# Output Flow Rebuild

## 目标

在保留 Lumen 能力层的前提下，把 `pi-tui` 的输出流相关实现恢复到 `upstream/main` 的 Pi 基线，然后基于干净基线重新做 Claude 风格输出流。

这次重建的重点不是“继续微调现有 UI”，而是把输出流从“事件日志视角”重构成“会话语义视角”。

目标样式规范见：

- [claude-output-style.md](D:/UGit/LumenAgent/docs/claude-output-style.md)

## 当前结论

当前主线曾经同时叠加了三类改动：

1. Pi 原生 interactive TUI
2. 一轮 Claude 风格输出流改造
3. Lumen 自定义能力层

这三层在消息流、tool 渲染、thinking、footer 上已经明显纠缠。继续在旧结构上修补，难以判断问题究竟来自：

- Pi 原生输出流
- Claude 化尝试
- Lumen 能力插入

因此先恢复“输出流层”基线，再重做，是成本最低、可验证性最高的路线。

## 恢复边界

### 恢复到 Pi 基线的文件

这些文件属于“输出流层”，应恢复到 `upstream/main`：

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/src/modes/interactive/components/assistant-message.ts`
- `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- `packages/coding-agent/src/modes/interactive/components/user-message.ts`
- `packages/coding-agent/src/modes/interactive/components/footer.ts`
- `packages/coding-agent/src/core/tools/bash.ts`
- `packages/coding-agent/src/core/tools/read.ts`
- `packages/coding-agent/src/core/tools/write.ts`
- `packages/coding-agent/src/core/tools/edit.ts`
- `packages/coding-agent/src/core/tools/grep.ts`
- `packages/coding-agent/src/core/tools/find.ts`
- `packages/coding-agent/src/core/tools/ls.ts`

### 从输出流层移除的 Claude 化组件

这些组件不是 Pi 原生结构的一部分，应从主线输出流中移除：

- `packages/coding-agent/src/modes/interactive/components/tool-group.ts`
- `packages/coding-agent/src/modes/interactive/components/lumen-status-line.ts`
- `packages/coding-agent/src/modes/interactive/components/lumen-output-block.ts`

### 保留不回滚的能力层

这些文件不是输出流层，应保留：

- `packages/coding-agent/src/core/lumen-todo.ts`
- `packages/coding-agent/src/core/lumen-task.ts`
- `packages/coding-agent/src/core/lumen-askuser.ts`
- `packages/coding-agent/src/core/lumen-lsp.ts`
- `packages/coding-agent/src/core/lumen-repo.ts`
- `packages/coding-agent/src/core/lumen-web.ts`
- `.lumen` 路径体系、中文化、品牌定制

## Pi 基线的原始形态

恢复后的 Pi 基线有这些特点：

1. `interactive-mode` 直接消费 `AgentSessionEvent`
2. assistant 文本与 tool execution 是两条并列渲染链
3. `AssistantMessageComponent` 只负责文本与 thinking
4. `ToolExecutionComponent` 是独立工具块，而不是 assistant 回合内部语义节点
5. `FooterComponent` 是简单状态栏，而不是任务/目标面板
6. 不存在连续 read/search 的折叠语义层

这套基线是“generic agent TUI”，不是 Claude 风格 transcript。

## 重建原则

### 1. 不再直接改原始事件流

下一轮 Claude 风格改造不应继续在 `handleEvent()` 分支里直接堆条件，而应先引入一层中间语义模型：

- 原始输入：`AgentSessionEvent`
- 中间层：`RenderableTurn` / `RenderableBlock` / `CollapsedGroup`
- 最终层：interactive 组件树

### 2. assistant 回合是第一语义单元

Claude 风格的核心不是“工具块长得像”，而是 assistant 的一个回合内部能自然包含：

- thinking
- text
- tool use row
- tool progress
- tool result summary

Pi 基线没有这个结构，这一层要重新建立。

### 3. tool 默认只显示摘要

Claude 风格不把 tool result 默认当正文输出，而是：

- 标题：简洁 user-facing name
- 进度：一行
- 结果：一行或少量行摘要
- 详细内容：verbose / expand 时再展开

### 4. 长期状态不要堆进消息流

这些应尽量放到 footer / prompt 附近，而不是塞到 transcript：

- todo 进度
- background task 状态
- permission wait
- active agent / worker 状态

### 5. thinking 要有清晰生命周期

重做时需要明确：

- streaming 阶段如何展示
- 结束后是否保留
- transcript 模式如何查看历史 thinking
- 和正文、tool row 的相对顺序是什么

## 建议的重建阶段

### Phase 0：冻结基线

验收标准：

- 上述恢复文件与 `upstream/main` 对齐
- 相关 Claude 化组件已移除
- `npm run check` 通过

### Phase 1：引入中间语义层

目标：

- 不直接从 `AgentSessionEvent` 渲染 UI
- 先把事件整理成 renderable blocks

建议新增：

- `packages/coding-agent/src/modes/interactive/output-flow/types.ts`
- `packages/coding-agent/src/modes/interactive/output-flow/projector.ts`
- `packages/coding-agent/src/modes/interactive/output-flow/collapse.ts`

### Phase 2：assistant 回合重排

目标：

- assistant 回合内统一承载 text / thinking / tool rows
- 不再把 tool execution 当完全独立的聊天块

优先顺序：

1. assistant text + thinking
2. tool use 行
3. tool result 摘要

### Phase 3：read/search 折叠

目标：

- 连续 `read` / `grep` / `find` 变成 collapsed group
- 默认只显示一句摘要 + 一条 hint
- expanded 模式再回放详细项

### Phase 4：状态迁移

目标：

- todo、task、permission 等长期状态搬离消息流
- transcript 专注表达“本轮发生了什么”

### Phase 5：spacing 与视觉细化

目标：

- 压缩垂直空白
- 统一 `⎿` 语义
- 收紧 tool row 与正文的层级关系

说明：spacing 是最后一层优化，不应早于语义重排。

## 当前分支建议

在 `feat/output-flow-rebase` 上继续推进，不要回到 `main` 直接做。

推荐后续提交节奏：

1. `refactor(output): restore interactive flow to pi baseline`
2. `feat(output): add renderable turn projection`
3. `feat(output): regroup assistant turn blocks`
4. `feat(output): collapse read and search groups`
5. `feat(output): move todo and task status out of transcript`

## 完成判定

当以下条件同时满足时，认为 Claude 风格输出流第一阶段完成：

- assistant 回合内部呈现 text / thinking / tool rows
- `read/search` 默认折叠为摘要
- todo 不再刷整张表到消息区
- 工具结果默认摘要化
- spacing 明显收紧
- `npm run check` 通过
