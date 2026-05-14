# LumenCli Rust Helper Subprocess Policy

日期：2026-05-12
状态：Policy — 未激活。本策略定义"何时、以什么条件、按什么流程引入 Rust helper 子进程"。首次使用前，每个具体 helper 仍需独立 spec 批准。
依赖文档：
- `Docs/specs/2026-05-10-lumencli-reference-usage-policy.md`
- `Docs/specs/2026-05-12-fork-vs-standalone-decision.md`
- `Docs/plans/2026-05-10-lumencli-phase1-agent-mvp-blueprint.md`

## 0. 目的

LumenCli 主干永久保持 Bun + TypeScript 单语言。对于极少数 Rust 能显著胜出的本地能力，本策略定义：

- 什么条件下允许引入 Rust helper
- helper 的形态约束（独立进程 + stdio 通信）
- 首批候选 helper 及其准入条件
- 引入流程与反向回撤路径

本策略回答 `2026-05-12-fork-vs-standalone-decision.md` §5 提出的命题："不 fork codex 不等于放弃 codex 的价值"。Rust helper 子进程是把 codex 级别的原生能力**按需、隔离地**兑现进 LumenCli，而不牺牲主干的单语言与迭代速度。

## 1. 非目标

本策略明确不做：

- **不把主干改写为 Rust**。`apps/cli` 与 `packages/*` 永远是 Bun + TS。
- **不把 Rust helper 放入主进程地址空间**。不写 NAPI / neon / WASM in-process 绑定；所有 helper 走独立进程 + stdio / JSON-RPC。
- **不整体 vendor codex / pi 的 Rust 代码树**。每个 helper 是独立小 crate 或独立小仓，设计可借鉴但代码自写或 adapted（按 Reference Usage Policy §6.6 的 source 标注）。
- **不用 helper 替代纯性能优化**。Rust helper 必须解决主干**做不到**或**显著做不好**的问题，不是"Bun 够用但 Rust 更快一点"的场景。

## 2. 准入条件（四选二硬门槛）

引入任何 Rust helper 必须至少满足以下四条中的**两条**：

### 2.1 Bun/TS 在当前场景做不到

例：

- 需要调用 Windows job-object / Linux Landlock / macOS seatbelt 的 syscall 级 API。
- 需要进程级硬沙箱（rlimit / cgroup / 权限下放）。
- 需要跨平台一致的 CPU + memory 限制。

### 2.2 Bun/TS 的性能差距 ≥ 10× 且命中主路径

条件：

- 某个 LumenCli 运行时热点被 profiler 测得在 Bun 下耗时 ≥ 1 秒级。
- 同功能在 Rust 下可以做到 < 100ms。
- 这个热点在真实用户场景里触发频率 ≥ 每会话 1 次。

例：

- 1M+ LOC 仓库的 ripgrep-style 搜索。
- SQLite FTS5 + 向量索引的批量写入。
- 大文件 patch 计算。

### 2.3 跨语言协议本身就是 Rust 世界的事实标准

例：

- rmcp 协议的某些子集（MCP 2025 扩展、复杂 streaming），TS SDK 滞后 ≥ 3 个月。
- 沙箱逃逸测试中 Rust 实现已经社区验证，TS 实现需要重新投入安全评审。

### 2.4 helper 可以完全在安全边界外运行

条件：helper 进程不持有任何 LumenCli secret（API key、OAuth token、session 内容）；所有输入/输出都是 explicit payload，helper 进程即使被攻破也只能影响 helper 自身的权限域。

满足这条意味着 helper 可以以更低权限运行（例如在 sandbox 里跑 sandbox），增加纵深防御。

**只有 §2.1 单条也成立**（"TS 做不到"）时也算通过准入门槛，因为这是必需而非优化。

## 3. 架构约束

### 3.1 通信协议（必须）

- 主进程与 helper 之间的通信走 **stdio + JSON-RPC 2.0** 或 **stdio + length-prefixed JSON**。
- 不允许 TCP / Unix domain socket / 命名管道作为默认路径（可以作为特定 helper 的可选模式，但必须有 stdio fallback）。
- 请求必须带 `id`，响应必须能与请求匹配。流式响应用 JSON-RPC notification 推送 chunk。

### 3.2 进程生命周期（必须）

