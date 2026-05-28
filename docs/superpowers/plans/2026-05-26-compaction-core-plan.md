# Compaction Core 化与 Compact Prompt 计划

> 规划定位：
> 本计划属于 [Stage D — Context & Memory](../../ROADMAP.md) 与 [Stage G — Governance & Upstream](../../ROADMAP.md) 的交叉主线。
> 它解决的是 Lumen 当前会话压缩仍处于 “core 切点 + 插件摘要桥接” 混合态的问题，并把 `compact_prompt` 提升为 core 正式能力。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当时仍在 project compaction extension 中的主摘要桥接逻辑下沉到 core，建立正式的 compaction policy / prompt / summarizer / history rebuilder 分层，并优先采用 Codex 风格 `compact_prompt`。

**Architecture:** compaction 将从“core + 插件主实现”演进为“core 正式拥有生命周期与历史重建，插件只做覆盖或实验策略”。架构上借 Codex 的 core ownership、`compact_prompt` 配置入口和历史重建边界，借 Claude 的 `boundaryMarker + summaryMessages + messagesToKeep + attachments + hookResults`，借 `oh-my-pi` 的阈值与策略配置。

**Tech Stack:** TypeScript, current `packages/coding-agent/src/core/compaction/*`, `agent-session`, `session-manager`, system prompt/config stack, Vitest, existing compaction docs.

---

## 范围

核心触点：

- `packages/coding-agent/src/core/compaction/`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/session-manager.ts`
- `packages/coding-agent/src/core/system-prompt.ts`
- `packages/coding-agent/src/core/settings-manager.ts` 或等价配置入口
- `packages/coding-agent/docs/compaction.md`

过渡触点：

- 旧 project compaction extension
- `packages/coding-agent/examples/extensions/custom-compaction.ts`

## 主要问题

1. 当前摘要桥接主行为仍依赖插件，不利于长期稳定维护。
2. `compact_prompt` 还不是 core 正式配置能力。
3. 当前 replacement history 与 recent user bridge 已经初步存在，但缺少正式的 core 分层与策略模型。

## 设计决策

### 1. 采用 core-owned compaction 生命周期

compaction 至少拆为四层：

- `CompactionPolicy`
- `CompactionPromptProvider`
- `CompactionSummarizer`
- `CompactionHistoryRebuilder`

### 2. `compact_prompt` 正式化

`compact_prompt` 应具备：

- core 默认值
- 配置覆盖
- 文件覆盖
- 运行时上下文可读取

并与主系统 prompt 分开治理。

### 3. 默认 prompt 风格优先对齐 Codex

若本地 `codex` 默认模板无法完整提取，则采用：

- Codex 的接口与行为作骨架
- `phistory` 的 `Codex CLI` prompt 快照校准语气与规则
- 本地 `ClaudeCodeRev` compaction prompt 作为结构实现参考

### 4. 历史重建综合 Codex + Claude

保留以下目标能力：

- recent user bridge
- replacement messages
- boundary marker
- summary messages
- kept messages
- attachments / tool context / plan context reinjection
- prefix-preserving / suffix-preserving

### 5. 策略配置借鉴 `oh-my-pi`

至少应评估：

- `context-full`
- `handoff`
- `off`
- `thresholdPercent`
- `thresholdTokens`
- `reserveTokens`
- `keepRecentTokens`
- tokenizer 估算替换 chars/4 路径

## 分阶段实施建议

### Phase 1：引入 core `compact_prompt`

目标：

- 先把 prompt 入口内核化

验收：

- 不依赖插件也可从 core 读取默认 compaction prompt

### Phase 2：下沉当前 Codex 风格摘要桥

目标：

- 将当前插件中最核心的结构化摘要桥接逻辑移入 core

验收：

- `session_before_compact` 不再是唯一主行为入口

### Phase 3：策略与阈值增强

目标：

- 引入 `context-full / handoff / off`
- 引入 `thresholdPercent / thresholdTokens`

验收：

- compaction 行为不再只有单一路径

### Phase 4：插件退居覆盖层

目标：

- 保留插件自定义能力，但不再让插件承载主实现

验收：

- 旧 project compaction extension 可以保留为覆盖或实验层，或在主行为完全内核化后删除

## 风险

- 过早移除插件实现会让当前已验证过的行为回退
- 若不先 formalize `compact_prompt`，后续 prompt 治理会继续耦合

## 结论

会话压缩内核化是下一阶段第二主轴。其正确路线不是重写一切，而是按 Codex 的 core ownership 方式逐步收口当前已经验证有效的摘要桥接能力。
