# Lumen Capability Matrix

## 说明

本文件是 Lumen 的能力账本，用来回答两个问题：

1. 这个项目到底已经有什么能力
2. 哪些能力还在推进、暂缓、放弃，为什么

状态定义：

- `已完成`：主能力已可用，但不排除后续增强
- `进行中`：已经进入当前主线，仍在收口
- `已规划`：在总路线图中保留，尚未进入当前主线
- `暂缓`：有价值，但当前优先级不足
- `已放弃`：明确不再作为当前路线

## Runtime 与兼容层

| 能力项 | 状态 | 落点 | 能力说明 | 当前现状 | 来源 | 下一动作 / 风险约束 |
|---|---|---|---|---|---|---|
| `.lumen/` 主配置目录 | 已完成 | compatibility | 以 `.lumen/` 作为项目级与用户级主配置面 | 已成为当前主路径 | manifest, fork-bootstrap/tasks | 继续保持为新能力默认落点 |
| `.lumen/` 迁移来源 | 已完成 | compatibility | 旧插件、旧 prompts、旧 rules 的一次性迁移来源 | 当前只作为导入来源保留 | manifest, README, 当前用户约束 | 不得因目录整理或重构破坏导入/迁移链路 |
| 中文化默认体验 | 已完成 | core | CLI、system prompt、slash 描述、欢迎语默认中文化 | 已融入主线 | manifest | 后续随上游变更做局部维护 |
| upstream 同步纪律 | 已完成 | docs-process | 明确 `upstream` 只拉不推，`origin` 才推送 | README 与当前操作规则已收口 | README, manifest | 继续把此约束写进规划与流程文档 |
| 规划真源治理 | 进行中 | docs-process | 收口总规划、能力矩阵、专题计划和 archive 的关系 | 本次重构正在建立新体系 | 当前文档重构 | 后续要防止重新长出平级规划文档 |

## 交互界面与会话流

| 能力项 | 状态 | 落点 | 能力说明 | 当前现状 | 来源 | 下一动作 / 风险约束 |
|---|---|---|---|---|---|---|
| core-owned progress surface | 进行中 | core | 输入框上方任务栏作为唯一主动进度面 | 主骨架已落地，仍在精修 | superpowers/plans, 当前主线 commits | 继续完善 teardown、复杂场景和执行树 |
| Claude-aligned workflow layering | 进行中 | core | 将 headline / execution / plan / queue / transcript 分层对齐 Claude | 已有专题计划和实现基础 | superpowers/plans | 避免为了样式继续扩大冲突面 |
| BottomPane 统一下半区结构 | 已规划 | core | 将当前分裂的状态区与输入区收口为统一下半区容器，并固定 `Taskbar / Pending / Composer / Extension / Footer` 五层 | 已有正式设计稿、总计划和专项子计划，尚未进入实现 | 2026-05-26 next-phase 设计与计划 | 下一步按子计划推进结构收口，并同时解决状态区贴近和任务栏闪动 |
| queue 独立展示槽位 | 进行中 | core | 待发送命令放在输入框上方，不污染 headline 语义 | 已从任务栏下方分离 | superpowers/plans, recent taskbar work | 继续验证 queued / steer / follow-up 语义 |
| approval / input / retry / reconnect 统一状态语义 | 进行中 | core | 把审批、用户输入、自动重试、流恢复都纳入统一 progress 语义 | 已进入当前验证矩阵，但仍需补齐 | superpowers/plans | 必须靠测试和 smoke 验证，不靠目测 |
| completion teardown | 进行中 | core | 会话完成后任务栏可靠消失 | 近期已修多轮，仍是重点回归项 | recent commits, regression checklist | 继续列为高优先级回归行为 |
| Steer Input | 已规划 | core | 运行中向 agent 注入用户消息或 follow-up | 仍停留在计划层 | fork-bootstrap/tasks | 依赖 Wire / execution flow 收口 |
| Background auto-trigger | 已规划 | core | 后台任务完成后自动触发主线程后续处理 | 仍在规划中 | fork-bootstrap/tasks | 依赖通知与后台状态模型统一 |
| Session Fork / Undo | 已规划 | core | 基于历史 turn 分支出新会话 | 仍未进入当前主线 | fork-bootstrap/tasks | 适合等 execution 与 session 模型更稳后推进 |

## 工作流工具链

