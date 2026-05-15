# TUI 渲染改造计划

> **已归档** — 此计划基于 pi-tui 框架的渐进改造。已决定改用 OpenTUI + SolidJS 全面迁移方案，见 `opentui-migration-plan.md`。

## 当前问题

1. **工具调用显示太简陋** — 没有 spinner 动画，折叠态只有一行文字，没有进度指示
2. **子代理显示不优雅** — `agent_spawn`/`agent_status` 只显示 `✓ explore [id] running`，没有实时进度、没有树形结构
3. **没有工具分组** — 连续多个 read/grep 调用各占一行，不像 Claude Code 那样合并成 "Read 4 files"
4. **没有 live diff 预览** — edit/write 工具在 args 流式传输时没有实时 diff 显示
5. **背景色过于突兀** — 工具结果的 bg 色块在某些终端上不好看
6. **没有 bordered output block** — oh-my-pi 的带边框输出块更清晰

## 参考项目对比

### 渲染框架

| 项目 | 框架 | 特点 |
|------|------|------|
| Claude Code | Ink (React for terminals) | 组件化、hooks、虚拟列表 |
| opencode | SolidJS (Web UI) | 响应式信号、CSS 动画、浏览器渲染 |
| oh-my-pi | 自定义 TUI (同 pi) | ANSI 字符串、差分渲染、组件树 |
| **我们 (pi fork)** | **@earendil-works/pi-tui** | **同 oh-my-pi 架构** |

**结论**：我们和 oh-my-pi 共享同一套 TUI 框架，oh-my-pi 的改进可以最直接地移植。Claude Code 的设计理念可以参考但实现方式不同（React vs 字符串渲染）。opencode 是 Web UI，不适合直接移植。

### 工具调用渲染对比

| 特性 | Claude Code | oh-my-pi | 我们当前 |
|------|-------------|----------|----------|
| 执行中指示器 | 闪烁圆点 (blink) | Braille spinner (80ms) | 无 |
| 折叠态 | 工具名 + 内联参数 | 状态图标 + 标题 + 描述 + badge + meta | 工具名 + 参数 JSON |
| 展开态 | 工具自定义渲染 | JSON 树 / diff / 输出行 | 全文输出 |
| 分组 | "Read 4 files" 合并 | 无 | 无 |
| 边框 | 无（纯文本） | 带边框输出块 (BoxSharp) | 背景色块 (Box) |
| 进度 | 工具自定义 progress | 状态行 + 实时输出 | 无 |
| 背景色 | 无 | pending=accent, success=dim, error=red | 同 oh-my-pi |

### 子代理/后台任务渲染对比

| 特性 | Claude Code | oh-my-pi | 我们当前 |
|------|-------------|----------|----------|
| 面板位置 | 底部独立面板 (CoordinatorTaskPanel) | 树形嵌套在消息流中 | 内联在消息流中 |
| 状态显示 | 名称 + 描述 + 耗时 + token 数 | 树形：图标 + ID + 描述 + badge + 耗时 | `✓ name [id] status` |
| 实时进度 | 当前工具活动 | 当前工具 + args | 无 |
| 交互 | Enter 查看/操控, x 关闭 | Ctrl+O 展开 | 无 |
| 多代理 | 可选列表 | 树形连接符 (├── └──) | 平铺 |

## 推荐改造路径

### Phase 1：基础体感提升（1-2 session）

**目标**：让工具调用看起来"活着"，有进度感。

1. **加 spinner 动画** — 从 oh-my-pi 移植 `Loader` 组件的 braille spinner 逻辑到 `ToolExecutionComponent`
   - 执行中：`⠋ read src/config.ts`（spinner 转动）
   - 完成：`✓ read src/config.ts`（绿色勾）
   - 失败：`✗ read src/config.ts`（红色叉）

2. **状态行格式** — 参考 oh-my-pi 的 `renderStatusLine()`
   ```
   ⠋ bash: npm run check · Elapsed 3.2s · 142 lines
   ✓ read: src/config.ts (45 lines)
   ✗ grep: "pattern" in src/ · exit 1
   ```

3. **bordered output block** — 移植 oh-my-pi 的 `CachedOutputBlock`
   - 带边框的输出容器，状态色在边框上而非背景
   - 运行中：accent 色边框
   - 完成：dim 色边框
   - 失败：red 色边框

