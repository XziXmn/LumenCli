# LumenCli Customization Manifest

Lumen 基于 `earendil-works/pi-mono` fork。本文件记录当前仍应保留的定制方向，供后续同步 `upstream` 时快速判断哪些差异是有意的。

这是一份高层 merge-intent 清单，不是逐文件 changelog。遇到冲突时，先看当前代码，再看本文件和 [docs/README.md](docs/README.md)。

## 使用原则

1. 优先保留 Lumen 的品牌、配置目录和中文化体验
2. 尽量把交互 UI 改动集中在 `packages/coding-agent/src/modes/interactive/` 主线
3. 允许跟随上游演进；如果某个旧文档和当前代码冲突，以当前代码为准
4. `upstream` 只用于拉取和合并；推送只发到 `origin`

## 定制面总览

### 1. 品牌与配置兼容层

这些改动属于 fork 身份和运行时兼容面的基础定制，合并上游时应默认保留：

| 范围 | 主要文件 | 意图 |
|---|---|---|
| 包名 / 可执行入口 | `package.json`, `packages/coding-agent/package.json` | `pi` → `lumen`，保留独立 bin 和包元数据 |
| 配置目录 | `packages/coding-agent/src/config.ts`, `packages/coding-agent/src/core/settings-manager.ts`, `packages/coding-agent/src/core/extensions/loader.ts`, `packages/coding-agent/src/package-manager-cli.ts` | `.lumen/` 为主，`.pi/` fallback 兼容 |
| CLI / 系统提示 / 中文化 | `packages/coding-agent/src/cli/args.ts`, `packages/coding-agent/src/core/system-prompt.ts`, `packages/coding-agent/src/core/slash-commands.ts`, `packages/coding-agent/src/modes/interactive/interactive-mode.ts` | CLI 帮助、默认人格、slash 描述、欢迎语中文化 |
| 资源加载 | `packages/coding-agent/src/core/resource-loader.ts` | 保留 Lumen 自定义扩展、提示词、规则、agents 等发现逻辑 |
| 运行时标识 | `packages/coding-agent/src/core/telemetry.ts`, `packages/coding-agent/src/utils/pi-user-agent.ts`, `packages/coding-agent/src/utils/version-check.ts`, `packages/coding-agent/src/main.ts` | Lumen 专属 env 前缀、UA、版本检查与离线兼容 |

### 2. Lumen 自定义能力层

这些文件代表 Lumen 相对上游新增或强化的核心能力，合并时不应被误删：

| 类别 | 主要文件 | 说明 |
|---|---|---|
| 工作流工具 | `packages/coding-agent/src/core/lumen-todo.ts`, `lumen-askuser.ts`, `lumen-repo.ts`, `lumen-snip.ts`, `lumen-worktree.ts`, `lumen-config-discovery.ts`, `lumen-codesearch.ts` | Todo、结构化问答、仓库辅助、摘要、worktree、外部配置发现、代码搜索 |
| 编辑 / 平台能力 | `packages/coding-agent/src/core/lumen-hashline.ts`, `lumen-powershell.ts`, `lumen-process-utils.ts` | Hashline、Windows PowerShell 工具、进程树处理 |
| LSP 能力 | `packages/coding-agent/src/core/lumen-lsp.ts`, `lumen-lsp-client.ts`, `lumen-lsp-config.ts`, `lumen-lsp-types.ts` | 完整 LSP 3.17 tool 链路 |
| 子代理执行 | `packages/coding-agent/src/core/lumen-task.ts` | 同进程 task 模型与子代理执行能力 |
| 项目运行面 | `.lumen/`, `lumen-test.sh`, `lumen-test.ps1` | 项目级默认配置、扩展、测试脚本 |

### 3. 交互模式与进度面定制

这部分是当前最容易与上游冲突的区域，合并时要按“尽量集中在 core 主线”的原则处理：

| 范围 | 主要文件 | 当前意图 |
|---|---|---|
| 进度面主所有权 | `packages/coding-agent/src/modes/interactive/interactive-mode.ts`, `packages/coding-agent/src/modes/interactive/components/progress-surface.ts` | 输入框上方任务栏由 core 统一渲染与控制生命周期 |
| transcript / tool 样式 | `packages/coding-agent/src/modes/interactive/components/assistant-tool-summary.ts`, `assistant-tool-batch-summary.ts`, `collapsed-tool-group.ts`, `user-message.ts`, `tool-group.ts` | 更接近 Claude 的主行 / `⎿` 次行语义与压缩显示 |
| thinking / footer / selector | `packages/coding-agent/src/modes/interactive/components/thinking-selector.ts`, `footer.ts`, `assistant-message.ts` | thinking 层级、footer 被动状态、assistant 展现细节 |
| 工具输出体感 | `packages/coding-agent/src/core/tools/bash.ts`, `read.ts`, `write.ts`, `grep.ts`, `ls.ts`, `find.ts`, `packages/coding-agent/src/core/tools/output-accumulator.ts` | 折叠策略、运行中预览、输出统计 |
| task / sub-agent 展示 | `packages/coding-agent/src/core/lumen-task.ts`, `packages/coding-agent/src/core/lumen-agents-bg.ts` | 子代理 transcript 与后台状态表现 |
| TUI 底层辅助 | `packages/tui/src/tui.ts`, `packages/coding-agent/src/modes/interactive/theme/theme.ts` | crash/debug 路径、主题符号与底层 TUI 行为 |

说明：

- 旧的“扩展层拥有主任务栏布局与生命周期”的路线已经废弃
- 相关旧方案文档已移入 `docs/archive/progress-surface/`
- 当前主线实施计划见：
  - [docs/superpowers/plans/2026-05-20-core-progress-surface-plan.md](docs/superpowers/plans/2026-05-20-core-progress-surface-plan.md)
  - [docs/superpowers/plans/2026-05-20-claude-aligned-progress-workflow-plan.md](docs/superpowers/plans/2026-05-20-claude-aligned-progress-workflow-plan.md)

### 4. 已删除但需保留历史语义的分支

以下能力当前已经不在代码中，但保留了历史说明，避免后续合并时误判为“缺文件”：

| 状态 | 对应文档 |
|---|---|
| 已删除：`packages/coding-agent/src/core/lumen-writing.ts` | `docs/archive/deprecated-core/lumen-writing-deprecated.md` |
| 已删除：`packages/coding-agent/src/core/lumen-memory.ts` | `docs/archive/deprecated-core/lumen-memory-deprecated.md` |

## 合并上游时的检查点

1. 保留 `lumen` / `Lumen` / `.lumen` 品牌与路径约定
2. 保留 `.pi/` fallback 兼容逻辑
3. 保留中文化默认体验
4. 新增上游功能优先正常吸收，不因旧文档描述而硬拦
5. 遇到 `interactive-mode` 冲突时，优先维护 core-owned progress surface 结构
6. 不要把历史插件化任务栏方案重新当成当前实现目标