| 能力项 | 状态 | 落点 | 能力说明 | 当前现状 | 来源 | 下一动作 / 风险约束 |
|---|---|---|---|---|---|---|
| Hashline | 已完成 | core | 以内容哈希锚点提升编辑定位稳定性 | 已上线可用 | fork-bootstrap/tasks, deep-analysis | 后续可评估算法兼容层 |
| Todo Tool | 已完成 | core | 在会话内维护结构化任务列表，并与当前进度流协同 | 已上线且已进入当前交互主线 | fork-bootstrap/tasks, lumen-todo-design | 后续继续保持“状态栏主导、正文极简痕迹”的方向 |
| AskUser Tool | 已完成 | core | 提供结构化单选、多选、确认和文本提问能力 | 已上线可用 | fork-bootstrap/tasks | 后续重点是和 approval / input 主线保持一致语义 |
| LSP Tool | 已完成 | core | 提供 diagnostics、definition、references、rename 等语言服务能力 | 已完成完整 LSP 3.17 链路 | fork-bootstrap/tasks | 后续主要是稳定性、覆盖面和交互体验维护 |
| Snapshot / Checkpoint | 已完成 | core | 通过快照支持恢复、diff 与编辑前保护 | 已上线 | fork-bootstrap/tasks | 可继续增强自动回滚体验 |
| Apply Patch | 已完成 | core | 支持标准 patch 文本批量修改文件 | 已上线 | fork-bootstrap/tasks | 与 snapshot 协同已存在，后续关注错误回滚 |
| Repo Clone / Overview | 已完成 | core | 克隆外部仓库并生成概览 | 已上线 | fork-bootstrap/tasks | 后续按需增强缓存与摘要质量 |
| Code Search | 已完成 | core | 通过 GitHub code search 查询外部代码 | 已上线 | fork-bootstrap/tasks | 主要关注配额和失败回退体验 |
| WebSearch / WebFetch | 已完成 | core | 提供联网检索与抓取能力 | 已上线 | fork-bootstrap/tasks | 继续控制结果截断和缓存 |
| Commit Tool | 已完成 | core | 辅助生成和执行更整洁的 commit 流程 | 已存在于能力规划与当前仓库工作流中 | fork-bootstrap/tasks, design | 后续主要是和当前 git 规则保持一致 |
| Secrets Redaction | 已完成 | core | 对输出中的 token、key、敏感文本做自动遮蔽 | 已上线 | fork-bootstrap/tasks | 后续与 Sensitive File Protection 形成输入/输出双保险 |
| PowerShell Tool | 已完成 | core | Windows 下使用原生 PowerShell 工具链 | 已上线 | fork-bootstrap/tasks | 继续保证与 Bash/Windows shell 语义协调 |
| Snip / Brief | 已完成 | core | 对长输出做截断或摘要 | 已上线 | fork-bootstrap/tasks | 后续主要看 transcript 体验 |
| Notebook Tool | 暂缓 | core | 提供 Jupyter / cell 级编辑能力 | 仅保留占位 | fork-bootstrap/tasks | 当前收益不如交互主线与安全工具 |
| Sensitive File Protection | 已规划 | core | 从工具输入侧拦截敏感文件访问 | 尚未实现 | fork-bootstrap/tasks | 与现有 secrets redaction 是互补，不是替代 |

## Agent 与编排能力

| 能力项 | 状态 | 落点 | 能力说明 | 当前现状 | 来源 | 下一动作 / 风险约束 |
|---|---|---|---|---|---|---|
| `task` 同进程子代理模型 | 已完成 | core | 用单工具承载子代理执行与结果聚合 | 已是当前主线实现 | fork-bootstrap/tasks, subagent-redesign | 后续继续完善 UI、并行语义和执行树 |
| built-in agents | 已完成 | core | 提供 explore / plan / worker / reviewer 等内建角色 | 已可用 | fork-bootstrap/tasks | 继续校准定位与 prompt |
| Wire / event transport foundation | 进行中 | core | 为交互流、后台流和 steer / notification 提供事件传输基础 | 已完成基础事件层，但相关能力仍在吃这条链路 | fork-bootstrap/tasks | 后续随 Steer Input、Background auto-trigger、Approval Runtime 一起完善 |
| worktree isolation | 已完成 | core | 为更安全的执行隔离提供工作树支持 | 已可用 | fork-bootstrap/tasks | 后续结合更复杂 agent flow 再增强 |
| background agent flow | 已完成 | core | 支持后台执行与状态回传 | 已实现基础链路 | fork-bootstrap/tasks | 继续和 progress surface 对齐 |
| agent messaging | 已完成 | core | 支持向运行中的 agent 发送 steering 消息 | 已实现基础链路 | fork-bootstrap/tasks | 后续与 Steer Input 统一语义 |
| per-agent memory | 已完成 | core | 为不同 agent 类型维持相对独立的记忆上下文 | 已完成基础链路 | fork-bootstrap/tasks | 后续和长期记忆路线协同演进 |
| Approval Runtime | 已规划 | core | 统一前台工具审批与后台执行审批 | 仍在规划 | fork-bootstrap/tasks | 必须与交互主线同步设计，不能孤立推进 |
| Hooks 系统 | 已规划 | core | 声明式生命周期钩子 | 仍在规划 | fork-bootstrap/tasks, lumen-archive reports | 要先明确和现有 extension hooks 的边界 |
| delegate / orchestrator worker 路线 | 已规划 | core | 使用外部 codex / claude / local worker 执行更复杂任务 | 仅存在于旧规划与长期方向 | fork-bootstrap/requirements, lumen-archive migration plan | 先厘清与当前 `task` 主线的边界，避免双路线竞争 |

