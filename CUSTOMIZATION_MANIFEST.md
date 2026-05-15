# LumenCli Customization Manifest

从 earendil-works/pi-mono fork 后的所有定制文件清单。
合并上游时，AI 应参考此文件理解每个改动的意图。

## 修改的上游文件

| 文件 | 定制内容 |
|------|----------|
| `package.json` | monorepo name → lumen-monorepo |
| `packages/coding-agent/package.json` | bin: lumen, lumenConfig, build:binary → dist/lumen |
| `packages/coding-agent/src/config.ts` | APP_NAME=lumen, APP_TITLE=Lumen, CONFIG_DIR_NAME=.lumen, LEGACY_CONFIG_DIR_NAME=.pi fallback, LUMEN_* env vars |
| `packages/coding-agent/src/cli.ts` | process.env.LUMEN_CODING_AGENT |
| `packages/coding-agent/src/cli/args.ts` | 中文 CLI help, LUMEN_OFFLINE/TELEMETRY/SHARE_VIEWER_URL env vars |
| `packages/coding-agent/src/main.ts` | LUMEN_OFFLINE + PI_OFFLINE dual check |
| `packages/coding-agent/src/core/system-prompt.ts` | "Lumen" branding + 中文规则注入 |
| `packages/coding-agent/src/core/slash-commands.ts` | 21 条命令中文描述 |
| `packages/coding-agent/src/core/telemetry.ts` | LUMEN_TELEMETRY env var |
| `packages/coding-agent/src/core/resource-loader.ts` | LEGACY_CONFIG_DIR_NAME fallback + lumen-novel/todo/askuser/config-discovery/repo/patch extensions |
| `packages/coding-agent/src/core/settings-manager.ts` | .lumen/settings.json 优先 + .pi/ fallback |
| `packages/coding-agent/src/core/extensions/loader.ts` | .lumen/extensions/ + .pi/extensions/ fallback |
| `packages/coding-agent/src/utils/pi-user-agent.ts` | User-Agent: lumen/version |
| `packages/coding-agent/src/utils/version-check.ts` | 禁用 pi.dev 版本检查 |
| `packages/coding-agent/src/package-manager-cli.ts` | "lumen" self-reference, .lumen/ paths |
| `packages/coding-agent/src/modes/interactive/interactive-mode.ts` | 中文欢迎语/onboarding |
| `packages/coding-agent/src/modes/interactive/interactive-mode.ts` | Phase 4 Claude Code TUI 复刻：带边框欢迎卡片 + ✻ 随机动词 spinner + 每 turn 重置 |
| `packages/tui/src/tui.ts` | .lumen/ debug/crash log paths |
| `packages/coding-agent/src/core/tools/read.ts` | 添加 hashline 前缀（2字符hash锚点）提升编辑定位准确性 + 折叠时不显示行数提示 |
| `packages/coding-agent/src/core/tools/write.ts` | 折叠时不显示 "+N more lines" 提示 |
| `packages/coding-agent/src/core/tools/grep.ts` | 折叠时不显示 "+N more lines" 提示 |
| `packages/coding-agent/src/core/tools/ls.ts` | 折叠时不显示 "+N more lines" 提示 |
| `packages/coding-agent/src/core/tools/find.ts` | 折叠时不显示 "+N more lines" 提示 |
| `packages/coding-agent/src/core/tools/bash.ts` | 折叠时不显示 "+N earlier lines" 提示；进行中预览扩到 5 行（Claude Code 风格）；进行中 footer 追加行数：`Elapsed 3.2s · 142 lines` |
| `packages/coding-agent/src/core/tools/output-accumulator.ts` | 暴露 `getTotalLines()` 用于 live progress |
| `packages/coding-agent/src/modes/interactive/components/thinking-selector.ts` | 增强 thinking level 选择器：彩色 tier dot + token 预估 + 描述 |
| `packages/coding-agent/src/modes/interactive/components/assistant-message.ts` | 三态 thinking 显示：full/summary/hidden + 折叠摘要 + streaming 结束后移除 thinking 节点（Claude Code 风格） |
| `packages/coding-agent/src/modes/interactive/components/tool-execution.ts` | TUI Phase 1：spinner 动画（80ms braille 帧）+ 状态图标（✓/✗/○）+ dispose 方法 |
| `packages/coding-agent/src/modes/interactive/components/tool-execution.ts` | Phase 4：去掉 Spacer/Box 背景（Claude Code 紧凑风格）+ ✻ pending 图标 |
| `packages/coding-agent/src/core/lumen-agents-bg.ts` | renderCall/renderResult 改用 renderStatusLine 格式化（icon + title + description + meta） |
| `packages/coding-agent/src/modes/interactive/theme/theme.ts` | TUI Phase 1：添加 spinnerFrames、tree、boxSharp、sep、format、styledSymbol() 到 Theme 类 |
| `packages/coding-agent/src/core/tools/bash.ts` | TUI Phase 1：renderCall 加 spinner/状态图标前缀 |
| `packages/coding-agent/src/core/lumen-powershell.ts` | TUI Phase 1：renderCall 用 renderStatusLine；renderResult 展开态用 CachedOutputBlock 带边框渲染 |
| `packages/coding-agent/src/modes/interactive/interactive-mode.ts` | Phase 3：工具分组逻辑 — 连续同类 tool 合并到 ToolGroupComponent |
| `packages/coding-agent/src/modes/interactive/components/tool-group.ts` | Phase 4：Claude Code collapseReadSearch 全面复刻 — 所有连续 collapsible tool 折叠为一行摘要（Reading N files, searching M patterns…） |
| `packages/coding-agent/src/modes/interactive/components/user-message.ts` | Phase 4：全宽深色背景 + ▶ 前缀（Claude Code 风格） |
| `packages/coding-agent/src/core/lumen-task.ts` | Phase 4：Claude Code 风格子代理树形渲染 — agent(desc) + ⎿ 状态行 + currentTool 实时显示 |
| `.gitignore` | .lumen/ patterns |