- helper 由 LumenCli 主进程 spawn，作为子进程。
- 主进程退出时必须保证 helper 也退出（Windows 用 job-object；类 Unix 用 process group + SIGTERM 传播）。
- helper crash 要被主进程捕获并通过 LumenCli error 事件暴露，不允许无声失败。
- helper 启动失败不能阻塞主进程启动；必须有"helper 不可用"的降级路径（即使功能下降也要保证主进程继续工作）。

### 3.3 边界隔离（必须）

- helper 二进制**不链接** LumenCli 的任何 TS 代码，也不读 LumenCli 的 config 文件或 memory 存储。
- helper 只接收 explicit payload，不做环境嗅探。
- helper 的 API 契约用 TypeScript 类型 + Rust types 双向生成（建议用 `typeshare` 或手写 schema，每次修改走 CI 校验）。

### 3.4 分发与构建（约束）

Phase 1 是私人永久使用，不对外分发。helper 的默认分发形态是：

- **源码在主仓**：`tools/<helper-name>/` 或独立子仓，根据规模决定。
- **本地构建**：用户自己装 rustup + cargo，`bun run build:helpers` 触发 `cargo build --release`。
- **binary 缓存路径**：`tools/<helper-name>/target/release/<name>.exe`（Windows）或 `<name>`（其他）。LumenCli 主进程通过 env 或 config 找到。
- **不走 npm optionalDependencies + platform package** 这条 codex 的分发模型。该模型只在对外 npm publish 的场景下有必要。

未来若 LumenCli 转向对外分发，本节走独立 spec 重新决策。

### 3.5 版本与 ABI（约束）

- helper 的 JSON-RPC 协议版本号独立维护，主进程在 `initialize` 消息里协商。
- 主进程容忍 helper 的小版本向后兼容；大版本不兼容要求 helper 在 `initialize` 阶段明确报错并让主进程降级到无 helper 路径。

## 4. 首批候选 helper 清单

以下是已识别的合理候选。本节不批准引入；每个 helper 需要在真正需要时写独立 spec。

### 4.1 `lumen-sandbox`

**用途**：在 Windows / Linux / macOS 上为 `shell.run` 工具与 S1.11 子代理提供进程沙箱。

**准入映射**：§2.1（TS 做不到 syscall 级沙箱）+ §2.4（helper 可以在更低权限域运行）。**双条满足，达标**。

**设计参考**：codex 的 `windows-sandbox-rs` / `linux-sandbox` / `bwrap` / `execpolicy` / `execpolicy-legacy` 五个 crate，Apache-2.0。source 标 `codex@<commit>, adapted`。

**最小 API**：

```jsonc
// spawn a command inside the sandbox
{ "method": "spawn", "params": {
  "cmd": "...", "args": [...], "cwd": "...",
  "policy": "read-only" | "workspace-write" | "custom",
  "timeoutMs": 30000,
  "envWhitelist": ["PATH", "..."]
}}

// stream stdout/stderr as notifications
{ "method": "stdoutChunk", "params": { "runId": "...", "bytes": "base64..." }}

// report completion
{ "method": "done", "params": { "runId": "...", "exitCode": 0, "signal": null }}
```

**触发条件**：S2+ 阶段用户请求"自动同意 shell 工具"或"长时间运行的代理需要防护"。

**触发前 LumenCli 用什么**：现有 `@lumen/permissions` 的 `ask` 路径 + 保守黑名单。

### 4.2 `lumen-indexer`

**用途**：超大仓库的本地搜索（替代 `rg` spawn + `project.search` 朴素实现），支持 FTS5 + 语义索引（可选 `sqlite-vec`）。

**准入映射**：§2.2（性能差距 ≥ 10× 且命中主路径）。**单条，不达标**。

**状态**：**不引入**。Phase 1 继续用 `rg` spawn，Phase 2 若 S1.13 永久记忆需要 FTS5 能力，先在 Bun + `better-sqlite3` 里实现，只有遇到实测 ≥ 1 秒耗时的真实用户场景才升级为 Rust helper。

### 4.3 `lumen-patcher`

**用途**：apply-patch 风格的结构化文件编辑。

**准入映射**：§2.3（跨语言协议优势）弱相关 + §2.2 偏弱。**不达标**。

**状态**：**不引入**。借鉴 codex `apply-patch` crate 的**协议设计**，在 `@lumen/tools` 内用 TS 实现。source 标 `codex@<commit>, adapted`。性能不够时再升级。

