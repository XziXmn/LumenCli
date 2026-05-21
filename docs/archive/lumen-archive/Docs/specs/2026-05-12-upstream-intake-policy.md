# LumenCli Upstream Intake Policy

日期：2026-05-12
状态：Policy — 生效。首次应用在 Pi 0.75（若/当上游发布）时走完整流程一次，作为校准。
依赖文档：
- `Docs/specs/2026-05-12-pi-powered-runtime-strategy.md`
- `Docs/specs/2026-05-10-lumencli-reference-usage-policy.md`
- `Docs/specs/2026-05-12-fork-vs-standalone-decision.md`

## 0. 目的

LumenCli 采用 Pi-powered runtime 架构，长期受益依赖于**定期、受控地吸收上游变化**。本策略定义：

- Pi 依赖包的版本升级节奏与流程。
- tier-1 设计参考源（OpenClaw / codex / opencode / oh-my-pi）的定期 design sweep 方式。
- scoped vendor / adapt 在什么条件下允许，怎么执行。
- 升级过程的最小验证门槛与回滚路径。

目标：让 LumenCli 在保持 standalone 边界的前提下，稳定吸收 Pi 及其生态的 bug 修复与能力增长，避免"升级成债"。

## 1. 非目标

- 不追上游 bleeding edge。每次升级都是受控窗口，不是 auto-merge。
- 不把上游设计变成主项目的附属任务清单。design sweep 产出的是"候选借鉴项"，不是 backlog。
- 不引入 "vendor 全部 Pi 源码" 这种反向依赖。scoped vendor 有严格条件（§4）。

## 2. 追踪对象

### 2.1 Pi 依赖（Dependency-first）

| npm 包 | 当前版本 pin | 上游仓库 | 用途 | LumenCli 消费层 |
| --- | --- | --- | --- | --- |
| `@earendil-works/pi-ai` | `0.74.0` | `github.com/earendil-works/pi`（别名 `badlogic/pi-mono`，monorepo 内的 `packages/ai`） | provider 抽象 / streaming | `packages/model-provider` |
| `@earendil-works/pi-agent-core` | `0.74.0` | `github.com/earendil-works/pi`（`packages/agent`） | agent runtime 内核 | `packages/agent-core` |
| `typebox` | `1.1.38` | `github.com/sinclairzx81/typebox` | tool 参数 schema | `packages/agent-core/src/tool-adapter.ts` |

这些是 LumenCli 的 **runtime tracking set**。每次 upstream-intake 检查这三项的变化。

### 2.2 设计参考源（Design-only sweep）

| 仓库 | License | 用途 | LumenCli 借鉴方式 |
| --- | --- | --- | --- |
| `openai/codex` | Apache-2.0 | memory / sandbox / apply-patch / MCP 双端 | 设计借鉴（见 Reference Usage Policy §6.6）；Rust 原生能力走 Rust helper policy |
| `openclaw/openclaw` | 待核对 | Pi-powered runtime 的产品级样本 | 架构参考（见 pi-powered-runtime-strategy §5）；不作 runtime 依赖 |
| `anomalyco/opencode` | MIT | 多模型路由 / session 事件 | 结构参考（见 Reference Usage Policy §6.2） |
| `can1357/oh-my-pi` | MIT | coding 工具 / 子代理 / LSP / hashline edit | 代码借鉴（见 Reference Usage Policy §6.1 oh-my-pi 条） |

这些是 LumenCli 的 **design tracking set**。每次设计 sweep 检查是否有新的值得借鉴的模式。

> **License 核对义务**：`openclaw/openclaw` 纳入本 policy 前须在一次 sweep 中确认 license。若非 MIT/Apache-2.0 等 permissive license，本表需移除相应行并限制引用方式至"架构观察"级别。

## 3. 升级节奏

### 3.1 触发类型（四档）

| 触发 | 节奏 | 深度 |
| --- | --- | --- |
| **Scheduled**（计划） | 每 4-6 周一次 | 所有 runtime tracking 包检查 + 设计 sweep |
| **Patch**（修复） | 发现影响 LumenCli 的 bug 时即刻 | 单包升级 |
| **Opportunistic**（跟进新能力） | 上游发布带 LumenCli 相关的新能力时 | 单包升级 + design review |
| **Security**（安全） | 上游或我们发现安全问题即刻 | 单包升级，跳过正常验证门槛仅保留基础 smoke |

### 3.2 Phase 适配

- **Phase 1**（当前）：Scheduled 节奏适度，侧重 bug 修复类 patch。重大能力升级延后到 Phase 1 验收之后。
- **Phase 2+**（记忆 / 子代理 / 自我迭代）：Scheduled 节奏可能下调到每 6-8 周，因为此时 adapter 边界层更成熟。
- **对外分发阶段**（若发生）：本 policy 失效，重新设计含依赖签名 / SBOM / 版本锁等更强约束的 policy。

