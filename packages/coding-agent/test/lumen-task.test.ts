import { describe, expect, it } from "vitest";
import {
	formatTaskFooterStatus,
	formatTaskResultSummary,
	getSessionTaskUiItems,
	type SubagentProgress,
} from "../src/core/lumen-task.js";

describe("lumen-task helpers", () => {
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
});
