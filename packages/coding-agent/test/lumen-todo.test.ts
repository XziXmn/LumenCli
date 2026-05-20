import type { Text } from "@earendil-works/pi-tui";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import lumenTodoExtension from "../src/core/lumen-todo.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";
import { stripAnsi } from "../src/utils/ansi.js";
import { createTestExtensionsResult } from "./utilities.js";

describe("lumenTodoExtension", () => {
	const disposers: Array<() => void> = [];

	beforeAll(() => {
		initTheme("dark");
	});

	afterEach(() => {
		while (disposers.length > 0) {
			disposers.pop()?.();
		}
	});

	// Behavior 3: footer does not carry task/todo primary summary display.
	// The todo extension resets state on session_start but no longer writes
	// a setStatus footer line. The compact summary is rendered via renderResult only.
	it("renders a compact summary result without using footer setStatus", async () => {
		const extensionsResult = await createTestExtensionsResult([lumenTodoExtension]);
		const extension = extensionsResult.extensions[0];
		const todoTool = extension.tools.get("todo")?.definition;
		expect(todoTool).toBeDefined();

		const ctx = {
			ui: {},
		} as any;

		for (const handler of extension.handlers.get("session_start") ?? []) {
			await handler({ type: "session_start", reason: "startup" }, ctx);
		}

		const result = await todoTool!.execute(
			"tool-todo-1",
			{
				ops: [
					{
						op: "init",
						list: [{ phase: "分析完成", items: ["总结仓库结构和特点", "提供项目概览报告"] }],
					},
					{ op: "start", task: "总结仓库结构和特点" },
				],
			},
			undefined,
			undefined,
			ctx,
		);

		const rendered = todoTool!.renderResult!(
			result as any,
			{ expanded: false, isPartial: false },
			(await import("../src/modes/interactive/theme/theme.js")).theme,
			{} as any,
		) as Text;
		const text = stripAnsi(rendered.render(120).join("\n"));
		expect(text).toContain("Todo 0/2 completed · 2 remaining");
		expect(text).not.toContain("分析完成:");
		expect(text).not.toContain("[>]");
	});
});
