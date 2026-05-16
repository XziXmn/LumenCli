# 参考项目工作流输出样式对比

日期：2026-05-16
目的：直观展示各参考项目的 TUI 输出风格，为 Lumen TUI 设计决策提供视觉参考。

以下示例为基于源码渲染逻辑的近似复现，用于风格对比。

---

## 1. Kimi Code CLI

### 风格特点
- **prompt-toolkit + Rich** 渲染
- `›` 用户输入前缀
- Box drawing 边框（双线/单线区分重要性）
- spinner 用 dots（⠋⠙⠹⠸）
- 工具调用展开显示完整参数和结果
- thinking 流式预览（6 行滚动）+ token 计数

### 示例输出

```
╭──────────────────────────────────────────────────────────────────────╮
│ Kimi Code CLI v1.44.0                                                │
│ Model: kimi-k2.6-thinking · Context: 8% (4.2k/200k)                  │
│ Working dir: ~/projects/example                                      │
│ Type / for commands, @ for files, Ctrl-X for shell mode              │
╰──────────────────────────────────────────────────────────────────────╯

› implement a binary search tree in src/bst.ts

⠋ Thinking... 3s · 312 tokens
  Looking at the project structure to understand the conventions...
  Need to check existing utilities and TypeScript style preferences.
  Will create class-based implementation with insert/search/delete.

ReadFile  src/types.ts
  ┌─ Result ──────────────────────────────────────────────────────────┐
  │ export interface Comparable<T> {                                  │
  │   compareTo(other: T): number;                                    │
  │ }                                                                 │
  │                                                                   │
  │ Total lines in file: 12.                                          │
  └───────────────────────────────────────────────────────────────────┘

WriteFile  src/bst.ts
  ┌─ Approval Required ───────────────────────────────────────────────┐
  │ + 47 lines · 0 deletions                                          │
  │                                                                   │
  │   1 │ import { Comparable } from "./types.js";                    │
  │   2 │                                                             │
  │   3 │ export class BSTNode<T extends Comparable<T>> {             │
  │   4 │   left: BSTNode<T> | null = null;                           │
  │  ...                                                              │
  │                                                                   │
  │ [1] Approve   [2] Approve for session   [3] Reject   [4] Feedback│
  └───────────────────────────────────────────────────────────────────┘

✓ WriteFile  src/bst.ts (47 lines written, 0.3s)

Created a generic BST implementation with insert, search, and delete
operations. The class uses your existing Comparable<T> interface from
types.ts.

╭ Status ──────────────────────────────────────────────────────────────╮
│ context: 12.4% (24.8k/200k) · 1 file changed · ⚙ bash: 0 · agent: 0 │
╰──────────────────────────────────────────────────────────────────────╯
```

---

## 2. oh-my-pi (omp)

### 风格特点
- **Ink (React)** 渲染
- `❯` 用户输入前缀
- 紧凑无边框风格
- spinner 用 ✻（默认）或 dots
- hashline 编辑显示 hash 锚点
- TTSR 规则注入提示

### 示例输出

```
  Welcome to oh-my-pi v14.9.9
  Model: claude-opus-4 · Memory: 234 entries · LSP: typescript active

❯ implement a binary search tree in src/bst.ts

✻ Considering the request...
  Will explore project structure first to match conventions.

  Read    src/types.ts (12 lines)
  Grep    pattern="class\\s+\\w+" in src/  (3 matches)
  Glob    src/**/*.ts  (8 files)

  ⏵ Edit  src/bst.ts
    Apply hashline-aware insert at top of file
    + 47 lines

    [a] Apply  [s] Skip  [r] Reject  [f] Feedback

  ✓ Edit  src/bst.ts  (47 lines, 0.3s)

  Created BSTNode<T extends Comparable<T>> class with:
  - insert(value): O(log n) average
  - search(value): O(log n) average
  - delete(value): O(log n) average using in-order successor

  All methods use the project's existing Comparable<T> interface.
  Hashline anchors saved for future edits.

  ─────────────────────────────────────────────────────────────────────
  context 12.4%  ·  ✻ idle  ·  /memory /todo /plan /worktree /commit
```

---

## 3. OpenCode

