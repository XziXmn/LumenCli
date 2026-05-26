import { beforeAll, describe, expect, it } from "vitest";
import { CollapsedToolGroupComponent } from "../src/modes/interactive/components/collapsed-tool-group.js";
import type { RenderableCollapsedToolGroup } from "../src/modes/interactive/output-flow/types.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";
import { stripAnsi } from "../src/utils/ansi.js";

function renderGroup(component: CollapsedToolGroupComponent, width = 100): string {
	return stripAnsi(component.render(width).join("\n"));
}

describe("CollapsedToolGroupComponent", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("renders a compact summary with the latest hint when collapsed", () => {
		const group: RenderableCollapsedToolGroup = {
			kind: "collapsed_tool_group",
			groupType: "read_search",
			readCount: 1,
			searchCount: 1,
			listCount: 0,
			items: [
				{
					assistantTurn: {} as any,
					toolCall: {
						kind: "tool_call",
						index: 0,
						id: "tool-read-1",
						name: "read",
						arguments: { path: "README.md" },
					},
					toolResult: {
						kind: "message",
						message: {
							role: "toolResult",
							toolCallId: "tool-read-1",
							toolName: "read",
							content: [{ type: "text", text: "read done" }],
							timestamp: Date.now(),
						} as any,
					},
				},
				{
					assistantTurn: {} as any,
					toolCall: {
						kind: "tool_call",
						index: 0,
						id: "tool-grep-1",
						name: "grep",
						arguments: { pattern: "todo", path: "src" },
					},
					toolResult: {
						kind: "message",
						message: {
							role: "toolResult",
							toolCallId: "tool-grep-1",
							toolName: "grep",
							content: [{ type: "text", text: "grep done" }],
							timestamp: Date.now(),
						} as any,
					},
				},
			],
		};

		const component = new CollapsedToolGroupComponent(process.cwd(), group);
		const rendered = renderGroup(component);

		expect(rendered).toContain("已读取 1 个文件, 已搜索 1 个模式");
		expect(rendered).toContain("src");
	});

	it("renders individual tool lines when expanded", () => {
		const group: RenderableCollapsedToolGroup = {
			kind: "collapsed_tool_group",
			groupType: "read_search",
			readCount: 1,
			searchCount: 0,
			listCount: 1,
			items: [
				{
					assistantTurn: {} as any,
					toolCall: {
						kind: "tool_call",
						index: 0,
						id: "tool-read-2",
						name: "read",
						arguments: { path: "README.md" },
					},
					toolResult: {
						kind: "message",
						message: {
							role: "toolResult",
							toolCallId: "tool-read-2",
							toolName: "read",
							content: [{ type: "text", text: "read done" }],
							timestamp: Date.now(),
						} as any,
					},
				},
				{
					assistantTurn: {} as any,
					toolCall: {
						kind: "tool_call",
						index: 0,
						id: "tool-ls-1",
						name: "ls",
						arguments: { path: "src" },
					},
					toolResult: {
						kind: "message",
						message: {
							role: "toolResult",
							toolCallId: "tool-ls-1",
							toolName: "ls",
							content: [{ type: "text", text: "ls done" }],
							timestamp: Date.now(),
						} as any,
					},
				},
			],
		};

		const component = new CollapsedToolGroupComponent(process.cwd(), group);
		component.setExpanded(true);
		const rendered = renderGroup(component);

		expect(rendered).toContain("⎿ ✓ 读取");
		expect(rendered).toContain("README.md");
		expect(rendered).toContain("⎿ ✓ 列目录");
		expect(rendered).toContain("src");
	});
});
