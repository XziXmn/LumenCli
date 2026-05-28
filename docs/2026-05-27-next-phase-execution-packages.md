# 2026-05-27-next-phase-execution-packages

这份文档给后续执行工具使用，不再讲抽象方向，只列当前真实进度、剩余任务包、验收标准和建议执行顺序。

## 当前进度确认

### 1. BottomPane / interactive-mode 下半区统一
当前进度：约 80%

已经完成：
- `interactive-mode` 主结构已经是 core-owned `bottomPane`
- 结构已固定为 `Taskbar / Pending / Composer / Extension / Footer`
- 主任务栏 ownership 已从扩展层回收到 core
- 本轮又清掉了一批 `interactive-mode.ts` 中明显的 `prototype` 式 fallback / 兼容调用
- 主测试 [interactive-mode-status.test.ts] 已对齐到真实 `bottomPane` 结构，不再依赖 production fallback

仍未完成：
- 继续扫 `interactive-mode` 里残余旧出口和少量历史心智
- 做最后一轮复杂场景收尾确认：completion teardown、approval/input/retry/reconnect、多任务并行、queued command

### 2. TUI 二级界面中文化
当前进度：约 70%

已经完成：
- 大多数 selector / dialog / settings 已中文化
- 运行时主状态与辅助提示已经开始按语境分层
- 工具名、参数值、true/false、枚举值保持英文

仍未完成：
- 扫掉剩余二级界面英文文案
- 继续统一“主状态英文、辅助提示可中文、二级界面中文”的边界

### 3. 会话压缩上限与策略、阈值配置
当前进度：约 82%

已经完成：
- `thresholdPercent / autoCompactThresholdPercent` 已进入 core
- `/settings` 已支持阈值配置
- “压缩阈值占比”已经移到“自动压缩”下面
- `compactPrompt / compactPromptFile` 已进入 core 设置与压缩链路

仍未完成：
- 继续优化真正的压缩策略质量，而不是入口配置
- 重点是 replacement history、summary bridge、默认 `compact_prompt` 质量

### 4. Lumen 自身 changelog 口径 + 上游版本映射
当前进度：约 85%

已经完成：
- 用户可见 changelog 主路径已切到 `LUMEN_CHANGELOG.md`
- `getLumenChangelogPath()` 已成为 interactive UI 主入口
- `docs/UPSTREAM_VERSION_MAP.md` 已存在

仍未完成：
- 继续确认所有展示面不再漏回上游 Pi 原始 changelog 口径

## 后续执行任务包

按优先级执行，不要并行乱改。

## 执行总原则

后续执行工具必须遵守：

1. 不要并行改多个工作包。
2. 不要扩做“系统提示词治理”“人格”“长期记忆”之类当前不在执行面的主题。
3. 不要为了“代码更优雅”新增 adapter / wrapper / compatibility shim。
4. 不要新增大而全的新测试；只允许补与当前工作包直接对应的最少回归。
5. 每个工作包必须先修真实剩余问题，再做必要验证，然后停下汇报。
6. 如果发现问题只是文案、注释、测试夹具层面的旧心智，优先清理这些，不要反向污染 production。

## 后续执行任务包

按优先级串行执行，不要并行乱改，不要跨包跳做。

### 工作包 A：BottomPane 最后旧出口清理
目标：把 `interactive-mode` 剩余旧路径再清一轮，让下半区真正只剩 `bottomPane` 这一套心智。

重点文件：
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/test/interactive-mode-status.test.ts`
- 可能波及少量 `interactive-mode-*.test.ts`

具体任务：
1. 扫描 `interactive-mode.ts` 是否还残留：
   - 旧 `status/pending` 心智
   - 只为测试保留的兼容调用
   - 非必要的 helper 兜底
2. 仅删除确认为历史包袱的路径
3. 不要再新增新的 adapter 层或 wrapper helper
4. 保持现有行为不退化
5. 不要把清理范围扩展到 compaction、prompt、model、memory

验收标准：
- `interactive-mode.ts` 不再有明显 `statusContainer/pendingMessagesContainer` 旧心智回流
- `BottomPane` 相关实例方法调用路径直接清晰
- `interactive-mode-status.test.ts` 仍通过

建议验证：
- `npx tsx ../../node_modules/vitest/dist/cli.js --run test/interactive-mode-status.test.ts`
- `npm run check`

### 工作包 B：completion teardown 与复杂状态最终收尾
目标：确认任务栏在复杂场景结束后可靠消失，且主动状态不会回流 footer 或 transcript。

重点文件：
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/src/modes/interactive/components/progress-surface.ts`
- `packages/coding-agent/test/interactive-mode-status.test.ts`
- `packages/coding-agent/test/claude-task-ui.test.ts`
- `packages/coding-agent/test/footer-progress-filter.test.ts`

具体任务：
1. 核对这些场景是否还有逻辑尾巴：
   - approval
   - waiting input
   - auto retry
   - reconnect
   - queued follow-up
   - todo/task 并行
   - session complete / agent_end teardown
2. 只修真实剩余问题
3. 避免再扩展无关视觉效果
4. 不要顺手重做 progress surface 架构