## 记忆、规则与上下文系统

| 能力项 | 状态 | 落点 | 能力说明 | 当前现状 | 来源 | 下一动作 / 风险约束 |
|---|---|---|---|---|---|---|
| TTSR | 已完成 | core | 按需触发规则注入，降低常驻上下文成本 | 已上线 | fork-bootstrap/tasks, deep-analysis | 后续需和 Config Discovery / skills 统一边界 |
| Config Discovery | 已完成 | compatibility | 兼容发现 Claude / Cursor / MCP 等外部配置 | 已上线 | fork-bootstrap/tasks | 必须继续保持低优先级加载与 native 优先 |
| Memory summary / lesson | 已完成 | core | 会话结束提取摘要与 lesson 进入 memory | 已上线 | fork-bootstrap/tasks | 继续优化 relevance 与噪声控制 |
| Memory pipeline 2-phase | 已完成 | core | 先抽取再全局整合的记忆管线 | 已上线 | fork-bootstrap/tasks, reference policy | 后续重点是质量和长期维护成本 |
| Compaction core 化 | 已规划 | core | 将当前 `core + codex-style-compaction` 混合态演进为正式 compaction 子系统，统一 policy / prompt / summarizer / history rebuilder | 已有正式设计稿、总计划与子计划，当前仍以插件桥接为主 | 2026-05-26 next-phase 设计与计划 | 下一步将 `compact_prompt`、摘要桥和历史重建边界收口进 core |
| `.novel` 场景上下文 | 已完成 | compatibility | 针对写作/小说项目注入特定上下文 | 已存在 | manifest, early Lumen design | 后续看是否需要和 rules / prompts 统一管理 |
| 写作工作流命令包（旧 `lumen-writing`） | 已放弃 | compatibility | 早期曾有独立写作命令包路线 | 现已不再作为独立核心能力保留 | deprecated-core archive, old design | 只保留其中有价值的上下文/场景能力，不恢复旧文件形态 |
| 条件化 instruction 统一体系 | 暂缓 | docs-process | 把 TTSR、Config Discovery、skills、rules 统一成更清晰的注入体系 | 只有分析结论，未正式立项 | deep-analysis | 先等当前文档真源和主交互面收口 |
| 更强长期记忆系统 | 已规划 | core | 向更稳定的长期知识与跨 session 记忆演进 | 有旧方向，无当前执行计划 | lumen-archive specs, roadmap long-term | 不是当前优先级，但不能从路线图消失 |

## 模型与生态路由

| 能力项 | 状态 | 落点 | 能力说明 | 当前现状 | 来源 | 下一动作 / 风险约束 |
|---|---|---|---|---|---|---|
| 当前 model registry / selector | 已完成 | core | 提供基本模型选择、provider 注册与运行时解析 | 已稳定存在 | existing code, fork-bootstrap/tasks | 持续随 provider 演进维护 |
| 本地 MiMo 默认工作流 | 已完成 | compatibility | 面向本地推理服务的默认模型配置和说明 | 已有文档与默认配置 | README, docs/models, installation | 后续和更广模型策略区分开 |
| Codex 风格 `compact_prompt` 治理 | 已规划 | core | 将压缩提示词提升为正式配置与上下文能力，并优先对齐 Codex 风格 | 已确认 Codex 本地实现存在 `compact_prompt` 配置入口，Lumen 侧已有正式设计与子计划 | codex core source, 2026-05-26 next-phase docs | 下一步在 compaction core 化时引入默认 prompt、覆盖与文件入口 |
| Model Preset / Routing | 暂缓 | core | 让不同能力自动路由到不同模型 | 旧规划里较完整，但当前未重新立项 | fork-bootstrap/requirements, lumen-archive model spec | 当前不是主线，保留为中长期方向 |
| vision fallback / capability routing | 暂缓 | core | 为视觉、多能力模型做自动降级或路由 | 有概念层方案 | model preset spec | 等模型使用场景更复杂时再升优先级 |
| Claude 生态 drop-in | 已规划 | compatibility | 更深层兼容 Claude 生态中的 prompts / skills / commands 习惯 | 当前只做到部分兼容 | lumen-archive reference policy | 保留规划，但不应破坏当前 Lumen 主权 |
| 自我迭代 / self-evolution | 暂缓 | core | 让系统积累规则、经验并反哺后续执行 | 仅保留为长期方向 | lumen-archive phase1 blueprint | 当前没有足够稳定的执行与记忆基础支撑它升优先级 |

