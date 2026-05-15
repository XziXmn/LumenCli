# OpenTUI 迁移计划

## 目标

将 Lumen 的 TUI 从 `@earendil-works/pi-tui`（行级渲染）迁移到 OpenTUI + SolidJS（cell 级渲染 + Yoga flexbox），复刻 OpenCode 的终端界面体验。

## 策略

1. **不删除原 TUI** — 保留 `packages/coding-agent/src/modes/interactive/` 作为 fallback
2. **新建目录** — `packages/coding-agent/src/modes/tui/` 容纳新界面
3. **直接复制 OpenCode 实现** — 从 `references/opencode/packages/opencode/src/cli/cmd/tui/` 复制，再调整

## OpenCode TUI 结构分析

```
references/opencode/packages/opencode/src/cli/cmd/tui/
├── app.tsx                    # 应用入口（SolidJS root）
├── keymap.tsx                 # 键绑定系统
├── layer.ts                   # 图层管理
├── thread.ts                  # 渲染线程
├── worker.ts                  # Worker 线程
├── component/                 # 通用组件
│   ├── spinner.tsx            # Spinner 动画
│   ├── border.tsx             # 边框组件
│   ├── logo.tsx               # Logo 显示
│   ├── dialog-*.tsx           # 各种对话框
│   └── prompt/                # 输入提示
├── context/                   # SolidJS Context providers
│   ├── theme.tsx              # 主题系统
│   ├── sdk.tsx                # SDK 连接
│   ├── route.tsx              # 路由系统
│   ├── prompt.tsx             # 输入管理
│   └── ...
├── routes/                    # 页面路由
│   ├── home.tsx               # 首页
│   └── session/               # 会话页面（核心）
│       ├── index.tsx          # 会话主视图
│       ├── footer.tsx         # 底部状态栏
│       ├── sidebar.tsx        # 侧边栏
│       ├── permission.tsx     # 权限请求
│       └── dialog-*.tsx       # 会话相关对话框
├── ui/                        # UI 原子组件
│   ├── dialog.tsx             # 对话框基础
│   ├── spinner.ts             # Spinner 工具
│   ├── toast.tsx              # Toast 通知
│   └── ...
├── config/                    # TUI 配置
│   ├── keybind.ts             # 键绑定配置
│   └── tui.ts                 # TUI 设置
└── util/                      # 工具函数
    ├── scroll.ts              # 滚动管理
    ├── transcript.ts          # 消息转录
    └── ...
```

## 依赖关系

### 必需的 npm 包
- `@opentui/core` (0.2.6) — 核心渲染引擎（Zig native + Yoga）
- `@opentui/solid` (0.2.6) — SolidJS reconciler
- `@opentui/keymap` (0.2.6) — 键绑定系统
- `solid-js` (1.9.10) — 响应式 UI 框架
- `opentui-spinner` (0.0.6) — Spinner 动画

### 系统要求
- **Zig 工具链** — OpenTUI 的 native core 需要 Zig 编译
- **平台二进制** — 每个平台需要预编译的 native 模块
- **Bun** — OpenCode 使用 Bun 运行时

### 潜在问题
1. **Zig 依赖** — 用户需要安装 Zig 才能从源码构建
2. **平台兼容性** — 需要为 Windows/macOS/Linux 提供预编译二进制
3. **Bun vs Node** — OpenTUI 可能依赖 Bun 特性（FFI、native modules）
4. **包大小** — native 二进制会增加 2-5MB

## 迁移步骤

### Phase 1: 基础设施（1-2 sessions）

1. 安装 OpenTUI 依赖
2. 创建 `packages/coding-agent/src/modes/tui/` 目录
3. 复制 OpenCode 的 TUI 骨架（app.tsx, keymap, layer, thread）
4. 创建 `tui-mode.ts` 入口（类似 `interactive-mode.ts`）
5. 验证 OpenTUI renderer 能在当前项目中启动

### Phase 2: 核心组件（2-3 sessions）

1. 复制 session route（消息列表、输入框、footer）
2. 适配我们的 AgentSession API（替换 OpenCode 的 SDK 调用）
3. 实现消息渲染（assistant text、tool calls、thinking）
4. 实现工具调用折叠（collapsed read/search）
5. 实现 thinking 显示（streaming 时显示，完成后平滑消失）

### Phase 3: 功能完善（2-3 sessions）

1. 实现所有对话框（model selector、settings、session list）
2. 实现 slash commands
3. 实现 autocomplete
4. 实现 image display
5. 实现 bash execution 内嵌终端

### Phase 4: 切换入口（1 session）

1. 在 `cli.ts` 中添加 `--tui` flag 切换新界面
2. 默认使用新 TUI，`--legacy-tui` 回退旧界面
3. 验证所有功能正常

## 需要从 OpenCode 复制的文件

### 核心（必须）
- `app.tsx` — 应用入口
- `keymap.tsx` — 键绑定
- `thread.ts` — 渲染线程
- `routes/session/index.tsx` — 会话主视图
- `routes/session/footer.tsx` — 底部栏
- `component/spinner.tsx` — Spinner
- `component/border.tsx` — 边框
- `component/prompt/` — 输入组件
- `context/theme.tsx` — 主题
- `context/route.tsx` — 路由
- `ui/` — 所有 UI 原子组件

### 可选（后续）
- `routes/home.tsx` — 首页
- `component/dialog-*.tsx` — 对话框
- `context/sync.tsx` — 同步
- `feature-plugins/` — 插件系统

## 风险评估

| 风险 | 影响 | 缓解 |
|------|------|------|
| Zig 工具链不可用 | 无法构建 | 使用预编译二进制，或 fallback 到旧 TUI |
| Windows 兼容性 | 用户无法使用 | OpenCode 已支持 Windows（有 win32.ts） |
| Bun 依赖 | Node.js 用户无法使用 | 检查是否有 Node.js 兼容层 |
| 性能回退 | 启动变慢 | native 模块应该更快，不太可能 |
| API 不兼容 | 需要大量适配 | 逐步替换，保留旧 TUI 作为 fallback |

## 下一步

1. 先验证 `@opentui/core` 能否在当前项目中安装和运行
2. 如果 Zig 依赖是阻碍，考虑使用 OpenTUI 的预编译包
3. 如果 OpenTUI 不可行，退回到 Ink (React) 方案
