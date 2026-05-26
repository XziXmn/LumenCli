# TUI 二级界面中文化计划

> 规划定位：
> 本计划属于 [Stage B — Interactive Surface](../../ROADMAP.md) 与 [Stage G — Governance & Upstream](../../ROADMAP.md) 的交叉主线。
> 它解决的是当前 TUI 二级界面仍有大量英文遗留的问题，并要求中文化以统一文案层方式推进，而不是零散翻译。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `interactive-mode` 的 selector、dialog、login flow、compact/tree/session/hotkeys/changelog 等二级界面建立统一文案层，并系统清理核心交互路径中的英文遗留。

**Architecture:** 中文化分两步推进：先抽离 `tuiStrings` 或等价文案层，再统一替换现有组件中的硬编码英文。用户可见文案与模型可见 prompt 分开治理，不通过系统提示词补 UI 翻译。

**Tech Stack:** TypeScript, `interactive-mode` components, auth guidance, selector/dialog components, docs.

---

## 范围

优先组件：

- `model-selector`
- `oauth-selector`
- `login-dialog`
- `settings-selector`
- `session-selector`
- `tree-selector`
- `interactive-mode.ts` 中的状态提示、空状态、系统提示

优先文案类别：

- 标题
- 说明文
- 空状态
- warning / error / success / loading 提示
- 确认类选项（如 `Yes / No`）

## 设计决策

### 1. 先抽离文案层

不直接在组件中继续替换字符串，而是建立统一文案出口。

### 2. 优先处理高频二级界面

按使用频率优先：

1. model / login / logout
2. settings
3. compact / tree / branch summary
4. session / hotkeys / changelog

### 3. 用户可见文案与 prompt 分离

不得通过修改系统提示词来“间接解决” TUI 文案英文残留。

## 分阶段实施建议

### Phase 1：文案盘点与抽离

验收：

- 核心用户可见硬编码文案有统一出口

### Phase 2：高频界面中文化

验收：

- model/login/settings/compact/tree 主路径无明显英文残留

### Phase 3：低频界面与文档同步

验收：

- hotkeys/session/changelog 等剩余路径完成收口

## 风险

- 若在 BottomPane 重构前大范围翻译，会造成重复返工
- 若不抽离文案层，未来新功能会继续回到英文默认值

## 结论

TUI 中文化应作为结构稳定后的系统化治理工作推进，而不是继续零散修正个别字符串。
