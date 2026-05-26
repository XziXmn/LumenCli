# Claude-Aligned Progress Workflow Implementation Plan

> 规划定位：
> 本计划属于 [Stage B — Interactive Surface](../../ROADMAP.md)。
> 它解决的是“任务栏内部如何按 Claude 风格分层 headline / execution / plan / queue / banner”，对应能力矩阵中的 `Claude-aligned workflow layering`、`approval / input / retry / reconnect 统一状态语义` 与 `queue 独立展示槽位` 等能力项。
> 执行时必须延续 core-owned progress surface 路线，不能重新把主任务栏所有权退回扩展层，也不能破坏 `.pi/` fallback 兼容。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `interactive-mode` 的核心任务栏继续对齐 Claude 的整套进度工作流与样式分层，使 headline、execution、plan、queue、transcript、approval/input/retry 各司其职，并收口重复进度。

**Architecture:** 继续以 core-owned `progress-surface` 为唯一主动进度面，但将其内部决策从“当前执行项优先”改为“主线程/计划视角优先”。`interactive-mode` 统一提供 headline、execution tree、plan list、next hint、queue slot 与 banner slot；`todo`/`task` 只在 transcript 中保留语义痕迹，不再输出主进度摘要。整体行为参考 Claude 的 `Spinner.tsx`、`TaskListV2.tsx`、`PromptInputQueuedCommands.tsx`、`TeammateSpinnerTree.tsx` 与 `AssistantToolUseMessage.tsx` 分层方式，但改动尽量集中在 Lumen 的 `interactive-mode` 主线。

**Tech Stack:** TypeScript, `@earendil-works/pi-tui`, Vitest, existing interactive-mode event loop, existing task/todo session state.

---

### Task 1: Reframe headline selection around plan-first semantics

**Files:**
- Modify: `packages/coding-agent/src/modes/interactive/components/progress-surface.ts`
- Modify: `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Test: `packages/coding-agent/test/claude-task-ui.test.ts`

- [ ] **Step 1: Write the failing headline-priority regression test**

```ts
const output = render({
  tasks: [
    {
      id: "task:explore-1",
      content: "读取 CONTRIBUTING.md",
      subject: "读取 CONTRIBUTING.md",
      status: "running",
      group: "explore",
      meta: "read CONTRIBUTING.md",
      toolCount: 1,
      tokens: 406,
    },
    {
      id: "todo:0:0:抽取公共工具类",
      content: "抽取公共工具类",
      subject: "抽取公共工具类",
      activeForm: "抽取公共工具类",
      status: "in_progress",
      group: "阶段一",
    },
  ],
  queued: undefined,
  spinner: {
    elapsedMs: 22_000,
    outputTokens: 406,
    mode: "tool-use",
  },
  expanded: false,
});

expect(output).toContain("抽取公共工具类...");
expect(output).not.toContain("@explore 读取 CONTRIBUTING.md...");
```

- [ ] **Step 2: Run the test and confirm it fails with current execution-first behavior**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/claude-task-ui.test.ts`
Expected: FAIL because headline still prefers the execution item.

- [ ] **Step 3: Change headline selection to match Claude-style priority**

```ts
function buildHeadlineText(
  currentPlan: TaskUiItem | undefined,
  executionItems: TaskUiItem[],
  spinner: SpinnerUiState | undefined,
  working: ProgressSurfaceWorkingState,
): string {
  if (spinner?.overrideMessage) {
    return inlineText(spinner.overrideMessage, MAX_WORKING_PREVIEW_CHARS);
  }

  if (currentPlan?.activeForm) {
    return inlineText(currentPlan.activeForm, MAX_WORKING_PREVIEW_CHARS);
  }

  if (currentPlan?.subject ?? currentPlan?.content) {
    return inlineText(currentPlan.subject ?? currentPlan.content, MAX_WORKING_PREVIEW_CHARS);
  }

  const runningExecution = firstTask(executionItems, ["running", "in_progress"]);
  if (runningExecution) {
    const label = runningExecution.activeForm ?? runningExecution.subject ?? runningExecution.content;
    const prefix = runningExecution.group ? `@${runningExecution.group} ` : "";
    return inlineText(`${prefix}${label}`, MAX_WORKING_PREVIEW_CHARS);
  }

  if (spinner?.currentToolLabel) {
    return inlineText(spinner.currentToolLabel, MAX_WORKING_PREVIEW_CHARS);
  }

  return working.randomVerb;
}
```