## 新增文件（零冲突）

| 文件 | 用途 |
|------|------|
| `packages/coding-agent/src/core/lumen-writing.ts` | 已删除 — 见 docs/lumen-writing-deprecated.md |
| `packages/coding-agent/src/core/lumen-memory.ts` | 已删除 — 见 docs/lumen-memory-deprecated.md |
| `packages/coding-agent/src/core/lumen-novel.ts` | .novel 项目检测 + 系统提示词注入 |
| `packages/coding-agent/src/core/lumen-todo.ts` | todo tool — 会话级结构化任务跟踪 + /todo-export /todo-import |
| `packages/coding-agent/src/core/lumen-askuser.ts` | ask_user tool — 结构化提问（select/confirm/text） |
| `packages/coding-agent/src/core/lumen-config-discovery.ts` | 外部 AI 工具配置发现（Claude/Cursor/Codex/MCP） |
| `packages/coding-agent/src/core/lumen-repo.ts` | repo_clone + repo_overview tools |
| `packages/coding-agent/src/core/lumen-hashline.ts` | hashline 核心算法（hash 计算、锚点解析、验证） |
| `packages/coding-agent/src/core/lumen-lsp.ts` | lsp tool — 完整 LSP 3.17 协议实现（10 个 actions） |
| `packages/coding-agent/src/core/lumen-lsp-client.ts` | LSP 客户端（JSON-RPC、didOpen/didChange、waitForDiagnostics） |
| `packages/coding-agent/src/core/lumen-lsp-config.ts` | LSP 服务器配置和发现（.lumen/lsp.json 可扩展） |
| `packages/coding-agent/src/core/lumen-lsp-types.ts` | LSP 协议类型定义 |
| `packages/coding-agent/src/core/lumen-worktree.ts` | git worktree 隔离工具 |
| `packages/coding-agent/src/core/lumen-snip.ts` | snip + brief tools（智能截断 / 摘要） |
| `packages/coding-agent/src/core/lumen-codesearch.ts` | code_search tool（GitHub code search） |
| `packages/coding-agent/src/core/lumen-powershell.ts` | powershell tool (Windows 原生 pwsh) — 版本检测、退出码捕获、CWD 追踪、版本感知 prompt |
| `packages/coding-agent/src/core/lumen-task.ts` | task tool — 同进程子代理执行（替代旧 agent 方案）：并行执行、EventBus 实时进度、树形渲染、agent discovery |
| `packages/coding-agent/src/core/lumen-process-utils.ts` | 跨平台进程树终止（Windows taskkill / Unix SIGKILL process group） |
| `packages/coding-agent/src/modes/interactive/components/lumen-tui-utils.ts` | TUI 工具集：State 类型、Hasher（Bun/Node 兼容）、padToWidth、树形前缀、box drawing 常量、spinner 帧 |
| `packages/coding-agent/src/modes/interactive/components/lumen-status-line.ts` | 状态行渲染：icon + title + description + badge + meta 格式 |
| `packages/coding-agent/src/modes/interactive/components/lumen-output-block.ts` | 带边框输出容器：CachedOutputBlock + renderOutputBlock（状态色边框） |
| `packages/coding-agent/src/modes/interactive/components/tool-group.ts` | Phase 3 工具分组：ToolGroupComponent — 连续同类工具合并显示（Read 4 files） |
| `packages/coding-agent/src/core/lumen-task.ts` | task tool — 同进程子代理执行（替代 agent_spawn/status/wait 方案）：并行执行、EventBus 实时进度、树形渲染 |
| `docs/subagent-redesign.md` | 子代理系统重设计文档 |
| `.lumen/` | 项目配置目录（extensions, prompts, settings.json, SYSTEM.md, default-models.json） |
| `lumen-test.sh` / `lumen-test.ps1` | 从源码运行脚本 |
| `CUSTOMIZATION_MANIFEST.md` | 本文件 |
| `README.md` | 完全重写为 LumenCli 说明 |

## 合并指导

合并上游时，AI 应遵循以下原则：

1. **保留品牌定制**：所有 "lumen"/"Lumen"/".lumen" 替换保持不变
2. **保留中文化**：slash 命令描述、欢迎语、CLI help 保持中文
3. **保留 fallback 逻辑**：.pi/ → .lumen/ 的 fallback 读取保持
4. **接受上游新功能**：上游新增的 tools、commands、providers 正常合并
5. **新增文件无冲突**：lumen-writing/novel/memory 是独立文件，不会和上游冲突
6. **resource-loader.ts 特殊处理**：我们在 import 区和 extensionFactories 数组中添加了内容，合并时保留我们的添加
