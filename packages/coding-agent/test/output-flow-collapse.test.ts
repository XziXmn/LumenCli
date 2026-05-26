import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { collapseReadSearchGroups } from "../src/modes/interactive/output-flow/collapse.ts";
import { projectTranscript } from "../src/modes/interactive/output-flow/projector.ts";

describe("output-flow collapse", () => {
	it("collapses consecutive read and search assistant turns into one semantic group", () => {
		const entries = projectTranscript([
			fauxAssistantMessage([fauxToolCall("read", { path: "README.md" }, { id: "tool-read-1" })]) as any,
			{
				role: "toolResult",
				toolCallId: "tool-read-1",
				toolName: "read",
				content: [{ type: "text", text: "read done" }],
				timestamp: Date.now(),
			} as any,
			fauxAssistantMessage([fauxToolCall("grep", { pattern: "todo", path: "src" }, { id: "tool-grep-1" })]) as any,
			{
				role: "toolResult",
				toolCallId: "tool-grep-1",
				toolName: "grep",
				content: [{ type: "text", text: "grep done" }],
				timestamp: Date.now(),
			} as any,
		]);

		const collapsed = collapseReadSearchGroups(entries);

		expect(collapsed).toHaveLength(1);
		expect(collapsed[0]?.kind).toBe("collapsed_tool_group");
		if (collapsed[0]?.kind !== "collapsed_tool_group") {
			throw new Error("expected collapsed tool group");
		}
		expect(collapsed[0].readCount).toBe(1);
		expect(collapsed[0].searchCount).toBe(1);
		expect(collapsed[0].listCount).toBe(0);
		expect(collapsed[0].items).toHaveLength(2);
		expect(collapsed[0].items[0]?.toolResult?.message.toolCallId).toBe("tool-read-1");
		expect(collapsed[0].items[1]?.toolResult?.message.toolCallId).toBe("tool-grep-1");
	});

	it("does not collapse assistant turns that already contain visible assistant content", () => {
		const entries = projectTranscript([
			fauxAssistantMessage([
				{ type: "text", text: "Reading config first" } as any,
				fauxToolCall("read", { path: "README.md" }, { id: "tool-read-2" }),
			]) as any,
			{
				role: "toolResult",
				toolCallId: "tool-read-2",
				toolName: "read",
				content: [{ type: "text", text: "read done" }],
				timestamp: Date.now(),
			} as any,
			fauxAssistantMessage([fauxToolCall("grep", { pattern: "todo", path: "src" }, { id: "tool-grep-2" })]) as any,
		]);

		const collapsed = collapseReadSearchGroups(entries);

		expect(collapsed.map((entry) => entry.kind)).toEqual(["assistant_turn", "message", "assistant_turn"]);
	});
});