- [ ] **Step 4: Re-run the headline test and confirm it passes**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/claude-task-ui.test.ts`
Expected: PASS.

---

### Task 2: Turn execution into a Claude-style agent tree instead of a pseudo-headline

**Files:**
- Modify: `packages/coding-agent/src/modes/interactive/components/progress-surface.ts`
- Modify: `packages/coding-agent/src/core/lumen-task.ts`
- Test: `packages/coding-agent/test/lumen-task.test.ts`
- Test: `packages/coding-agent/test/claude-task-ui.test.ts`

- [ ] **Step 1: Add a regression test for multi-agent execution tree rendering**

```ts
const output = render({
  tasks: [
    {
      id: "task:explore-1",
      content: "读取 CONTRIBUTING.md",
      subject: "读取 CONTRIBUTING.md",
      status: "running",
      group: "explore",
      meta: "read CONTRIBUTING.md",
      toolCount: 1,
      tokens: 1700,
      durationMs: 14000,
    },
    {
      id: "task:review-1",
      content: "扫描错误处理路径",
      subject: "扫描错误处理路径",
      status: "running",
      group: "review",
      meta: "grep retry logic",
      toolCount: 2,
      tokens: 2100,
      durationMs: 15000,
    },
  ],
  queued: undefined,
  spinner: {
    elapsedMs: 15_000,
    outputTokens: 3800,
    mode: "tool-use",
  },
  expanded: false,
});

expect(output).toContain("2 running tasks");
expect(output).toContain("@explore: read CONTRIBUTING.md");
expect(output).toContain("@review: grep retry logic");
```

- [ ] **Step 2: Run the task/tree test and confirm it fails with current single-line execution summary**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/claude-task-ui.test.ts test/lumen-task.test.ts`
Expected: FAIL because execution rendering does not yet use the Claude-style tree semantics.

- [ ] **Step 3: Change execution rendering to aggregate headline and keep detail rows below**

```ts
function renderExecutionLines(items: TaskUiItem[], expanded: boolean, theme: Theme): string[] {
  const liveItems = items.filter((item) =>
    item.status === "running" || item.status === "in_progress" || item.status === "pending",
  );
  if (liveItems.length === 0) return [];

  const header =
    liveItems.length === 1
      ? "1 running task"
      : `${liveItems.filter((item) => item.status !== "pending").length} running tasks`;

  const lines = [theme.fg("dim", `  ⎿ ${header}`)];
  const capped = expanded ? liveItems : liveItems.slice(0, MAX_EXECUTION_ITEMS);

  for (const item of capped) {
    const agent = item.group ? `@${item.group}` : item.id;
    const activity = item.meta ?? item.activeForm ?? item.subject ?? item.content;
    const stats: string[] = [];
    if (item.toolCount) stats.push(`${item.toolCount} uses`);
    if (item.tokens) stats.push(`${formatTokens(item.tokens)} tokens`);
    if (item.durationMs) stats.push(formatElapsed(item.durationMs));
    if (item.status === "pending") stats.push("pending");
    lines.push(
      `${theme.fg("dim", "    ├─ ")}${theme.fg("accent", agent)}${theme.fg("dim", `: ${inlineText(activity, 72)}${stats.length > 0 ? ` · ${stats.join(" · ")}` : ""}`)}`,
    );
  }

  return lines;
}
```

- [ ] **Step 4: Re-run the execution tests and confirm they pass**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/claude-task-ui.test.ts test/lumen-task.test.ts`
Expected: PASS.

---

### Task 3: Remove todo/task progress summaries from transcript results

**Files:**
- Modify: `packages/coding-agent/src/core/lumen-todo.ts`
- Modify: `packages/coding-agent/src/core/lumen-task.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- Test: `packages/coding-agent/test/lumen-todo.test.ts`
- Test: `packages/coding-agent/test/lumen-task.test.ts`

