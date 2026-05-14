# 深度检测与分析报告

日期: 2026-05-13
范围: Lumen 所有自研 extension 和核心定制

## 1. 质量指标

### 代码规模

| 文件 | LOC |
|------|-----|
| lumen-repo.ts | 505 |
| lumen-todo.ts | 493 |
| lumen-patch.ts | 442 |
| lumen-web.ts | 430 |
| lumen-agents.ts | 380 |
| lumen-memory.ts | 281 |
| lumen-config-discovery.ts | 252 |
| lumen-askuser.ts | 246 |
| lumen-ttsr.ts | 212 |
| lumen-snapshot.ts | 207 |
| lumen-hashline.ts | 171 |
| lumen-novel.ts | 159 |
| lumen-secrets.ts | 132 |
| lumen-plan-mode.ts | 127 |
| lumen-commit.ts | 89 |
| lumen-writing.ts | 86 |

**总计**: 16 个 extension + 1 个 utility module, ~4200 LOC, ~130KB

### 类型检查

- `tsgo --noEmit`: **clean**（0 error）
- `biome check`: **clean**（660 文件全绿）
- `any` 类型使用: **1 处**（合理的 catch 块错误处理）
- 空 catch 块: **5 处**（都是故意的静默回退，有注释）
- TODO/FIXME: **0 处**

### 测试覆盖

`scripts/deep-test.mjs`: **30/30 passing**

覆盖范围：
- hashline: 10 个测试（hash 确定性、空行 seed、格式、锚点解析、验证、边界）
- patch: 7 个测试（add/delete/update、marker 验证、缺失文件、空 patch、端到端应用）
- secrets: 7 个测试（OpenAI/GitHub/AWS/私钥、短前缀不误杀、多 secret）
- 结构性: 6 个测试（config-discovery、agents、snapshot、web cache、resource-loader、全加载）

## 2. 架构评估

### 优点

**解耦良好**：所有 16 个 extension 都通过 `ExtensionAPI` 注册，零侵入 Pi 核心。`resource-loader.ts` 中 10 行 import + 17 行数组即可装载所有能力。

**Provenance 可追溯**：每个 extension 都有 `[Provenance] 来源` 和 `[Provenance] 移植方式` 注释，合并上游时不会迷失。

**合理的同步 IO**：绝大多数同步 IO 在 extension 初始化时（session_start hook 加载 agent 定义、rules、memory）或工具执行时（用户触发的一次性调用），都是合理场景。

**TypeBox schema**：所有 LLM tool 都用 TypeBox 定义参数，类型安全且 schema 自动暴露给模型。

### 隐患

**Extension 负载增长**：每次 session 启动会加载 16 个 extension，目前都很轻，但如果继续增加（比如 LSP、ClickCache 等）需要考虑 lazy loading。

**Hashline 哈希算法偏离**：oh-my-pi 用的是 xxHash32（Bun native），我用 MD5 截取前 4 字节代替。功能等价（只要一致），但跨项目复用锚点时会不兼容。好在 hashline 是 session-local 的。

**Memory store 无限增长兜底**：`consolidate` 会在 500 条时触发，但合并策略比较粗（按 kind 分组合并），对高频用户仍可能产生巨量 summary 条目。

**Web cache 仅进程内**：5 分钟 TTL + 50 条上限的内存缓存，session 重启就丢。对大型文档的重复抓取场景仍有浪费。

**Agent 进程模型**：当前 agent 通过 `spawn` 进程外执行，好处是零冲突，坏处是每次启动要重新加载模型/上下文，延迟约 1-2 秒。

**Patch 匹配算法简单**：`applyChunks` 用的是 trimEnd 匹配，不处理空白差异、不支持 fuzzy match。遇到空白敏感的代码（比如 Python）容易失败。

### 冗余

**TTSR + Config Discovery 功能重叠**：两者都在 `before_agent_start` 注入 system prompt。TTSR 走 `.lumen/rules/`（关键词/工具触发），config-discovery 走 `.claude/`（无条件注入）。可以考虑统一为「规则来源 + 触发条件」两层架构。

**Snapshot + Apply Patch**：Snapshot 已经覆盖 apply_patch 了，但 apply_patch 内部没有错误回滚机制。如果 patch 应用到一半失败，需要手动 `/snapshot restore`。

