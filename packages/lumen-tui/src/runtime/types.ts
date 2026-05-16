import type { JSX } from "solid-js";

export type TuiSessionStatus = "idle" | "working" | "compacting" | "retrying" | "error";

export interface TuiModelInfo {
	provider: string;
	id: string;
	displayName: string;
}

export interface TuiModelOption extends TuiModelInfo {
	key: string;
	available: boolean;
	contextWindow?: number;
	reasoning?: boolean;
}

export interface TuiAgentInfo {
	id: string;
	displayName: string;
	color?: string;
}

export interface TuiAgentOption extends TuiAgentInfo {
	description?: string;
	enabled: boolean;
}

export interface TuiToolOption {
	id: string;
	displayName: string;
	description?: string;
	enabled: boolean;
}

export interface TuiToolActivity {
	id: string;
	name: string;
	title: string;
	status: TuiToolPart["status"];
	summary: string;
	startTime: number;
	endTime?: number;
}

export interface TuiBackgroundTask {
	id: string;
	name: string;
	title: string;
	description: string;
	status: TuiToolPart["status"];
	startTime: number;
	endTime?: number;
	tokenCount?: number;
	queuedCount: number;
}

export interface TuiQueuedItem {
	id: string;
	kind: "prompt" | "command";
	text: string;
	createdAt: number;
}

export interface TuiPermissionNotice {
	id: string;
	title: string;
	detail?: string;
	createdAt: number;
	actions: TuiPermissionActionStatus[];
}

export interface TuiPermissionActionStatus {
	id: string;
	label: string;
	status: "ready" | "disabled" | "unimplemented";
	detail?: string;
}

export interface TuiCapabilityStatus {
	id: string;
	label: string;
	status: "ready" | "partial" | "disabled" | "unimplemented";
	detail?: string;
}

export interface TuiSessionOption {
	id: string;
	path: string;
	title: string;
	cwd: string;
	description: string;
	modified: number;
	current: boolean;
}

export interface TuiTreeItem {
	id: string;
	title: string;
	description?: string;
	right?: string;
	enabled: boolean;
	depth: number;
	entryType: string;
	current: boolean;
	leaf: boolean;
}

export interface TuiTokenUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

export type TuiPart = TuiTextPart | TuiThinkingPart | TuiToolPart | TuiStatusPart | TuiErrorPart;

export interface TuiTextPart {
	id: string;
	type: "text";
	text: string;
}

export interface TuiThinkingPart {
	id: string;
	type: "thinking";
	text: string;
	visible: boolean;
}

export interface TuiToolPart {
	id: string;
	type: "tool";
	callId: string;
	name: string;
	title?: string;
	args: Record<string, unknown>;
	status: "pending" | "running" | "success" | "error" | "aborted";
	result?: string;
	error?: string;
	details?: unknown;
	startTime: number;
	endTime?: number;
	display: "inline" | "block";
}

export interface TuiStatusPart {
	id: string;
	type: "status";
	text: string;
	variant: "info" | "success" | "warning";
}

export interface TuiErrorPart {
	id: string;
	type: "error";
	text: string;
}

export interface TuiMessage {
	id: string;
	entryId?: string;
	role: "user" | "assistant" | "system";
	parts: TuiPart[];
	timestamp: number;
	completed: boolean;
}

export interface TuiCommand {
	id: string;
	title: string;
	category: "Session" | "Agent" | "System" | "Prompt";
	shortcut?: string;
	enabled: boolean;
	description?: string;
}

export interface TuiToast {
	id: string;
	title?: string;
	message: string;
	variant: "info" | "success" | "warning" | "error";
	createdAt: number;
	durationMs: number;
}

export type TuiInteractionRequest =
	| {
			id: string;
			kind: "select";
			title: string;
			message?: string;
			options: string[];
			createdAt: number;
	  }
	| {
			id: string;
			kind: "input";
			title: string;
			placeholder?: string;
			createdAt: number;
	  }
	| {
			id: string;
			kind: "confirm";
			title: string;
			message: string;
			confirmLabel: string;
			cancelLabel: string;
			createdAt: number;
	  };

export interface TuiDialogAction {
	id: string;
	label: string;
	description?: string;
	enabled: boolean;
	run: () => void | Promise<void>;
}

export interface TuiState {
	session: {
		id: string;
		title?: string;
		status: TuiSessionStatus;
		messages: TuiMessage[];
		model: TuiModelInfo | null;
		agent: TuiAgentInfo | null;
		tokenUsage: TuiTokenUsage;
		error: string | null;
	};
	ui: {
		cwd: string;
		version: string;
		autoCompact: boolean;
		theme: "dark" | "light";
		sidebar: "auto" | "show" | "hide";
		thinkingVisible: boolean;
		showTimestamps: boolean;
		showToolDetails: boolean;
		showScrollbar: boolean;
		navigation: {
			canUndo: boolean;
			canRedo: boolean;
		};
		focusMessageId?: string;
		prefillPrompt?: { id: string; text: string };
		editorRequest?: { id: string };
		commands: TuiCommand[];
		sessions: TuiSessionOption[];
		treeItems: TuiTreeItem[];
		models: TuiModelOption[];
		agents: TuiAgentOption[];
		tools: TuiToolOption[];
		activities: TuiToolActivity[];
		backgroundTasks: TuiBackgroundTask[];
		queued: TuiQueuedItem[];
		permission: TuiPermissionNotice | null;
		capabilities: TuiCapabilityStatus[];
		toasts: TuiToast[];
		interaction: TuiInteractionRequest | null;
	};
}

export interface TuiPromptInput {
	text: string;
	mode: "normal" | "shell";
}

export type TuiRuntimeListener = (state: TuiState) => void;

export interface TuiRuntime {
	readonly state: TuiState;
	subscribe(listener: TuiRuntimeListener): () => void;
	sendPrompt(input: TuiPromptInput): Promise<void>;
	abort(): Promise<void> | void;
	compact(): Promise<void> | void;
	runShell(command: string): Promise<void>;
	executeCommand(commandId: string): Promise<void> | void;
	respondInteraction(requestId: string, value: string | undefined): void;
	setModel(modelId: string): Promise<void> | void;
	setAgent(agentId: string): Promise<void> | void;
	setTheme(themeId: string): Promise<void> | void;
	dispose(): void;
}

export interface TuiComponentProps {
	runtime: TuiRuntime;
	children?: JSX.Element;
}
