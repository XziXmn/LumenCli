# Claude Tool And Thinking Style Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Lumen's assistant thinking blocks and tool transcript rendering with the latest Claude-style output, including structure, color hierarchy, highlight rules, and minimal regression coverage.

**Architecture:** Keep the existing `interactive-mode` runtime flow and settings model intact. Implement the alignment inside the transcript-facing rendering components, plus a narrow theme/runtime adjustment for expanded tool execution so collapsed and expanded states no longer look like two different design systems.

**Tech Stack:** TypeScript, Vitest, pi-tui theme system, existing interactive-mode transcript components

---

## Scope

In scope:

- Assistant thinking default display structure
- Assistant thinking color and emphasis rules
- Single-tool collapsed summary structure
- Batch-tool collapsed summary structure
- Expanded tool execution visual weight, background, and highlight behavior
- Theme token usage for the above
- Targeted transcript-style tests

Out of scope:

- `interactive-mode.ts` flow restructuring
- settings semantics (`隐藏思考`, `工具折叠`)
- collapsed read/search grouping logic
- progress-surface headline system
- model / compaction / memory / prompt changes

## File map

Primary implementation files:

- Modify: `packages/coding-agent/src/modes/interactive/components/assistant-message.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/assistant-tool-summary.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/assistant-tool-batch-summary.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/tui-copy.ts`
- Modify: `packages/coding-agent/src/modes/interactive/theme/dark.json`
- Optional if parity requires it: `packages/coding-agent/src/modes/interactive/theme/light.json`

Primary tests:

- Modify: `packages/coding-agent/test/assistant-message.test.ts`
- Modify: `packages/coding-agent/test/assistant-tool-summary.test.ts`
- Modify: `packages/coding-agent/test/assistant-tool-batch-summary.test.ts`
- Modify only if snapshots/assertions need refresh: `packages/coding-agent/test/interactive-mode-status.test.ts`

Reference-only files:

- Read: `docs/claude-output-style.md`
- Read: `docs/claude-tool-call-style.md`
- Read: `references/ClaudeCodeRev/src/components/messages/AssistantThinkingMessage.tsx`
- Read: `references/ClaudeCodeRev/src/components/messages/AssistantToolUseMessage.tsx`
- Read: `references/ClaudeCodeRev/src/components/MessageResponse.tsx`

## Non-negotiable constraints

- Do not change settings semantics:
  - `隐藏思考` stays `true/false`
  - `工具折叠` stays `true/false`
- Keep tool names, command names, parameter values, enum values, and `true/false` in English
- Do not broaden this task into prompt / compaction / progress-surface redesign
- Do not add adapter layers or compatibility shims
- Do not run:
  - `npm run dev`
  - `npm run build`
  - `npm test`
- After code changes, run:
  - specific Vitest files touched by this work
  - `npm run check`

## Target behavior

### Thinking

- Default thinking display should no longer be:
  - line 1: `∴ Thinking…`
  - line 2+: extracted preview
- Default thinking display should become:
  - a weak, direct preview line beginning with `∴ `
  - optionally followed by one or two weak continuation lines only if needed
- Thinking should remain visually subordinate:
  - dim / muted
  - italic is allowed
  - no accent title
  - no badge
  - no colored box background
- Hidden mode still shows the hidden label
- Expanded mode still shows the full thinking content

### Single tool collapsed summary

- Main line remains:
  - colored status dot
  - bold title
  - no full JSON args
- Result line remains `⎿`-style subordinate
- Remove the collapsed-mode default 5-line output preview for non-collapsible tools

### Batch tool collapsed summary

- Replace `Done 1 read, 1 bash`-style summaries with statistical summaries:
  - `Done (2 tool uses)`
  - `Running (3 tool uses)`
- Keep the latest hint line below
- Keep the status-dot-first hierarchy

### Expanded tool execution style

- Reduce or remove the strong colored panel feel for ordinary tools
- Ordinary read / grep / bash / edit expanded views should not depend on colored block backgrounds for hierarchy
- Preserve readability of:
  - result text
  - diffs
  - image fallback text
- Do not remove tool-specific special rendering hooks

### Color hierarchy rules

- Status dot owns most of the state color
- Title relies on bold first, color second
- `⎿` gutter stays dim
- Thinking stays dim/subordinate
- Ordinary tool titles should not be globally accent-colored
- Ordinary tool rows should not get badge-like background fills by default

---

### Task 1: Lock the target behavior in tests first

**Files:**

- Modify: `packages/coding-agent/test/assistant-message.test.ts`
- Modify: `packages/coding-agent/test/assistant-tool-summary.test.ts`
- Modify: `packages/coding-agent/test/assistant-tool-batch-summary.test.ts`

