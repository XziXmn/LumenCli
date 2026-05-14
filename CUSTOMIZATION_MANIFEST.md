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
| `packages/coding-agent/src/core/resource-loader.ts` | LEGACY_CONFIG_DIR_NAME fallback + lumen-writing/novel/memory/todo/askuser/config-discovery/repo/patch extensions |
| `packages/coding-agent/src/core/settings-manager.ts` | .lumen/settings.json 优先 + .pi/ fallback |
| `packages/coding-agent/src/core/extensions/loader.ts` | .lumen/extensions/ + .pi/extensions/ fallback |
| `packages/coding-agent/src/utils/pi-user-agent.ts` | User-Agent: lumen/version |
| `packages/coding-agent/src/utils/version-check.ts` | 禁用 pi.dev 版本检查 |
| `packages/coding-agent/src/package-manager-cli.ts` | "lumen" self-reference, .lumen/ paths |
| `packages/coding-agent/src/modes/interactive/interactive-mode.ts` | 中文欢迎语/onboarding |
| `packages/tui/src/tui.ts` | .lumen/ debug/crash log paths |
| `packages/coding-agent/src/core/tools/read.ts` | 添加 hashline 前缀（2字符hash锚点）提升编辑定位准确性 |
| `packages/coding-agent/src/modes/interactive/components/thinking-selector.ts` | 增强 thinking level 选择器：彩色 tier dot + token 预估 + 描述 |
| `packages/coding-agent/src/modes/interactive/components/assistant-message.ts` | 三态 thinking 显示：full/summary/hidden + 折叠摘要 |
| `.gitignore` | .lumen/ patterns |

## 新增文件（零冲突）

| 文件 | 用途 |
|------|------|
| `packages/coding-agent/src/core/lumen-writing.ts` | /plan /draft /review /revise 写作命令 |
| `packages/coding-agent/src/core/lumen-novel.ts` | .novel 项目检测 + 系统提示词注入 |
| `packages/coding-agent/src/core/lumen-memory.ts` | /remember /memory 跨 session 记忆 |
| `packages/coding-agent/src/core/lumen-todo.ts` | todo tool — 结构化分阶段任务跟踪 |
| `packages/coding-agent/src/core/lumen-askuser.ts` | ask_user tool — 结构化提问（select/confirm/text） |
| `packages/coding-agent/src/core/lumen-config-discovery.ts` | 外部 AI 工具配置发现（Claude/Cursor/Codex/MCP） |
| `packages/coding-agent/src/core/lumen-repo.ts` | repo_clone + repo_overview tools |
| `packages/coding-agent/src/core/lumen-hashline.ts` | hashline 核心算法（hash 计算、锚点解析、验证） |
| `packages/coding-agent/src/core/lumen-lsp.ts` | lsp tool — 完整 LSP 3.17 协议实现（10 个 actions） |
| `packages/coding-agent/src/core/lumen-lsp-client.ts` | LSP 客户端（JSON-RPC、didOpen/didChange、waitForDiagnostics） |
| `packages/coding-agent/src/core/lumen-lsp-config.ts` | LSP 服务器配置和发现（.lumen/lsp.json 可扩展） |
| `packages/coding-agent/src/core/lumen-lsp-types.ts` | LSP 协议类型定义 |
| `packages/coding-agent/src/core/lumen-preset.ts` | 模型 preset 路由（primary/vision/thinking） |
| `packages/coding-agent/src/core/lumen-worktree.ts` | git worktree 隔离工具 |
| `packages/coding-agent/src/core/lumen-snip.ts` | snip + brief tools（智能截断 / 摘要） |
| `packages/coding-agent/src/core/lumen-codesearch.ts` | code_search tool（GitHub code search） |
| `packages/coding-agent/src/core/lumen-powershell.ts` | powershell tool (Windows 原生 pwsh) |
| `packages/coding-agent/src/core/lumen-agents-bg.ts` | agent_spawn/status/send/wait/kill (5 个 background agent tools) |
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