## 4. 升级流程（以 Pi 为主）

对每次升级执行以下步骤。新会话可按此清单走：

### 4.1 准备阶段

1. **打开 Upstream Intake Log**：新建 `Docs/reports/YYYY-MM-DD-upstream-intake-<tag>.md`（tag 示例：`pi-0.75`）。
2. **记录当前 baseline**：
   - 当前 package.json 中三包版本。
   - 上次成功 `smoke:all` 的 commit SHA 与日期。
3. **识别上游变化**：
   - 对每个 runtime tracking 包，对比 CHANGELOG / release notes / diff。**先核对 §2.1 表格中的"上游仓库"字段是否仍然有效**（维护者改名 / fork 迁移时路径会变，2026-05 的 calibration 已经观察到 `badlogic/pi-mono` → `earendil-works/pi` 的 alias）。
   - 标记条目：
     - 🔴 **Breaking**（API 签名 / 行为改变）
     - 🟡 **Behavior change**（默认值、错误信息、默认路径等）
     - 🟢 **Additive**（新增能力、bugfix、性能）

### 4.2 决策阶段

对每个 🔴 / 🟡 条目回答：

- 影响哪个 adapter 文件？
- 有替代方案吗？
- 升级成本预估（LOC / 重构风险）？
- 是否值得？

决策结果写入 Log 对应段。**一次升级的结论只能是三选一**：

1. **Upgrade as-is**：所有条目都可吸收，adapter 层改动可控。
2. **Upgrade with adapter changes**：需要修 adapter 文件，但不触及产品层。
3. **Skip / defer**：风险 > 收益，跳过本次。

决策 3 必须记录理由和"下次重新评估"的触发条件。

### 4.3 实施阶段

只有决策 1 或 2 才进入此阶段。

1. **起 branch**：`upstream-intake/<package>-<version>`。
2. **改 package.json**：精确版本 pin，不用 caret 或 tilde 范围。
3. **`bun install`**：验证 lockfile 干净变化。
4. **改 adapter**（若决策 2）：**只**改 §4 Pi-Powered Runtime Strategy spec 中登记的 adapter 文件。改动产品层算 scope creep，拦截。
5. **运行验证门槛**（§6）。
6. **合并回 main**。

### 4.4 记录阶段

- Log 状态改为 "merged" 或 "skipped"。
- Plan Mutation Log（Blueprint §9.1）追加一条 "Upstream Intake: <package> <old> → <new>"。
- 更新本 policy §2.1 表格中的当前版本 pin。

## 5. 设计 Sweep 流程（每次 Scheduled 触发附带）

### 5.1 范围

每次 Scheduled 触发，顺带做一次 design sweep，但不强制：

- 对 design tracking set 中的每个仓库做一次 **shallow pass**：读 CHANGELOG / blog / discussion / recent PR 列表。
- 时间箱：**最多 2 小时**。超时即停，未完成项留到下次。

### 5.2 产出

- Log 中新增一段 "Design Sweep Findings"。
- 对每个发现的"值得借鉴模式"产出一行：
  - 模式名
  - 上游位置（URL + commit）
  - 对 LumenCli 哪个包 / 哪个未来 spec 有用
  - 预估工作量（T-shirt size）
  - 下一步：归档 / 开 TODO / 开 spec

### 5.3 决策

sweep 产出**永远**是候选项，不是 backlog。是否进入路线：

- 触发独立 spec 写作（`Docs/specs/YYYY-MM-DD-<topic>.md`）。
- 在那份 spec 里做详细的 fork vs standalone vs vendor vs clean-room 决策。
- 通过 Reference Usage Policy §9 决策变更协议批准。

## 6. 验证门槛

每次升级（决策 1 或 2）必须通过以下门槛才能合并：

### 6.1 最小门槛

- `bun install --frozen-lockfile` 成功。
- `bun run build` 成功。
- `bun run typecheck` 成功。
- `bun run smoke:boundaries` 通过（保证没有因为升级而让 Pi 类型穿透到产品层）。
- `bun run smoke:all` 通过（含 14 条 smoke）。

### 6.2 行为门槛（针对 🟡 / 🔴 升级）

针对 🟡 行为变更，对应行为必须有对应 smoke。若当前 smoke 集未覆盖，这一步包括"新增 smoke"。不因为"没 smoke"就跳过。

针对 🔴 API 破坏，升级后必须手工验证一条端到端流程：

- `bun --conditions development apps/cli/src/main.tsx --once "/status"`
- `bun --conditions development apps/cli/src/main.tsx --once "请读 README.md 的前两行"`（需要 LUMEN_USE_PI_AGENT=1 且有本地 mimo key）

### 6.3 Security 升级例外

