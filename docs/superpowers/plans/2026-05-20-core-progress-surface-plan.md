# Core Progress Surface Implementation Plan

> 规划定位：
> 本计划属于 [Stage B — Interactive Surface](../../ROADMAP.md)。
> 它解决的是“输入框上方任务栏由谁拥有、如何显示、何时隐藏”这一条核心交互主线，对应能力矩阵中的 `core-owned progress surface`、`queue 独立展示槽位` 与 `completion teardown` 等能力项。
> 执行时必须保留 `.pi/` 兼容层，且尽量把改动集中在 `interactive-mode` 主线，以减少上游合并冲突。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把输入框上方的唯一进度面收回 `interactive-mode`，让扩展只提供语义状态，最终移除 `.lumen/extensions/claude-task-ui.ts` 的布局所有权。

**Architecture:** `interactive-mode` 直接拥有进度面的显示、隐藏、时序和动画；它从 session 与 extension state 读取 `SpinnerUiState`、`TaskUiSummary`、`QueuedUiState`，再渲染成一个 core-owned progress surface。`task`/`todo` 仍然输出 transcript 语义，但不再决定主进度面的存在与否。`.lumen/extensions/claude-task-ui.ts` 先降级为过渡壳，等 core surface 稳定后删除。

**Tech Stack:** TypeScript, `@earendil-works/pi-tui`, Vitest, existing extension runtime, existing interactive-mode event loop.

---

### Task 1: Move shared spinner vocabulary into core

**Files:**
- Create: `packages/coding-agent/src/modes/interactive/spinner-verbs.ts`
- Modify: `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Modify: `.lumen/extensions/claude-task-ui.ts`
- Test: `packages/coding-agent/test/progress-surface.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
expect(renderProgressSurface(snapshot)).toContain("⣻ @explore 查看Git分支信息...");
expect(renderProgressSurface({ ...snapshot, tasks: completedOnly })).toBe("");
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/progress-surface.test.ts`
Expected: FAIL because the core surface does not exist yet.

- [ ] **Step 3: Add the core spinner verb list and a core-owned render helper**

```ts
export const CLAUDE_SPINNER_VERBS = [/* moved from .lumen/extensions/lib/claude-spinner-verbs.ts */] as const;
```

- [ ] **Step 4: Re-run the test and confirm it passes**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/progress-surface.test.ts`
Expected: PASS.

---

### Task 2: Build the core progress surface inside `interactive-mode`

**Files:**
- Create: `packages/coding-agent/src/modes/interactive/components/progress-surface.ts`
- Modify: `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/footer.ts`

- [ ] **Step 1: Write the failing composition test**

```ts
expect(renderProgressSurface({
  banner: { kind: "warning", title: "接口不稳定，正在自动重试" },
  queued: { steering: [], followUp: [{ kind: "followUp", mode: "prompt", text: "完成后补文档" }] },
  tasks: [{ id: "task:1", content: "查看Git分支信息", subject: "查看Git分支信息", activeForm: "查看Git分支信息", status: "running", group: "explore" }],
  expanded: false,
})).toContain("Follow-up: 完成后补文档");
```

- [ ] **Step 2: Wire core render ownership**

```ts
const surface = new ProgressSurfaceComponent({
  spinner: ctx.ui.getSpinnerState(),
  tasks: ctx.getTasks() ?? [],
  queued: ctx.getQueuedMessages(),
  expanded: ctx.ui.getTasksExpanded(),
});
this.widgetContainerAbove.clear();
this.widgetContainerAbove.addChild(surface);
```

- [ ] **Step 3: Make visibility a core decision**

```ts
if (!hasLiveBanner && !hasQueuedMessages && !hasRunningTasks && !hasLivePlan) {
  return undefined;
}
```

