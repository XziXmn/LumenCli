# Codex 压缩方案调研与插件化可行性结论

日期：2026-05-24

## 目标

回答三个问题：

1. 本地参考项目 Codex 的会话压缩方案为什么更强
2. Lumen 现在的会话压缩和自动压缩缺的是什么
3. 这些能力里，哪些可以先用插件完成，哪些必须改 core

## 结论先行

一句话结论：

- **可以先做插件版增强压缩**
- **但做不到完整复刻 Codex**
- **如果要逼近 Codex 现在的效果，最终仍然需要小范围 core 改动**

也就是说，正确路线不是“二选一”，而是：

1. 先做插件版增强压缩，尽快把摘要质量和结构提升起来
2. 再根据插件落地结果，补最小 core 改动，把 Codex 方案里真正决定体验上限的部分收进主线

## Codex 方案为什么更优

从 `references/codex/codex-rs/core/src/compact.rs` 与 `compact_remote_v2.rs` 看，Codex 的优势不只在 prompt，而在 **压缩后的历史重建方式**。

核心点有 5 个：

### 1. 它不是“写一条摘要消息”，而是“替换整段历史”

Codex 在压缩完成后，会直接构造一份新的 replacement history，再用它替换原来的旧历史，而不是只往会话里追加一条总结。

这意味着：

- 压缩后的上下文形态是受控的
- 模型后续看到的上下文顺序更稳定
- 不会无限叠加“旧摘要 + 新消息 + 更旧摘要”这种混合噪音

对 Lumen 的启发：

- 仅靠插件生成更好的摘要文本，不足以复刻 Codex
- 真正强的是“摘要如何进入后续上下文”

### 2. 它明确控制 initial context 的重新注入位置

Codex 有一个非常关键的点：压缩后会把初始上下文重新插回去，而且不是随便插，而是精确插到“最后一个真实 user message 之前”或“summary/compaction item 之前”。

这解决的是：

- SYSTEM / developer context 丢位
- summary 被后续上下文顶乱
- mid-turn compact 后模型看到的顺序不自然

对 Lumen 的启发：

- 这部分目前插件很难完整接管
- 因为它依赖 session replacement history 的最终装配权

### 3. 它区分 manual compact / auto compact / mid-turn compact

Codex 不是只有一个压缩入口。

它至少区分：

- 用户主动触发
- 自动触发
- 回答进行到一半时的 mid-turn compaction

不同入口的处理差异包括：

- 是否要重新注入 initial context
- replacement history 的最终形态
- 压缩完成后下一轮该怎么看这段上下文

对 Lumen 的启发：

- 现在 Lumen 的 `session_before_compact` hook 已经能拦截压缩
- 但还没有把不同压缩阶段的“历史重建策略”做成独立模型

### 4. 它会保留最近 user messages，并把 summary 作为最后一项

Codex 的 `build_compacted_history()` 不是“只留 summary”，而是：

- 保留一定量最近 user messages
- 把 summary 放到固定位置

这样做的效果是：

- 模型不会只看到一大段抽象总结
- 最近用户真实意图仍然保留
- summary 变成稳定桥接层，而不是唯一上下文载体

对 Lumen 的启发：

- 这部分是**最适合先插件化借鉴**的
- 因为它主要是总结策略和输入构造策略，不一定立刻要求替换底层历史

### 5. 它对 compact 过程本身也做了状态化处理

Codex 会显式把 compact 作为 turn item / event 流中的正式对象来跟踪，还会记录：

- compact reason
- compact phase
- compact status
- retry / error / interrupted

对 Lumen 的启发：

- Lumen 当前已经有 compaction start/end、hooks start/end 事件
- 所以这部分不是缺“事件”，而是缺“更精细的压缩策略层”

## Lumen 当前已经具备的基础

从 `packages/coding-agent/src/core/compaction/compaction.ts`、`branch-summarization.ts`、`extensions/types.ts` 看，Lumen 其实已经有不错的插件切入点：

### 已有能力

1. `session_before_compact`
   - 可以拦截自动压缩和手动压缩
   - 可以取消
   - 可以提供自定义压缩结果

2. `session_before_tree`
   - 可以自定义 branch summary

3. `CompactionPreparation`
   - 已经给了：
     - `messagesToSummarize`
     - `turnPrefixMessages`
     - `keptMessages`
     - `isSplitTurn`
     - `previousSummary`
     - `fileOps`
     - `firstKeptEntryId`

4. 现有 `compact()` 是纯函数式准备 + 最终写入
   - 这让插件更容易介入“摘要生成”阶段

### 当前缺口

真正缺的不是“能不能生成自定义摘要”，而是：

1. 插件不能完全决定 **replacement history 的最终形态**
2. 插件不能完整模拟 Codex 那种 **initial context 注入位置控制**
3. 插件不能轻易把 compact 后历史改造成“最近 user messages + summary + controlled context reinjection”这种结构

## 哪些可以插件化

下面这些我认为**可以先插件化**：

### A. 更强的摘要 prompt 与结构

可以做成一个 compaction plugin，统一接管：

- manual compact
- auto compact
- branch summary

插件版可以做到：

- 参考 Codex 的结构化总结格式
- 把最近 user messages 单独提取出来
- 区分历史总结与 split-turn 前缀总结
- 对摘要内容进行更严格的段落结构约束

### B. 更好的自动压缩策略判断

插件可以基于 `preparation` 自己决定：