### 风格特点
- **Ink (React)** + 高密度 footer
- `>` 用户输入前缀
- sidebar 显示 session 树和文件变更
- footer 状态栏极致紧凑（OpenCode 风格）
- tool 块用 `└` 树形连接
- ANSI 颜色系统化（bright 主色 + dim 辅助）

### 示例输出

```
┌─ Session: implement-bst ──────────────────────────────────────────────┐
│                                                                       │
│  > implement a binary search tree in src/bst.ts                       │
│                                                                       │
│  I'll explore the project first to understand the conventions.        │
│                                                                       │
│  ⠋ read    src/types.ts                                               │
│    └─ 12 lines · Comparable<T> interface found                        │
│                                                                       │
│  ⠋ grep    pattern: class\s+\w+                                       │
│    └─ 3 matches in src/utils.ts, src/queue.ts, src/stack.ts           │
│                                                                       │
│  ⠋ write   src/bst.ts                                                 │
│    └─ 47 lines · approval required                                    │
│                                                                       │
│      [Y] yes  [N] no  [A] always  [E] edit  [R] reject with reason   │
│                                                                       │
│  ✓ write   src/bst.ts (47 lines, 0.3s)                                │
│                                                                       │
│  Created BSTNode<T extends Comparable<T>> with insert/search/delete.  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
[build] claude-opus-4 · ctx 12% · ~/projects/example · main · +1 ~0 -0
```

---

## 4. Claude Code (官方)

### 风格特点
- **Ink (React)** 简洁风格
- `>` 用户输入前缀
- spinner 用彩色 dots
- 工具名彩色背景标签（inverse text）
- 折叠摘要：连续读/搜可合并为一行
- 分隔符极少，纯靠空行和颜色区分

### 示例输出

```
> implement a binary search tree in src/bst.ts

  ● Looking at your project to understand conventions

  ● Read(src/types.ts)
    ⎿ Read 12 lines

  ● Search(class\s+\w+)
    ⎿ Found 3 matches across 3 files

  ● Write(src/bst.ts)
    ⎿ Wrote 47 lines

  I've created a generic BST implementation in src/bst.ts.

  The class uses your existing Comparable<T> interface and provides:
  - insert(value)
  - search(value)
  - delete(value)

  All operations are O(log n) on average and use the in-order successor
  for deletion.

  ⎿ 1 file changed · 47 insertions

──────────────────────────────────────────────────────────────────────────
  Auto-update available: 1.0.42 → 1.0.45 · Run /upgrade to install
──────────────────────────────────────────────────────────────────────────
```

---

## 5. Codex (OpenAI)

### 风格特点
- **ratatui (Rust)** 渲染
- `▶` 用户输入前缀
- 沙箱安全状态实时显示
- 工具状态彩色 dim 修饰
- patch summary 树形显示
- 插入命令前会显示沙箱配置

### 示例输出

```
codex v0.20 (sandbox: seatbelt · network: disabled)
─────────────────────────────────────────────────────────────────────────

▶ implement a binary search tree in src/bst.ts

  Reading repository for context.

  read    src/types.ts
  search  class definitions
  glob    src/**/*.ts

  Proposing changes:

  ╭─ patch ───────────────────────────────────────────────────────────╮
  │  └ A  src/bst.ts                                                   │
  │       +47  -0                                                      │
  ╰────────────────────────────────────────────────────────────────────╯

  Apply? (y/n/v=view diff)

  ✓ Applied patch · 1 file · +47 lines

  Created src/bst.ts with a generic BSTNode<T extends Comparable<T>>
  class. The implementation uses the in-order successor for deletion
  and matches your existing TypeScript style.

─────────────────────────────────────────────────────────────────────────
session: 7f3a · model: gpt-5-codex · sandbox: seatbelt · ⏎ next turn
```

---

## 6. Pi (earendil-works)

### 风格特点
- **Ink (React)** 极简
- 无 prompt symbol
- 工具名直接显示，无装饰
- 无边框、无分隔符
- 状态信息极少

### 示例输出

