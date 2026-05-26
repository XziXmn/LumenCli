# BottomPane 统一结构与闪动稳定性计划

> 规划定位：
> 本计划属于 [Stage B — Interactive Surface](../../ROADMAP.md)。
> 它解决的是 `interactive-mode` 下半区当前仍由 `promptAreaContainer + interactionAreaContainer` 分裂承载的问题，并将任务栏 execution row 跳帧闪动纳入同一条结构主线。
> 执行时必须延续 core-owned progress surface 路线，不能把主任务栏所有权重新退回扩展层，也不能破坏当前 `.lumen/` 兼容与 Windows / PowerShell 工作流。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `interactive-mode` 下半区重构为统一 `BottomPane` 结构，明确 `TaskbarRow / PendingRow / ComposerFrame / ExtensionRow / PassiveFooter` 五层，并修复 `@explore ... uses/tokens/duration` 这类 execution row 偶发闪出错误候选内容的问题。

**Architecture:** 用一个新的 bottom-pane 结构取代现有“上层状态区 + 下层输入区”分裂模型。主动进度语义全部收口到 `TaskbarRow`，待发送消息区收口到 `PendingRow`，输入框本体收口到 `ComposerFrame`，扩展区收口到 `ExtensionRow`，footer 只保留被动状态。execution row 的稳定性修复将作为 `TaskbarRow` 的职责，而不是零散修补单个 spinner 或 loader。

**Tech Stack:** TypeScript, `@earendil-works/pi-tui`, current `interactive-mode`, `progress-surface`, `FooterDataProvider`, Vitest, `lumen-test`.

---

## 范围

核心触点：

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/src/modes/interactive/components/progress-surface.ts`
- `packages/coding-agent/src/modes/interactive/components/footer.ts`
- `packages/coding-agent/src/core/lumen-task.ts`
- `packages/coding-agent/src/core/extensions/types.ts`

关联触点：

- queued / steering / follow-up 展示逻辑
- extension widgets 布局
- progress surface refresh loop
- IME 输入抑制窗口

## 主要问题

1. 状态区和输入区在结构上仍是两个分裂容器，导致视觉边界和刷新源不稳定。
2. 当前 `@explore ... 55 uses · 26k tokens · 3m 29s` 这类 execution row 会被频繁重新组装，导致用户感知到“一帧错误候选内容”。
3. footer 仍与上层状态语义存在潜在耦合，不利于长期收口。

## 设计决策

### 1. 下半区统一视为一个系统

最终结构应为：

- `TaskbarRow`
- `PendingRow`
- `ComposerFrame`
- `ExtensionRow`
- `PassiveFooter`

不再让 `promptAreaContainer` 和 `interactionAreaContainer` 各自承担一半“下半区”职责。

### 2. 主动状态与被动状态彻底分离

- 主动进度：只出现在 `TaskbarRow`
- 被动状态：只出现在 `PassiveFooter`
- top border 可以承载极轻量被动 contextual badge，但不能重新接管主任务栏

### 3. execution row 稳定显示

在一个 task 生命周期内，execution row 的主展示字段应保持稳定：

- `agent/group`
- `description/subject`
- `meta/currentTool`

只有下列字段允许高频变化：

- elapsed/duration
- token 数值
- tool uses 计数

不得在每个 tick 里重新选择另一条候选 headline 或 execution text。

### 4. 与 IME 稳定性协同

任何新的下半区刷新时序必须继续尊重：

- 输入活动抑制窗口
- terminal progress 指示器抑制
- `skipInitialRender` loader 路径

不能为了结构统一重新引入输入期背景刷新。

## 分阶段实施建议

### Phase 1：容器结构改造

目标：

- 提炼统一的 bottom-pane 结构
- 保持现有行为不明显退化

验收：

- 下半区五层结构清晰
- 状态区与输入框之间不再是硬拼接

### Phase 2：execution row 稳定性

目标：

- 修复 task line 候选内容跳帧

验收：

- `@explore ... uses/tokens/duration` 行只做尾部 stats 刷新
- 不再出现主文案闪成别的候选项的一帧

### Phase 3：footer 语义收口

目标：

- footer 只保留被动状态

验收：

- queue / task / todo / approval / retry 等主动语义不回流 footer

## 验收矩阵

至少覆盖：

1. 单 todo
2. 单 task
3. 多 task 并行
4. todo + task 并行
5. queued follow-up
6. approval / ask-user
7. retry / reconnect
8. completion teardown
9. IME 输入中持续流式输出

## 风险

- 若一次性把旧容器直接删除，回归面会过大
- execution row 稳定性必须同时约束“渲染层展示策略”和“上游状态输入粒度”；若只修渲染层而不限制候选内容切换，闪动问题仍会复发

## 结论

BottomPane 重构是下一阶段最优先子计划。它既解决视觉问题，也为 compaction core 化、中文化和 prompt 治理提供稳定落脚点。
