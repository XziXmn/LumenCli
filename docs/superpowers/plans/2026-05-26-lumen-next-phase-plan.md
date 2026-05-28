# Lumen 下一阶段实施总计划

> 规划定位：
> 本计划属于 [Stage B — Interactive Surface](../../ROADMAP.md)、[Stage D — Context & Memory](../../ROADMAP.md) 与 [Stage G — Governance & Upstream](../../ROADMAP.md) 的交叉主线。
> 它不直接替代现有专题计划，而是为下一阶段的四条核心工作提供统一施工顺序、边界与衔接关系：
> 1）`interactive-mode` 下半区统一容器与任务栏闪动稳定性；
> 2）会话压缩内核化；
> 3）TUI 二级界面中文化；
> 4）系统提示词治理。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Lumen 下一阶段四条核心主线建立统一实施顺序、边界和交付路径，使后续实现不再分散推进。

**Architecture:** 先用一个上位总计划，把下半区结构、压缩内核、中文化和提示词治理四条线串起来；其中 `BottomPane` 与 compaction core 是主轴，中文化和 prompt 治理作为配套收口层围绕它们推进。所有执行应优先保持 core-owned 结构和 `.lumen/` 兼容边界，不再新增扩展层主逻辑依赖。

**Tech Stack:** TypeScript, `@earendil-works/pi-tui`, current `interactive-mode` core, current compaction core, extension runtime, Vitest, existing docs/spec/plan system.

---

## 任务分解原则

本计划不是把所有实现细节一次性写死，而是把后续工作拆成四个主工作包与若干子专题计划入口。

约束如下：

- 不回到“一个 plan 同时承载所有实现细节”的旧模式
- 不把当前 spec 当成永久真源；已采纳的设计要继续下沉为可执行计划
- 不让新工作破坏 `.lumen/` 迁移来源、Windows / PowerShell 工作流与上游同步纪律

## 总体实施顺序

### 工作包 1：统一 BottomPane 结构

目标：

- 把当前已经落地的 `bottomPane` 继续收口为统一下半区系统
- 明确 `TaskbarRow / PendingRow / ComposerFrame / ExtensionRow / PassiveFooter` 五层
- 纳入 `@explore ... uses/tokens/duration` 跳帧闪动修复

原因：

- 当前所有后续问题几乎都和“下半区不是一个系统”有关
- 如果不先统一结构，后面的中文化、footer 收口、approval/input 展示语义会继续分散

范围：

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/src/modes/interactive/components/progress-surface.ts`
- `packages/coding-agent/src/modes/interactive/components/footer.ts`
- `packages/coding-agent/src/core/lumen-task.ts`
- 相关的 queued / spinner / extension widget / footer data provider 接口

依赖：

- 当前 `core-owned progress surface` 专题计划
- 当前 `Claude-aligned progress workflow` 专题计划

计划产物：

- 新建一个专门的 `BottomPane` 收口子计划
- 旧的 progress-surface / claude-aligned 计划在完成后应并入此结构主线，而不再平行增长

### 工作包 2：会话压缩内核化

目标：

- 把当时 `core + project compaction extension` 的混合态，演进为正式 core compaction 子系统
- 让 `compact_prompt` 像 Codex 一样成为正式配置与上下文能力
- 综合：
  - Codex 的 core ownership、prompt 配置入口、历史重建边界
  - Claude 的 `boundaryMarker + summaryMessages + messagesToKeep + attachments + hookResults`
  - `oh-my-pi` 的策略与阈值配置

原因：

- 当前扩展实现已经证明方向正确，但主行为长期停留在扩展层会限制后续能力
- 如果不先把 compaction core 化，提示词治理和中文化都容易继续围着旧插件打补丁

范围：

- `packages/coding-agent/src/core/compaction/`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/session-manager.ts`
- `packages/coding-agent/src/core/system-prompt.ts`
- 旧 project compaction extension（最终应降级或移除）
- `packages/coding-agent/docs/compaction.md`

关键设计决定：

- 默认 `compact_prompt` 优先对齐 Codex 风格
- 若本地 `codex` 仓无法完整提供默认 prompt 原文，则使用：
  - Codex 的接口与行为作为骨架
  - `phistory` 快照作校准
  - 本地 `ClaudeCodeRev` 的完整 compaction prompt 作为结构实现参考

计划产物：

- 新建一个正式的 compaction core 化子计划
- 更新现有 `docs/2026-05-24-codex-compaction-plugin-feasibility.md`，将其降级为设计参考，不再作为唯一入口

### 工作包 3：TUI 二级界面中文化

目标：

- 为所有用户可见二级界面建立统一文案层
- 系统化梳理并替换 model/login/settings/session/compact/tree 等路径中的英文遗留

原因：

- 当前已经不是“缺少一两个翻译”，而是缺少统一文案治理机制
- 如果继续边做边翻，后续 compact core 化和 BottomPane 重构时还会重复返工

范围：