- 什么情况下沿用默认压缩
- 什么情况下使用“保留更多最近 user messages”的策略
- 什么情况下直接拒绝压缩并提示用户开新会话

### C. 压缩后提示与风险提示

Codex 会在压缩完成后给出“长线程会降低准确性”的提示。

这类提示完全可以先插件化：

- 压缩完成后提示用户开新线程
- 多次压缩后提高 warning 等级
- 在 UI 上给出更明显的压缩状态反馈

## 哪些不能完整插件化

下面这些我认为**最终还是要进 core**：

### A. replacement history 的精确控制

如果要真正复刻 Codex 的做法，插件必须能直接控制：

- 压缩后历史里保留哪些 item
- summary 插在什么位置
- initial context 插在什么位置
- compaction item / summary item 的最终顺序

Lumen 当前的 hook 更像“允许你自己生成 summary 和 details”，但不是“把整个 replacement history 构造权交给你”。

补充：

- 现在已经新增一个**最小 core 补位**：
  - `summaryPlacement?: "before-kept" | "after-kept"`
- 这意味着扩展现在至少可以控制：
  - 压缩摘要放在保留消息之前
  - 或放在保留消息之后
- 这还不是完整 replacement history 控制，但已经能更接近 Codex 的“最近真实消息 + 摘要桥接层”形态。

### B. mid-turn compact 的上下文重建语义

Codex 在 mid-turn compact 上的核心强点是：

- 压缩完后模型继续看上下文时，看到的是一个精确整理过的 replacement history

如果 Lumen 想要接近这个效果，必须让 core 对“压缩后的历史形态”有更强控制。

### C. 压缩产物进入后续上下文的规范化位置

插件能控制“写什么”，但不够容易控制“放哪”和“后续如何重建 session context”。

这正是 Codex 方案体验更稳的核心原因之一。

## 推荐实施路线

### 阶段 1：先做插件版增强压缩

目标：

- 不改 core 先把总结质量和自动压缩策略提升一截

插件应做的事：

1. 接管 `session_before_compact`
2. 接管 `session_before_tree`
3. 统一使用新的结构化压缩 prompt
4. 参考 Codex 做“两段式摘要”：
   - 历史摘要
   - split-turn 前缀摘要
5. 额外保留最近 user messages 的抽取结果到 summary 内容中
6. 增加 repeated compaction 的 warning

这一步的价值：

- 风险小
- 不破坏现有会话结构
- 能快速验证“Codex 风格摘要策略”对实际效果有没有明显提升

### 阶段 2：再做最小 core 改动

如果插件版验证有效，再考虑补两类 core 能力：

1. **允许 hook 返回 replacement history**
   - 不只是 `summary + details`
   - 而是可选返回“压缩后的完整历史替换结果”

2. **允许控制 initial context reinjection policy**
   - 比如：
     - `none`
     - `before_last_real_user`
     - `before_summary`
     - `default`

目前第 0.5 步和第 1 步的最小版本已经部分完成：

- 已支持 `summaryPlacement`
- 已支持 `replacementMessages`
- 已支持 `event.reason`
- 已支持 `preparation.keptMessages`

所以现在离“最小可用 core 补位”已经更近，剩下真正决定上限的还是：

- custom replacement history 的更完整控制策略
- context reinjection policy

补充判断：

- 在 Lumen 当前架构里，skills / context files / append system prompt 本来就会每 turn 重建进 system prompt。
- 所以和 Codex 相比，Lumen 对“initial context reinjection”的紧迫性没有那么高。
- 当前更优先的核心能力其实是：
  - **replacement history 能否被扩展精确控制**
- 现在这一步已经不再只是“待用能力”：
  - 插件已经实际使用 `replacementMessages`
  - 插件已经开始按 `manual / threshold / overflow` 分流
  - 插件提取 recent user intent 时已优先使用 `keptMessages`
- 所以下一阶段更合理的方向变成：
  - 继续细化 replacement history 的控制粒度
  - 再评估是否还需要显式 reinjection policy

## 对三项主线的直接影响

### 对 interactive-mode 主线的影响

短期影响不大。

主要是：

- compacting / auto-compacting 的提示文案可以更清晰
- 压缩成功后的 warning / queued follow-up / summary 展示可以更稳定

但它不是当前 interactive-mode 收口的最大 blocker。

### 对 `.lumen` 配置与旧插件兼容的影响

有间接帮助。

因为如果后面要做“新插件下次启动自动评估”，可以顺手把：

- 旧 Pi 压缩插件
- 旧 prompt/summary 插件

也纳入兼容分类里。

### 对会话压缩主线本身的影响

这是最大的。

当前最合理的判断是：

- **先插件化增强**
- **再 core 补位**

而不是一上来就重写 core compaction。

## 最终判断

| 问题 | 结论 |
|---|---|
| Codex 压缩方案值不值得参考 | 值得，而且很值得 |
| 能不能完全插件化 | 不能完整复刻 |
| 能不能先插件化拿到大部分收益 | 能 |
| 要不要最终改 core | 要，但应该是最小 core 改动，不是重写 |

## 下一步建议

按优先级我建议这样排：

1. 先写一个 **Codex-style compaction extension** 设计稿
2. 明确插件版的输入、输出、summary 结构
3. 先实现插件版
4. 跑真实会话压缩体验验证
5. 再决定是否补 core：
   - custom replacement history
   - context reinjection policy
