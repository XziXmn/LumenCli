import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
	RenderableAssistantTurn,
	RenderableCollapsedToolGroup,
	RenderableCollapsedToolGroupItem,
	RenderablePassthroughMessage,
	RenderableProjectedEntry,
	RenderableToolCallBlock,
	RenderableTranscriptEntry,
} from "./types.js";

const SEARCH_TOOL_NAMES = new Set(["grep", "find"]);
const LIST_TOOL_NAMES = new Set(["ls"]);
const READ_TOOL_NAMES = new Set(["read"]);

function isToolResultMessage(entry: RenderableTranscriptEntry | undefined): entry is RenderablePassthroughMessage & {
	message: Extract<Exclude<AgentMessage, AssistantMessage>, { role: "toolResult" }>;
} {
	return entry?.kind === "message" && entry.message.role === "toolResult";
}

function classifyToolCall(toolCall: RenderableToolCallBlock): "read" | "search" | "list" | undefined {
	if (READ_TOOL_NAMES.has(toolCall.name)) return "read";
	if (SEARCH_TOOL_NAMES.has(toolCall.name)) return "search";
	if (LIST_TOOL_NAMES.has(toolCall.name)) return "list";
	return undefined;
}

export function isCollapsibleToolName(toolName: string): boolean {
	return READ_TOOL_NAMES.has(toolName) || SEARCH_TOOL_NAMES.has(toolName) || LIST_TOOL_NAMES.has(toolName);
}

function isCollapsibleAssistantTurn(turn: RenderableAssistantTurn): boolean {
	return (
		turn.toolCalls.length === 1 &&
		!turn.hasRenderableAssistantContent &&
		classifyToolCall(turn.toolCalls[0]) !== undefined
	);
}

function buildCollapsedToolGroup(items: RenderableCollapsedToolGroupItem[]): RenderableCollapsedToolGroup {
	let readCount = 0;
	let searchCount = 0;
	let listCount = 0;

	for (const item of items) {
		const type = classifyToolCall(item.toolCall);
		if (type === "read") readCount++;
		if (type === "search") searchCount++;
		if (type === "list") listCount++;
	}

	return {
		kind: "collapsed_tool_group",
		groupType: "read_search",
		items,
		readCount,
		searchCount,
		listCount,
	};
}

export function collapseReadSearchGroups(entries: RenderableTranscriptEntry[]): RenderableProjectedEntry[] {
	const collapsed: RenderableProjectedEntry[] = [];

	for (let index = 0; index < entries.length; index++) {
		const current = entries[index];
		if (current?.kind !== "assistant_turn" || !isCollapsibleAssistantTurn(current)) {
			collapsed.push(current!);
			continue;
		}

		const items: RenderableCollapsedToolGroupItem[] = [];
		let cursor = index;

		while (cursor < entries.length) {
			const candidate = entries[cursor];
			if (candidate?.kind !== "assistant_turn" || !isCollapsibleAssistantTurn(candidate)) {
				break;
			}

			const next = entries[cursor + 1];
			const toolCall = candidate.toolCalls[0];
			const toolResult = isToolResultMessage(next) && next.message.toolCallId === toolCall.id ? next : undefined;

			items.push({
				assistantTurn: candidate,
				toolCall,
				toolResult,
			});

			cursor += toolResult ? 2 : 1;
		}

		if (items.length >= 2) {
			collapsed.push(buildCollapsedToolGroup(items));
			index = cursor - 1;
			continue;
		}

		collapsed.push(current);
	}

	return collapsed;
}
