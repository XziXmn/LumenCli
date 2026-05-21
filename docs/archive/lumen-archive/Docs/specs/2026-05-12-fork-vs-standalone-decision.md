# LumenCli Fork vs Standalone 决策

日期：2026-05-12
状态：Decision — **维持 standalone + 选择性借鉴**，不 fork 任何候选仓库。
依赖文档：
- `Docs/specs/2026-05-10-lumencli-reference-usage-policy.md`
- `Docs/specs/2026-05-10-lumencli-pi-agent-core-decision.md`
- `Docs/plans/2026-05-10-lumencli-phase1-agent-mvp-blueprint.md`
- 配套 spec：`Docs/specs/2026-05-12-rust-helper-subprocess-policy.md`

## 0. 背景

LumenCli 已经在 P1 / P1.5a / P1.5b 步骤 0-3 / P2 落地，走的是"standalone 主干 + 把 pi-ai / pi-agent-core 作为 npm 依赖 + 选择性借鉴 tier-1 参考项目"的路线。用户提出合理质疑：直接 fork 一个成熟参考项目（pi / oh-my-pi / opencode / ClaudeCodeRev / codex）做分支改造，是否比当前 standalone 路线更快、更健全。

本 spec 把这个问题摊开评估并固化结论。目的：

- 避免未来新会话反复进入同一讨论。
- 为"什么条件下应当重新考虑 fork"定义明确触发线，而不是把决策留成开放问题。
- 和配套的 `2026-05-12-rust-helper-subprocess-policy.md` 联动，说明"不 fork codex"不等于"放弃 codex 的价值"。

## 1. 候选 fork 源清单

| 候选 | License | 语言 | Fork 可行性 | 原因 |
| --- | --- | --- | --- | --- |
| pi (`earendil-works/pi-mono`) | MIT | TypeScript | 技术可行 | 最成熟稳定的 TS 参考。 |
| oh-my-pi (`can1357/oh-my-pi`) | MIT | TypeScript | 技术可行但更脆 | 已是 pi 的 fork，fork 它等于 fork-of-fork，rebase 链更复杂。单人维护。 |
| opencode (`anomalyco/opencode`) | MIT | TypeScript (Effect-TS + SolidJS) | **不可行** | UI 栈（SolidJS）与 LumenCli 定位的 OpenTUI + React 正交，"改造"等于重写。 |
| ClaudeCodeRev | Anthropic 闭源 | TypeScript | **License 排除** | 不能作为 runtime 基础，Private-Project Exemption 仅覆盖 prompt 层。 |
| codex (`openai/codex`) | Apache-2.0 | Rust | 语言切换全量重写 | 详见 §3。 |

真实候选只有三个：**pi、oh-my-pi、codex**。以下分别评估。

## 2. 候选 A: Fork pi / oh-my-pi

### 2.1 短期优势

- Day 1 即拥有：provider 抽象（pi-ai 完整支持多 provider、OAuth、streaming、tool-call）、event loop、tool-call loop、streaming、permission hook、session repo、compaction、skills loader、prompt-templates loader、部分 coding 工具沉淀、命令注册。
- 不用自己写适配层（当前 `@lumen/agent-core` 的 event-mapper / pi-agent-adapter）。

### 2.2 长期与结构成本

以下成本与 LumenCli 的已定约束直接冲突，Fork 路线无法规避：

#### 2.2.1 UI 框架选择强制重写 40-50%

pi / oh-my-pi 的 TUI 是 `@earendil-works/pi-tui`（自有渲染栈、自有 reconciler、自有键盘模型）。LumenCli 已定 **OpenTUI + React**。在 fork 里把 pi-tui 换成 OpenTUI 不是"改几处组件"，是**数百个文件的外科手术**：

- Box / Text / Input / ScrollBox 等组件语义差异要逐个映射。
- 键盘事件模型（pi-tui 的 keymap 约定 vs `@opentui/keymap`）。
- 生命周期与渲染根（pi-tui 的 `createApp` vs OpenTUI 的 `createCliRenderer + createRoot`）。
- 主题 / 光标 / focus 管理。

换完后 LumenCli 事实上已重写 pi 的一半。"fork 省时间"的核心优势在这一步大幅蒸发。

#### 2.2.2 产品身份与 prompt 主权冲突

LumenCli 已定两条硬约束：

