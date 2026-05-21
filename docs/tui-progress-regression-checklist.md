# TUI Progress Surface Regression Checklist

本清单用于回归验证 Lumen 当前的 core-owned progress surface，重点覆盖“输入框上方任务栏作为唯一主动进度面”的行为约束。

## 适用范围

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/src/modes/interactive/components/progress-surface.ts`
- `todo` / `task` / queued message / retry / approval / user-input 相关改动
- transcript 与 footer 的进度收口改动

## 执行前提

代码改动后至少完成：

- 定向 vitest（只跑受影响用例）
- `npx tsc -p tsconfig.extensions.json --noEmit`
- `npm run check`
- `./lumen-test.sh -c` 或 `.\lumen-test.ps1 -c`

## 核心静态检查

- [ ] 搜索确认没有重新引入扩展层主任务栏所有权
  - 重点查 `.lumen/extensions/claude-task-ui.ts`
  - 预期：扩展不再决定主任务栏的布局、显示/隐藏和生命周期
- [ ] 搜索确认 transcript 中没有重新输出 `Todo x/y completed · n remaining` 这类主进度摘要
- [ ] 搜索确认 footer 没有重复 headline / execution / plan 语义

## 交互场景检查

- [ ] 空闲态
  - 预期：没有遗留状态栏，没有“完成后残留”的 headline 或 execution 行
- [ ] 单个 `todo init`
  - 预期：transcript 不显示噪声 call/result；状态栏承担初始化反馈
- [ ] 单个 `todo done/start/append/drop/rm`
  - 预期：只有纯进度摘要被抑制；真正的错误或语义结果仍保留
- [ ] 多操作 `todo` 调用
  - 预期：headline 不退化成单一子操作标题；plan 区展示 current / pending / completed
- [ ] 单个 `task`
  - 预期：headline 以主线程/计划语义优先；子代理信息进入 execution 区，不污染主标题
- [ ] 多个 `task` 并行
  - 预期：execution 区能聚合并行任务；`N running tasks` 只作必要 fallback
- [ ] `todo + task` 并行
  - 预期：plan 与 execution 各司其职；headline 仍优先主线程/计划视角
- [ ] queued command / queued steer
  - 预期：待发送消息显示在输入框上方，不进入主进度面 headline 语义
- [ ] approval
  - 预期：审批提示不会和普通执行态混淆；完成后状态栏可恢复或消失
- [ ] 用户输入请求
  - 预期：等待用户输入时表现清晰，不与运行态 spinner 混在一起
- [ ] API 自动重试
  - 预期：状态栏显示 retry 语义；不会把错误和重试态混成完成态
- [ ] stream 恢复 / reconnect
  - 预期：恢复后状态栏与 transcript 不重复、不残留旧 execution 行
- [ ] 会话完成
  - 预期：状态栏可靠消失；footer 只保留被动状态

## 布局与健壮性检查

- [ ] 状态栏与正文间距正确，没有挤压或额外空洞
- [ ] 状态栏动画前缀与 transcript 状态点层级一致，不丢失符号
- [ ] 长文本、长工具结果、长 task 描述不会突破终端宽度
  - 重点防止再次出现 `Rendered line exceeds terminal width`
- [ ] 窄终端下仍能安全截断，不出现单行爆宽崩溃

## 通过标准

- 所有高频交互场景都能在状态栏、transcript、footer 三层里找到唯一职责
- completion teardown 稳定
- queued 与 plan / execution 语义不串位
- 没有爆宽、残留、重复摘要、错误颜色或错误 headline 选择
