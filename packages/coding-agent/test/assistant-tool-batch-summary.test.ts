import { beforeAll, describe, expect, it } from "vitest";
import { AssistantToolBatchSummaryComponent } from "../src/modes/interactive/components/assistant-tool-batch-summary.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

function render(component: AssistantToolBatchSummaryComponent, width = 100): string {
	return stripAnsi(component.render(width).join("\n"));
}

describe("AssistantToolBatchSummaryComponent", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("renders a compact batch summary with latest hint", () => {
		const component = new AssistantToolBatchSummaryComponent(
			[
				{
					toolName: "read",
					args: { path: "README.md" },
					result: {
						role: "toolResult",
						toolCallId: "tool-read-1",
						toolName: "read",
						content: [{ type: "text", text: "line one\nline two\n" }],
						timestamp: Date.now(),
					} as any,
				},
				{
					toolName: "bash",
					args: { command: "pwd" },
					result: {
						role: "toolResult",
						toolCallId: "tool-bash-1",
						toolName: "bash",
						content: [{ type: "text", text: "/tmp/work\n" }],
						timestamp: Date.now(),
					} as any,
				},
			],
			process.cwd(),
		);

		const rendered = render(component);
		expect(rendered).toContain("Done (2 tool uses)");
		expect(rendered).toContain("⎿ pwd");
	});

	it("completed batch summary uses statistical phrasing", () => {
		const component = new AssistantToolBatchSummaryComponent(
			[
				{
					toolName: "read",
					args: { path: "a.ts" },
					result: {
						role: "toolResult",
						toolCallId: "t1",
						toolName: "read",
						content: [{ type: "text", text: "x" }],
						timestamp: Date.now(),
					} as any,
				},
				{
					toolName: "read",
					args: { path: "b.ts" },
					result: {
						role: "toolResult",
						toolCallId: "t2",
						toolName: "read",
						content: [{ type: "text", text: "y" }],
						timestamp: Date.now(),
					} as any,
				},
				{
					toolName: "grep",
					args: { pattern: "todo", path: "src" },
					result: {
						role: "toolResult",
						toolCallId: "t3",
						toolName: "grep",
						content: [{ type: "text", text: "match" }],
						timestamp: Date.now(),
					} as any,
				},
			],
			process.cwd(),
		);

		const rendered = render(component);
		expect(rendered).toContain("Done (3 tool uses)");
		expect(rendered).not.toContain("read");
		expect(rendered).not.toContain("grep");
	});

	it("renders per-tool summary lines when expanded", () => {
		const component = new AssistantToolBatchSummaryComponent(
			[
				{
					toolName: "find",
					args: { pattern: "src/**/*.ts", path: "." },
					result: {
						role: "toolResult",
						toolCallId: "tool-find-1",
						toolName: "find",
						content: [{ type: "text", text: "src/a.ts\nsrc/b.ts\n" }],
						timestamp: Date.now(),
					} as any,
				},
				{
					toolName: "ls",
					args: { path: "src" },
					result: {
						role: "toolResult",
						toolCallId: "tool-ls-1",
						toolName: "ls",
						content: [{ type: "text", text: "a.ts\nb.ts\n" }],
						timestamp: Date.now(),
					} as any,
				},
			],
			process.cwd(),
		);
		component.setExpanded(true);

		const rendered = render(component);
		// Expanded items show bold title + renderer output (raw listing, not summary)
		expect(rendered).not.toContain('⎿ "."');
		expect(rendered).toContain('Search(pattern: "src/**/*.ts", path: ".")');
		expect(rendered).toContain("  ⎿ ");
		expect(rendered).toContain("src/a.ts");
		expect(rendered).toContain("List(src)");
		expect(rendered).toContain("a.ts");
	});

	it("supports streaming pending tools before results arrive", () => {
		const component = new AssistantToolBatchSummaryComponent([], process.cwd());
		component.addOrUpdateToolCall("read", { path: "README.md" }, "tool-read-1");
		component.addOrUpdateToolCall("bash", { command: "pwd" }, "tool-bash-1");

		const pending = render(component);
		expect(pending).toContain("Running (2 tool uses)");

		component.updateResult(
			"tool-read-1",
			{
				role: "toolResult",
				toolCallId: "tool-read-1",
				toolName: "read",
				content: [{ type: "text", text: "line one\nline two\n" }],
				timestamp: Date.now(),
			} as any,
			"read",
		);
		component.updateResult(
			"tool-bash-1",
			{
				role: "toolResult",
				toolCallId: "tool-bash-1",
				toolName: "bash",
				content: [{ type: "text", text: "/tmp/work\n" }],
				timestamp: Date.now(),
			} as any,
			"bash",
		);

		const completed = render(component);
		expect(completed).toContain("Done (2 tool uses)");
	});
});
