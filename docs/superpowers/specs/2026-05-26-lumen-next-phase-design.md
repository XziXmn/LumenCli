# Lumen 下一阶段设计稿

> 本文是下一阶段的正式规划设计稿，只定义目标、边界、分层与分阶段方案，不包含代码改动。

## 目标

为 Lumen 下一阶段工作产出正式规划，范围包含四条主线：

1. 重构 `interactive-mode` 下半区为统一容器，并纳入任务栏闪动稳定性修复
2. 将会话压缩内核化，综合 Codex、Claude 与 `oh-my-pi` 的优点，并优先采用 Codex 风格 `compact prompt`
3. 梳理 TUI 二级界面中文化范围
4. 梳理系统提示词治理边界

当前阶段只做规划与设计，不修改代码。

## 背景

Lumen 当前已经完成了大量基础收口，但这几条主线之间仍然处于“局部可用、整体边界尚未完全统一”的状态。

现状可以概括为：

- `interactive-mode` 已经具备任务栏、待发送消息区、输入框、底栏这些基本部件，但它们还没有被真正收口成一个统一的下半区系统。
- 会话压缩已经不是纯 Pi 原生形态，而是 `core` 负责切点和会话重建、`.lumen/extensions/codex-style-compaction.ts` 负责 Codex 风格摘要桥接的混合态。
- TUI 主线已经大量中文化，但大量二级界面仍然有英文遗留，尤其是 selector、login flow、compact / tree 相关提示。
- 系统提示词已经不是 Pi 原生直出，而是 Lumen 自己构建默认 prompt，再叠加项目上下文、skills 和扩展追加内容，但这几层边界还没有被正式治理。

因此，下一阶段的重点不是继续零散加能力，而是把“结构、压缩、文案、提示词”四条线统一成可长期维护的主线。

## 设计原则

### 1. 优先内核化，不再让关键行为长期依赖扩展补丁

影响主交互路径、历史重建、会话续跑、系统约束的能力，应优先进入 `core`，而不是继续挂在扩展层实现主逻辑。

适用范围：

- progress surface 主布局与生命周期
- compaction 生命周期与会话重建
- 系统提示词默认结构
- TUI 全局用户可见文案入口

### 2. 借鉴上游或参考实现时，要区分“架构优点”和“产品表象”

下一阶段需要同时参考：

- `oh-my-pi`
- 本地 `ClaudeCodeRev`
- 本地 `codex`
- `phistory` 的 prompt 快照

但它们提供的是不同层次的信息：

- `codex` 更适合借鉴 compaction 在 core 中的一等公民地位、`compact_prompt` 配置入口、历史重建边界
- `ClaudeCodeRev` 更适合借鉴摘要消息、preserved segment、attachments 恢复、partial compaction 结构
- `oh-my-pi` 更适合借鉴阈值策略与配置维度
- `phistory` 更适合补足最新系统提示词快照，而不是替代本地实现分析

### 3. 优先把“下半区”视为一个系统，而不是几块临时拼接的容器

用户当前已经直接感知到两个典型问题：

- 状态区和输入框贴得太近
- `@explore ... 55 uses · 26k tokens · 3m 29s` 这类 task 行偶发闪出一帧别的内容

这说明当前问题不是单个 spacer 或单个 loader 的问题，而是下半区还没有被视为一个稳定的单元系统。

### 4. 中文化要做成“统一文案层”，而不是继续边做边翻

如果继续在各组件里零散替换英文，会导致：

- 文案不统一
- 同义词反复出现
- 后续新增功能时又回到英文默认值

因此中文化必须配合统一文案表一起做。

### 5. 系统提示词治理必须和压缩提示词治理分开

主会话系统提示词和 compaction 摘要提示词承担的是两种不同职责：

- 主系统提示词：定义默认行为、语气、规则、工具使用方式
- compaction 提示词：定义历史压缩时如何保真、如何续跑、如何保留最近用户意图

这两者不能再混在“追加一段 prompt”式的弱治理结构里。

## 当前状态诊断

### A. interactive-mode 下半区

当前主布局中：

- `chatContainer` 负责正文
- `promptAreaContainer` 挂着 `statusContainer + pendingMessagesContainer`
- `interactionAreaContainer` 挂着 `editorContainer + extensionAreaContainer + footer`

这意味着状态区和输入区虽然在视觉上都位于“正文下方”，但在结构上仍然是两个分裂的区域。

直接后果：

- 状态区和输入框之间缺少稳定的层级边界
- loader、taskbar、pending、footer 的刷新来源不统一
- 某些状态变化会让用户感知为“跳帧”而不是“局部刷新”

### B. 会话压缩

Lumen 当前压缩已经进入“两层实现”状态：

- `core` 负责：
  - token 估算
  - cut point
  - split turn
  - compaction entry 落盘
  - session context 重建
- `.lumen/extensions/codex-style-compaction.ts` 负责：
  - Codex 风格结构化摘要
  - recent user bridge
  - replacement messages
  - summary placement = `after-kept`

这已经证明当前方向是可行的，但问题是：

- 主行为不在 `core`
- 远期难以形成正式 compaction API
- 插件和内核职责边界不够稳定