**改动文件**：
- `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- 新建 `packages/coding-agent/src/modes/interactive/components/output-block.ts`（从 oh-my-pi 移植）
- 新建 `packages/coding-agent/src/modes/interactive/components/status-line.ts`（从 oh-my-pi 移植）

### Phase 2：子代理渲染改造（1 session）

**目标**：子代理有实时进度、树形结构、可交互。

1. **agent_spawn 渲染** — 参考 oh-my-pi 的 `task/render.ts` 树形渲染
   ```
   ⠋ explore: 深度解析 lumen-monorepo
   │  ├── ⠋ grep: "import.*from" in packages/
   │  └── ✓ read: package.json (12 lines)
   ```

2. **agent_status 渲染** — 显示所有后台代理的状态面板
   ```
   ┌─── Background Agents (2) ──────────────────────┐
   │ ⠋ explore [bg_xxx] running · 12.3s · 4 tools   │
   │ ✓ worker [bg_yyy] completed · 8.1s · 2 tools   │
   └────────────────────────────────────────────────┘
   ```

3. **实时输出流** — 子代理的 stdout 解析 JSON 消息，提取当前工具活动显示

**改动文件**：
- `packages/coding-agent/src/core/lumen-agents-bg.ts`（renderCall/renderResult 重写）
- 新建 `packages/coding-agent/src/modes/interactive/components/agent-panel.ts`

### Phase 3：工具分组 + 折叠优化（1 session）

**目标**：连续同类工具合并显示，折叠态更紧凑。

1. **工具分组** — 参考 Claude Code 的 `GroupedToolUseContent`
   - 连续 read 调用合并为 `Read 4 files`
   - 连续 grep 调用合并为 `Searched 3 patterns`
   - 展开后显示每个调用的详情

2. **折叠态优化** — 参考 oh-my-pi 的 `formatArgsInline()`
   - 每个工具一行，关键参数内联
   - `✓ read src/config.ts, src/main.ts, src/cli.ts (+2 more)`

3. **Ctrl+O 展开** — 已有，但展开内容需要更好的格式化（JSON 树、diff 预览）

**改动文件**：
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`（分组逻辑）
- `packages/coding-agent/src/core/tools/` 各工具的 `renderResult` 优化

### Phase 4：高级特性（可选，后续）

- Live diff 预览（edit 工具 args 流式传输时实时显示 diff）
- 虚拟列表（长对话性能优化）
- 图片内联显示优化（Kitty/Sixel）
- 主题系统增强（更多预设主题）

## 从 oh-my-pi 可复用的完整组件清单

### 核心 TUI 组件（`packages/coding-agent/src/tui/`）

| 文件 | 功能 | 复用方式 | 依赖 |
|------|------|----------|------|
| `output-block.ts` | 带边框的输出容器（状态色边框、header/sections 分区） | 直接移植 | Theme, utils |
| `status-line.ts` | 标准化状态行（icon + title + description + badge + meta） | 直接移植 | Theme, render-utils |
| `tree-list.ts` | 层级树形列表（自动截断、"... N more" 后缀） | 直接移植 | Theme, utils |
| `file-list.ts` | 文件列表渲染（图标 + 路径 + meta） | 直接移植 | Theme, tree-list |
| `code-cell.ts` | 代码/Markdown 单元格（带语法高亮、输出区、状态） | 参考移植 | output-block, Theme |
| `types.ts` | 共享类型（State, TreeContext） | 直接移植 | 无 |
| `utils.ts` | Hasher（缓存 key）、树形前缀、padding 工具 | 部分移植 | 无（Hasher 用 Bun.hash，打包后可用；开发时用 fallback） |

### 工具渲染系统（`packages/coding-agent/src/tools/`）

| 文件 | 功能 | 复用方式 |
|------|------|----------|
| `render-utils.ts` | 格式化工具集（状态图标、badge、diff stats、路径缩短、诊断格式化） | 大量复用 |
| `json-tree.ts` | JSON 值的树形渲染（折叠/展开、深度限制、标量截断） | 直接移植 |
| `renderers.ts` | 工具渲染器注册表（每个工具注册 renderCall + renderResult） | 参考架构 |
| `bash.ts` (renderer 部分) | `createShellRenderer` — 通用 shell 工具渲染器工厂 | 直接复用 |

### 子代理渲染（`packages/coding-agent/src/task/render.ts`）

