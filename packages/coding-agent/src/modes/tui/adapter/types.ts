/**
 * Types for the Lumen-to-OpenTUI adapter layer.
 * Maps AgentSession concepts to a reactive store consumable by SolidJS components.
 */

export interface TuiMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
	completed: boolean;
}

export interface TuiToolCall {
	id: string;
	messageId: string;
	name: string;
	args: Record<string, unknown>;
	status: "pending" | "running" | "success" | "error";
	result?: string;
	startTime: number;
	endTime?: number;
}

export interface TuiSessionState {
	id: string;
	status: "idle" | "working" | "compacting" | "error";
	messages: TuiMessage[];
	toolCalls: TuiToolCall[];
	model: {
		provider: string;
		id: string;
		displayName: string;
	} | null;
	thinking: {
		content: string;
		visible: boolean;
	};
	tokenUsage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
	error: string | null;
}

export interface TuiAppState {
	session: TuiSessionState;
	cwd: string;
	version: string;
	autoCompact: boolean;
}