- [ ] **Step 1: Write transcript regressions for summary suppression**

```ts
const todoResult = todoTool.renderResult!(
  {
    content: [{ type: "text", text: "Todo 9/9 completed · 0 remaining" }],
    details: { phases: updated, errors: [] },
  } as any,
  { expanded: false, isPartial: false },
  theme,
  {} as any,
) as Text;

expect(stripAnsi(todoResult.render(120).join("\n"))).toBe("");
```

```ts
const taskResult = taskTool.renderResult!(
  {
    content: [{ type: "text", text: "Done (5 tool uses · 350 tokens · 5.0s)" }],
    details,
  } as any,
  { expanded: false, isPartial: false },
  theme,
  ctx,
) as { render: () => string[] };

expect(stripAnsi(taskResult.render().join("\n"))).toBe("");
```

- [ ] **Step 2: Run the transcript regressions and confirm they fail**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/lumen-task.test.ts test/lumen-todo.test.ts`
Expected: FAIL because the tools still emit progress summaries into transcript results.

- [ ] **Step 3: Suppress progress-only result text for stateful progress tools**

```ts
renderResult(
  result: { content: Array<{ type: string; text?: string }>; details?: TodoToolDetails },
  options: ToolRenderResultOptions,
  _theme,
  _context,
) {
  if (options.isPartial) {
    return new Text("", 0, 0);
  }
  const details = result.details;
  const hasErrors = !!details?.errors?.length;
  if (!hasErrors) {
    return new Text("", 0, 0);
  }
  const fallback = result.content?.[0]?.text ?? "Todo update failed";
  return new Text(fallback, 0, 0);
}
```

```ts
renderResult(result, options, _theme, context) {
  const details = result.details as TaskToolDetails | undefined;
  const state = context.state as TaskRenderState;
  if (details?.progress) {
    for (const p of details.progress) state.progressMap.set(p.id, p);
  }
  if (options.isPartial) {
    return { render: () => [""], invalidate: () => {} };
  }
  const hasFailure = !!details?.results.some((entry) => entry.exitCode !== 0);
  if (!hasFailure) {
    return { render: () => [""], invalidate: () => {} };
  }
  return {
    render: () => [theme.fg("error", `  ⎿ ${formatTaskResultSummary(details!)}`)],
    invalidate: () => {},
  };
}
```

- [ ] **Step 4: Re-run transcript regressions and confirm they pass**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/lumen-task.test.ts test/lumen-todo.test.ts`
Expected: PASS.

---

### Task 4: Make queue a dedicated slot and keep it out of headline semantics

**Files:**
- Modify: `packages/coding-agent/src/modes/interactive/components/progress-surface.ts`
- Modify: `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Test: `packages/coding-agent/test/claude-task-ui.test.ts`

- [ ] **Step 1: Add a regression test ensuring queue does not replace the main headline**

```ts
const output = render({
  tasks: [
    {
      id: "todo:0:0:统一封装响应格式",
      content: "统一封装响应格式",
      subject: "统一封装响应格式",
      activeForm: "统一封装响应格式",
      status: "in_progress",
      group: "阶段一",
    },
  ],
  queued: {
    steering: [],
    followUp: [{ kind: "followUp", mode: "prompt", text: "完成后补文档" }],
  },
  spinner: {
    elapsedMs: 8_000,
    outputTokens: 210,
    mode: "responding",
  },
  expanded: false,
});

expect(output).toContain("统一封装响应格式...");
expect(output).toContain("1 queued command");
expect(output).not.toContain("Follow-up: 完成后补文档...");
```

- [ ] **Step 2: Run the queue/headline regression and confirm it fails**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/claude-task-ui.test.ts`
Expected: FAIL because queue handling still competes with headline semantics or duplicates in transcript.

- [ ] **Step 3: Keep queue rendering in a separate slot with bounded preview**