- [ ] **Step 1: Add failing thinking-summary assertions**

Add assertions that verify:

- summary mode renders a direct `∴ ` preview instead of a separate `∴ Thinking…` title block
- hidden mode still renders the hidden label
- expanded mode still renders the full thinking content

Suggested cases:

- assistant message with one thinking block and no tool calls
- assistant message with thinking followed by assistant text

- [ ] **Step 2: Add failing collapsed tool summary assertions**

Add assertions that verify:

- collapsed `bash` summary shows:
  - `Bash(pwd)`
  - `⎿ Command completed...`
- collapsed `bash` summary does **not** show raw preview output lines unless expanded
- collapsed `read` summary still shows title + summary only

- [ ] **Step 3: Add failing batch summary assertions**

Add assertions that verify:

- completed batch summary becomes `Done (N tool uses)`
- in-progress batch summary becomes `Running (N tool uses)`
- latest hint remains on the `⎿` line

- [ ] **Step 4: Run targeted tests to confirm failure**

Run from `packages/coding-agent`:

```powershell
npx tsx ../../node_modules/vitest/dist/cli.js --run test/assistant-message.test.ts test/assistant-tool-summary.test.ts test/assistant-tool-batch-summary.test.ts
```

Expected:

- at least the newly added assertions fail
- failures clearly describe current mismatches

---

### Task 2: Update assistant thinking rendering structure and emphasis

**Files:**

- Modify: `packages/coding-agent/src/modes/interactive/components/assistant-message.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/tui-copy.ts`

- [ ] **Step 1: Replace summary-mode title block with direct preview rendering**

Adjust the `summary` branch so it:

- does not emit `TUI_COPY.thinkingBlock.summaryTitle` as a standalone heading
- emits the first preview line prefixed with `∴ `
- optionally emits continuation lines in the same weak visual tone if the preview is wrapped/truncated

Implementation rule:

- keep the preview extraction heuristic local to this component
- do not create a new adapter or utility module for this task

- [ ] **Step 2: Keep thinking visually subordinate**

Ensure summary-mode and full-mode thinking uses:

- `thinkingText`
- optional italic
- no accent foreground
- no background fill

Do not promote thinking to `accent`, `success`, or code-style highlighting.

- [ ] **Step 3: Keep hidden and expanded behavior intact**

Preserve:

- hidden mode label path
- expanded full thinking rendering path
- OSC 133 markers behavior for assistant messages without tool calls

- [ ] **Step 4: If `TUI_COPY.thinkingBlock.summaryTitle` becomes unused, remove or repurpose it**

Update `tui-copy.ts` only as needed. Avoid leaving stale thinking-title strings behind.

---

### Task 3: Remove collapsed-mode output leakage from single-tool summaries

**Files:**

- Modify: `packages/coding-agent/src/modes/interactive/components/assistant-tool-summary.ts`

- [ ] **Step 1: Keep the main line hierarchy**

Preserve:

- colored status dot
- bold title from `titleForTool(...)`
- `⎿` summary line from `summaryForTool(...)`

Do not convert ordinary titles to accent-colored labels.

- [ ] **Step 2: Delete collapsed-mode raw output preview for non-collapsible tools**

Remove the branch that currently:

- slices first 5 output lines
- renders dim preview text
- shows `... N more lines`

Collapsed mode should stop after the summary line.

- [ ] **Step 3: Preserve expanded-mode full output**

Expanded mode should still render the full output body.

- [ ] **Step 4: Preserve status/error behavior**

Keep:

- pending => `⎿ Running…`
- success/error state dot semantics
- summary generation semantics

---

### Task 4: Convert batch summaries to statistical phrasing

**Files:**

- Modify: `packages/coding-agent/src/modes/interactive/components/assistant-tool-batch-summary.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/tui-copy.ts`

- [ ] **Step 1: Replace per-tool count phrasing**

Change batch summary generation from tool-name count phrasing to total tool-use count phrasing:

- all completed => `Done (N tool uses)`
- otherwise => `Running (N tool uses)`

Do not add tokens or duration in this task unless they already exist in the component inputs. Avoid expanding scope into runtime aggregation.

- [ ] **Step 2: Keep latest hint line intact**

Preserve the current latest-hint logic and its subordinate `⎿` rendering.

- [ ] **Step 3: Keep expanded batch details working**

Expanded mode should still list each tool item with:

- title line
- result summary line
- raw output only in expanded mode

---

### Task 5: Reduce expanded tool execution visual weight