```
implement a binary search tree in src/bst.ts

I'll look at the project structure first.

read src/types.ts
12 lines read.

write src/bst.ts (approval required)

Approve? [y/n]

write src/bst.ts: 47 lines written.

Created src/bst.ts with a binary search tree implementation using
the existing Comparable<T> interface.

context: 8.4%
```

---

## 7. Lumen（当前）

### 风格特点
- **Ink (React)** Phase 4 + Claude Code 复刻
- `▶` 用户输入前缀（全宽深色背景）
- spinner ✻ + 彩色随机动词
- 连续 read/search 合并为单行摘要（Reading 4 files, searching 2 patterns）
- 工具组用 ⎿ 树形连接
- 中文 footer 状态

### 示例输出

```
╭──────────────────────────────────────────────────────────────────────╮
│  ✻ Lumen — 你的中文优先 AI 编程伙伴                                   │
│                                                                       │
│  /help 查看命令  ·  @file 引用文件  ·  Ctrl-X 切换 shell 模式         │
╰──────────────────────────────────────────────────────────────────────╯

▶ implement a binary search tree in src/bst.ts

  ✻ Pondering... 312 tokens
    检查项目结构和 TypeScript 风格约定...

  ⎿ Read 1 file, searching 1 pattern, listing 1 directory

  ⎿ Write  src/bst.ts
    ⎿ + 47 lines · 等待审批

      [a] 同意  [s] 跳过  [r] 拒绝  [f] 反馈

  ✓ Write  src/bst.ts (47 lines, 0.3s)

  在 src/bst.ts 创建了泛型二叉搜索树实现：

  - 使用项目现有的 Comparable<T> 接口
  - 提供 insert / search / delete 三个方法
  - 平均时间复杂度 O(log n)
  - delete 使用中序后继节点

  hashline 锚点已保存，后续编辑会自动定位。

  ─────────────────────────────────────────────────────────────────────
  ✻ idle  ·  上下文 12.4% (24.8k/200k)  ·  Claude Opus 4.7  ·  ↑ 历史
  /memory /todo /plan /worktree /commit /lsp
```

---

## 工作流编排对比

各项目对「多步骤任务」的可视化方式：

### Plan Mode 输出对比

#### Kimi CLI
```
╭ Plan Mode ───────────────────────────────────────────────────────────╮
│ Active · Read-only tools only · Plan file: ~/.kimi/plans/abc123.md  │
│                                                                      │
│ ## Implementation Plan                                               │
│                                                                      │
│ 1. Create `src/bst.ts` with generic BSTNode class                    │
│ 2. Implement insert/search/delete operations                         │
│ 3. Add unit tests in `test/bst.test.ts`                              │
│                                                                      │
│ [Approve]  [Revise]  [Reject and Exit]  [Reject (stay in plan)]     │
╰──────────────────────────────────────────────────────────────────────╯
```

#### oh-my-pi
```
  Plan Mode (read-only)

  Plan:
    1. Create src/bst.ts
    2. Implement BSTNode<T> with insert/search/delete
    3. Add tests in test/bst.test.ts

  /approve to execute  ·  /revise to edit  ·  /exit-plan to abandon
```

#### Lumen
```
  📋 计划模式 (read-only)

  执行计划：
    1. 创建 src/bst.ts
    2. 实现 BSTNode<T> 的 insert/search/delete
    3. 添加 test/bst.test.ts 单元测试

  Tab 切换  ·  /plan-approve 执行  ·  /plan-exit 退出计划
```

---

### 子代理（Subagent）输出对比

#### Kimi CLI（树形嵌套）
```
Agent  explore  "find all files using BSTNode"
  ⠋ subagent · explore agent
  ├─ Glob   src/**/*.ts
  ├─ Grep   BSTNode
  ├─ Read   src/utils/tree.ts
  └─ ... 4 more tool calls

  ✓ Agent  explore  (12 tool calls, 4.2s)
    Found 3 files using BSTNode in src/utils/, src/queue/, test/
```

#### oh-my-pi（独立面板）
```
  ┌─ Subagent: explore ─────────────────────────────┐
  │ Status: running · 4.2s elapsed                 │
  │ Tools: 12 calls · 8 reads · 2 greps · 2 globs  │
  │                                                 │
  │ Latest: Reading src/queue/tree.ts               │
  └─────────────────────────────────────────────────┘
```