验收标准：
- 会话完成后任务栏可靠消失
- footer 只保留被动状态
- queued command 不进入 taskbar headline 或 transcript
- todo/task/approval/input/retry/reconnect 各自仍在任务栏语义内

建议验证：
- `npx tsx ../../node_modules/vitest/dist/cli.js --run test/interactive-mode-status.test.ts test/claude-task-ui.test.ts test/footer-progress-filter.test.ts`
- `npm run check`

### 工作包 C：压缩策略深推
目标：不再碰“有没有这个设置”，而是提升压缩质量本身。

重点文件：
- `packages/coding-agent/src/core/compaction/compaction.ts`
- `packages/coding-agent/src/core/settings-manager.ts`
- `packages/coding-agent/test/compaction.test.ts`
- `packages/coding-agent/test/suite/agent-session-compaction.test.ts`
- `packages/coding-agent/test/agent-session-auto-compaction-queue.test.ts`

具体任务：
1. 核对当前 `thresholdPercent`、`compactPrompt`、summary bridge 的真实路径
2. 识别还没完成的策略问题：
   - replacement history 粒度
   - summary bridge 质量
   - 默认 `compact_prompt` 质量
3. 仅在确实能提升核心行为时改代码
4. 不要为了“看起来更高级”再引入新的复杂抽象
5. 不要碰系统提示词主链，只处理 compaction 自身链路

验收标准：
- 自动压缩阈值与压缩主链继续保持一致
- 现有 compaction 回归测试通过
- 没有破坏 queued message / session history / branch summary 相关行为

建议验证：
- `npx tsx ../../node_modules/vitest/dist/cli.js --run test/compaction.test.ts test/agent-session-auto-compaction-queue.test.ts test/suite/agent-session-compaction.test.ts`
- `npm run check`

### 工作包 D：Lumen changelog 展示口径扫尾
目标：确认用户可见更新日志都已转到 Lumen 口径，不再直漏上游 Pi 文案。

重点文件：
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/src/utils/changelog.ts`
- `packages/coding-agent/LUMEN_CHANGELOG.md`
- `docs/UPSTREAM_VERSION_MAP.md`
- `packages/coding-agent/test/interactive-mode-status.test.ts`

具体任务：
1. 检查 interactive UI、启动提示、`/changelog` 是否都走 Lumen 路径
2. 只修漏网展示面
3. 不要改 release 流程本身
4. 不要把这个工作包扩展成版本系统重构

验收标准：
- 用户可见 changelog 展示走 `LUMEN_CHANGELOG.md`
- 上游版本信息只出现在映射文档，不直接伪装成 Lumen 更新内容

建议验证：
- `npx tsx ../../node_modules/vitest/dist/cli.js --run test/interactive-mode-status.test.ts`
- `npm run check`

### 工作包 E：TUI 二级界面中文化扫尾
目标：这是最后一层，不要优先于 A/B/C/D。只在核心收尾后推进。

重点文件：
- `packages/coding-agent/src/modes/interactive/components/tui-copy.ts`
- `packages/coding-agent/src/modes/interactive/components/session-selector.ts`
- `packages/coding-agent/src/modes/interactive/components/model-selector.ts`
- `packages/coding-agent/src/modes/interactive/components/oauth-selector.ts`
- `packages/coding-agent/src/modes/interactive/components/tree-selector.ts`
- 相关 `tui-localization-*.test.ts`

具体任务：
1. 继续扫掉二级界面英文残留
2. 保持：
   - 工具名英文
   - 参数值英文
   - `true/false` 不翻译
   - 主任务栏运行时主状态保持英文优先
3. 不要碰 runtime 主状态 headline 的语言策略
4. 不要翻译工具名、命令名、参数值、布尔值、枚举值

验收标准：
- selector/dialog/settings/tree 等剩余二级界面文案继续统一
- 不破坏“主状态英文、辅助提示可中文、二级界面中文”的边界

建议验证：
- `npx tsx ../../node_modules/vitest/dist/cli.js --run test/tui-localization-dialogs.test.ts test/tui-localization-secondary-selectors.test.ts test/tui-localization-settings-selector.test.ts`
- `npm run check`

## 推荐执行顺序

1. 工作包 A
2. 工作包 B
3. 工作包 C
4. 工作包 D
5. 工作包 E

## 交付要求

后续执行工具每完成一个工作包，都要回报：
1. 改了哪些文件
2. 为什么这些改动能推进目标，而不是只是在重构
3. 跑了哪些验证
4. 还剩什么没做
5. 明确下一步是否继续同一工作包，还是等待审核

## 给后续审核者的注意事项

审核时重点看：
- 有没有又引入新的兼容壳 / wrapper / fallback
- 有没有把主动状态重新回流到 footer 或 transcript
- 有没有为了中文化破坏工具名 / 参数值英文约束
- 有没有把压缩策略改复杂但没有新增行为证明
- 有没有把 Lumen changelog 路径又混回 upstream Pi 口径
- 有没有把任务偷偷扩展到系统提示词治理或其它未授权主题
