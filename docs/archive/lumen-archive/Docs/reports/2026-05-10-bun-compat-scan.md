# Bun Compatibility Scan (P1.5a Preflight)

日期：2026-05-10
状态：**扫描完成 ✅ — 可以开始 P1.5a 代码实施**

本报告记录 LumenCli 切换到 Bun 运行时（P1.5a）前的依赖与 Node builtin 兼容性扫描。

## 0. 环境

| 项 | 值 |
| --- | --- |
| 扫描日期 | 2026-05-10 |
| Bun 版本 | 1.3.13 |
| Bun revision | 1.3.13+bf2e2cecf |
| Bun 内置 Node 兼容版本 | 24.3.0 |
| 宿主 OS | Windows x64 |
| 宿主 Shell | PowerShell 7 |
| PATH 注入方式 | 本 session `$env:USERPROFILE\.bun\bin` 前置（永久配置待 user shell 重载后验证）|

## 1. @lumen/* 内部包

测试方式：每个包内跑 `bun -e "await import('@lumen/<pkg>')"`，或通过 `bun --conditions development apps/cli/src/main.ts` 间接验证（workspace TS 解析）。

| 包 | 状态 | 验证路径 |
| --- | --- | --- |
| `@lumen/agent-core` | ✅ 通过 | `bun --conditions development apps/cli/src/main.ts --once /status` 正常 |
| `@lumen/command-system` | ✅ 通过 | `smoke-ux.mjs` 通过（走 `/help /tools /config /model`）|
| `@lumen/config` | ✅ 通过 | CLI 启动读默认 mimo 配置成功 |
| `@lumen/context` | ✅ 通过 | `smoke-context.mjs` 通过 |
| `@lumen/memory` | ✅ 通过 | `smoke-memory.mjs` 通过 |
| `@lumen/mcp` | ✅ 通过 | `smoke-mcp.mjs` 通过（见 §2 详述）|
| `@lumen/model-provider` | ✅ 通过 | pi-ai streaming 深度冒烟 PASS |
| `@lumen/permissions` | ✅ 通过 | `smoke-permissions.mjs` 通过 |
| `@lumen/prompts` | ✅ 通过 | CLI `/help` 输出正常 |
| `@lumen/shared-schema` | ✅ 通过 | 纯类型，无运行时 |
| `@lumen/tools` | ✅ 通过 | `smoke-tools.mjs` 通过 |
| `@lumen/writing` | ✅ 通过 | `smoke-writing.mjs` 通过（通过 spawn 子进程跑 CLI） |

## 2. 第三方 Runtime 依赖

### 2.1 `@earendil-works/pi-ai` 0.74.0

| 检查项 | 结果 |
| --- | --- |
| `import '@earendil-works/pi-ai'` 在 Bun 下 | ✅ 通过，60 exports |
| `registerBuiltInApiProviders()` | ✅ 通过 |
| `getModels('anthropic')` | ✅ 返回模型列表 |
| `completeSimple()` streaming 调用（自建 mock SSE server） | ✅ 通过。response content = `[{"type":"text","text":"bun-stream-ok"}]`，stopReason = `stop` |
| 真实 mimo-v2.5 端点调用（内网 `http://192.168.31.160:8007/v1`） | ✅ 通过。`bun --conditions development apps/cli/src/main.ts --once "..."` 返回预期中文回复 |

### 2.2 `@modelcontextprotocol/sdk`

| 检查项 | 结果 |
| --- | --- |
| `import '@modelcontextprotocol/sdk/client/index.js'` | ✅ 通过，2 exports，`Client` 为 function |
| `import '@modelcontextprotocol/sdk/client/stdio.js'` | ✅ 通过，3 exports，`StdioClientTransport` 为 function |
| `connectMcpServer()` → `spawn node script` → stdio transport | ✅ 通过。`smoke-mcp.mjs` 全流程成功 |
| `client.callTool({ name: 'mcp.mock.ping' })` 返回 pong | ✅ 通过 |

**关键确认**：MCP 的 stdio 子进程 + 二进制协议在 Bun 下行为与 Node 一致。这是整条 Bun 迁移链里风险最高的部分，已扫清。

## 3. Node Builtins

测试方式：`bun -e "const m = await import('<mod>'); console.log(Object.keys(m).length)"`。

| builtin | 状态 | 导出数 |
| --- | --- | --- |
| `node:fs/promises` | ✅ 通过 | 46 |
| `node:child_process` | ✅ 通过 | 9 |
| `node:readline/promises` | ✅ 通过 | 4 |
| `node:http` | ✅ 通过 | 20 |
| `node:crypto` | ✅ 通过 | 66 |
| `node:os` | ✅ 通过 | 24 |
| `node:path` | ✅ 通过 | 18 |
| `node:process` | ✅ 通过 | 90 |
| `node:url` | ✅ 通过 | 13 |

Bun 1.3 对 Node builtins 的兼容性在 LumenCli 使用的 API 面上是完整的。

## 4. 构建 / 启动 / Smoke 路径

