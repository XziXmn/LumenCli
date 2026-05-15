# TUI 框架评估：pi-tui vs Ink (Claude Code)

## 当前框架：@earendil-works/pi-tui

### 架构
- **渲染模型**：基于行的 `render(width: number): string[]`
- **布局**：Container 简单拼接子组件的行输出，无 flexbox
- **更新**：`requestRender()` 全屏重绘（diff-based output）
- **组件**：Text, Box, Container, Spacer, Markdown, Image, Loader 等
- **交互**：Editor (输入), Overlay (弹窗), Autocomplete

### 能力
- ✅ 基本文本渲染、颜色、样式
- ✅ Markdown 渲染
- ✅ 输入编辑器（多行、自动补全）
- ✅ 图片显示（Kitty protocol）
- ✅ 进程终端嵌入
- ✅ 主题系统
- ✅ 键绑定系统

### 限制
- ❌ 没有 margin/padding collapse — Spacer 是显式组件，容易产生多余空行
- ❌ 没有条件渲染 — 组件 addChild 后必须手动 removeChild 或返回空数组
- ❌ 没有增量更新 — 每次 render 重算所有组件
- ❌ 没有虚拟化 — 长对话性能下降
- ❌ 没有动画框架 — 需要手动 setInterval + requestRender
- ❌ 没有 viewport awareness — 不知道哪些组件在屏幕外
- ❌ 组件间通信困难 — 没有 context/state 管理

## Claude Code 框架：自定义 Ink (React for CLI)

### 架构
- **渲染模型**：React 组件树 → Yoga flexbox 布局 → ANSI 输出
- **布局**：完整 flexbox（flexDirection, gap, margin, padding, wrap）
- **更新**：React reconciler + 脏标记 + 局部重绘
- **组件**：Box, Text, 自定义 hooks (useAnimationFrame, useBlink, etc.)
- **交互**：useInput hook, focus management

### 能力
- ✅ 所有 pi-tui 的能力
- ✅ Flexbox 布局（自动间距、对齐）
- ✅ 条件渲染（JSX `{cond && <X/>}`）
- ✅ 增量更新（React reconciler）
- ✅ 虚拟化（VirtualMessageList, ScrollBox）
- ✅ 动画框架（useAnimationFrame, viewport-aware）
- ✅ 状态管理（AppState, useAppState）
- ✅ Shimmer/glimmer 动画
- ✅ 鼠标支持（onClick, onMouseEnter）

## 评估结论

### 当前问题是否可以在 pi-tui 内修复？

| 问题 | 可修复？ | 难度 |
|------|---------|------|
| 异常空行 | ✅ 是 | 中 — 需要审计所有 Spacer 使用 |
| Thinking 不显示 | ✅ 是 | 低 — 时序问题，需要调试 |
| 工具折叠 | ✅ 已实现 | — |
| Spinner 动画 | ✅ 已实现 | — |
| 欢迎卡片 | ✅ 已实现 | — |
| 用户消息样式 | ✅ 已实现 | — |

### 切换到 Ink 的成本

- **工作量**：2-4 周全职开发
- **风险**：高 — 所有交互逻辑需要重写
- **涉及文件**：~30 个组件文件 + interactive-mode.ts 核心
- **依赖**：需要 React 17+, Yoga layout engine
- **好处**：一劳永逸解决布局问题，未来开发效率大幅提升

### 建议

**短期（现在）**：继续在 pi-tui 内修复具体问题。当前的空行和 thinking 问题是可以解决的。

**中期（1-2 周后）**：如果持续遇到布局问题，开始规划 Ink 迁移。可以渐进式迁移：
1. 先用 Ink 重写消息渲染层（Messages, MessageRow）
2. 保留 pi-tui 的 Editor 和 Footer
3. 逐步替换其他组件

**长期**：完全迁移到 Ink，获得 Claude Code 级别的渲染能力。