### 4.4 `lumen-mcp-server`

**用途**：让 LumenCli 作为 MCP server 暴露给别的 agent（复用 codex `codex mcp-server` 思路）。

**准入映射**：§2.3（MCP 协议 Rust 生态更活跃）弱相关。**不达标**。

**状态**：**不引入**。TS 有官方 `@modelcontextprotocol/sdk` 支持 server 端；真实需要时在 Bun 内实现，而不是独立 helper。

## 5. 引入流程

每个 helper 从无到有的流程：

1. **识别需求**：某个 LumenCli 能力命中 §2 的两条（或 §2.1 单条）。
2. **写 spec**：`Docs/specs/<date>-helper-<name>.md`，说明：
   - 所属 §2 条件
   - JSON-RPC API 契约
   - 安全模型（主进程传什么、helper 返回什么、出错怎么降级）
   - 验证 smoke 清单
   - 回撤条件（见 §7）
3. **用户批准**：spec 进入 `approved` 状态前，执行窗口不开工。
4. **实施**：
   - 新建 `tools/<name>/` 下的 Rust crate。
   - 主进程侧在 `packages/<bound-package>/src/` 新增 TS 包装层。
   - 新增 `smoke:helper-<name>` smoke，必须能跑无 helper 降级路径 + 有 helper 路径双版本。
   - 更新 `smoke:all`。
5. **Plan Mutation Log**：Blueprint §9.1 追加 "Insert：`<name>` Rust helper" 条目。

## 6. 反向回撤路径

每个 helper 必须支持"LumenCli 没装 Rust 工具链 / helper 被禁用"的降级路径。具体约束：

- 主进程永远能启动和运行，即使 helper 不可用。
- `smoke:helper-<name>` 必须有 "no-helper mode" 变体，在 `LUMEN_NO_RUST_HELPERS=1` 下跑通。
- 功能降级要在 CLI 启动时一次性告知（中文提示 + 降级原因），不要静默。
- 未来若某个 helper 的 Bun 实现性能足够，可以 deprecate Rust helper。`source` 标注留作考古。

## 7. 退出条件

以下情况任意一条成立时，**本 policy 失效**，需要重写：

### 7.1 主干技术栈改变

LumenCli 放弃 Bun + TS 或 OpenTUI + React 核心选型。届时"helper 子进程 vs 主语言"的决策前提变了，本策略不再适用。

### 7.2 对外分发

LumenCli 开始对外分发（npm publish / binary release / SaaS）。届时分发形态、license attribution、优化分发包大小等问题都会改变 helper 架构。触发 `2026-05-12-fork-vs-standalone-decision.md` §6.4 的重新评估，同时这份 policy 也要跟着改。

### 7.3 Rust helper 总数超过 3 个

若同时在维护 ≥ 4 个 Rust helper，说明 Rust 已经在 LumenCli 里成为事实上的二级语言，维护成本显著。届时重新评估：继续多 helper 路线 vs 合并为单一 Rust sidecar vs 干脆 fork codex。

### 7.4 helper 协议复杂度失控

若某个 helper 的 JSON-RPC API 超过 30 个方法或携带复杂双向 streaming 状态，说明"stdio 子进程"的边界已经不适合。触发重新设计（可能升级为独立 daemon + socket，但不走 in-process 绑定）。

## 8. 与其他 spec 的联动

- **Reference Usage Policy §6.6**：codex 是 tier-1 设计参考。本 policy 把"设计参考"具体化为"通过 Rust helper 借鉴原生能力"。每个 helper 的 `source` 标注遵循 §4 规则。
- **Fork vs Standalone Decision**：本 policy 的存在是那份 decision 的第二支柱。没有本 policy，"不 fork codex 但想要 codex 能力"的承诺无法兑现。
- **Blueprint §12 参考项目使用策略**：本 policy 延伸到"何时引入非 TS 代码"。执行摘要建议在 Blueprint §12 下追加一行指向本 spec。

## 9. 决策锁定

本 policy 以当前状态（私人永久使用、Bun + TS 主干、OpenTUI + React UI、Windows x64 一等公民）为前提锁定。第一次激活 helper 引入时，实施方必须重新检查本 policy §2 / §3 / §4 是否仍然合理；如果前提已变，先改 policy 再开工。
