import { beforeAll, describe, expect, it } from "vitest";
import { AssistantToolSummaryComponent } from "../src/modes/interactive/components/assistant-tool-summary.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

function render(component: AssistantToolSummaryComponent, width = 100): string {
	return stripAnsi(component.render(width).join("\n"));
}

describe("AssistantToolSummaryComponent", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("renders a compact two-line transcript-style summary for read", () => {
		const component = new AssistantToolSummaryComponent(
			"read",
			{ path: "README.md" },
			{
				role: "toolResult",
				toolCallId: "tool-read-1",
				toolName: "read",
				content: [{ type: "text", text: "line one\nline two\n" }],
				timestamp: Date.now(),
			} as any,
			process.cwd(),
		);

		const rendered = render(component);
		expect(rendered).toContain("Read(README.md)");
		expect(rendered).toContain("⎿ Read 2 lines");
	});

	it("shows full output when expanded", () => {
		const component = new AssistantToolSummaryComponent(
			"bash",
			{ command: "pwd" },
			{
				role: "toolResult",
				toolCallId: "tool-bash-1",
				toolName: "bash",
				content: [{ type: "text", text: "/tmp/work\n" }],
				timestamp: Date.now(),
			} as any,
			process.cwd(),
		);
		component.setExpanded(true);

		const rendered = render(component);
		expect(rendered).toContain("Bash(pwd)");
		expect(rendered).toContain("⎿ Command completed");
		expect(rendered).toContain("  ⎿ ");
		expect(rendered).toContain("/tmp/work");
	});

	it("expanded edit summary keeps diff content inside the response layer", () => {
		const component = new AssistantToolSummaryComponent(
			"edit",
			{ path: "config.json", oldText: '{"a":1}', newText: '{"a":2}' },
			{
				role: "toolResult",
				toolCallId: "tool-edit-1",
				toolName: "edit",
				content: [{ type: "text", text: "Successfully replaced 1 block(s) in config.json." }],
				details: { diff: '  1 {"a":1}\n- 2 "version": "1.0.0"\n+ 2 "version": "1.1.0"', patch: "" },
				timestamp: Date.now(),
			} as any,
			process.cwd(),
		);
		component.setExpanded(true);

		const rendered = render(component);
		expect(rendered).toContain("Update(config.json)");
		expect(rendered).toContain("⎿ Updated file");
		expect(rendered).toContain("  ⎿ ");
		expect(rendered).toContain('+ 2 "version": "1.1.0"');
	});

	it("collapsed bash summary shows title and result but no raw output preview", () => {
		const component = new AssistantToolSummaryComponent(
			"bash",
			{ command: "pwd" },
			{
				role: "toolResult",
				toolCallId: "tool-bash-1",
				toolName: "bash",
				content: [{ type: "text", text: "/tmp/work\nsome other output\nmore lines\n" }],
				timestamp: Date.now(),
			} as any,
			process.cwd(),
		);

		const rendered = render(component);
		expect(rendered).toContain("Bash(pwd)");
		expect(rendered).toContain("⎿ Command completed");
		// Should NOT show raw output preview in collapsed mode
		expect(rendered).not.toContain("/tmp/work");
		expect(rendered).not.toContain("some other output");
	});

	it("collapsed read summary shows title and summary only", () => {
		const component = new AssistantToolSummaryComponent(
			"read",
			{ path: "README.md" },
			{
				role: "toolResult",
				toolCallId: "tool-read-1",
				toolName: "read",
				content: [{ type: "text", text: "line one\nline two\nline three\n" }],
				timestamp: Date.now(),
			} as any,
			process.cwd(),
		);

		const rendered = render(component);
		expect(rendered).toContain("Read(README.md)");
		expect(rendered).toContain("⎿ Read 3 lines");
	});

	it("can start in pending mode and later transition to a completed summary", () => {
		const component = new AssistantToolSummaryComponent(
			"grep",
			{ pattern: "todo", path: "src" },
			undefined,
			process.cwd(),
		);

		const pending = render(component);
		expect(pending).toContain('Search(pattern: "todo", path: "src")');
		expect(pending).toContain("⎿ Running…");
		expect(pending).not.toContain("to expand");

		component.updateResult({
			role: "toolResult",
			toolCallId: "tool-grep-1",
			toolName: "grep",
			content: [{ type: "text", text: "src/a.ts:1:todo\nsrc/b.ts:2:todo\n" }],
			timestamp: Date.now(),
		} as any);

		const completed = render(component);
		expect(completed).toContain("⎿ 2 matches in 2 files");
		expect(completed).not.toContain("to expand");
	});
});
