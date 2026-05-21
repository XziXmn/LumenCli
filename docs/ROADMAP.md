# Lumen Roadmap

## 项目定位

Lumen 是一个以 Pi 为运行时底座、以中文化和 coding workflow 深度定制为特色的终端 coding agent fork。

它当前不是一套完全独立重写的新系统，而是一个 **Pi-powered fork**：

- 运行时、会话、工具与大量基础能力继续复用 Pi 主线
- Lumen 在其上叠加自己的中文化、工具链、交互面、任务流与本地工作流习惯
- 对外目标不是“尽快摆脱 Pi”，而是“在尽量少引入上游合并冲突的前提下，持续把 Lumen 做成更顺手的个人/团队 coding agent”

这里有一个必须反复强调的硬约束：

- `.lumen/` 是主配置面
- `.pi/` fallback 兼容层必须保留

`.pi/` 不是临时脏目录，也不是单纯历史债务。它承担社区插件、旧提示词、旧工作流资产的兼容责任。后续任何规划、重构或目录整理，都不能以破坏 `.pi/` 插件兼容为代价。

## 当前状态

### 已经稳定落地的能力

Lumen 当前已经不是一个“只有皮肤替换”的轻量 fork，而是具备了一批实质性的 coding workflow 增强：

- 结构化 `todo` / `askuser` / `task` 工具
- hashline、snapshot、apply_patch、repo clone / overview、code search 等执行工具
- LSP、Config Discovery、memory pipeline、PowerShell 等能力层扩展
- 面向 Claude 风格的 interactive TUI 主线改造

### 当前主线

当前最核心的进行中主线仍然是 **Stage B — Interactive Surface**，也就是：

- 把输入框上方任务栏收口为唯一主动进度面
- 让 headline / execution / plan / queue / transcript / footer 分层清晰
- 对齐 Claude 风格工作流，但尽量把改动集中在 `interactive-mode` 主线内，减少上游冲突

### 当前最主要的工程风险

当前最大的风险不是“缺少功能”，而是“功能、历史规划和现行真源之间的关系不够清晰”。具体表现为：

1. 很多能力已经做完，但总规划入口没有完整反映
2. 旧 Phase 文档仍然承载了一部分真实信息，容易和现行计划冲突
3. TUI 主线已重构，但相关规划入口还停留在旧的分散状态

因此，本次路线图重构的首要目标不是新增功能，而是先把“项目要往哪走、哪些能力已经有、哪些能力还待推进”重新讲清楚。

## 规划原则

### 1. 优先维护 Pi-powered 主线，而不是追求形式上的独立

Lumen 的短中期策略是继续以 Pi 为底座演进。只有当某条能力在 Pi 结构中已经明显无法承载，或者兼容成本超过收益时，才考虑局部分叉更深。

### 2. 优先把 UI 重构收口到 core 主线

涉及 active progress、布局所有权、生命周期控制的内容，优先放到 `interactive-mode` 核心实现中，不再把主任务栏所有权长期放在扩展层。

### 3. 保留兼容层，但避免兼容层反客为主

`.pi/` fallback 要长期保留，但新功能默认以 `.lumen/` 为主落点。兼容层的职责是“让旧资产继续可用”，不是“继续把所有新能力设计成 Pi-first”。

### 4. 规划要服务执行，不再制造第二套历史

`ROADMAP` 负责总路线，`CAPABILITY_MATRIX` 负责能力账本，`plans/` 负责专题施工图。以后新增文档时，必须先判断它属于哪一层，避免重新长出一堆平级规划文档。

### 5. 尽量降低上游合并冲突

凡是会显著扩大上游冲突面的改动，都要优先评估是否能收口到现有主线结构中解决。尤其是：

- interactive UI
- 扩展 API
- 共享 contract / shared types
- 根配置和文档真源

## 阶段路线

下面的 Stage 不是历史时间线，而是能力导向的长期路线图。它们可以并行推进，但始终有主次优先级。

### Stage A — Runtime & Compatibility

这一阶段关注的是 Lumen 的“存在方式”是否稳定：品牌、配置目录、兼容层、运行时习惯、上游同步策略是否清晰。

它解决的问题不是用户界面，而是“这个 fork 到底怎么活下去”。如果这一层不稳定，后面再多的工具和 UI 增强都会持续制造维护成本。

