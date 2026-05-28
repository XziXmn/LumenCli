import type { TUI } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it } from "vitest";
import { createAllToolDefinitions, type ToolName } from "../src/core/tools/index.ts";
import { ToolExecutionComponent } from "../src/modes/interactive/components/tool-execution.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

function createFakeTui(): TUI {
	return {
		requestRender: () => {},
	} as unknown as TUI;
}

function renderTool(toolName: ToolName, args: Record<string, unknown>, result = "ok"): string {
	const definitions = createAllToolDefinitions(process.cwd());
	const component = new ToolExecutionComponent(
		toolName,
		`tool-${toolName}`,
		args,
		{},
		definitions[toolName],
		createFakeTui(),
		process.cwd(),
	);
	component.markExecutionStarted();
	component.setArgsComplete();
	component.updateResult({ content: [{ type: "text", text: result }], details: undefined, isError: false }, false);
	return stripAnsi(component.render(100).join("\n"));
}

describe("Claude-style tool rendering", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("renders bash/read/write with Claude-style titles", () => {
		expect(renderTool("bash", { command: "npm run check" })).toContain("$ npm run check");
		expect(renderTool("read", { path: "src/index.ts" })).toContain("read src/index.ts");
		expect(renderTool("write", { path: "notes.txt", content: "hello" })).toContain("Write(notes.txt)");
	});

	it("renders edit/search/list tool titles with Claude-style labels", () => {
		expect(renderTool("edit", { path: "notes.txt", oldText: "", newText: "hello" })).toContain("Create(notes.txt)");
		expect(renderTool("edit", { path: "notes.txt", oldText: "old", newText: "new" })).toContain("Update(notes.txt)");
		expect(renderTool("grep", { pattern: "todo", path: "src" })).toContain('Search(pattern: "todo", path: "src")');
		expect(renderTool("find", { pattern: "src/**/*.ts", path: "." })).toContain(
			'Search(pattern: "src/**/*.ts", path: ".")',
		);
		expect(renderTool("ls", { path: "src" })).toContain("List(src)");
	});

	it("shows compact read result summaries instead of hiding collapsed output", () => {
		expect(renderTool("read", { path: "src/index.ts" }, "line one\nline two\n")).toContain("read src/index.ts");
	});
});
