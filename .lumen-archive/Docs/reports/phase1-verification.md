# LumenCli Phase 1 Verification

日期：2026-05-10

## 验证范围

本报告覆盖 Phase 1 agent MVP 当前已完成能力：

- TypeScript pnpm workspace。
- CLI 单次 prompt 与交互 shell 入口。
- OpenAI-compatible provider 非流式调用。
- Agent event lifecycle。
- Permission contract。
- Core local tools。
- MCP stdio client。
- Context assembler。
- JSONL memory。
- Writing command pack。
- CLI runtime introspection。

## Release Gate

推荐发布前执行：

```powershell
pnpm install --frozen-lockfile
pnpm clean
pnpm build
pnpm typecheck
pnpm smoke:all
```

## 本次验证结果

已于 2026-05-10 在 `D:\UGit\LumenCli` 执行：

```powershell
pnpm smoke:all
```

结果：通过。

覆盖到的子验证：

- `pnpm clean`
- `pnpm build`
- `pnpm typecheck`
- `pnpm smoke:cli`
- `pnpm smoke:provider`
- `pnpm smoke:permissions`
- `pnpm smoke:tools`
- `pnpm smoke:mcp`
- `pnpm smoke:context`
- `pnpm smoke:memory`
- `pnpm smoke:writing`
- `pnpm smoke:ux`

## Smoke Scripts

- `pnpm smoke:cli`：验证 CLI `/status`。
- `pnpm smoke:provider`：使用本地 mock OpenAI-compatible server 验证 provider 路径。
- `pnpm smoke:permissions`：验证 permission engine 基础决策。
- `pnpm smoke:tools`：验证 core tools 与默认权限。
- `pnpm smoke:mcp`：使用本地 mock MCP stdio server 验证 MCP 工具发现与调用。
- `pnpm smoke:context`：验证规则文件、工作区摘要、recent messages、memory 注入。
- `pnpm smoke:memory`：验证 JSONL memory 跨进程持久化和 CLI 命令。
- `pnpm smoke:writing`：使用本地 mock provider 验证 `/draft` 写作命令模型路径。
- `pnpm smoke:ux`：验证 `/tools`、`/config`、`/model`、`/help`。

## 已知限制

- Provider 当前是非流式调用。
- Tool-call loop 尚未让模型自动选择并执行工具。
- write/shell 工具的用户确认 UI 尚未完整实现；当前默认权限会阻止执行。
- MCP server 尚未通过配置文件加载。
- `.novel` 项目协议和 Lumen-Rebuild 的连续性能力尚未迁移。
- Memory 当前为 JSONL，尚未使用 SQLite。

## 下一阶段建议

1. S11：实现模型 tool-call loop。
2. S12：实现 CLI permission prompt，允许用户确认 write/shell。
3. S13：加入 MCP config loader。
4. S14：迁移 `.novel` 最小上下文读取。
5. S15：补测试框架，减少 smoke 脚本对构建的重复调用。