### C. TUI 二级界面中文化

当前 slash command 描述大部分已经是中文，但仍有大量二级界面英文遗留，主要集中在：

- model selector
- OAuth/login selector
- login dialog
- session / hotkeys / changelog
- compact / tree / branch summary
- 各类 `Yes / No / No models available / No providers available / What's New / Keyboard Shortcuts`

这说明中文化已经不是“缺少一两个翻译”，而是进入了“要不要建立正式文案层”的阶段。

### D. 系统提示词

当前系统提示词并不是 Pi 原生 prompt，而是 Lumen 自己的默认系统提示词构造器：

- 默认身份描述
- 工具列表
- 文档入口
- 中文规则
- 项目上下文
- skills 注入
- 扩展追加 prompt

这意味着 Lumen 已经事实拥有自己的 prompt 层，但目前还没有正式的分层治理说明。

## 参考实现结论

### 1. `oh-my-pi`

可借鉴点：

- 主状态收进 editor top border 的思想
- compaction 策略配置：
  - `context-full`
  - `handoff`
  - `off`
- `thresholdPercent / thresholdTokens`
- `effectiveReserveTokens`
- tokenizer 级 token 估算

不直接照搬的点：

- 主任务栏不应回退成 top border 主导
- 不能让主动进度语义再次散回 editor border / status line

### 2. 本地 `ClaudeCodeRev`

可借鉴点：

- `boundaryMarker + summaryMessages + messagesToKeep + attachments + hookResults`
- `prefix-preserving / suffix-preserving`
- compaction 后重新注入工具、MCP、agent、plan 等上下文附件
- `getCompactPrompt()` / `getPartialCompactPrompt()` 这种正式 prompt 入口

不直接照搬的点：

- 其 prompt 风格和摘要结构是 Claude 风格，不应直接作为最终默认 prompt 语气
- 某些为远端会话、session-memory、Ant 内部环境设计的特殊逻辑不一定适合全部移植

### 3. 本地 `codex`

确认过的关键点：

- compaction 是 core 正式能力，不是 UI 补丁
- `compact_prompt` 是正式配置项
- `experimental_compact_prompt_file` 可从文件载入
- 本地 inline compaction 会让模型在 compact turn 中生成 summary
- 远端 compaction 走 `/responses/compact`
- 历史重建由 `core` 显式负责

设计上最值得借鉴的是：

- `compact_prompt` 作为正式配置和上下文属性存在
- compaction 生命周期由 core 管理
- 历史重建、initial context re-injection、stale developer instructions 过滤都归 core

### 4. `phistory`

`phistory` 的价值是：

- 它不是实现仓库，而是 prompt 快照仓库
- 可以用于校准最新 `Codex CLI` / `Claude Code` 的系统提示词风格
- 不适合替代本地实现分析

在本阶段的作用应限定为：

- 校准默认 prompt 的语气和规则取向
- 校准 compact prompt 的高层目标

## 方案对比

### 方案 A：维持当前结构，只做局部补丁

做法：

- 在状态区和输入框之间补 spacer
- 对 progress surface 增加去抖
- 保持 compaction 仍以插件为主
- 继续零散翻译英文文案

优点：

- 风险低
- 改动分散、单次提交轻

缺点：

- 无法解决下半区的结构性问题
- compaction 继续停留在“半内核半插件”状态
- 中文化和 prompt 治理会继续分散

结论：

不推荐作为本阶段主方案，只能作为临时缓解手段。

### 方案 B：统一 BottomPane + compaction 内核化 + 文案层抽离

做法：

- 重做 interactive-mode 下半区结构
- 把 compaction 主逻辑下沉进 core
- 建立统一文案层
- 同时把主系统 prompt 和 compact prompt 做正式分层

优点：

- 能一次性解决四条主线的结构问题
- 与当前长期目标一致
- 后续易于继续演化

缺点：

- 设计和实现跨度较大
- 需要明确阶段顺序，避免一次性过度施工

结论：

推荐作为主方案。

### 方案 C：完全回到 `oh-my-pi` 式 top border 状态模型

做法：

- 主状态和任务栏都收进 editor top border
- 下半区只保留输入框和 footer

优点：

- 与 `oh-my-pi` 的局部现成经验一致

缺点：

- 与 Lumen 当前“任务栏为唯一主动进度面”的方向冲突
- 不利于后续复杂 task/todo/queued command 展示

结论：

不推荐作为主方案，只保留其“被动状态可进 top border”的局部思想。

## 推荐设计

推荐采用 **方案 B**，并吸收 `oh-my-pi`、Claude、Codex 的局部优点。

### 一、下半区结构

将当前：

- `promptAreaContainer`
- `interactionAreaContainer`

重构为一个统一的 `BottomPane` 抽象。

推荐子层级：

- `TaskbarRow`
  - 唯一主动进度面
  - 显示 headline / execution / plan / retry / reconnect / approval / input banner
- `PendingRow`
  - 待发送消息区
  - 只显示 queued / follow-up / steer 的待发内容
- `ComposerFrame`
  - 输入框主体
  - 只处理编辑、IME、selector replacement