## 3. 成熟度评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 类型安全 | ★★★★★ | tsgo 全绿，1 处合理的 any |
| 测试覆盖 | ★★★☆☆ | 核心算法覆盖良好，但缺少 extension API 集成测试 |
| 错误处理 | ★★★★☆ | catch 块基本都有合理回退；有几处可改进错误信息 |
| 文档 | ★★★★☆ | Provenance、tasks、设计文档齐全；缺用户使用文档 |
| 可维护性 | ★★★★☆ | 命名一致、职责单一；少数文件（repo、todo、patch）接近 500 LOC |
| 性能 | ★★★☆☆ | 正常使用足够；大项目/高频场景下同步 IO 和进程外 agent 可能慢 |
| 可移植性 | ★★★★☆ | Node.js 纯实现，无平台特定 API（除 git/shell） |

**整体**: ★★★★☆（4/5）—— 生产可用，有明确的改进方向。

## 4. 建议与方向

### 短期优化（低风险，1-2h 内）

1. **Patch 回滚**: `applyPatch` 失败时，通过快照自动恢复所有已修改文件。
2. **Memory search 优化**: 加 fuzzy match 和 relevance threshold，避免返回不相关的陈旧记忆。
3. **Todo persistence 改进**: 当前存 `.lumen/todo.json`，建议改为 `.lumen/agent/todo-{session_id}.json`，避免多 session 同步问题。
4. **Hashline 兼容层**: 加一个 env var `LUMEN_HASHLINE_ALGO=xxhash|md5`，后续若需要和 oh-my-pi 互通可切换。
5. **Extension 统一 log**: 目前有的 extension `console.log`，有的 `pi.sendUserMessage`，建议统一走 pi 日志通道。

### 中期演进（2-5h，一次专注）

1. **LSP Tool (Task 14)**: 最大的空缺。建议只做 TypeScript + Python 两个语言，用 `vscode-languageserver` 协议。
2. **Agent 进程内执行**: 用 `agent-session.ts` 直接 fork 一个 session 实例，省掉 spawn 开销。
3. **Preset Routing (Task 24)**: 支持 `.lumen/presets.json` 定义模型组合（primary/vision/thinking），自动路由。
4. **Worktree Isolation (Task 18)**: agent 在独立 worktree 执行，结束后 git diff 提取 patch，避免脏工作区。

### 长期战略（5h+，分多次）

1. **统一规则系统**：合并 TTSR + Config Discovery + Skills 为一个「条件化 instruction」系统，统一的 frontmatter + 触发条件 + 注入位置。
2. **持久化 Web 缓存**：`.lumen/agent/web-cache/` + LRU + SQLite 索引，跨 session 复用。
3. **Scraper 移植 (oh-my-pi 70+ 站点)**：GitHub/MDN/Stackoverflow 等专用解析器能极大提升 fetch 质量。
4. **Memory Pipeline 2-phase (Task 32)**：Codex 架构，session 结束时提取 raw_memory，全局合并，避免当前的线性增长。
5. **TUI 测试框架**：用 pty 模拟输入，端到端测试 /commands 和快捷键。

### 战略定位

Lumen 当前已覆盖了 Pi + 大部分 oh-my-pi 的核心能力，成为一个有独立特色的 fork。未来方向有两个：

**方向 A：持续 merge upstream**
适合如果 Pi 和 oh-my-pi 仍在快速演进。优点：免费拿新能力；缺点：每次合并工作量大（现在 17 个自研文件都要 review）。

**方向 B：逐步自立**
把 `.lumen-archive/` 里保留的经验沉淀下来，把 agent-core 和 AI providers 也 fork 到 `packages/lumen-*`，真正成为独立产品。优点：定制自由；缺点：长期维护成本翻倍。

**建议**: 方向 A 为主，方向 B 作为长期选项。短期继续 merge upstream，中期关注 LSP + Agent Runner + Preset Routing 三个高价值功能，长期看是否有用户反馈决定是否自立。

## 5. 下一步优先级推荐

综合重要度、难度、用户价值：

1. **Task 14 (LSP Tool)** — 最大空缺，直接提升代码质量（4h，中高难度）
2. **Patch 回滚机制** — 安全性提升（1h，低难度）
3. **Task 18 (Worktree Isolation)** — agent 模式安全性（3h，中难度）
4. **Task 24 (Preset Routing)** — 模型使用效率（3h，中难度）
5. **Scraper 移植** — web_fetch 质量跃升（4h 分批，低难度）