| 路径 | Bun 命令 | 状态 | 备注 |
| --- | --- | --- | --- |
| 构建 | `bunx tsc -b` | ✅ 通过 | 无 warning，exit 0 |
| CLI 直接执行 TS | `bun --conditions development apps/cli/src/main.ts --once /status` | ✅ 通过 | 无 tsx 依赖 |
| `smoke:cli` 等价 | 同上 | ✅ 通过 | 替代原 `pnpm --filter @lumen/cli exec tsx ...` |
| `smoke:provider` | `bun scripts/smoke-openai-compatible.mjs` | ✅ 通过 | 输出 `mock:mock-model:hello provider` |
| `smoke:permissions` | `bun scripts/smoke-permissions.mjs` | ✅ 通过 |  |
| `smoke:tools` | `bun scripts/smoke-tools.mjs` | ✅ 通过 |  |
| `smoke:mcp` | `bun scripts/smoke-mcp.mjs` | ✅ 通过 |  |
| `smoke:context` | `bun scripts/smoke-context.mjs` | ✅ 通过 |  |
| `smoke:memory` | `bun scripts/smoke-memory.mjs` | ✅ 通过 |  |
| `smoke:writing` | `bun scripts/smoke-writing.mjs` | ✅ 通过 | 目前脚本内部还 spawn `pnpm.cmd`；P1.5a 需改为 `bun` spawn |
| `smoke:ux` | `bun scripts/smoke-ux.mjs` | ✅ 通过 | 同上 |
| 端到端：真实 mimo-v2.5 调用 | `bun --conditions development apps/cli/src/main.ts --once "..."` | ✅ 通过 | 返回"Bun + LumenCli 跑通了。" |

## 5. 回归风险清单（扫描后更新）

| 风险 | 原等级 | 实测结果 | 新等级 |
| --- | --- | --- | --- |
| `@modelcontextprotocol/sdk` 在 Bun 下 stdio transport 行为 | 中 | 完整流程通过 | ✅ 已消除 |
| `@earendil-works/pi-ai` 拉入的各 provider SDK | 中 | 基础 import + OpenAI-compatible streaming 通过；其他 provider SDK（Anthropic / AWS / Google / Mistral）未单独测试但不阻塞 P1 | 低 |
| Bun 对 `spawn` 的 Windows cmd 兼容 | 中 | `smoke-writing` / `smoke-ux` 用现有 `cmd.exe /d /s /c pnpm` 模式仍能跑；P1.5a 将统一改为 spawn `bun` | ✅ 已消除 |
| OpenTUI 的 Zig native addon 在 Windows x64 下的加载 | 低 | 本轮未测（P1.5b 范围）| 保留作为 P1.5b 前置 |
| React 19 + Bun HMR 冲突 | 低 | Phase 1 不做 HMR | ✅ 无关 |
| tsc 增量 build 在 Bun 下的行为 | 低 | `bunx tsc -b` 通过 | ✅ 已消除 |

## 6. 识别的待办（P1.5a 实施项）

扫描发现的、必须在 P1.5a 代码层落实的具体改动：

1. `scripts/smoke-writing.mjs`、`scripts/smoke-ux.mjs`、`scripts/smoke-openai-compatible.mjs` 里 spawn `pnpm.cmd` / `cmd.exe /d /s /c pnpm` 的地方，改为 spawn `bun`。
2. 所有 smoke script 头部可以保留 `#!/usr/bin/env node` 或改成 `#!/usr/bin/env bun`（一致性选 bun）。
3. 根 `package.json` 的 `scripts.smoke:*` 从 `node scripts/...` → `bun scripts/...`，从 `pnpm --filter ...` → `bun --filter ...`。
4. `scripts.smoke:cli` 从 `pnpm --filter @lumen/cli exec tsx --conditions development src/main.ts --once /status` 改为 `bun --conditions development apps/cli/src/main.ts --once /status`（tsx 依赖可删）。
5. 删除 `pnpm-workspace.yaml` 与 `pnpm-lock.yaml`，根 `package.json` 加 `"workspaces": ["apps/*", "packages/*"]`。
6. 删除 `devDependencies.tsx`。
7. `engines.node: ">=22.0.0"` → `engines.bun: ">=1.3.0"`。
8. 删除 `packageManager: "pnpm@..."`。
9. 运行 `bun install` 生成 `bun.lock`，提交。
10. 各 package 的 `scripts.dev` 里 `tsx --conditions development src/main.ts` 改为 `bun --conditions development src/main.ts`。
11. 各 package 的 `scripts.build` 保持 `tsc -b`（或改 `bunx tsc -b`，behavior 相同）。
12. README 更新安装章节：要求 Bun 1.3+ 与 Windows x64。

## 7. 结论

**扫描结果：所有已知风险消除或降级为低风险/无关。P1.5a 代码层实施可以启动。**

唯一需要后续验证的：Bun PATH 在新 PowerShell / cmd session 里的持久化。安装器声称已注入用户 PATH；本轮验证是在手工注入 session PATH 的前提下跑的。P1.5a 实施前，请确认开新 shell 时 `bun --version` 直接可用。

## 8. 附：扫描原始结果

### 8.1 `.tmp-bun-scan.mjs`（已清理，内容在本报告 §2/§3）

### 8.2 端到端验证输出

```
$ bun --conditions development apps/cli/src/main.ts --once "用一句中文回复：Bun + LumenCli 跑通"
Bun + LumenCli 跑通了。
```

### 8.3 完整 smoke 矩阵（逐条运行结果）

```
>>> bun scripts/smoke-permissions.mjs
permissions smoke passed

>>> bun scripts/smoke-tools.mjs
tools smoke passed

>>> bun scripts/smoke-context.mjs
context smoke passed

>>> bun scripts/smoke-memory.mjs
memory smoke passed

>>> bun scripts/smoke-writing.mjs
writing smoke passed

>>> bun scripts/smoke-ux.mjs
ux smoke passed

>>> bun scripts/smoke-openai-compatible.mjs
mock:mock-model:hello provider
```

全部 exit 0，无 stderr。
