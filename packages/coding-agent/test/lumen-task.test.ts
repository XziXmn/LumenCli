import { describe, expect, it } from "vitest";
import { formatTaskFooterStatus, formatTaskResultSummary, type SubagentProgress } from "../src/core/lumen-task.js";

function progress(partial: Partial<SubagentProgress>): SubagentProgress {
	return {
		index: 0,
		id: "task-1",
		agent: "worker",
		status: "running",
		description: "Implement feature",
		toolCount: 0,
		tokens: 0,
		durationMs: 0,
		startedAt: 0,
		...partial,
	};
}

describe("formatTaskFooterStatus", () => {
	it("shows running task progress with current tool", () => {
		const text = formatTaskFooterStatus([
			progress({ index: 0, id: "task-1", agent: "worker", currentTool: "read" }),
			progress({ index: 1, id: "task-2", agent: "reviewer" }),
		]);

		expect(text).toBe("task running 2 · worker: read");
	});

	it("shows completion summary when all tasks finished", () => {
		const text = formatTaskFooterStatus([
			progress({ status: "completed" }),
			progress({ id: "task-2", status: "completed" }),
		]);

		expect(text).toBe("task done 2/2");
	});

	it("shows failure count when some tasks failed", () => {
		const text = formatTaskFooterStatus([
			progress({ status: "completed" }),
			progress({ id: "task-2", status: "failed" }),
		]);

		expect(text).toBe("task done 1/2 · 1 failed");
	});
});

describe("formatTaskResultSummary", () => {
	it("renders a compact success summary", () => {
		const text = formatTaskResultSummary({
			results: [
				{ id: "a", agent: "worker", description: "A", output: "ok", exitCode: 0, tokens: 120, durationMs: 1000 },
				{ id: "b", agent: "reviewer", description: "B", output: "ok", exitCode: 0, tokens: 80, durationMs: 2000 },
			],
			totalDurationMs: 4200,
			progress: [
				progress({ id: "a", status: "completed", toolCount: 2 }),
				progress({ id: "b", status: "completed", toolCount: 3 }),
			],
		});

		expect(text).toBe("Done (5 tool uses · 200 tokens · 4.2s)");
	});

	it("renders a compact failure summary", () => {
		const text = formatTaskResultSummary({
			results: [
				{ id: "a", agent: "worker", description: "A", output: "ok", exitCode: 0, tokens: 50, durationMs: 1000 },
				{
					id: "b",
					agent: "reviewer",
					description: "B",
					output: "",
					exitCode: 1,
					tokens: 20,
					durationMs: 2000,
					error: "boom",
				},
			],
			totalDurationMs: 3100,
			progress: [
				progress({ id: "a", status: "completed", toolCount: 1 }),
				progress({ id: "b", status: "failed", toolCount: 2 }),
			],
		});

		expect(text).toBe("Failed (1/2 done · 3 tool uses · 70 tokens · 3.1s)");
	});
});