oh-my-pi 的 task 渲染是最值得参考的部分：

```
⠋ explore: 深度解析项目结构
├── ✓ grep "import" in packages/ · 0.3s
├── ⠋ read src/config.ts · streaming
└── … 2 more tools
```

关键特性：
- 树形连接符（`├──` `└──` `│`）
- 每个子任务有独立状态图标（spinner/check/cross）
- 折叠时显示摘要，展开时显示完整输出
- 支持嵌套（agent 内的 agent）

### TUI 框架层（`packages/tui/src/`）

| 文件 | 功能 | 我们是否已有 |
|------|------|-------------|
| `components/loader.ts` | Braille spinner（80ms 间隔） | 有类似但未用于工具 |
| `components/cancellable-loader.ts` | 可取消的 loader（显示取消提示） | 无 |
| `components/truncated-text.ts` | 自动截断文本组件 | 无 |
| `components/tab-bar.ts` | Tab 切换栏 | 无 |
| `components/select-list.ts` | 可选择列表 | 有 |
| `components/settings-list.ts` | 设置列表（key-value 对） | 无 |
| `tui.ts` | 差分渲染引擎 | 已有（fork） |
| `terminal-capabilities.ts` | 终端能力检测 | 已有（fork） |

### 主题系统增强

oh-my-pi 的主题比我们丰富：
- `theme.spinnerFrames` — spinner 动画帧（braille 字符）
- `theme.tree.*` — 树形连接符（vertical, branch, last）
- `theme.icon.*` — 文件/文件夹/包图标
- `theme.sep.*` — 分隔符（dot, pipe）
- `theme.format.*` — 格式化字符（bracketLeft, bracketRight）
- `theme.styledSymbol()` — 带颜色的符号渲染
- `theme.getLangIcon()` — 按语言获取文件图标

### `createShellRenderer` 模式（最值得复用）

oh-my-pi 的 bash 渲染器是一个**工厂函数**，生成标准化的 shell 工具渲染器：

```typescript
export function createShellRenderer<TArgs>(config: ShellRendererConfig<TArgs>) {
  return {
    renderCall(args, options, theme): Component {
      // 状态行：⠋ Bash: $ npm run check
      return new Text(renderStatusLine({ icon: "pending", title, description: cmdText }), 0, 0);
    },
    renderResult(result, options, theme, args): Component {
      // CachedOutputBlock 带边框：
      // ┌─── ✓ Bash ──────────────────┐
      // │ $ npm run check              │
      // ├─── Output ──────────────────┤
      // │ Checked 679 files...         │
      // └──────────────────────────────┘
      return { render: (width) => outputBlock.render({...}, theme) };
    },
    mergeCallAndResult: true,  // call 和 result 合并为一个组件
    inline: true,              // 不用外层 Box 包裹
  };
}
```

这个模式可以直接用于我们的 `bash`、`powershell`、`agent_spawn` 等工具。

### `CachedOutputBlock` 性能优化

oh-my-pi 的输出块有缓存层：
- 用 `Hasher`（xxHash64）计算渲染输入的 hash
- 如果 hash 没变，直接返回上次的渲染结果
- 避免每帧重复计算 `visibleWidth()` 和 `padding()`

**注意**：`Hasher` 用了 `Bun.hash.xxHash64`——打包后的二进制（`bun build --compile`）可以直接用；开发时（tsx/Node.js）需要 fallback。写一个运行时检测层即可：

```typescript
const xxHash64 = typeof globalThis.Bun !== "undefined"
    ? (data: string | Uint8Array, seed?: bigint) => Bun.hash.xxHash64(data, seed ?? 0n)
    : nodeJsFallback; // 简单的字符串 hash 或 crypto.createHash
```

oh-my-pi 的主题比我们丰富（tree/icon/spinner/sep/format 字段），需要扩展。

### 从 Claude Code 参考的设计理念

| 理念 | 实现方式 |
|------|----------|
| 闪烁圆点而非 spinner | 用 setInterval 切换 `●` / ` ` |
| 工具分组 | 在 interactive-mode 的 message_update 中检测连续同类工具 |
| 背景任务面板 | 独立 Container 在 footer 上方 |
| 权限等待状态 | 在工具执行组件中加 "Waiting for permission..." 状态 |

### 不改的部分