Security 升级允许跳过 §6.2 行为门槛，但**不**允许跳过 §6.1。若 §6.1 失败，走 §7 回滚。

## 7. 回滚路径

每次升级必须有明确回滚路径：

1. **升级前**：
   - 记录 git HEAD（revertable）。
   - `bun.lock` 纳入 commit。
2. **升级失败**：
   - 一次 `git revert <upgrade-commit>` + `bun install`。
3. **升级合并后发现问题**：
   - 起 hotfix branch。
   - 优先：pin 回旧版本。
   - 次选：在 adapter 层加临时 wrapper 绕开新行为。
   - 最后：如果成本高，把该升级整体回滚，重新走流程。

## 8. Scoped Vendor 策略

### 8.1 什么是 scoped vendor

从上游取出**极小**范围的代码或设计，adapt 到 LumenCli 仓内，不作为依赖导入。例如：

- 把 Pi 的某个内部 helper 函数 paraphrase 到 `@lumen/agent-core/src/<helper>.ts`。
- 把 codex 的 apply-patch 格式规范（协议，不是代码）实现为 `@lumen/tools/src/apply-patch.ts`。
- 把 OpenClaw 的 malformed-tool-call 修复逻辑借鉴到 `packages/agent-core/src/tool-adapter.ts` 的 `prepareArguments`。

### 8.2 准入条件（三选二）

- **上游未公开导出**：所需能力在上游包的 `dist/index.d.ts` 之外。
- **稳定性要求高**：能力在多个 upstream intake 中已证明稳定，复制它本身不会很快过时。
- **小而完整**：能力的 LOC ≤ 200，边界清晰，测试容易。

### 8.3 标注与治理

- 文件顶部必须带 `source: <upstream>@<commit>, adapted` 或 `clean-room`。
- 进入 Plan Mutation Log：`Scoped Vendor: <function/module> from <upstream>`。
- 每次 upstream intake 检查这些 scoped vendor 是否仍需保留；上游后续公开导出 / 有更好的方式时，优先移除自写版本。

### 8.4 禁止项

- 不允许 "scoped vendor 整个子模块" 来绕开依赖限制（那是变相 fork）。
- 不允许 scoped vendor 跨语言（例如把 codex 的某段 Rust 翻译成 TS），这走 §4 scoped vendor + `rust-helper-subprocess-policy` 联合评估。
- 不允许 scoped vendor 后"忘记去标注 source"。evictable by grep。

## 9. 跟踪与回顾

### 9.1 Intake Log 归档

所有 `Docs/reports/YYYY-MM-DD-upstream-intake-<tag>.md` 都保留在仓内。每季度回顾一次：

- 总结本季度 intake 次数 / 决策分布（1/2/3）。
- 回顾 scoped vendor 的可移除项。
- 评估 design tracking set 是否需要调整（新增 / 移除 / 调 tier）。

### 9.2 KPI

- **Intake coverage**：每 6 周至少一次 Scheduled。
- **Adapter-only discipline**：连续 ≥ 3 次 intake 零产品层改动 = 架构定位成功。
- **Scoped vendor hygiene**：任何时间点 scoped vendor 总数 ≤ 5 项。超过则触发 review。

## 10. 与其他 spec 的联动

- `pi-powered-runtime-strategy.md`：定义了 Pi 与 LumenCli 的架构边界。本 policy 保证那些边界被**持续**维护。
- `fork-vs-standalone-decision.md`：§6 定义 fork 触发线。本 policy §9.1 的季度回顾是评估那些触发线的自然节点。
- `reference-usage-policy.md`：定义借鉴 / source 标注规则。scoped vendor 的标注复用那份 spec。
- `rust-helper-subprocess-policy.md`：跨语言 vendor 的协调入口。

## 11. 首次应用

本 policy 生效后的**首次** intake 作为校准：

- 时间：Pi 0.75（或下一次 Pi 发布）之后 1 周内。
- 目的：完整走一遍 §4 流程，校准模板与清单。
- 产出：`Docs/reports/YYYY-MM-DD-upstream-intake-pi-0.75.md`。
- 经验回填：校准中发现的 policy 改进点，回写本文档 §4 / §5 / §6。

### 11.1 Dry-run 校准（2026-05-12）

在首次 Scheduled intake 之前，已执行过一次 dry-run，产出 `Docs/reports/2026-05-12-upstream-intake-dry-run.md`：

- 结论：Skip（npm 上 pi 0.74.0 即 latest，无 delta）。
- 校准产出：
  - §2.1 表格新增"上游仓库"列（本次修订已应用）。
  - §4.1 步骤 3 增加"核对上游仓库名是否有效"提示（本次修订已应用）。
- 学到的事实：`badlogic/pi-mono` 已经成为 `earendil-works/pi` 的别名，future 查询用 canonical 名。
