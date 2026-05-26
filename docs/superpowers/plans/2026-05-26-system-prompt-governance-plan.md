# 系统提示词治理计划

> 规划定位：
> 本计划属于 [Stage D — Context & Memory](../../ROADMAP.md) 与 [Stage G — Governance & Upstream](../../ROADMAP.md) 的交叉主线。
> 它解决的是当前 Lumen 已经事实拥有自己的 prompt 分层，但缺少正式治理边界的问题，尤其是主系统 prompt 与 `compact_prompt` 之间的职责尚未完全固定。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 固定 Lumen 当前 prompt 体系的职责边界，明确主系统 prompt、mode/personality/agent overlays、project context、skills/rules/prompts、extension `appendSystemPrompt` 与 `compact_prompt` 的分层关系。

**Architecture:** 将 prompt 治理拆分为两条并行但边界清晰的线：主会话 prompt 线与 compaction prompt 线。主会话 prompt 负责默认行为与会话规则，compaction prompt 负责历史压缩与续跑保真。扩展追加能力只作为 overlay，不再承担 compaction 主行为配置职责。

**Tech Stack:** TypeScript, `system-prompt.ts`, `agent-session.ts`, prompt templates, extension runtime, skills/rules/context loader docs.

---

## 范围

核心触点：

- `packages/coding-agent/src/core/system-prompt.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/prompt-templates.ts`
- skills / prompts / rules / extensions 文档

## 设计决策

### 1. prompt 分两条主线治理

- 主系统 prompt
- `compact_prompt`

二者不能再靠“追加一段 prompt”混在一起。

### 2. 主系统 prompt 继续由 Lumen 自己拥有

当前系统提示词已经不是 Pi 原生直出，后续应继续以 Lumen 自己的默认 prompt 为正式真源。

### 3. extension `appendSystemPrompt` 退回 overlay 角色

扩展只能补充局部约束，不应继续承担 core compaction 或全局 UI 文案职责。

### 4. 文档化 prompt 注入链路

需要能回答：

- 当前 turn 的主系统 prompt 由哪些层组成
- 当前 compaction prompt 从哪里来
- 哪些内容会进入模型可见上下文，哪些只是 UI 文案

## 分阶段实施建议

### Phase 1：梳理现有注入路径

验收：

- 能完整列出 default / mode / personality / project context / skills / extension append 的顺序

### Phase 2：固定 `compact_prompt` 边界

验收：

- `compact_prompt` 与主系统 prompt 文档边界明确

### Phase 3：更新文档真源

验收：

- 用户与开发者都能通过文档快速判断当前 prompt 来源与覆盖层级

## 风险

- 若不先完成 compaction core 化，`compact_prompt` 边界很难真正固定
- 若把 UI 文案问题继续塞回 prompt，会让治理目标再次混乱

## 结论

系统提示词治理是 compaction 内核化后的配套收口层，它的目标不是改写现有能力，而是让当前已经存在的 prompt 体系变得可解释、可配置、可维护。