- 语言规则：给人中文、给 AI 英文，写作整段中文，slash 命令英文名 + 中文 summary。
- 写作 pack 是"站在巨人肩膀上"的一等扩展，不是某个 coding agent 的附属命令包。

pi 是纯 coding agent 产品，prompt fabric、命令命名、帮助文本、skill 结构都是围绕 coding 英文体系优化的。在 fork 里铺 LumenCli 的 prompt 体系不是加文件，是**双套并存**（pi 原有 + LumenCli 的），违反用户明确的"一份 prompt 文件"原则。写作 pack 在 pi 的目录结构里是异物。

#### 2.2.3 依赖边界被贯穿，换向成本爆炸

当前 standalone 路线里 `@lumen/agent-core` 是明确的适配边界：

- pi 0.80 做破坏性 API 重写 → 改适配层一个包。
- 想换成直接调 OpenAI SDK / Anthropic SDK 做 A/B → 改适配层一个包。
- 想把某条能力改成自己实现 → 改适配层一个包。

Fork 路线里 pi 的 `Agent` 类是**穿透的**，从 UI 到 session 到 tool 定义到权限决策全绑在同一个类型上。任何换向都是大规模重构。对"永久私人使用、单人维护"的项目，**长期减负价值 > 短期加速价值**。

#### 2.2.4 "oh-my-pi 更好"这条路线更脆

oh-my-pi 是单人项目。fork pi 追的是 `earendil-works` 团队；fork oh-my-pi 追的是一个自己也在追 pi 上游的单人仓库。fork 的 fork 的 rebase 链是维护地狱。

#### 2.2.5 "Day 1 有完整能力"的优势已过期

P1 + P2 完成后，LumenCli 已经有：provider（含真实 mimo 路径）、event loop、tool-call 结构、streaming、permission hook、session、命令注册、TUI 骨架。这些是 fork 路线在 week 0 会赠送的东西。standalone 路线把它们做到了 week 2。差距已经消耗完了。

### 2.3 选项 A 结论

**不选**。UI 框架选择 + 产品身份 + 依赖边界这三件事已经把 fork pi/oh-my-pi 的收益抽掉。剩下的"成熟 coding 工具沉淀"可以通过选择性 vendor 按需补齐，不必吞整个 fork。

## 3. 候选 B: Fork codex

codex 是 tier-1 参考里**技术上最强**的候选。不能用"pi 更合适"一句话带过。本节必须摊开正反两面。

### 3.1 codex 独有、其他候选都没有的能力

这些不是"有更糙版本"，是**同类 OSS 里最成熟的实现**：

1. **两阶段 memory pipeline**（`codex-rs/memories/` + `state/` + SQLite claim/lease + git baseline + consolidation 子代理）。比 pi 的 compaction、opencode 的 session.summarize、Claude Code 的 `/memorize` 都成熟一代。详见 Reference Usage Policy §6.6。
2. **原生沙箱**（`linux-sandbox` + `windows-sandbox-rs` + `bwrap` + `execpolicy` + `execpolicy-legacy` 五个 crate）。跑真实的 Landlock / seatbelt / job-object，不是 shim。
3. **rmcp 双端**：同时是 MCP client 和 MCP server。`codex mcp-server` 可以把自己暴露为别人的 tool。现有 TS MCP SDK 只做 client。
4. **apply-patch** 独立 crate，patch-based 编辑协议，比 "Edit 工具 + string diff" 安全一个量级。
5. **rollout / thread-store / agent-graph-store**：session 持久化 + 并发 + 线程依赖图。比 pi 的 session.jsonl 复杂但正确。
6. **Apache-2.0 + OpenAI 维护**：license 干净（跨语言借鉴合法且无清理义务），团队资源投入量级最高。
7. **多平台 binary 分发链**（`arg0`, `codex-cli/bin/codex.js` shim + `optionalDependencies` 切 6 个 target triple）完整可工作。

排除语言因素，codex 是 tier-1 里的 tier-0。

### 3.2 Fork codex 的真实成本

直接废掉的当前资产：

- `@lumen/agent-core`（pi-agent-core TS 适配层，P2 的全部工作）
- `@lumen/model-provider`（pi-ai TS 封装，P1 的全部工作）
- `@lumen/config`、`@lumen/memory`、`@lumen/tools`、`@lumen/permissions`（所有 Bun+TS 包）
- `@lumen/writing`、`@lumen/prompts`（写作 pack 与中文 prompt 资产加载）
- `apps/cli`（OpenTUI + React，P1.5b 刚做完的）

