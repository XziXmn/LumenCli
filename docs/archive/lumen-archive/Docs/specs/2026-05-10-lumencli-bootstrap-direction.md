# LumenCli 初始构建方向

日期：2026-05-10（2026-05-10 修订：产品身份升级为 coding-first + 写作扩展，运行时切 Bun，TUI 选 OpenTUI）

## 1. 结论

LumenCli 是 **CLI-first 的主流代码编程通用智能体**，在 runtime 主干上叠加写作助手、个人任务助理、记忆协作等扩展能力。

- 主干 = 通用 coding agent（对标 Claude Code / opencode / oh-my-pi 级别）。
- 扩展 = 写作助手（`/plan /draft /review /revise`、`.novel` 项目协议）、个人任务与记忆。
- 项目不 fork 任何上游产品，而是在 MIT tier-1 参考项目（pi / oh-my-pi / opencode / opentui）之上自建产品，`ClaudeCodeRev` 作为 prompt / UX 设计参考（Private-Project Exemption 下）。

第一阶段采用 **Bun + TypeScript + OpenTUI + React**；Rust 作为后续 native spine 接入。

## 2. 项目边界

**LumenCli 当前主入口是 CLI**。桌面 UI、常驻助手界面、Tauri 壳层和其他图形界面属于后续阶段。

项目不是：

- `pi` / `oh-my-pi` / `opencode` / `Claude Code` 的改版
- `Lumen-Rebuild` 的附属 CLI
- 桌面助手项目的临时命令行壳

项目是：

- 独立 coding-first CLI agent
- 个人 AI 助理底座（基于 coding agent runtime）
- 可逐步扩展到写作、文件协作、任务管理、记忆、多模态理解的综合 agent

## 3. 参考来源分工

详细策略见 `Docs/specs/2026-05-10-lumencli-reference-usage-policy.md`。此处只列结论：

### Tier-1 MIT 参考项目

| 项目 | 角色 |
| --- | --- |
| `pi` | Runtime 依赖上游（`@earendil-works/pi-ai` + `@earendil-works/pi-agent-core`） |
| `oh-my-pi` | pi 的深度 fork，coding 工具 / 子代理设计借鉴来源 |
| `opencode` | 多模型路由 / session / coding prompt 架构参考 |
| `opentui` | TUI runtime 依赖（`@opentui/core` + `@opentui/react` + `@opentui/keymap`） |

四者同级 tier-1，允许借鉴 runtime + tool + prompt + UI 结构，不作整体依赖或 fork。

### Private-Project Exemption 参考

- `ClaudeCodeRev`（闭源 license 的逆向）：允许作为 **prompt / UX 设计参考**借鉴并 adapt 到 `packages/prompts/assets/`，runtime 层严禁跨线。豁免以私有仓库 + 永久私人使用为前提。

### 写作扩展迁移源

- `Lumen-Rebuild`：写作命令语义 / `.novel` 协议 / project memory 迁移来源，仅进入 `packages/writing` 及相关写作 package。

## 4. 技术路线

### 4.1 第一阶段：Bun + TypeScript agent brain

第一阶段重点是快速形成可用 coding-first CLI agent：

- **运行时**：Bun ≥ 1.3（单一运行时，取代 Node）。
- **包管理**：Bun workspaces。
- **TUI**：OpenTUI + React（`@opentui/core` + `@opentui/react` + `@opentui/keymap`）。
- **Agent 内核**：pi-agent-core（`@earendil-works/pi-agent-core`）。
- **Provider**：pi-ai（`@earendil-works/pi-ai`）。
- **命令系统 / 记忆 / 权限 / MCP**：LumenCli 自有 packages，沿用已有设计。
- **Prompt 资产**：`packages/prompts/assets/` 下的 Markdown + frontmatter 源文件。

Windows x64 是第一阶段 **唯一** 一等公民平台；其他 OS / arch 留待 S2+ 评估。

### 4.2 后续阶段：Rust native spine

当 CLI agent 行为稳定后，再引入 Rust：

- native launcher
- Tauri host
- PTY / shell executor
- filesystem watcher
- SQLite / local indexer
- permission engine
- packaging runtime（如 `bun build --compile` 不满足分发需求）

TypeScript / Bun 与 Rust 之间优先使用 JSON-RPC、stdio 或本地进程协议通信，避免早期引入复杂 FFI。

## 5. 初始架构建议

```text
LumenCli/
  apps/
    cli/                          Bun 入口
      src/
        core/                     渲染无关（事件、状态、动作）
        ui/                       OpenTUI + React 组件（迁移边界）
          react/                  第一实现
  packages/
    agent-core/                   pi-agent-core 封装
    command-system/
    config/
    context/
    memory/
    mcp/
    model-provider/               pi-ai 封装
    permissions/
    prompts/                      prompt + skill + template 资产
    sub-agent/                    子代理 runtime（S1.11）
    shared-schema/
    tools/
    writing/                      写作扩展
  crates/                         S2+ 启用
    lumen-native/
    lumen-cli-launcher/
  references/                     MIT + 闭源逆向参考，不提交
    pi/
    oh-my-pi/
    opencode/
    opentui/
    ClaudeCodeRev/
```

`crates/` 可以后置创建。第一阶段不需要为了形式完整而同时维护两套语言核心。

## 6. 当前决策

- LumenCli 产品身份：coding-first 通用智能体 + 写作等扩展能力。
- 运行时：Bun（单一），切换由 Plan Mutation Log 记录。
- 包管理：Bun workspaces（完全替代 pnpm）。
- TUI：OpenTUI + `@opentui/react`（不用 solid / three）。
- Agent 内核：pi-agent-core 封装在 `@lumen/agent-core` 内。
- Provider：pi-ai 封装在 `@lumen/model-provider` 内。
- 平台：Phase 1 仅 Windows x64。
- 参考项目：pi / oh-my-pi / opencode / opentui 为 tier-1 MIT 参考；ClaudeCodeRev 为 Private-Project Exemption 下的 prompt/UX 参考；Lumen-Rebuild 为写作迁移来源。
- `references/` 不提交远程。