**Files:**

- Modify: `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- Modify: `packages/coding-agent/src/modes/interactive/theme/dark.json`
- Optional if needed for parity: `packages/coding-agent/src/modes/interactive/theme/light.json`

- [ ] **Step 1: Decide ordinary-tool background strategy**

Implement one of these, preferring the narrowest change that achieves the target:

Option A:

- ordinary tools in expanded mode render with no pending/success/error background fill
- keep text hierarchy only

Option B:

- keep backgrounds technically present
- reduce them to near-neutral, low-contrast surfaces so they no longer read as colored status cards

Recommendation: start with Option A for ordinary tools and keep special tool-provided visual treatments intact.

- [ ] **Step 2: Do not break renderer hooks**

Preserve:

- `renderCall`
- `renderResult`
- self-render shells
- image rendering
- diff rendering

The change should affect ordinary framing weight, not tool-specific custom layouts.

- [ ] **Step 3: Keep text readable after background reduction**

Verify that ordinary expanded tool output still reads correctly with:

- `toolTitle`
- `toolOutput`
- diff colors

If needed, tune theme tokens rather than re-introducing heavy color blocks.

- [ ] **Step 4: Adjust dark theme tokens conservatively**

If background tokens remain in use elsewhere, tune only what is necessary:

- `toolPendingBg`
- `toolSuccessBg`
- `toolErrorBg`
- optionally `toolOutput`

Do not change unrelated brand colors.

---

### Task 6: Re-run targeted tests and fix fallout

**Files:**

- Modify only what fails from previous tasks

- [ ] **Step 1: Run targeted component tests**

Run:

```powershell
npx tsx ../../node_modules/vitest/dist/cli.js --run test/assistant-message.test.ts test/assistant-tool-summary.test.ts test/assistant-tool-batch-summary.test.ts
```

Expected:

- all three pass

- [ ] **Step 2: Run broader transcript regression coverage**

Run:

```powershell
npx tsx ../../node_modules/vitest/dist/cli.js --run test/interactive-mode-status.test.ts
```

Expected:

- pass
- or fail only where transcript expectations need legitimate updates from this style change

- [ ] **Step 3: If `interactive-mode-status.test.ts` fails for valid output-shape changes, update only the affected assertions**

Do not use broad snapshot churn. Keep assertion changes narrow and style-driven.

---

### Task 7: Run final typecheck and verify no scope drift

**Files:**

- No intentional code changes unless verification exposes a real issue from this task

- [ ] **Step 1: Run package typecheck**

Run:

```powershell
npm run check
```

Expected:

- success
- if failures appear, they must be caused by this task and should be fixed before completion

- [ ] **Step 2: Review changed files for scope control**

Confirm the final change set is limited to:

- thinking transcript rendering
- tool collapsed summary rendering
- tool batch summary rendering
- expanded tool execution framing / theme tokens
- tests directly covering those paths

- [ ] **Step 3: Prepare delivery summary**

Record:

- what changed in thinking rendering
- what changed in tool collapsed rendering
- what changed in expanded execution styling
- which tests were run
- whether any theme token values were adjusted

---

## Acceptance checklist

- Thinking default display is a weak `∴`-prefixed preview, not a `∴ Thinking…` heading block
- Thinking remains subordinate in color/emphasis
- Single-tool collapsed summaries no longer leak raw output previews
- Batch summaries use `Done (N tool uses)` / `Running (N tool uses)` phrasing
- `⎿` subordinate lines remain dim and structurally attached
- Ordinary expanded tool execution no longer reads as a heavy colored status card
- `interactive-mode` settings semantics remain unchanged
- Targeted tests pass
- `npm run check` passes

## Suggested implementation order

1. tests
2. thinking structure
3. single-tool collapsed summary
4. batch summary
5. expanded tool execution weight
6. regression tests
7. typecheck

## Self-review

Spec coverage:

- thinking structure: covered by Tasks 1-2
- tool collapsed structure: covered by Task 3
- batch summary phrasing: covered by Task 4
- color/highlight hierarchy: covered by Tasks 2 and 5
- verification: covered by Tasks 6-7

Placeholder scan:

- no `TODO` / `TBD`
- no delegated “similar to above” steps
- no hidden validation steps

Type/scope consistency:

- plan keeps settings semantics unchanged
- plan keeps runtime flow file (`interactive-mode.ts`) out of scope unless tests prove otherwise
- plan treats `tool-execution.ts` as required for style parity

---

Plan complete and saved to `docs/superpowers/plans/2026-05-27-claude-tool-and-thinking-style-alignment.md`.
