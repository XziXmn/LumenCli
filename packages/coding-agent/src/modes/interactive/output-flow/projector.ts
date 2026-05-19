import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
	RenderableAssistantBlock,
	RenderableAssistantTurn,
	RenderableProjectedEntry,
	RenderableTextBlock,
	RenderableThinkingBlock,
	RenderableToolCallBlock,
	RenderableTranscriptEntry,
} from "./types.js";

function isRenderableText(value: unknown): value is { type: "text"; text: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { type?: unknown }).type === "text" &&
		typeof (value as { text?: unknown }).text === "string"
	);
}

function isRenderableThinking(value: unknown): value is { type: "thinking"; thinking: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { type?: unknown }).type === "thinking" &&
		typeof (value as { thinking?: unknown }).thinking === "string"
	);
}

function isRenderableToolCall(
	value: unknown,
): value is { type: "toolCall"; id: string; name: string; arguments?: Record<string, unknown> } {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { type?: unknown }).type === "toolCall" &&
		typeof (value as { id?: unknown }).id === "string" &&
		typeof (value as { name?: unknown }).name === "string"
	);
}

export function projectAssistantTurn(message: AssistantMessage): RenderableAssistantTurn {
	const blocks: RenderableAssistantBlock[] = [];
	const textBlocks: RenderableTextBlock[] = [];
	const thinkingBlocks: RenderableThinkingBlock[] = [];
	const toolCalls: RenderableToolCallBlock[] = [];

	for (let index = 0; index < message.content.length; index++) {
		const content = message.content[index];
		if (isRenderableText(content)) {
			if (!content.text.trim()) continue;
			const block: RenderableTextBlock = { kind: "text", index, text: content.text };
			blocks.push(block);
			textBlocks.push(block);
			continue;
		}

		if (isRenderableThinking(content)) {
			if (!content.thinking.trim()) continue;
			const block: RenderableThinkingBlock = { kind: "thinking", index, thinking: content.thinking };
			blocks.push(block);
			thinkingBlocks.push(block);
			continue;
		}

		if (isRenderableToolCall(content)) {
			const block: RenderableToolCallBlock = {
				kind: "tool_call",
				index,
				id: content.id,
				name: content.name,
				arguments: content.arguments ?? {},
			};
			blocks.push(block);
			toolCalls.push(block);
		}
	}

	return {
		kind: "assistant_turn",
		message,
		blocks,
		textBlocks,
		thinkingBlocks,
		toolCalls,
		hasVisibleText: textBlocks.length > 0,
		hasVisibleThinking: thinkingBlocks.length > 0,
		hasRenderableAssistantContent: textBlocks.length > 0 || thinkingBlocks.length > 0,
	};
}

export function projectTranscript(messages: AgentMessage[]): RenderableTranscriptEntry[] {
	return messages.map((message) =>
		message.role === "assistant"
			? projectAssistantTurn(message as AssistantMessage)
			: { kind: "message", message: message as Exclude<AgentMessage, AssistantMessage> },
	);
}

export function canUseSingleToolSummary(
	entry: RenderableAssistantTurn,
	nextEntry: RenderableProjectedEntry | undefined,
): nextEntry is Extract<RenderableProjectedEntry, { kind: "message" }> & {
	message: Extract<AgentMessage, { role: "toolResult" }>;
} {
	return (
		entry.toolCalls.length === 1 &&
		nextEntry?.kind === "message" &&
		nextEntry.message.role === "toolResult" &&
		nextEntry.message.toolCallId === entry.toolCalls[0]?.id
	);
}

export function collectSequentialToolResults(
	entry: RenderableAssistantTurn,
	entries: RenderableProjectedEntry[],
	startIndex: number,
):
	| Array<
			Extract<RenderableProjectedEntry, { kind: "message" }> & {
				message: Extract<AgentMessage, { role: "toolResult" }>;
			}
	  >
	| undefined {
	if (entry.toolCalls.length < 2) {
		return undefined;
	}

	const results: Array<
		Extract<RenderableProjectedEntry, { kind: "message" }> & {
			message: Extract<AgentMessage, { role: "toolResult" }>;
		}
	> = [];

	for (let offset = 0; offset < entry.toolCalls.length; offset++) {
		const candidate = entries[startIndex + offset];
		const toolCall = entry.toolCalls[offset];
		if (
			candidate?.kind !== "message" ||
			candidate.message.role !== "toolResult" ||
			candidate.message.toolCallId !== toolCall?.id
		) {
			return undefined;
		}
		results.push(
			candidate as Extract<RenderableProjectedEntry, { kind: "message" }> & {
				message: Extract<AgentMessage, { role: "toolResult" }>;
			},
		);
	}

	return results;
}