- [ ] **Step 4: Re-run the composition test**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/progress-surface.test.ts`
Expected: PASS.

---

### Task 3: Retire the extension-owned taskbar and delete plugin-only progress APIs

**Files:**
- Delete: `.lumen/extensions/claude-task-ui.ts`
- Delete: `.lumen/extensions/claude-spinner-verbs.ts`
- Delete: `.lumen/extensions/lib/claude-spinner-verbs.ts`
- Modify: `packages/coding-agent/src/core/extensions/types.ts`
- Modify: `packages/coding-agent/src/core/extensions/runner.ts`
- Modify: `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Modify: `packages/coding-agent/src/modes/rpc/rpc-mode.ts`
- Modify: `packages/coding-agent/docs/extensions.md`
- Modify: `packages/coding-agent/docs/tui.md`
- Modify: `.lumen/extensions/claude-task-ui.test.ts`
- Modify: any extension loader wiring that still points at the deleted taskbar entry

- [ ] **Step 1: Write the failing loader test**

```ts
expect(() => loadExtensions()).not.toThrow();
expect(renderedProgress).not.toContain("Idle");
```

- [ ] **Step 2: Delete the plugin-only progress APIs from the extension contract**

Remove these APIs entirely:

```ts
ctx.getTasks()
ctx.getTaskSummary()
ctx.getQueuedMessages()
ctx.ui.getSpinnerState()
ctx.ui.setSpinnerState()
ctx.ui.getTasksExpanded()
ctx.ui.setTasksExpanded()
ctx.ui.toggleTasksExpanded()
ctx.ui.setQueuedVisible()
```

Do **not** remove these Pi-native primitives:

```ts
ctx.ui.setWidget()
ctx.ui.setFooter()
ctx.ui.setHeader()
ctx.ui.setWorkingMessage()
ctx.ui.setWorkingIndicator()
ctx.ui.setWorkingVisible()
ctx.ui.setWorkingDetails()
```

- [ ] **Step 3: Remove the extension-owned widget path**

```ts
// No setWidget("claude-task-ui:taskbar") calls remain.
// The core progress surface owns placement and teardown.
```

- [ ] **Step 4: Re-run the loader test**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/claude-task-ui.test.ts`
Expected: PASS after the extension file is removed and the loader no longer references it.

---

### Task 4: Keep task/todo transcript semantic and non-progressive

**Files:**
- Modify: `packages/coding-agent/src/core/lumen-task.ts`
- Modify: `packages/coding-agent/src/core/lumen-todo.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- Modify: `packages/coding-agent/src/modes/interactive/output-flow/projector.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/footer.ts`
- Test: `packages/coding-agent/test/lumen-task.test.ts`
- Test: `packages/coding-agent/test/lumen-todo.test.ts`

- [ ] **Step 1: Write the regression tests**

```ts
expect(stripAnsi(rendered.render(120).join("\n"))).toContain("● task explore · 1 task");
expect(stripAnsi(todoRendered.render(120).join("\n"))).not.toContain("toolSuccessBg");
```

- [ ] **Step 2: Keep `task`/`todo` as transcript rows only**

```ts
renderShell: "self" as const
```

- [ ] **Step 3: Remove footer progress duplication**

```ts
// task / todo / queue / ask_user / ui stay out of the footer status list
```

- [ ] **Step 4: Re-run the transcript tests**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/lumen-task.test.ts test/lumen-todo.test.ts`
Expected: PASS.

---

### Task 5: Verify the migration end-to-end

**Files:**
- Test: `packages/coding-agent/test/progress-surface.test.ts`
- Test: `packages/coding-agent/test/claude-task-ui.test.ts`
- Test: `packages/coding-agent/test/lumen-task.test.ts`
- Test: `packages/coding-agent/test/lumen-todo.test.ts`

- [ ] **Step 1: Run the focused regression suite**

Run: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/progress-surface.test.ts test/claude-task-ui.test.ts test/lumen-task.test.ts test/lumen-todo.test.ts`
Expected: PASS.

- [ ] **Step 2: Run the extensions typecheck**

Run: `npx tsc -p tsconfig.extensions.json --noEmit`
Expected: PASS.

- [ ] **Step 3: Run the repo check**

Run: `npm run check`
Expected: PASS with no fixes applied.

- [ ] **Step 4: Run the local smoke command**

Run: `.\lumen-test.ps1 -c`
Expected: task/todo/subagent output loads with the core-owned progress surface and disappears cleanly at completion.
