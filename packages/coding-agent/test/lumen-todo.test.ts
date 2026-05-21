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
	it("keeps todo summaries visible when they contain semantic current-task information", async () => {
		const extensionsResult = await createTestExtensionsResult([lumenTodoExtension]);
		const extension = extensionsResult.extensions[0];
		const todoTool = extension.tools.get("todo")?.definition;
		expect(todoTool).toBeDefined();
		expect(todoTool?.renderShell).toBe("self");

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
		expect(text).toContain("Current 总结仓库结构和特点");
	});

	it("hides multi-op todo call rows so transcript does not repeat status-bar progress semantics", async () => {
		const extensionsResult = await createTestExtensionsResult([lumenTodoExtension]);
		const extension = extensionsResult.extensions[0];
		const todoTool = extension.tools.get("todo")?.definition;
		expect(todoTool).toBeDefined();

		const rendered = todoTool!.renderCall!(
			{
				ops: [
					{ op: "done", task: "升级存在漏洞的依赖" },
					{ op: "note", task: "升级存在漏洞的依赖" },
					{ op: "done", task: "添加接口限流防护" },
					{ op: "note", task: "添加接口限流防护" },
					{ op: "start", task: "加固SQL注入防护" },
				],
			},
			(await import("../src/modes/interactive/theme/theme.js")).theme,
			{
				args: {},
				toolCallId: "tool-todo-2",
				invalidate: () => {},
				lastComponent: undefined,
				state: {},
				cwd: process.cwd(),
				executionStarted: true,
				argsComplete: true,
				isPartial: false,
				expanded: false,
				showImages: true,
				isError: false,
			} as any,
		) as Text;

		const text = stripAnsi(rendered.render(120).join("\n"));
		expect(text.trim()).toBe("");
	});

	it("hides single-op todo init call rows because plan state is owned by the status surface", async () => {
		const extensionsResult = await createTestExtensionsResult([lumenTodoExtension]);
		const extension = extensionsResult.extensions[0];
		const todoTool = extension.tools.get("todo")?.definition;
		expect(todoTool).toBeDefined();

		const rendered = todoTool!.renderCall!(
			{
				ops: [
					{
						op: "init",
						phase: "安全加固阶段",
					},
				],
			},
			(await import("../src/modes/interactive/theme/theme.js")).theme,
			{
				args: {},
				toolCallId: "tool-todo-3",
				invalidate: () => {},
				lastComponent: undefined,
				state: {},
				cwd: process.cwd(),
				executionStarted: true,
				argsComplete: true,
				isPartial: false,
				expanded: false,
				showImages: true,
				isError: false,
			} as any,
		) as Text;

		const text = stripAnsi(rendered.render(120).join("\n"));
		expect(text.trim()).toBe("");
	});

	it("keeps non-progress todo success summaries visible", async () => {
		const extensionsResult = await createTestExtensionsResult([lumenTodoExtension]);
		const extension = extensionsResult.extensions[0];
		const todoTool = extension.tools.get("todo")?.definition;
		expect(todoTool).toBeDefined();

		const rendered = todoTool!.renderResult!(
			{
				content: [{ type: "text", text: "Todo list cleared." }],
				details: { phases: [], errors: [] },
			} as any,
			{ expanded: false, isPartial: false },
			(await import("../src/modes/interactive/theme/theme.js")).theme,
			{} as any,
		) as Text;
		const text = stripAnsi(rendered.render(120).join("\n"));
		expect(text).toContain("Todo list cleared.");
	});
});