以上约等于整个 current repo 的 TS 代码。能迁移的只有 prompt 文本资产（`.md` 文件本身与语言无关）和 spec/plan 文档。

替换路径：

- TUI：OpenTUI + React → Ratatui。React 组件模型、`useSyncExternalStore`、lazy import 那套全部报废，换成 Ratatui 的 Widget trait + State pattern。
- 运行时：Bun 1.3 → tokio runtime。
- provider：pi-ai → codex 自带的 `model-provider` + `model-provider-info` + `backend-client` + `codex-client`。

二阶成本：

- **Rust dev loop 退化**：Bun 即时 ts 执行 → Rust incremental compile 仍在秒到分钟级。个人迭代节奏显著下降。
- **AI 辅助编码质量下降**：Claude / Copilot / Cursor 对 Rust 的 borrow checker + lifetime 的补全质量明显低于 TS。对"永久私人使用、一个人维护"的场景尤其关键。
- **写作 pack 进 codex 比进 pi 更异物**。codex 是纯 OpenAI coding 产品本体，写作 subcommand 在它的目录结构里比"外挂"还陌生。
- **去 OpenAI 品牌（`@openai/codex`、`codex` binary 名、帮助文本、bug-report URL）的 rebase 成本**：每次 OpenAI 上游重构都重新付一次。
- **中文 UI + 英文 prompt + 写作整段中文这套语言规则**在 Rust + codex 生态里没有同构样本，基础设施要从零建。

### 3.3 Rust 真能提速的地方（诚实清单）

| 场景 | Rust 优势 | LumenCli 触碰频率 |
| --- | --- | --- |
| 代码库 ripgrep-style 扫描 | 显著 | 高（`project.search` 工具） |
| 本地 SQLite 批量 IO（S1.13 Phase 2） | 中等 | 中（永久记忆落地时） |
| 原生沙箱接口（Landlock / seatbelt / job-object） | 必需 | 中（S2+ 安全硬化） |
| 大文件 diff 计算 | 显著 | 低（apply-patch 单文件都是小 diff） |
| 主循环 / LLM streaming | 可忽略 | 几乎所有时间都在等 LLM |
| 终端渲染（Ratatui vs OpenTUI+React） | 边际 | OpenTUI 已是 Zig native，不比 Ratatui 慢 |

瓶颈路径里 Rust 真能赚的只有"代码搜索 + SQLite 批写 + 原生沙箱"三件事。其他 90% 的时间都在等 LLM，Rust 和 Bun 无差别。

### 3.4 选项 B 结论

**不 fork**。核心理由**不是** "Rust 没用"，而是：

- 把现有 TS 工作全废 + 失去 AI 辅助编码加持 + 独立维护 Rust 产品 ≫ codex 设计本身的价值。
- codex 最值钱的东西是**架构与 pipeline 设计**（memory 两阶段、apply-patch 协议、sandbox 分层、rmcp 双端）。这些完全可以在 TS 里重建，Apache-2.0 license 就是为这种跨语言借鉴写的。
- codex 次值钱的东西是**原生沙箱**。TS 做不到。但正确解法是把沙箱作为**独立 Rust helper 子进程**，不是"整个 LumenCli 切 Rust"。详见 `2026-05-12-rust-helper-subprocess-policy.md`。

## 4. 决策表汇总

| 维度 | Fork pi/oh-my-pi | Fork codex | Standalone + 选择性借鉴（当前） |
| --- | --- | --- | --- |
| 起点能力（memory / sandbox / MCP / apply-patch） | 部分到位 | **完整到位** | 需要 3-6 个月逐步补 |
| UI 框架契合 | 冲突（pi-tui 要全换） | 冲突（Ratatui 要重建） | 已在位（OpenTUI + React） |
| 现有 TS 代码复用率 | ~30%（prompt + writing + spec） | ~10%（仅 `.md` 资产） | 100% |
| 开发迭代速度 | Bun 即时 | Rust 秒→分钟 dev loop | Bun 即时 |
| AI 辅助编码质量 | 保持 | 明显下降 | 保持 |
| 写作 pack 融入度 | 异物 | 极异物 | 独立包 + 命令系统，清晰 |
| 中文 UI / 中文 prompt 基础设施 | 双套并存 | 从零建 | 现有资产可用 |
| 品牌去化持续成本 | 中（pi brand 较弱） | 高（OpenAI brand 贯穿） | 无 |
| 长期单人维护成本 | 追 pi + 懂 Bun/TS | 追 OpenAI + 懂 Rust | 追 pi（适配层）+ 懂 Bun/TS |
| 借鉴成熟设计 | 原生吃下，含不想要的 | 原生吃下，含不想要的 | 选择性 vendor |
| 改方向成本 | 大 | 巨大 | 小（边界包独立） |