本阶段包含：

- `.lumen/` 主配置目录
- `.pi/` fallback 兼容
- 中文化默认体验
- 自定义 manifest 与上游同步策略
- 文档真源与规划治理

本阶段不包含：

- Claude 风格界面细节微调
- 新工具的大规模扩张
- delegate/orchestrator 这类更重的执行系统

完成标准：

- 新增能力都明确其落点是 `.lumen/` 主面还是 `.pi/` 兼容面
- 上游同步策略清晰、不会误推 upstream
- 目录与文档入口足够稳定，新人能快速判断真源

### Stage B — Interactive Surface

这一阶段关注会话交互本身，也就是用户每天最直接看到的部分。

它解决的问题是：Lumen 的 progress surface、transcript、queued input、approval / retry / reconnect 等行为是否形成一套统一工作流，而不是一堆局部 UI 补丁。

本阶段包含：

- core-owned progress surface
- headline / execution / plan / queue 分层
- transcript 的 tool/task/todo 语义压缩
- queued command 的独立展示
- approval / input / retry / reconnect / completion teardown
- TUI 回归清单与行为矩阵

当前这是 Lumen 的最高优先级主线。

完成标准：

- 输入框上方任务栏成为唯一主动进度面
- footer 不再重复主进度语义
- completion 后任务栏可靠消失
- 高复杂场景都能通过回归验证

### Stage C — Workflow Tools

这一阶段关注“让 agent 真正更好用”的具体工具链。

它不是单纯追求工具数量，而是让常见编码操作更安全、更高效、更少 token 浪费。

本阶段包含：

- hashline
- snapshot / restore / diff
- apply_patch
- repo clone / overview
- code search
- WebSearch / WebFetch
- PowerShell
- Snip / Brief
- Notebook Tool
- Sensitive File Protection

完成标准：

- 高频编码/审查/外部仓库读取动作都有稳定工具支撑
- 工具结果在 transcript 和 progress surface 上的呈现一致
- 高风险文件和大结果输出有稳定保护

### Stage D — Context & Memory

这一阶段关注 agent “知道什么、记住什么、何时注入什么”。

它解决的是上下文工程，而不是具体工具。Lumen 在这层已经有不少基础能力，但还没有完全收成一套统一体系。

本阶段包含：

- TTSR
- Config Discovery
- memory summary / lesson / 2-phase pipeline
- skills / prompts / rules 条件化注入
- `.novel` 场景上下文

本阶段的关键不是继续堆更多注入源，而是避免注入机制互相重叠、难以维护。

完成标准：

- context 注入路径可以被解释清楚
- memory 与 rules 不再是彼此孤立的“补丁模块”
- 新增上下文能力时，知道该放在规则、记忆还是配置发现里

### Stage E — Agentic Execution

这一阶段关注更复杂的执行编排能力，也就是从“单轮工具调用”进化到“更像一个协作系统”。

它要解决的问题是：主线程、子代理、后台任务、会话分支、实时 steer、审批反馈这些能力，能不能形成一致执行模型。

本阶段包含：

- `task` / built-in agents
- background flow
- worktree isolation
- agent messaging
- Steer Input
- Approval Runtime
- Session Fork / Undo
- Hooks
- 更长线的 delegate / orchestrator worker 路线

完成标准：

- 当前 `task` 主线稳定，并能继续扩展
- 多代理与后台流转不再依赖脆弱的 UI 假设
- 是否引入外部 delegate worker 有清晰边界，不和当前 task 主线混淆

### Stage F — Model & Ecosystem

这一阶段关注模型选择、能力路由和生态兼容。

它解决的问题不是“能不能切模型”，而是“不同能力该用什么模型、什么时候需要和其他生态做更深兼容”。

本阶段包含：

- model registry / selector 的长期演化
- Model Preset / Routing
- vision fallback
- Claude 生态 drop-in 兼容
- delegate worker 相关的模型/生态选择

当前这部分不是最紧迫主线，但仍然值得在总路线图里保留，否则以后很容易被忘掉或反复重开旧讨论。

完成标准：

- 模型能力槽位和用户体验足够清晰
- preset/routing 若要推进，有明确收益，不再停留在概念层
- Claude / Cursor / Codex 等生态兼容不再只是零散适配

