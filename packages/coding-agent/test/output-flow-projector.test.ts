import { fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
	canUseSingleToolSummary,
	collectSequentialToolResults,
	projectAssistantTurn,
	projectTranscript,
} from "../src/modes/interactive/output-flow/projector.js";

describe("output-flow projector", () => {
	it("projects assistant content into ordered semantic blocks", () => {
		const message = fauxAssistantMessage([
			fauxThinking("plan the work"),
			fauxText("done"),
			fauxToolCall("read", { path: "README.md" }, { id: "tool-read-1" }),
		]);

		const projected = projectAssistantTurn(message);

		expect(projected.blocks.map((block) => block.kind)).toEqual(["thinking", "text", "tool_call"]);
		expect(projected.hasVisibleThinking).toBe(true);
		expect(projected.hasVisibleText).toBe(true);
		expect(projected.hasRenderableAssistantContent).toBe(true);
		expect(projected.toolCalls).toHaveLength(1);
		expect(projected.toolCalls[0]).toMatchObject({
			id: "tool-read-1",
			name: "read",
			arguments: { path: "README.md" },
		});
	});

	it("drops empty text and thinking blocks but keeps tool calls", () => {
		const message = fauxAssistantMessage([
			fauxText("   "),
			fauxThinking(""),
			fauxToolCall("bash", { command: "pwd" }, { id: "tool-bash-1" }),
		]);

		const projected = projectAssistantTurn(message);

		expect(projected.blocks.map((block) => block.kind)).toEqual(["tool_call"]);
		expect(projected.hasVisibleThinking).toBe(false);
		expect(projected.hasVisibleText).toBe(false);
		expect(projected.hasRenderableAssistantContent).toBe(false);
	});

	it("projects mixed transcript messages while preserving assistant turns", () => {
		const assistant = fauxAssistantMessage([
			fauxText("summary"),
			fauxToolCall("read", { path: "README.md" }, { id: "tool-read-2" }),
		]);
		const transcript = projectTranscript([
			{ role: "user", content: "hello", timestamp: Date.now() } as any,
			assistant as any,
			{
				role: "toolResult",
				toolCallId: "tool-read-2",
				toolName: "read",
				content: [{ type: "text", text: "done" }],
				details: undefined,
				timestamp: Date.now(),
			} as any,
		]);

		expect(transcript).toHaveLength(3);
		expect(transcript[0]?.kind).toBe("message");
		expect(transcript[1]?.kind).toBe("assistant_turn");
		expect(transcript[2]?.kind).toBe("message");
		if (transcript[1]?.kind !== "assistant_turn") {
			throw new Error("expected assistant turn");
		}
		expect(transcript[1].toolCalls).toHaveLength(1);
		expect(transcript[1].textBlocks).toHaveLength(1);
	});

	it("detects single-tool turns that can render as transcript summaries", () => {
		const assistant = projectAssistantTurn(
			fauxAssistantMessage([
				fauxText("I checked the file."),
				fauxToolCall("read", { path: "README.md" }, { id: "tool-read-3" }),
			]),
		);
		const toolResult = {
			kind: "message" as const,
			message: {
				role: "toolResult",
				toolCallId: "tool-read-3",
				toolName: "read",
				content: [{ type: "text", text: "done" }],
				timestamp: Date.now(),
			} as any,
		};

		expect(canUseSingleToolSummary(assistant, toolResult)).toBe(true);
		expect(canUseSingleToolSummary(assistant, undefined)).toBe(false);
	});

	it("collects a contiguous batch of tool results for multi-tool turns", () => {
		const assistant = projectAssistantTurn(
			fauxAssistantMessage([
				fauxToolCall("read", { path: "README.md" }, { id: "tool-read-4" }),
				fauxToolCall("bash", { command: "pwd" }, { id: "tool-bash-4" }),
			]),
		);
		const entries = [
			assistant,
			{
				kind: "message" as const,
				message: {
					role: "toolResult",
					toolCallId: "tool-read-4",
					toolName: "read",
					content: [{ type: "text", text: "done" }],
					timestamp: Date.now(),
				} as any,
			},
			{
				kind: "message" as const,
				message: {
					role: "toolResult",
					toolCallId: "tool-bash-4",
					toolName: "bash",
					content: [{ type: "text", text: "done" }],
					timestamp: Date.now(),
				} as any,
			},
		];

		const batch = collectSequentialToolResults(assistant, entries as any, 1);
		expect(batch).toHaveLength(2);
		expect(batch?.[0]?.message.toolCallId).toBe("tool-read-4");
		expect(batch?.[1]?.message.toolCallId).toBe("tool-bash-4");
	});
});