## 5. 最终决策

**当前结论：继续 Standalone + 选择性借鉴**。

执行策略已在 Reference Usage Policy §6 与 Blueprint §12 定义；本 spec 不改变这些规则，只为 Fork 决策提供显式评估锚点。

对 codex 的特殊处理：**架构与设计作为 tier-1 参考（见 Reference Usage Policy §6.6），原生能力通过独立 Rust helper 子进程按需引入（见 `2026-05-12-rust-helper-subprocess-policy.md`）**。

## 6. Fork 触发线（未来重新评估的条件）

本决策不是永久。出现以下情况时必须重新评估 Fork 是否成为更优路径。命中任意**两条**即触发新一轮决策 spec：

### 6.1 重复实现触发线

**条件**：在 3 个月内反复重新实现 pi / oh-my-pi / codex 已经写好的能力 ≥ 3 个子系统，且每次重实现占用 ≥ 1 周。

**信号**：Plan Mutation Log 里出现 ≥ 3 条"参照 <上游> 实现 <能力>"的条目。

### 6.2 适配层维护成本失控触发线

**条件**：`@lumen/agent-core` 的 pi 适配层（当前为 `pi-agent-adapter.ts` + `event-mapper.ts`）代码量 / 修改频率超过自写加强版的 1.5 倍。

**度量**：每季度统计一次。指标为"适配层 LOC" + "适配层相关 commit 数"。

### 6.3 技术栈选型改向触发线

**条件**：LumenCli 主动放弃 OpenTUI + React 或 Bun + TS 的任一核心选型。

**示例**：回到 pi-tui、切到 Textual/Ink/Charm、切到 Node + pnpm、切到纯 Rust。任何一条成立即触发。

### 6.4 维护方能力改变触发线

**条件**：从"一个人私人维护"变为"多人协作 / 公开发布 / 对外分发"。

**影响**：Private-Project Exemption 失效（见 Reference Usage Policy §5），而且团队协作对"统一 UI 栈 + 统一目录结构"的收益会显著超过 standalone 的解耦优势。届时 fork 一个有社区基础的 upstream 可能更合理。

## 7. 重新评估流程

当 §6 任意两条触发时：

1. 在 `Docs/specs/` 下新建 `YYYY-MM-DD-fork-reevaluation.md`，引用本 spec。
2. 重新填写 §4 决策表，基于当时实际状态。
3. 若结论变为 Fork，**必须同时定义迁移路径**：
   - 现有 `@lumen/*` 包作为 fork 仓的顶层子目录保留还是废弃。
   - 现有 spec / plan / report 的迁移策略。
   - 现有 prompt 资产（含 `source` 标注）的 license/attribution 处理。
4. 若结论仍为 Standalone，在 Plan Mutation Log 补一条 "Reaffirm Standalone @ <date>"。

## 8. 对 Blueprint 的影响

- Blueprint §4 参考来源使用规则与 §12 参考项目策略不变。
- 本 spec 的存在让未来任何"是否该 fork"的讨论有明确引用锚点，避免反复争议。
- Plan Mutation Log 新增一条对应记录（见 Blueprint §9.1）。

## 9. 相关 spec 联动

- `Docs/specs/2026-05-10-lumencli-reference-usage-policy.md`：tier-1 参考项目的借鉴边界。本 spec 不改变这些边界。
- `Docs/specs/2026-05-10-lumencli-pi-agent-core-decision.md`：pi-agent-core 作为 runtime 内核的决策。本 spec 的 standalone 结论建立在该决策之上。
- `Docs/specs/2026-05-12-rust-helper-subprocess-policy.md`：把 codex 的原生能力以独立 Rust helper 子进程方式按需引入，避免"要 Rust 能力就得 fork codex"的伪两难。本 spec 和该 spec 是姐妹文档，应同步阅读。
