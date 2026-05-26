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
		expect(rendered).toContain("读取(README.md)");
		expect(rendered).toContain("⎿ 已读取 2 行");
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
		expect(rendered).toContain("⎿ 命令已执行");
		expect(rendered).toContain("/tmp/work");
	});

	it("can start in pending mode and later transition to a completed summary", () => {
		const component = new AssistantToolSummaryComponent(
			"grep",
			{ pattern: "todo", path: "src" },
			undefined,
			process.cwd(),
		);

		const pending = render(component);
		expect(pending).toContain('搜索(模式: "todo", 路径: "src")');
		expect(pending).toContain("⎿ 运行中…");
		expect(pending).not.toContain("to expand");

		component.updateResult({
			role: "toolResult",
			toolCallId: "tool-grep-1",
			toolName: "grep",
			content: [{ type: "text", text: "src/a.ts:1:todo\nsrc/b.ts:2:todo\n" }],
			timestamp: Date.now(),
		} as any);

		const completed = render(component);
		expect(completed).toContain("⎿ 共找到 2 处匹配，涉及 2 个文件");
		expect(completed).not.toContain("to expand");
	});
});