```ts
function renderQueueLines(snapshot: ProgressSurfaceSnapshot, theme: Theme): string[] {
  if (!snapshot.queued) return [];
  const items = [...snapshot.queued.steering, ...snapshot.queued.followUp].filter((item) => !item.isMeta);
  if (items.length === 0) return [];

  const lines = [
    theme.fg("dim", items.length === 1 ? "1 queued command" : `${items.length} queued commands`),
  ];

  for (const item of items.slice(0, MAX_QUEUED_ITEMS)) {
    const label = item.kind === "steer" ? "Steer" : "Follow-up";
    const text = item.preExpansionText && item.preExpansionText !== item.text ? item.preExpansionText : item.text;
    lines.push(`${theme.fg("dim", "  ⎿ ")}${theme.fg("muted", `${label}: `)}${inlineText(text, MAX_QUEUED_PREVIEW_CHARS)}`);
  }

  return lines;
}
```

- [ ] **Step 4: Re-run queue/headline regression and confirm it passes**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/claude-task-ui.test.ts`
Expected: PASS.

---

### Task 5: Keep banner states dominant over task/execution semantics

**Files:**
- Modify: `packages/coding-agent/src/modes/interactive/components/progress-surface.ts`
- Modify: `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Test: `packages/coding-agent/test/claude-task-ui.test.ts`

- [ ] **Step 1: Add regressions for approval/input/retry/reconnect dominance**

```ts
const output = render({
  tasks: [
    {
      id: "todo:0:0:实现核心功能",
      content: "实现核心功能",
      subject: "实现核心功能",
      activeForm: "实现核心功能",
      status: "in_progress",
      group: "开发实现",
    },
  ],
  queued: undefined,
  spinner: {
    banner: {
      kind: "approval",
      title: "等待审批确认",
      detail: "将修改 4 个文件，确认后继续",
    },
    overrideMessage: "Waiting for approval",
    mode: "requesting",
  },
  expanded: false,
});

expect(output).toContain("等待审批确认");
expect(output).toContain("Waiting for approval...");
expect(output).not.toContain("实现核心功能...");
```

- [ ] **Step 2: Run banner-dominance regressions and confirm they fail where needed**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/claude-task-ui.test.ts`
Expected: FAIL if task or execution semantics still override banner states.

- [ ] **Step 3: Keep banner/override at the top of the headline priority**

```ts
if (spinner?.overrideMessage) {
  return inlineText(spinner.overrideMessage, MAX_WORKING_PREVIEW_CHARS);
}

if (spinner?.banner) {
  lines.push(...renderBannerLines(snapshot, theme));
}
```

- [ ] **Step 4: Re-run banner regressions and confirm they pass**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/claude-task-ui.test.ts`
Expected: PASS.

---

### Task 6: Sync docs to the new Claude-aligned core workflow

**Files:**
- Modify: `packages/coding-agent/docs/extensions.md`
- Modify: `packages/coding-agent/docs/tui.md`
- Modify: `packages/coding-agent/docs/rpc.md`

- [ ] **Step 1: Document that the core taskbar owns active progress, not extensions**

```md
Extensions can contribute passive UI via `setWidget`, `setFooter`, `setHeader`,
and can influence the built-in working loader via `setWorkingMessage`,
`setWorkingIndicator`, `setWorkingVisible`, and `setWorkingDetails`.

Extensions do not own the main prompt-side progress surface. The core
interactive taskbar renders queue, banner, execution, and plan state.
```

- [ ] **Step 2: Remove any stale wording that implies extension-owned taskbar APIs**

```md
Do not document `getTasks`, `getTaskSummary`, `getQueuedMessages`,
`getSpinnerState`, `setSpinnerState`, `getTasksExpanded`, `setTasksExpanded`,
`toggleTasksExpanded`, or `setQueuedVisible`.
```

- [ ] **Step 3: Clarify RPC behavior for supported passive primitives only**

```md
In RPC mode, `setWorkingMessage`, `setWorkingIndicator`, `setWorkingVisible`,
`setFooter`, `setHeader`, and `setEditorComponent` remain no-ops because they
require direct TUI ownership. `setWidget` and `setStatus` still forward through
the extension UI request channel as passive host-facing UI signals.
```

- [ ] **Step 4: Manually review docs for remaining stale API references**

Run: `rg -n "getTasks\\(|getTaskSummary\\(|getQueuedMessages\\(|getSpinnerState\\(|setSpinnerState\\(|getTasksExpanded\\(|setTasksExpanded\\(|toggleTasksExpanded\\(|setQueuedVisible\\(" packages/coding-agent/docs`
Expected: no matches.

