# Lumen Docs Index

本目录存放 **Lumen fork 专属** 的设计、计划、分析和历史记录。

如果你在找 Pi 的正式使用手册，请看 [../packages/coding-agent/docs/index.md](../packages/coding-agent/docs/index.md)。  
如果你在判断 fork 相对上游哪些差异是有意的，请看 [../CUSTOMIZATION_MANIFEST.md](../CUSTOMIZATION_MANIFEST.md)。

## 文档分层

- 根目录 `README.md`：项目入口、远端策略、开发入口
- `docs/`：Lumen fork 级文档，偏设计、计划、阶段性结论
- `packages/coding-agent/docs/`：Pi/package 级正式手册，偏用户文档与接口说明
- `docs/archive/`：已废弃或历史上下文文档，不作为当前实现真源

## 规划真源

如果你想知道“项目现在往哪走、已经有什么能力、下一步做什么”，先看这三份：

- [FEATURE_OVERVIEW.md](FEATURE_OVERVIEW.md)：白话版功能总览，适合快速看“已经做了什么、还缺什么”
- [ROADMAP.md](ROADMAP.md)：唯一总路线图，解释项目定位、阶段路线、近期焦点和中长期方向
- [CAPABILITY_MATRIX.md](CAPABILITY_MATRIX.md)：能力账本，统一登记已完成、进行中、已规划、暂缓、已放弃的功能
- [PLANNING_RULES.md](PLANNING_RULES.md)：规划治理规则，定义什么内容属于 roadmap、matrix 或专题计划

## 当前活跃专题计划

这些文档是“施工图”，不是项目总路线图：

- [superpowers/plans/2026-05-20-core-progress-surface-plan.md](superpowers/plans/2026-05-20-core-progress-surface-plan.md)
- [superpowers/plans/2026-05-20-claude-aligned-progress-workflow-plan.md](superpowers/plans/2026-05-20-claude-aligned-progress-workflow-plan.md)
- [superpowers/plans/2026-05-26-lumen-next-phase-plan.md](superpowers/plans/2026-05-26-lumen-next-phase-plan.md)
- [superpowers/plans/2026-05-26-bottom-pane-unification-plan.md](superpowers/plans/2026-05-26-bottom-pane-unification-plan.md)
- [superpowers/plans/2026-05-26-compaction-core-plan.md](superpowers/plans/2026-05-26-compaction-core-plan.md)
- [superpowers/plans/2026-05-26-tui-localization-plan.md](superpowers/plans/2026-05-26-tui-localization-plan.md)
- [superpowers/plans/2026-05-26-system-prompt-governance-plan.md](superpowers/plans/2026-05-26-system-prompt-governance-plan.md)

## 当前设计稿

这些文档用于在进入实现前固定设计边界，不直接承担施工图职责：

- [superpowers/specs/2026-05-26-lumen-next-phase-design.md](superpowers/specs/2026-05-26-lumen-next-phase-design.md)

## 当前调研与方案判断

- [2026-05-24-codex-compaction-plugin-feasibility.md](2026-05-24-codex-compaction-plugin-feasibility.md)：Codex 压缩方案为什么更优、哪些可以先插件化、哪些最终需要 core 补位
- [2026-05-24-lumen-plugin-reevaluation-plan.md](2026-05-24-lumen-plugin-reevaluation-plan.md)：新插件安装后，下次启动自动复评估的方案与验收标准
- [2026-05-25-goal-handoff.md](2026-05-25-goal-handoff.md)：本轮三项主线的当前落地状态、证据和剩余人工验证项

## 使用与配置入口

- [installation.md](installation.md)：安装与运行
- [models.md](models.md)：模型与 provider 配置
- [extensions.md](extensions.md)：Lumen 内建扩展与扩展机制
- [PROVENANCE.md](PROVENANCE.md)：参考来源和外部借鉴边界

## 当前交互 / TUI 参考文档

- [output-flow-rebuild.md](output-flow-rebuild.md)
- [claude-output-style.md](claude-output-style.md)
- [claude-tool-call-style.md](claude-tool-call-style.md)
- [claude-ui-adjustment-summary.md](claude-ui-adjustment-summary.md)
- [2026-05-19-claude-task-ui-handoff.md](2026-05-19-claude-task-ui-handoff.md)
- [status-region-vs-claude.md](status-region-vs-claude.md)
- [tui-progress-regression-checklist.md](tui-progress-regression-checklist.md)
- [ime-manual-check.md](ime-manual-check.md)：中文输入法与 progress surface 手工回归步骤

## 报告与调研

- [reports/2026-05-16-reference-workflow-styles.md](reports/2026-05-16-reference-workflow-styles.md)
- [reports/2026-05-16-kimi-cli-deep-analysis.md](reports/2026-05-16-kimi-cli-deep-analysis.md)

## 已归档

- [archive/fork-bootstrap/](archive/fork-bootstrap/)：早期 fork / Phase 3 阶段规划与设计
- [archive/lumen-archive/](archive/lumen-archive/)：更早期 blueprint、spec、migration 记录
- [archive/progress-surface/](archive/progress-surface/)：旧的插件化任务栏与过渡路线
- [archive/tui-migration/](archive/tui-migration/)：旧的 TUI 框架迁移方向
- [archive/deprecated-core/](archive/deprecated-core/)：已废弃核心能力的历史说明
