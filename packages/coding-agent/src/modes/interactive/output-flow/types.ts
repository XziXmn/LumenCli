import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";

export interface RenderableTextBlock {
	kind: "text";
	index: number;
	text: string;
}

export interface RenderableThinkingBlock {
	kind: "thinking";
	index: number;
	thinking: string;
}

export interface RenderableToolCallBlock {
	kind: "tool_call";
	index: number;
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export type RenderableAssistantBlock = RenderableTextBlock | RenderableThinkingBlock | RenderableToolCallBlock;

export interface RenderableAssistantTurn {
	kind: "assistant_turn";
	message: AssistantMessage;
	blocks: RenderableAssistantBlock[];
	textBlocks: RenderableTextBlock[];
	thinkingBlocks: RenderableThinkingBlock[];
	toolCalls: RenderableToolCallBlock[];
	hasVisibleText: boolean;
	hasVisibleThinking: boolean;
	hasRenderableAssistantContent: boolean;
}

export interface RenderablePassthroughMessage {
	kind: "message";
	message: Exclude<AgentMessage, AssistantMessage>;
}

export interface RenderableCollapsedToolGroupItem {
	assistantTurn: RenderableAssistantTurn;
	toolCall: RenderableToolCallBlock;
	toolResult?: RenderablePassthroughMessage & {
		message: Extract<Exclude<AgentMessage, AssistantMessage>, { role: "toolResult" }>;
	};
}

export interface RenderableCollapsedToolGroup {
	kind: "collapsed_tool_group";
	groupType: "read_search";
	items: RenderableCollapsedToolGroupItem[];
	readCount: number;
	searchCount: number;
	listCount: number;
}

export type RenderableTranscriptEntry = RenderableAssistantTurn | RenderablePassthroughMessage;

export type RenderableProjectedEntry = RenderableTranscriptEntry | RenderableCollapsedToolGroup;