- `ExtensionRow`
  - 扩展 widget / lower extension area
- `PassiveFooter`
  - cwd / branch / model / token / compat 等被动状态

额外原则：

- 主动任务进度绝不回落到 footer
- top border 只允许承载被动状态或极轻量 contextual badge
- `@explore ...` 这类 execution row 在一个任务生命周期内必须稳定展示，不允许候选字符串跳帧

### 二、compaction 内核化

目标是把当前插件式 Codex 摘要桥，升级为正式 core compaction 子系统。

推荐分层：

- `CompactionPolicy`
  - `context-full / handoff / off`
  - `thresholdPercent / thresholdTokens`
  - `reserveTokens / keepRecentTokens`
- `CompactionPromptProvider`
  - 默认 `compact_prompt`
  - 文件覆盖 / 设置覆盖
- `CompactionSummarizer`
  - full compact
  - partial compact
  - prefix-preserving / suffix-preserving
- `CompactionHistoryRebuilder`
  - boundary marker
  - summary messages
  - kept messages
  - attachments reinjection
  - previous summary / replacement history / recent user bridge

prompt 策略：

- 默认语气和结构目标优先对齐 Codex
- 若需直接落地模板细节，则借本地 Claude 的完整 prompt 设计
- 保持 `compact_prompt` 为 core 正式配置项

### 三、中文化

建立统一 `tuiStrings` 或等价文案层，至少覆盖：

- dialog titles
- selector titles
- empty state / warning / progress messages
- compact / branch summary / login / model / session / changelog / hotkeys
- approval / input / retry / reconnect 的面向用户文案

原则：

- 用户可见文案不再散落在组件内部直接写死
- 先完成抽离，再做统一翻译

### 四、系统提示词治理

正式拆分以下几层：

- `default system prompt`
- `mode/personality/agent overlays`
- `project context`
- `skills/rules/prompts injections`
- `extension appendSystemPrompt`
- `compact_prompt`

治理目标：

- 主会话 prompt 与 compaction prompt 明确分治
- 避免 extension append 和 compact prompt 互相污染
- 允许未来对 Codex 风格默认 prompt 和中文风格规则分别演化

## 分阶段实施建议

### Phase 1：BottomPane 结构收口

范围：

- 统一下半区结构
- 修复状态区/输入框贴近问题
- 修复 execution row 闪动问题

验收：

- 任务栏、待发送区、输入框、footer 成为同一容器中的稳定层
- `@explore ... uses/tokens/duration` 行无明显跳帧

### Phase 2：Compaction core 化

范围：

- 下沉当前 `codex-style-compaction` 主逻辑到 core
- 引入 `compact_prompt` 正式入口
- 建立 compaction 生命周期对象模型

验收：

- 不依赖扩展即可完成 Codex 风格摘要桥
- session rebuild 逻辑由 core 正式负责

### Phase 3：Compaction 策略增强

范围：

- 加入 `context-full / handoff / off`
- 加入阈值配置
- 引入 tokenizer 估算
- 评估远端 compact endpoint 预留

验收：

- compaction 策略可配置，不再只有单一路径

### Phase 4：TUI 中文化

范围：

- 抽离文案
- 系统化翻译用户可见二级界面

验收：

- 主交互链路中不再有明显英文遗留

### Phase 5：系统提示词治理

范围：

- 主系统 prompt / compact prompt / extension append 边界固定
- 更新文档与配置说明

验收：

- 可以清晰解释任一会话在当前 turn 中实际使用了哪些 prompt 层

## 风险与取舍

### 风险 1：一次性改动过多

缓解：

- 分阶段推进
- 先结构、再 compaction、再中文化、最后 prompt 治理

### 风险 2：compaction 内核化后回归面变大

缓解：

- 保留当前插件行为作为对照参考
- 在 core 化时补回归测试矩阵

### 风险 3：中英文文案与 prompt 规则互相牵连

缓解：

- 明确“用户可见文案”与“模型可见 prompt”是两套治理对象

### 风险 4：过度追求 Claude 或 Codex 单方一致性

缓解：

- Lumen 只借其优点，不做完整复制
- 以当前 Lumen 的主目标为判断标准：
  - runtime 稳定
  - 中文体验统一
  - 下半区结构清晰
  - compaction 可长期维护

## 本阶段不做

以下内容不属于本阶段：

- 直接改动实现代码
- 恢复或扩张写作专属产品线
- 做完整 delegate/orchestrator 外部 worker 系统
- 做全面 UI 重设计
- 把所有历史英文文案一次性翻完

## 结论

下一阶段应当以“统一底部交互结构 + compaction 内核化”为主轴，其它工作围绕这两条主线服务。

具体来说：

- `interactive-mode` 下半区必须从分裂容器演进为统一 `BottomPane`
- 会话压缩必须从“core + 插件混合实现”演进为正式 core 子系统
- `compact_prompt` 应当像 Codex 一样成为正式配置与上下文能力
- 中文化和系统提示词治理应作为配套收口，而不是继续零散推进

这条路线既能延续当前 Lumen 已有成果，也能为后续 runtime/adapter 化提供更稳定的基础。