## 工程治理与上游维护

| 能力项 | 状态 | 落点 | 能力说明 | 当前现状 | 来源 | 下一动作 / 风险约束 |
|---|---|---|---|---|---|---|
| `npm run check` 主验证门禁 | 已完成 | docs-process | 作为主要类型 / lint / web-ui 校验入口 | 已固化在规则中 | AGENTS, repo rules | 持续作为代码改动后的最低门槛 |
| 定向 vitest / `lumen-test` | 已完成 | docs-process | 使用定向测试与本地 smoke 做行为验证 | 已形成规则 | AGENTS, active plans | 继续根据主线补专门回归用例 |
| TUI progress regression checklist | 已完成 | docs-process | 为交互主线提供行为矩阵 | 已写成专门文档 | tui-progress-regression-checklist | 需随 Stage B 演进持续更新 |
| CUSTOMIZATION_MANIFEST | 已完成 | docs-process | 作为 merge-intent 高层清单 | 已重写为更稳定结构 | CUSTOMIZATION_MANIFEST | 随核心定制面变化维护，不再写成 changelog |
| Planning rules / 文档治理 | 进行中 | docs-process | 定义规划真源、专题计划与 archive 的边界 | 本次正在建立 | 当前文档重构 | 后续要严格执行，避免体系再次发散 |
| TUI 二级界面中文化 | 已规划 | docs-process | 为 selector、dialog、login flow、session / hotkeys / changelog 等二级界面建立统一文案层并清理英文遗留 | 已有正式设计稿、总计划与子计划，但尚未开始统一抽离文案 | 2026-05-26 next-phase docs | 应在结构与 compaction 收口后按文案层方式推进，而不是继续零散翻译 |
| 系统提示词治理 | 已规划 | docs-process | 明确主系统 prompt、overlay、project context、skills/rules/prompts、extension append 与 `compact_prompt` 的边界 | 已确认当前不是 Pi 原生直出，且已形成正式设计稿与专项子计划 | system-prompt.ts, 2026-05-26 next-phase docs | 下一步在 compaction core 化之后固定 prompt 分层真源 |
| Upstream intake / merge workflow | 已规划 | docs-process | 建立更系统的上游跟踪、升级、记录和回滚纪律 | 有旧 spec 和脚本基础 | fork-bootstrap/tasks, lumen-archive upstream policy | 当前可先维持轻量流程，后续再决定是否正式化 |

## 已放弃或明确不再作为主线

| 能力项 | 状态 | 落点 | 能力说明 | 当前现状 | 来源 | 下一动作 / 风险约束 |
|---|---|---|---|---|---|---|
| 扩展层拥有主任务栏布局与生命周期 | 已放弃 | core | 旧路线让扩展层控制主任务栏 | 已明确被 core-owned progress surface 取代 | recent TUI work, manifest | 不要重新回到该路线 |
| 持久化 `.lumen/todo.json` 作为默认 todo 真源 | 已放弃 | core | 早期曾考虑项目级持久化 todo | 现已转向会话级语义为主 | lumen-todo-design | 跨 session 通过显式导入导出解决 |
| 旧 Phase / S 编号体系 | 已放弃 | docs-process | 用历史编号组织当前主线 | 已不再适合当前项目 | old requirements/design/tasks | 新规划统一使用 Stage A-G |
| OpenTUI / Bun / Rust helper 主线迁移 | 暂缓 | docs-process | 早期曾讨论更激进的底座或 helper 路线 | 当前不作为主线 | lumen-archive blueprint/specs | 没有足够收益前不重启 |
| 旧 `lumen-writing.ts` / `lumen-memory.ts` 路线 | 已放弃 | core | 旧实现形态已被新结构替代 | 只保留历史说明 | deprecated-core archive | 不恢复旧文件本身，只提炼其有价值能力 |