- `packages/coding-agent/src/modes/interactive/components/*`
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/src/core/auth-guidance.ts`
- 任何用户可见的 selector / dialog / empty state / warning / progress message

关键设计决定：

- 先抽离 `tuiStrings` 或等价文案层
- 再进行统一翻译
- 用户可见文案与模型可见 prompt 分开治理

计划产物：

- 新建一个 TUI 中文化专项计划
- 同步更新 [FEATURE_OVERVIEW.md](../../FEATURE_OVERVIEW.md) 与 [CAPABILITY_MATRIX.md](../../CAPABILITY_MATRIX.md) 中相关状态

### 工作包 4：系统提示词治理

目标：

- 明确主系统 prompt、mode/personality/agent overlay、project context、skills/rules/prompts、extension append、`compact_prompt` 的边界
- 为后续压缩内核化和中文化提供稳定 prompt 分层

原因：

- 当前 Lumen 已经事实拥有自己的 prompt 体系，但缺少正式治理边界
- 如果不单独治理，compaction prompt 和主系统 prompt 会继续互相污染

范围：

- `packages/coding-agent/src/core/system-prompt.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/prompt-templates.ts`
- skills / prompts / rules / extension append 相关文档和接口

关键设计决定：

- 主系统 prompt 与 `compact_prompt` 必须分治
- extension 的 `appendSystemPrompt` 不能继续承担 compaction 行为配置职责
- 保留中文默认规则，但不把中文化二级文案问题塞回主系统 prompt

计划产物：

- 新建一个 prompt 治理专项计划
- 更新 `docs/README.md`、`packages/coding-agent/docs/usage.md`、`packages/coding-agent/docs/extensions.md`、`packages/coding-agent/docs/packages.md`

## 分阶段落地顺序

### 阶段 1：结构先行

优先级最高。

执行内容：

- 完成 `BottomPane` 统一收口
- 修复状态区与输入框贴近问题
- 修复 execution row 跳帧闪动

验收：

- 下半区成为稳定统一结构
- 主任务栏语义不再漂移
- 现有 Stage B 回归矩阵仍然成立

### 阶段 2：压缩内核化

结构稳定后推进。

执行内容：

- 下沉 Codex 风格摘要桥
- 引入 core `compact_prompt`
- 建立 compaction policy / summarizer / rebuilder 明确分层

验收：

- 不依赖扩展也能完成当前插件式摘要桥接效果
- compaction 行为由 core 正式解释清楚

### 阶段 3：中文化

在下半区结构与 compaction 入口稳定后推进。

执行内容：

- 抽离文案层
- 批量清理二级界面英文遗留

验收：

- 核心二级界面路径中无明显英文残留
- 文案统一且可维护

### 阶段 4：系统提示词治理

最后推进。

执行内容：

- 固定 prompt 分层
- 文档化主系统 prompt 与 compaction prompt 的职责边界

验收：

- 能清晰回答当前 turn 的 prompt 由哪些层组成
- compaction prompt 可独立配置和演进

## 后续需要拆出的子计划

本总计划确认后，应继续拆出至少四份子计划：

1. `BottomPane` 统一结构与闪动稳定性计划
2. compaction core 化与 `compact_prompt` 计划
3. TUI 二级界面中文化计划
4. 系统提示词治理计划

拆分标准：

- 每份子计划只解决一个独立主题
- 每份计划都能产生可验证的软件改动或文档治理结果
- 不再把四条主线重新塞回一个超长施工计划里

## 风险与约束

### 风险 1：现有专题计划与新总计划并存造成真源混乱

缓解：

- 新总计划只负责实施顺序与工作包边界
- 已有专题计划继续保留，但后续需逐步并入新的子计划体系

### 风险 2：压缩内核化与 prompt 治理互相阻塞

缓解：

- 先引入 core `compact_prompt` 入口，再做完整 prompt 治理
- 不要求一次性完成所有 prompt 分层收口

### 风险 3：中文化提前进入实现会放大返工

缓解：

- 先结构和 compaction，后统一文案抽离
- 中文化不应抢在底层结构重构前展开大范围修改

### 风险 4：再次回到扩展层主逻辑

缓解：

- 所有新设计默认优先 core-owned
- 扩展只保留覆盖、被动 UI 和项目级自定义能力

## 本计划完成条件

本总计划的完成，不是指代码已实现，而是指：

- 四条主线的边界、顺序、依赖关系和拆分方式已经明确
- 已经有对应的设计稿和总计划入口
- 后续实现可以按子计划推进，而不再需要重新讨论总方向

届时应同步更新：

- [ROADMAP.md](../../ROADMAP.md)
- [CAPABILITY_MATRIX.md](../../CAPABILITY_MATRIX.md)
- [FEATURE_OVERVIEW.md](../../FEATURE_OVERVIEW.md)

## 结论

下一阶段的正确推进方式不是“直接开做所有改动”，而是先把四条主线纳入统一实施框架。

具体顺序应固定为：

1. `BottomPane` 统一结构与闪动稳定性
2. compaction core 化与 `compact_prompt`
3. TUI 二级界面中文化
4. 系统提示词治理

其中前两项是主轴，后两项是围绕主轴收口的治理层。