#### Claude Code（CoordinatorAgent 风格）
```
  ● Task(explore, "find all files using BSTNode")
    ⎿ ⠋ Searching with 4 tools

      ● Glob(src/**/*.ts)
        ⎿ Found 8 files

      ● Search(BSTNode)
        ⎿ Found 3 matches in 3 files

      ● Read(src/utils/tree.ts)
        ⎿ Read 45 lines

    ⎿ Found 3 files using BSTNode (4.2s)
```

#### Lumen（Claude Code 风格 + 中文）
```
  ⎿ task(explore, "查找所有使用 BSTNode 的文件")
    ⎿ ✻ 用 4 个工具搜索中

      ⎿ Glob(src/**/*.ts)
        ⎿ 8 个文件

      ⎿ Grep(BSTNode)
        ⎿ 3 个匹配，3 个文件

      ⎿ Read(src/utils/tree.ts)
        ⎿ 45 行

    ⎿ 找到 3 个使用 BSTNode 的文件 (4.2s)
```

---

### Background Task 通知对比

#### Kimi CLI
```
  ⚙ bash: 1 · agent: 1                              [2 background]

  ╭ Notification ────────────────────────────────────────────────────╮
  │ Background task completed                                         │
  │ task-7f3a · run tests                                             │
  │ Duration: 32.4s · Exit: 0                                         │
  │                                                                   │
  │ All 47 tests passed.                                              │
  ╰───────────────────────────────────────────────────────────────────╯

  Auto-resuming agent to process result...
```

#### Lumen（应实现）
```
  ⚙ bash: 1  ·  agent: 1                          [2 个后台任务]

  ┌─ 通知 ───────────────────────────────────────────────────────────┐
  │ ✓ 后台任务完成                                                    │
  │ task-7f3a · 运行测试                                              │
  │ 用时 32.4s · 退出码 0                                             │
  │                                                                   │
  │ 全部 47 个测试通过                                                │
  └───────────────────────────────────────────────────────────────────┘

  自动恢复 agent 处理结果...
```

---

## 关键差异总结

| 维度 | Kimi CLI | oh-my-pi | OpenCode | Claude Code | Codex | Pi | Lumen |
|------|----------|----------|----------|-------------|-------|----|----|
| **prompt 前缀** | `›` | `❯` | `>` | `>` | `▶` | (无) | `▶` |
| **spinner** | dots | ✻ | dots | ● | dots | (无) | ✻ |
| **边框风格** | 双线/单线 | 极少 | sidebar 边框 | 极少 | 单线 | (无) | 选择性 |
| **工具树** | 缩进 | 缩进 | `└` | `⎿` | `└` | (无) | `⎿` |
| **审批 UI** | 内联面板 | inline | 紧凑 | 简洁 | 内联 | y/n | 内联面板 |
| **状态栏** | 多行 | 单行 dim | 极致紧凑 | 简洁 | 单行 | 极少 | 中文紧凑 |
| **思考显示** | 6 行预览 | 单行 | 单行 | 折叠 | 简短 | 简短 | 单行预览 |
| **语言** | 英文 | 英文 | 英文 | 英文 | 英文 | 英文 | **中文** |

---

## Lumen 的设计选择

基于以上对比，Lumen 的最终风格定位：

1. **prompt 前缀**：`▶` + 全宽深色背景（Phase 4 已实现，复刻 Claude Code 但保留 Codex 的箭头）
2. **spinner**：`✻` 静态 + 彩色随机动词（Phase 4 已实现）
3. **工具树**：`⎿` 连接（Phase 4 已实现，复刻 Claude Code）
4. **折叠摘要**：连续 collapsible 工具合并为单行（Phase 4 已实现）
5. **审批 UI**：内联面板 + 中文按键标签（待 Task 36 实现）
6. **状态栏**：中文紧凑布局（已实现）
7. **后台通知**：浮窗 + 自动恢复（待 Task 35 实现）
8. **Steer Input**：行内 prompt + 队列指示器（待 Task 34 实现）

整体方向：**Claude Code 的简洁感 + Kimi CLI 的交互能力 + 中文友好**。
