# Next Session Prompt

## 项目背景

LumenCli（`d:\UGit\LumenAgent`），从 earendil-works/pi-mono fork 的个人深度定制 coding agent。

**已完成**（31/32 tasks，97%）：
- Phase 1：品牌定制 + 中文化 + .lumen/ 配置
- Phase 2/3：22 个内置 extension
- **22 个 LLM 可调用 tool**: read/write/edit/grep/find/ls/bash/todo/ask_user/apply_patch/web_search/web_fetch/repo_clone/repo_overview/lsp/snip/brief/code_search/powershell/agent/agent_spawn/agent_status/agent_send/agent_wait/agent_kill
- 完整 LSP 3.17 协议实现（11+ 语言服务器）
- Hashline 锚点系统（read tool 输出 `42sr|code`）
- Apply Patch 原子性（失败自动回滚）
- Memory 2-phase pipeline（phase1 rollout summary + phase2 cwd/kind 合并 + Jaccard dedup）
- Preset 路由（vision auto-routing，实际 pi.setModel 调用）
- Worktree 隔离（/worktree 命令 + 程序化 API）
- Background agents（spawn/status/send/wait/kill 5 个 tools）
- Plan Mode + Tab 切换
- Snapshot 覆盖 write/edit/apply_patch
- Web fetch 5 分钟缓存
- Snip/Brief tools（智能截断/摘要）
- CodeSearch（GitHub code search API）
- PowerShell tool（Windows 原生）
- **73 个测试全部通过**（61 unit + 5 LSP E2E + 7 真实 fs E2E）

**关键文件**：
- `docs/tasks.md` — 32 task 清单（31 已完成）
- `docs/installation.md` — 安装指南
- `docs/extensions.md` — 所有 22 个 extension 的介绍
- `docs/deep-analysis-2026-05-13.md` — 深度分析报告
- `docs/PROVENANCE.md` — 代码来源追踪
- `CUSTOMIZATION_MANIFEST.md` — 改动清单
- `scripts/deep-test.mjs` — 61 个单元测试
- `scripts/test-lsp-e2e.mjs` — 5 个 LSP E2E 测试
- `scripts/test-e2e.mjs` — 7 个真实 fs E2E 测试
- `packages/coding-agent/src/core/resource-loader.ts` — 22 个 extension 注册处

**设计原则**：
- 能拿就拿，拿不到再自己重构（记录来源到 PROVENANCE.md）
- 合并冲突由 AI 处理
- 新功能通过 extension API 实现

**验证命令**：
```
npx tsgo --noEmit                       # 类型检查
npx biome check .                       # lint
npx tsx scripts/deep-test.mjs           # 61 单元测试
npx tsx scripts/test-lsp-e2e.mjs        # 5 LSP E2E
npx tsx scripts/test-e2e.mjs            # 7 真实 fs E2E
```

## 剩余任务（1 个）

**低优先级**：
- Task 27: Notebook Tool — Jupyter notebook 编辑支持（3h，低优先级）

## 可选改进方向

- oh-my-pi scraper 移植 — 70+ 站点专用解析器
- 连接本地 mimo 服务做端到端测试
- hashline-edit tool（基于锚点的精确编辑）
- agent 进程内执行（省 spawn 开销）
- Memory 图形化可视化
- 开发 TUI 浏览器（visual diff / interactive snapshot browser）
- 发布 v0.1 release，申请反馈
