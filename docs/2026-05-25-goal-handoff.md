# 2026-05-25 Goal Handoff

本文件用于承接当前这轮三项主线收口工作的真实落地状态，并明确区分：

1. 已经完成且有代码 / 测试 / 门禁证据支撑的部分
2. 仍然需要真实现场验证或下一阶段决策的部分

## 目标范围

当前持续收口的目标仍然是这三项：

1. `interactive-mode` 主线
2. `.lumen` 配置与旧插件兼容，并在检测到新安装插件时于下次启动自动执行一次兼容评估
3. 参考本地 Codex 方案优化会话压缩与自动压缩，优先评估是否能以插件形式完整落地，否则再考虑修改核心代码

## 当前已落地

### 1. interactive-mode 主线

当前可以确认这些行为已经落到代码与回归里：

- 主任务栏 / 主进度面由 core 持有
- 主布局维持：
  - `chatContainer`
  - `bottomPane`
    - `taskbarRow`
      - `taskbarContent`
    - `pendingRow`
      - `pendingContent`
    - `composerRow`
      - `gap`
      - `editorContainer`
    - `extensionRow`
      - `extensionAreaContainer`
    - `passiveFooterRow`
      - `footerContent`
- `queued` 消息继续留在待发送区，不回流 transcript
- `footer` 继续保持被动状态，不再吃进主动进度语义
- `approval`
  - 进入时会占住任务栏，不让 todo headline 混入
  - 关闭时会清掉 waiting 状态与 banner
- `user-input`
  - 进入时会占住任务栏，不让 todo headline 混入
  - 关闭时会清掉 waiting 状态与 banner
- `auto-retry`
  - retry banner 会压住 todo headline
  - queued follow-up 仍然只留在待发送区
- `bash`
  - 开始、流式输出、完成路径已改走输入保护感知刷新
  - 对应 transcript 组件里的 loader 首帧直刷也已收口
- `compaction_end + willRetry=true`
  - queued follow-up 继续走 follow-up 流，不打回 transcript
- `agent_end`
  - 任务栏状态会被清空，避免会话完成后残留
- `ToolExecutionComponent`
  - `invalidate`
  - `markExecutionStarted`
  - `setArgsComplete`
  - 图片转换回调
  - 现在也已改成遵守输入保护，而不是继续直接后台抢刷

### 2. `.lumen` 配置与旧插件兼容

当前可以确认这些能力已经落地：

- `.lumen` 继续作为正式运行时配置目录
- `.pi` 只作为迁移来源，不重新引入 runtime fallback
- `installAndPersist()` 后会做即时兼容审计
- 审计结果继续区分：
  - `direct`
  - `light-adapt`
  - `needs-ai-review`
- 兼容状态已经持久化
  - user: `~/.lumen/agent/plugin-compat-state.json`
  - project: `<cwd>/.lumen/plugin-compat-state.json`
- 下次启动会自动复评估 `pending` 或 package 指纹变化的插件/包
- interactive 启动时会显示复评估摘要
- 交互模式新增 `/compat`
  - 汇总 package compatibility audit
  - extension load errors
  - skill diagnostics
  - 给出 `/reload` 和移除插件/skill 的下一步动作
- `pi install` 当次的即时兼容审计输出，也已补上：
  - 下次启动还会自动复评估
  - 交互里可用 `/compat`
  - 还不行就 `remove`

### 3. Codex 风格压缩主线已回收进 core

当前已经不是“插件优先、core 补位”的混合态，而是默认主行为已经进 core：

- core 当前默认已覆盖：
  - 结构化 history summary
  - split-turn summary
  - recent user requests 注入
  - `replacementMessages`
  - `summaryPlacement`
  - `manual / threshold / overflow` 分流
  - repeated compaction / overflow recovery 提醒
  - branch summary 的结构化默认实现
- 旧 project compaction extension（现已删除，默认主行为已回收进 core）
  - 现在只保留为 no-op shim
  - 目的是兼容旧本地引用，不再承载默认压缩逻辑
- 已有加载级与行为级回归：
  - core compaction 的 replacement history / summary placement 已被 session context / agent session 级回归覆盖
  - repeated compaction / overflow recovery 提醒已进入 core 事件回归
  - extension discovery 继续覆盖 shim 可加载，但不再要求它注册 compaction/branch handlers

## 当前证据

### 已通过的门禁

- `npx tsc -p tsconfig.extensions.json --noEmit`
- `npm run check`
- `.\lumen-test.ps1 -c`

### 已通过的 focused regression bundle

