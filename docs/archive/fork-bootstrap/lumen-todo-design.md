> 历史降级说明：
> 本文档记录的是早期 `todo` 工具的设计取向，尤其是“会话级而非项目级持久化”的决定。
> 当前它主要作为能力背景说明保留。当前能力状态请优先看 [../../CAPABILITY_MATRIX.md](../../CAPABILITY_MATRIX.md)。

# Lumen Todo — 会话级设计

## 设计意图

Todo 状态仅存内存，session 结束即清空。这与 Claude Code / opencode 的行为对齐。

理由：
- 项目级持久化（`.lumen/todo.json`）会导致多 session 同步问题
- 大多数 todo 列表是单次任务的执行计划，跨 session 意义不大
- 需要跨 session 接续时，用户可显式 `/todo-export` 保存

## 命令

| 命令 | 说明 |
|------|------|
| `/todo` | 查看当前会话的任务列表 |
| `/todo-export [path]` | 导出为 markdown（默认 `./TODO.md`） |
| `/todo-import [path]` | 从 markdown 导入（默认 `./TODO.md`） |

## LLM Tool

`todo` tool 支持操作：`init`, `start`, `done`, `drop`, `rm`, `append`, `note`

## 导出格式

```markdown
# Todo

## Phase Name

- [x] completed task
- [ ] **pending task** (in progress)
- [ ] pending task
- [ ] ~~abandoned task~~
  - note attached to task
```

## 跨 session 工作流

1. Session A 结束前：`/todo-export`
2. Session B 开始后：`/todo-import`