- TUI 框架本身（`@earendil-works/pi-tui`）不动
- 消息流的基本结构不动（AssistantMessage → ToolExecution → ...）
- 主题系统保持兼容
- 快捷键系统不动


### 从 Claude Code 参考的设计理念

| 理念 | 实现方式 |
|------|----------|
| 闪烁圆点而非 spinner | 用 setInterval 切换 `●` / ` `（oh-my-pi 用 braille spinner 更好看） |
| 工具分组 | 在 interactive-mode 的 message_update 中检测连续同类工具 |
| 背景任务面板 | 独立 Container 在 footer 上方（参考 CoordinatorTaskPanel） |
| 权限等待状态 | 在工具执行组件中加 "Waiting for permission..." 状态 |
| `mergeCallAndResult` | call 和 result 合并为一个组件（oh-my-pi 也有这个） |

### 不改的部分

- TUI 框架本身（`@earendil-works/pi-tui`）不动
- 消息流的基本结构不动（AssistantMessage → ToolExecution → ...）
- 主题系统保持兼容（但需要扩展 tree/icon/spinner 字段）
- 快捷键系统不动

## 移植优先级和依赖关系

```
Phase 1 依赖链：
  types.ts (无依赖)
  └── utils.ts (依赖 types, 需替换 Bun.hash)
      └── status-line.ts (依赖 utils, render-utils)
      └── output-block.ts (依赖 utils, Theme)
          └── ToolExecutionComponent 改造

Phase 2 依赖链：
  tree-list.ts (依赖 utils, render-utils)
  └── task/render.ts 移植 (依赖 tree-list, status-line, output-block)
      └── agent_spawn/status renderResult 重写

Phase 3 依赖链：
  json-tree.ts (依赖 render-utils)
  └── 工具分组逻辑 (在 interactive-mode.ts 中)
```

## 文件参考

下一个 session 开始时优先读：

### 我们的当前实现
- `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`（消息流处理，~5000 行）
- `packages/coding-agent/src/core/tools/render-utils.ts`（当前的渲染工具）

### oh-my-pi 目标参考（按移植顺序）
- `references/oh-my-pi/packages/coding-agent/src/tui/types.ts`（State, TreeContext）
- `references/oh-my-pi/packages/coding-agent/src/tui/utils.ts`（Hasher, tree helpers）
- `references/oh-my-pi/packages/coding-agent/src/tui/status-line.ts`（renderStatusLine）
- `references/oh-my-pi/packages/coding-agent/src/tui/output-block.ts`（CachedOutputBlock）
- `references/oh-my-pi/packages/coding-agent/src/tools/render-utils.ts`（formatStatusIcon 等）
- `references/oh-my-pi/packages/coding-agent/src/tools/bash.ts`（createShellRenderer 模式）
- `references/oh-my-pi/packages/coding-agent/src/tui/tree-list.ts`（renderTreeList）
- `references/oh-my-pi/packages/coding-agent/src/task/render.ts`（子代理树形渲染）
- `references/oh-my-pi/packages/coding-agent/src/modes/components/tool-execution.ts`（完整工具组件）

### Claude Code 设计参考
- `references/ClaudeCodeRev/src/components/messages/AssistantToolUseMessage.tsx`
- `references/ClaudeCodeRev/src/components/CoordinatorAgentStatus.tsx`
- `references/ClaudeCodeRev/src/components/ToolUseLoader.tsx`
- `references/ClaudeCodeRev/src/components/tasks/BackgroundTask.tsx`

## 优先级建议

Phase 1 的 ROI 最高——加 spinner + 状态行 + 边框输出块就能让体感提升 80%。

具体来说，Phase 1 的最小可行改动是：
1. 移植 `status-line.ts` 和 `output-block.ts`（~200 行纯渲染代码）
2. 给 `ToolExecutionComponent` 加 spinner interval（~20 行）
3. 让 bash/powershell/agent 工具的 `renderResult` 用 `CachedOutputBlock` 替代当前的 `Box`

这三步做完，工具调用就会从：
```
  bash npm run check
  Checked 679 files...
```
变成：
```
┌─── ⠋ Bash ─────────────────────────────┐
│ $ npm run check                          │
├─── Output ──────────────────────────────┤
│ Checked 679 files in 1403ms.             │
└──────────────────────────────────────────┘
```

建议先做 Phase 1，验证效果后再决定是否继续 Phase 2-3。