- `test/print-mode.test.ts`
- `test/interactive-mode-status.test.ts`
- `test/package-manager.test.ts`
- `test/extensions-discovery.test.ts`
- `test/compaction.test.ts`
- `test/session-manager/build-context.test.ts`
- `test/suite/agent-session-compaction.test.ts`

当前 focused bundle 主要覆盖：

- BottomPane / taskbar / queue / footer 主线
- startup plugin reevaluation 与 `/compat` 路径
- core compaction 的 replacement history / summary placement
- codex-style compaction extension 的加载与 session hook 行为

### 已通过的更广复杂场景回归

- `test/claude-task-ui.test.ts`
- `test/footer-progress-filter.test.ts`
- `test/lumen-task.test.ts`
- `test/lumen-todo.test.ts`
- `test/agent-session-retry.test.ts`
- `test/agent-session-auto-compaction-queue.test.ts`
- `test/suite/regressions/3317-network-connection-lost-retry.test.ts`
- `test/suite/regressions/3688-tree-cancel-compacting.test.ts`

## 本轮额外修复的重要点

### 1. `lumen-test.ps1 -c` 的 headless continue 假失败

已定位并修复：

- 在当前非 TTY 环境下，`-c` 会落到 print-mode
- 如果最近会话最后一条 assistant 恰好是空的 aborted message，会直接返回 `Operation aborted`
- 现在 print-mode 只在“纯 continue / 无新 prompt”的 headless 场景下，回退到最近一条有真实文本的 assistant
- 如果本轮真的发了新 prompt，新的 aborted 仍然会按失败返回，不会被旧消息吞掉

### 2. 兼容提示的用户路径闭环

现在安装时、启动时、交互内的用户路径已经串起来：

- 安装时即时审计
- 下次启动自动复评估
- interactive 里 `/compat`
- 修完后 `/reload`
- 还不行就移除插件或删除 skill

### 3. `Loader` 首帧直刷与 IME 验证面继续收口

当前又新增了几项对真实中文输入法问题更贴近的收口：

- `Loader` 现在支持 `skipInitialRender`
- 已接入：
  - `bash` transcript loader
  - `bordered-loader`
  - `working` 主任务栏 loader
  - `branch summary` loader
- IME harness 新增了更贴近真实刷新链的 transcript 场景：
  - `bash`
  - `branch-summary`
- script-level smoke 现在已覆盖：
  - `complete`
  - `approval`
  - `retry`
  - `reconnect`
  - `parallel`
  - `bash`
  - `branch-summary`
  - `--auto-cycle-ms`
  - `--scenario-list`

## 当前仍未完成 / 仍需人工确认

### 1. 中文输入法真实现场验证

虽然当前代码、回归和门禁都已通过，但以下仍缺真实现场验证：

- Windows Terminal / PowerShell 中持续输出期间输入中文拼音
- 候选窗是否始终跟随真实输入框
- 正文区 / 任务栏 / footer 是否不再闪出拼音
- 输入位置是否不跑偏

执行方式见：

- [ime-manual-check.md](ime-manual-check.md)
- `.\ime-progress-surface-debug.ps1`

当前建议至少覆盖这些场景：

- `approval`
- `retry`
- `reconnect`
- `parallel`
- `bash`
- `branch-summary`

当前脚本级 smoke 已证明这些场景都能正常进入并自动退出。

如果想降低人工切场景成本，当前推荐直接用：

- `.\ime-progress-surface-debug.ps1 --scenario-list approval,retry,reconnect,parallel,bash,branch-summary,complete --auto-cycle-ms 2500`

### 2. Codex 上限能力仍可继续优化

当前默认压缩主行为已经进入 core，并且至少已经具备：

- `summaryPlacement?: "before-kept" | "after-kept"`
- `replacementMessages?: AgentMessage[]`
- `reason: "manual" | "threshold" | "overflow"`
- `keptMessages: AgentMessage[]`
- core 默认 repeated compaction / overflow notices

但下面这两类决定上限的能力仍然可以继续优化：

- replacement history 的更完整精确控制
- initial context reinjection policy

这不再是“默认主行为没进 core”的阻塞，而是下一阶段的质量上限工作。

## 下一步建议

1. 如果继续收口而不提交
   - 优先做真实中文输入法现场验证
   - 再决定是否需要继续追更深的上下分区重构

2. 如果准备提交
   - 先按三条主线整理提交边界
   - 再做一次最终 diff 审查
   - 明确哪些文档 / 测试 / 代码应该进同一提交