### Stage G — Governance & Upstream

这一阶段关注“怎么长期维护这套 fork”。

它解决的问题是：验证门禁、文档治理、回归清单、上游 intake、merge 冲突处理，能不能形成稳定流程，而不是每次靠临场记忆。

本阶段包含：

- `npm run check` / 定向 vitest / `lumen-test` 验证门禁
- TUI progress regression checklist
- 规划文档治理
- customization manifest
- upstream merge / intake 策略

完成标准：

- 新功能进入主线前有清晰验证路径
- 新规划文档不会再次失控增殖
- 上游同步不会破坏 Lumen 已有能力与 `.pi/` 兼容层

## 近期焦点

当前近期焦点集中在两个主题：

1. **Stage B — Interactive Surface**
   - 核心任务栏与 Claude 风格进度工作流继续收口
   - 详见：
     - [superpowers/plans/2026-05-20-core-progress-surface-plan.md](superpowers/plans/2026-05-20-core-progress-surface-plan.md)
     - [superpowers/plans/2026-05-20-claude-aligned-progress-workflow-plan.md](superpowers/plans/2026-05-20-claude-aligned-progress-workflow-plan.md)

2. **规划真源收口**
   - 用本次 `ROADMAP + CAPABILITY_MATRIX + PLANNING_RULES` 体系替换旧的分散入口
   - 让历史规划继续可追溯，但不再与当前主线竞争

## 中长期方向

以下方向值得保留，但当前不作为最高优先级：

### 1. Delegate / Orchestrator 路线

旧规划中存在较完整的外部 worker / delegate 设想，包括 codex、claude、local worker 以及 isolation workspace。  
这条路线仍有价值，但必须先和当前 `task` 主线做边界切分，不能在没有统一执行模型的前提下贸然推进。

### 2. Model Preset / Routing

模型 preset 与能力路由在早期文档里有完整构想，目前并未真正成为主线。  
后续如果本地模型、云模型、视觉模型混用成为高频需求，这条路线会重新升优先级。

### 3. Claude 生态更深兼容

当前已经有一定的配置发现与样式对齐，但“Claude 生态 drop-in”还远没有到完整阶段。  
后续可继续评估 skills / prompts / commands / workflow 兼容是否值得提升。

### 4. 更强的长期记忆与自我迭代

记忆系统已经有两阶段抽取/整合基础，但还没有发展成真正的长期知识系统。  
自我迭代、自我修正规则、跨 session 能力演进等方向仍然存在，但当前属于远期项。

## 不做与暂缓

### 明确不再作为当前主线

- 扩展层拥有主任务栏布局与生命周期
- 旧的历史 Phase 编号体系
- 把 `.pi/` 兼容层当成待删除目标

### 当前暂缓

- Notebook Tool
- Model Preset / Routing 的全面恢复
- 外部 delegate / orchestrator worker 的工程化推进
- Rust helper 路线
- 更大范围的 UI 框架重写

暂缓不代表永远放弃，而是当前收益/风险比还不够高，或者前置主线尚未收口。

## 规划入口

先看这里：

- [CAPABILITY_MATRIX.md](CAPABILITY_MATRIX.md)
- [PLANNING_RULES.md](PLANNING_RULES.md)

当前活跃专题计划：

- [superpowers/plans/2026-05-20-core-progress-surface-plan.md](superpowers/plans/2026-05-20-core-progress-surface-plan.md)
- [superpowers/plans/2026-05-20-claude-aligned-progress-workflow-plan.md](superpowers/plans/2026-05-20-claude-aligned-progress-workflow-plan.md)

当前交互分析与样式规范：

- [output-flow-rebuild.md](output-flow-rebuild.md)
- [claude-output-style.md](claude-output-style.md)
- [claude-tool-call-style.md](claude-tool-call-style.md)
- [status-region-vs-claude.md](status-region-vs-claude.md)

历史规划来源：

- [archive/fork-bootstrap/requirements.md](archive/fork-bootstrap/requirements.md)
- [archive/fork-bootstrap/tasks.md](archive/fork-bootstrap/tasks.md)
- [archive/lumen-archive/Docs/](archive/lumen-archive/Docs/)
