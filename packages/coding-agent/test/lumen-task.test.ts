import type { Text } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import lumenTaskExtension, {
	formatTaskFooterStatus,
	formatTaskResultSummary,
	getSessionTaskUiItems,
	type SubagentProgress,
	type TaskToolDetails,
} from "../src/core/lumen-task.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";
import { stripAnsi } from "../src/utils/ansi.js";
import { createTestExtensionsResult } from "./utilities.js";

describe("lumen-task helpers", () => {
	initTheme("dark");

	it("formats task footer status for running and completed progress", () => {
		const running: SubagentProgress = {
			index: 0,
			id: "one",
			agent: "worker",
			status: "running",
			description: "Implement feature",
			activeForm: "Implementing feature",
			currentTool: "read",
			currentToolArgs: "src/app.ts",
			toolCount: 1,
			tokens: 42,
			durationMs: 1000,
			startedAt: Date.now(),
		};

		expect(formatTaskFooterStatus([running])).toBe("task running 1 · worker: read");

		const done: SubagentProgress = {
			...running,
			status: "completed",
			currentTool: undefined,
			currentToolArgs: undefined,
		};
		expect(formatTaskFooterStatus([done])).toBe("task done 1/1");
	});

	it("formats task result summary including failures", () => {
		expect(
			formatTaskResultSummary({
				results: [
					{
						id: "1",
						agent: "worker",
						description: "Implement feature",
						output: "ok",
						exitCode: 0,
						tokens: 120,
						durationMs: 1000,
					},
					{
						id: "2",
						agent: "worker",
						description: "Write tests",
						output: "",
						exitCode: 1,
						tokens: 30,
						durationMs: 500,
						error: "failed",
					},
				],
				totalDurationMs: 1500,
				progress: [],
			}),
		).toContain("Failed (1/2 done");
	});

	it("exposes activeForm on running task ui items", () => {
		const originalSet = (globalThis as any).__pi_test_setTaskProgress;
		const originalClear = (globalThis as any).__pi_test_clearTaskProgress;
		expect(typeof originalSet).toBe("function");
		expect(typeof originalClear).toBe("function");

		originalClear();
		originalSet({
			index: 0,
			id: "task-1",
			agent: "worker",
			status: "running",
			description: "Implement feature",
			activeForm: "Implementing feature",
			currentTool: "read",
			currentToolArgs: "src/app.ts",
			toolCount: 1,
			tokens: 42,
			durationMs: 1000,
			startedAt: Date.now(),
		} satisfies SubagentProgress);

		const items = getSessionTaskUiItems();
		expect(items).toHaveLength(1);
		expect(items?.[0]?.subject).toBe("Implement feature");
		expect(items?.[0]?.activeForm).toBe("Implementing feature");

		originalClear();
	});

	// -------------------------------------------------------------------
	// Behavior 4: sub-agent detail fields (agent, toolCount, tokens, duration)
	// -------------------------------------------------------------------

	it("getSessionTaskUiItems exposes toolCount, tokens, and durationMs when non-zero", () => {
		const originalSet = (globalThis as any).__pi_test_setTaskProgress;
		const originalClear = (globalThis as any).__pi_test_clearTaskProgress;

		originalClear();
		originalSet({
			index: 0,
			id: "task-field-check",
			agent: "explore",
			status: "completed",
			description: "Investigate bug",
			activeForm: "Investigating bug",
			currentTool: undefined,
			currentToolArgs: undefined,
			toolCount: 5,
			tokens: 3200,
			durationMs: 8500,
			startedAt: Date.now() - 8500,
		} satisfies SubagentProgress);

		const items = getSessionTaskUiItems();
		expect(items).toHaveLength(1);
		expect(items?.[0]?.group).toBe("explore");
		expect(items?.[0]?.toolCount).toBe(5);
		expect(items?.[0]?.tokens).toBe(3200);
		expect(items?.[0]?.durationMs).toBe(8500);
		expect(items?.[0]?.meta).toBeUndefined(); // no currentTool

		originalClear();
	});

	it("getSessionTaskUiItems omits toolCount and tokens when zero", () => {
		const originalSet = (globalThis as any).__pi_test_setTaskProgress;
		const originalClear = (globalThis as any).__pi_test_clearTaskProgress;

		originalClear();
		originalSet({
			index: 0,
			id: "task-zero-fields",
			agent: "worker",
			status: "pending",
			description: "Waiting task",
			toolCount: 0,
			tokens: 0,
			durationMs: 0,
			startedAt: Date.now(),
		} satisfies SubagentProgress);

		const items = getSessionTaskUiItems();
		expect(items).toHaveLength(1);
		expect(items?.[0]?.toolCount).toBeUndefined();
		expect(items?.[0]?.tokens).toBeUndefined();
		expect(items?.[0]?.durationMs).toBeUndefined();

		originalClear();
	});

	it("getSessionTaskUiItems populates meta from currentTool and currentToolArgs", () => {
		const originalSet = (globalThis as any).__pi_test_setTaskProgress;
		const originalClear = (globalThis as any).__pi_test_clearTaskProgress;

		originalClear();
		originalSet({
			index: 0,
			id: "task-meta",
			agent: "worker",
			status: "running",
			description: "Implement feature",
			currentTool: "read",
			currentToolArgs: "src/app.ts",
			toolCount: 1,
			tokens: 42,
			durationMs: 1000,
			startedAt: Date.now() - 1000,
		} satisfies SubagentProgress);

		const items = getSessionTaskUiItems();
		expect(items).toHaveLength(1);
		expect(items?.[0]?.meta).toBe("read src/app.ts");

		originalClear();
	});

	// -------------------------------------------------------------------
	// Behavior 3: footer summary format (lightweight, not primary display)
	// -------------------------------------------------------------------

	it("formatTaskFooterStatus returns pending status for pending tasks", () => {
		const pending: SubagentProgress = {
			index: 0,
			id: "pending-1",
			agent: "worker",
			status: "pending",
			description: "Queued work",
			toolCount: 0,
			tokens: 0,
			durationMs: 0,
			startedAt: Date.now(),
		};

		const status = formatTaskFooterStatus([pending]);
		// Pending-only items return task done 0/1 (0 completed, not running)
		expect(status).toBe("task done 0/1");
	});

	it("formatTaskFooterStatus includes failure count when tasks fail", () => {
		const progress: SubagentProgress[] = [
			{
				index: 0,
				id: "ok-1",
				agent: "worker",
				status: "completed",
				description: "Done task",
				toolCount: 2,
				tokens: 100,
				durationMs: 2000,
				startedAt: Date.now() - 2000,
			},
			{
				index: 1,
				id: "fail-1",
				agent: "worker",
				status: "failed",
				description: "Broken task",
				toolCount: 1,
				tokens: 50,
				durationMs: 1000,
				startedAt: Date.now() - 1000,
			},
		];

		const status = formatTaskFooterStatus(progress);
		expect(status).toBe("task done 1/2 · 1 failed");
	});

	it("formatTaskResultSummary formats a successful multi-task result", () => {
		const summary = formatTaskResultSummary({
			results: [
				{
					id: "a",
					agent: "worker",
					description: "Task A",
					output: "ok",
					exitCode: 0,
					tokens: 200,
					durationMs: 3000,
				},
				{
					id: "b",
					agent: "worker",
					description: "Task B",
					output: "ok",
					exitCode: 0,
					tokens: 150,
					durationMs: 2000,
				},
			],
			totalDurationMs: 5000,
			progress: [
				{
					index: 0,
					id: "a",
					agent: "worker",
					status: "completed",
					description: "Task A",
					toolCount: 3,
					tokens: 200,
					durationMs: 3000,
					startedAt: 0,
				},
				{
					index: 1,
					id: "b",
					agent: "worker",
					status: "completed",
					description: "Task B",
					toolCount: 2,
					tokens: 150,
					durationMs: 2000,
					startedAt: 0,
				},
			],
		});

		expect(summary).toContain("Done (");
		expect(summary).toContain("5 tool uses");
		expect(summary).toContain("350 tokens");
		expect(summary).toContain("5.0s");
	});

	it("renderResult hides live task progress details during partial results", async () => {
		const extensionsResult = await createTestExtensionsResult([lumenTaskExtension]);
		const extension = extensionsResult.extensions[0];
		const taskTool = extension.tools.get("task")?.definition;
		expect(taskTool).toBeDefined();

		const rendered = taskTool!.renderResult!(
			{
				content: [{ type: "text", text: "Running..." }],
				details: {
					results: [],
					totalDurationMs: 1000,
					progress: [
						{
							index: 0,
							id: "task-1",
							agent: "worker",
							status: "running",
							description: "Implement feature",
							currentTool: "read",
							currentToolArgs: "src/app.ts",
							toolCount: 1,
							tokens: 42,
							durationMs: 1000,
							startedAt: Date.now() - 1000,
						},
					],
				} satisfies TaskToolDetails,
			} as any,
			{ expanded: false, isPartial: true },
			(await import("../src/modes/interactive/theme/theme.js")).theme,
			{ state: { progressMap: new Map() }, invalidate: () => {} } as any,
		) as { render: () => string[] } | Text;

		const lines =
			typeof (rendered as { render?: unknown }).render === "function"
				? (rendered as { render: () => string[] }).render()
				: (rendered as Text).render(120);
		expect(stripAnsi(lines.join("\n")).trim()).toBe("");
	});
});