---

### Task 7: Verify the Claude-aligned progress workflow end to end

**Files:**
- Test: `packages/coding-agent/test/claude-task-ui.test.ts`
- Test: `packages/coding-agent/test/lumen-task.test.ts`
- Test: `packages/coding-agent/test/lumen-todo.test.ts`
- Test: `packages/coding-agent/test/extensions-runner.test.ts`
- Test: `packages/coding-agent/test/trigger-compact-extension.test.ts`

- [ ] **Step 1: Run the focused progress/transcript regression suite**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/claude-task-ui.test.ts test/lumen-task.test.ts test/lumen-todo.test.ts test/extensions-runner.test.ts test/trigger-compact-extension.test.ts`
Expected: PASS.

- [ ] **Step 2: Run the extensions typecheck**

Run: `npx tsc -p tsconfig.extensions.json --noEmit`
Expected: PASS.

- [ ] **Step 3: Run the repo check**

Run: `npm run check`
Expected: PASS with no fixes applied.

- [ ] **Step 4: Run the local smoke command**

Run: `.\lumen-test.ps1 -c`
Expected: single todo, single subagent, multi-subagent, todo+subagent, retry, and queued command flows all behave with the core-owned Claude-aligned progress surface.

- [ ] **Step 5: Manually inspect the required behavior matrix**

```text
1. 单 todo：headline = todo.current，execution 可为空，plan 可见
2. 单子代理：headline = 聚合或单执行态，execution 显示 1 行 agent
3. 多子代理并行：headline = 聚合 execution，execution 显示多行 agent tree
4. todo + 子代理并行：headline = todo.current 或总控态，不落到单个 @agent
5. queue：只在 queue slot，可见但不改写 headline
6. approval/input/retry/reconnect：banner/override 主导 headline
7. transcript：无 `Todo x/y completed` / `Task done x/y` 这类主进度摘要
8. completion：任务栏可靠消失
```

---

### Task 8: Commit

**Files:**
- Modify: all touched files from Tasks 1-7

- [ ] **Step 1: Inspect the diff before staging**

Run: `git diff -- packages/coding-agent/src/modes/interactive/components/progress-surface.ts packages/coding-agent/src/modes/interactive/interactive-mode.ts packages/coding-agent/src/core/lumen-todo.ts packages/coding-agent/src/core/lumen-task.ts packages/coding-agent/src/modes/interactive/components/tool-execution.ts packages/coding-agent/docs/extensions.md packages/coding-agent/docs/tui.md packages/coding-agent/docs/rpc.md packages/coding-agent/test/claude-task-ui.test.ts packages/coding-agent/test/lumen-task.test.ts packages/coding-agent/test/lumen-todo.test.ts packages/coding-agent/test/extensions-runner.test.ts packages/coding-agent/test/trigger-compact-extension.test.ts`
Expected: only Claude-aligned progress workflow changes.

- [ ] **Step 2: Stage only the intended files**

```bash
git add packages/coding-agent/src/modes/interactive/components/progress-surface.ts
git add packages/coding-agent/src/modes/interactive/interactive-mode.ts
git add packages/coding-agent/src/core/lumen-todo.ts
git add packages/coding-agent/src/core/lumen-task.ts
git add packages/coding-agent/src/modes/interactive/components/tool-execution.ts
git add packages/coding-agent/docs/extensions.md
git add packages/coding-agent/docs/tui.md
git add packages/coding-agent/docs/rpc.md
git add packages/coding-agent/test/claude-task-ui.test.ts
git add packages/coding-agent/test/lumen-task.test.ts
git add packages/coding-agent/test/lumen-todo.test.ts
git add packages/coding-agent/test/extensions-runner.test.ts
git add packages/coding-agent/test/trigger-compact-extension.test.ts
git add docs/superpowers/plans/2026-05-20-claude-aligned-progress-workflow-plan.md
```

- [ ] **Step 3: Commit with a scoped message**

```bash
git commit -m "refactor(coding-agent): 对齐 Claude 进度工作流"
```
