/**
 * Wire Protocol Layer — 事件类型定义
 *
 * Wire 层是 agent 核心与 UI 之间的结构化事件传输层。
 * 所有事件可序列化为 JSONL，支持 session replay 和 trace 可视化。
 *
 * 协议版本: 1.0
 */

/** Wire 协议版本 */
export const WIRE_PROTOCOL_VERSION = "1.0";

/** Turn 触发来源 */
export type WireTurnTrigger = "user_prompt" | "steer_input" | "auto_trigger";

/** Steer 消息优先级 */
export type WireSteerPriority = "queued" | "immediate";

/** 通用 Wire 事件基础字段 */
export interface WireEventBase {
	/** 协议版本 */
	version: typeof WIRE_PROTOCOL_VERSION;
	/** 单调递增序列号 */
	seq: number;
	/** ISO 8601 时间戳 */
	timestamp: string;
	/** 会话 ID */
	sessionId: string;
}

// ─── 生命周期事件 ───

export interface WireTurnBegin extends WireEventBase {
	type: "TurnBegin";
	turnId: string;
	triggerSource: WireTurnTrigger;
}

export interface WireTurnEnd extends WireEventBase {
	type: "TurnEnd";
	turnId: string;
	/** turn 结束原因 */
	reason: "complete" | "error" | "aborted" | "tool_use";
}

export interface WireStepBegin extends WireEventBase {
	type: "StepBegin";
	turnId: string;
	stepIndex: number;
}

export interface WireStepEnd extends WireEventBase {
	type: "StepEnd";
	turnId: string;
	stepIndex: number;
}

// ─── 内容事件 ───

export interface WireContentPart extends WireEventBase {
	type: "ContentPart";
	turnId: string;
	contentIndex: number;
	delta: string;
}

export interface WireThinkingPart extends WireEventBase {
	type: "ThinkingPart";
	turnId: string;
	contentIndex: number;
	delta: string;
}

// ─── 工具事件 ───

export interface WireToolCall extends WireEventBase {
	type: "ToolCall";
	turnId: string;
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
}

export interface WireToolResult extends WireEventBase {
	type: "ToolResult";
	turnId: string;
	toolCallId: string;
	toolName: string;
	result: unknown;
	isError: boolean;
}

// ─── 状态事件 ───

export interface WireStatusUpdate extends WireEventBase {
	type: "StatusUpdate";
	status: string;
	detail?: string;
}

// ─── 交互事件 ───

export interface WireApprovalRequest extends WireEventBase {
	type: "ApprovalRequest";
	requestId: string;
	title: string;
	message?: string;
	kind: "select" | "input" | "confirm";
	options?: string[];
}

export interface WireApprovalResponse extends WireEventBase {
	type: "ApprovalResponse";
	requestId: string;
	value: string | undefined;
}

// ─── 注入事件 ───

export interface WireSteerInput extends WireEventBase {
	type: "SteerInput";
	message: string;
	priority: WireSteerPriority;
}

// ─── 通知事件 ───

export interface WireNotification extends WireEventBase {
	type: "Notification";
	source: string;
	title: string;
	payload?: Record<string, unknown>;
	autoTrigger: boolean;
}

// ─── 联合类型 ───

export type WireEvent =
	| WireTurnBegin
	| WireTurnEnd
	| WireStepBegin
	| WireStepEnd
	| WireContentPart
	| WireThinkingPart
	| WireToolCall
	| WireToolResult
	| WireStatusUpdate
	| WireApprovalRequest
	| WireApprovalResponse
	| WireSteerInput
	| WireNotification;

export type WireEventType = WireEvent["type"];
