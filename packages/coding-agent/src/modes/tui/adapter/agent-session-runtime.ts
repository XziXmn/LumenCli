import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { batch } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import type {
	TuiCapabilityStatus,
	TuiMessage,
	TuiPart,
	TuiSessionOption,
	TuiState,
	TuiStatusPart,
	TuiTextPart,
	TuiThinkingPart,
	TuiTreeItem,
} from "../../../../../lumen-tui/src/runtime/types.js";
import { getShareViewerUrl } from "../../../config.js";
import type { AgentSession, AgentSessionEvent } from "../../../core/agent-session.js";
import type { AgentSessionRuntime } from "../../../core/agent-session-runtime.js";
import type { ExtensionUIContext } from "../../../core/extensions/types.js";
import { getActiveClients } from "../../../core/lumen-lsp-client.js";
import { isCommandAvailable, loadLspConfig } from "../../../core/lumen-lsp-config.js";
import { MissingSessionCwdError } from "../../../core/session-cwd.js";
import {
	type SessionEntry,
	type SessionInfo,
	SessionManager,
	type SessionTreeNode,
} from "../../../core/session-manager.js";
import type { WireHub } from "../../../core/wire/index.js";
import { createWireHub, createWireTraceWriter, wireEventBase } from "../../../core/wire/index.js";
import { copyToClipboard } from "../../../utils/clipboard.js";

export interface AgentSessionTuiRuntimeOptions {
	runtime?: AgentSessionRuntime;
	session: AgentSession;
	cwd: string;
	version: string;
}

const BLOCK_TOOL_NAMES = new Set(["bash", "shell", "write", "edit", "apply_patch", "patch"]);
const SHARE_CUSTOM_TYPE = "lumen_tui_share";

interface TuiShareState {
	version: 1;
	active: boolean;
	gistId: string;
	gistUrl?: string;
	shareUrl: string;
	createdAt: string;
	revokedAt?: string;
}

export function createAgentSessionTuiRuntime(options: AgentSessionTuiRuntimeOptions) {
	const { cwd, version } = options;
	const hostRuntime = options.runtime;
	let activeSession = options.session;
	const listeners = new Set<(state: TuiState) => void>();
	const timeouts = new Set<ReturnType<typeof setTimeout>>();
	const toolIndex = new Map<string, { messageId: string; partId: string }>();
	const pendingInteractions = new Map<string, (value: string | undefined) => void>();
	const navigationForwardStack: string[] = [];
	let currentAssistantMessageId: string | undefined;
	let unsubscribeSession: () => void;
	let currentTurnId: string | undefined;

	// Wire Protocol Layer — 创建 WireHub 并可选持久化
	const sessionDir = activeSession.sessionManager.getSessionDir();
	const wireTraceWriter = createWireTraceWriter(sessionDir);
	const wireHub: WireHub = createWireHub({
		sessionId: activeSession.sessionId,
		onPersist: wireTraceWriter,
	});

	function wirePublish(partial: Record<string, unknown> & { type: string }) {
		const base = wireEventBase(wireHub, activeSession.sessionId);
		wireHub.publish({ ...base, ...partial } as import("../../../core/wire/types.js").WireEvent);
	}

	const [state, setState] = createStore<TuiState>({
		session: {
			id: activeSession.sessionId,
			title: activeSession.sessionName,
			status: activeSession.isStreaming ? "working" : "idle",
			messages: seedMessagesFromSession(activeSession),
			model: modelInfo(activeSession.model),
			agent: { id: "build", displayName: "Build", color: "#b9e887" },
			tokenUsage: usageFromMessages(activeSession.messages),
			error: null,
		},
		ui: {
			cwd,
			version,
			autoCompact: activeSession.autoCompactionEnabled,
			theme: "dark",
			sidebar: "auto",
			thinkingVisible: true,
			showTimestamps: false,
			showToolDetails: true,
			showScrollbar: true,
			navigation: {
				canUndo: canUndoPreviousMessage(),
				canRedo: false,
			},
			focusMessageId: undefined,
			prefillPrompt: undefined,
			editorRequest: undefined,
			commands: defaultCommands(canUndoPreviousMessage(), false, canUnshareSession(activeSession)),
			sessions: [],
			treeItems: treeOptions(activeSession),
			models: modelOptions(activeSession),
			agents: agentOptions(),
			tools: toolOptions(activeSession),
			activities: [],
			backgroundTasks: [],
			queued: queuedItems(activeSession),
			permission: null,
			capabilities: capabilityStatus(latestShareState(activeSession), null, cwd),
			toasts: [],
			interaction: null,
		},
	});

	let recomputeScheduled = false;
	let lastRecomputeAt = 0;
	let suppressNotify = 0;

	function notify() {
		// 在 batched flush 中跳过中间通知，由 flushEvents 末尾统一调用一次。
		if (suppressNotify > 0) return;
		// 只通知订阅者（每个 listener 调用 renderer.requestRender，几乎零成本）。
		// 派生状态的 reconcile 不在这里跑——streaming text_delta 不会改变模型列表 /
		// 工具 / 命令 / 能力等任何派生数据，每个 delta 跑一次 reconcile 就是无效成本。
		// 真正需要 reconcile 的生命周期事件（agent_end / message_end / tool_*  /
		// session 切换 / theme 等）显式调 scheduleRecompute()。
		for (const listener of listeners) listener(state);
	}

	/**
	 * 标记需要重新构建派生状态（modelOptions/toolOptions/treeOptions/commands/
	 * capabilities）。多次调用会被合并到一个 50ms 窗口里，最多每 50ms 跑一次。
	 */
	function scheduleRecompute() {
		if (suppressNotify > 0) {
			// 在 batch 中：等 batch 结束后由 flushEvents 触发。
			recomputeScheduled = true;
			return;
		}
		const now = Date.now();
		const elapsed = now - lastRecomputeAt;
		if (elapsed >= 50) {
			recomputeAuxiliaryState();
			return;
		}
		if (recomputeScheduled) return;
		recomputeScheduled = true;
		setTimeout(() => {
			recomputeScheduled = false;
			recomputeAuxiliaryState();
		}, 50 - elapsed);
	}

	function recomputeAuxiliaryState() {
		lastRecomputeAt = Date.now();
		const canUndo = canUndoPreviousMessage();
		const canRedo = navigationForwardStack.length > 0;
		const shareState = latestShareState(activeSession);
		setState("ui", "models", reconcile(modelOptions(activeSession)));
		setState("ui", "tools", reconcile(toolOptions(activeSession)));
		setState("ui", "treeItems", reconcile(treeOptions(activeSession)));
		setState("ui", "navigation", { canUndo, canRedo });
		setState("ui", "commands", reconcile(defaultCommands(canUndo, canRedo, isActiveShareState(shareState))));
		setState(
			"ui",
			"capabilities",
			reconcile(capabilityStatus(shareState, state.ui.permission, activeSession.sessionManager.getCwd())),
		);
		// 重计算后再通知一次，确保新的 derived state 也被订阅者看到
		for (const listener of listeners) listener(state);
	}

	async function refreshSessions() {
		try {
			const sessions = await SessionManager.list(
				activeSession.sessionManager.getCwd(),
				activeSession.sessionManager.getSessionDir(),
			);
			setState("ui", "sessions", reconcile(toSessionOptions(sessions, activeSession.sessionFile)));
		} catch (error) {
			addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
		}
		scheduleRecompute();
		notify();
	}

	function resetStateForSession(nextSession: AgentSession) {
		toolIndex.clear();
		currentAssistantMessageId = undefined;
		setState("session", {
			id: nextSession.sessionId,
			title: nextSession.sessionName,
			status: nextSession.isStreaming ? "working" : "idle",
			messages: seedMessagesFromSession(nextSession),
			model: modelInfo(nextSession.model),
			agent: state.session.agent ?? { id: "build", displayName: "Build", color: "#b9e887" },
			tokenUsage: usageFromMessages(nextSession.messages),
			error: null,
		});
		setState("ui", "cwd", nextSession.sessionManager.getCwd());
		setState("ui", "autoCompact", nextSession.autoCompactionEnabled);
		setState("ui", "models", reconcile(modelOptions(nextSession)));
		setState("ui", "tools", reconcile(toolOptions(nextSession)));
		setState("ui", "treeItems", reconcile(treeOptions(nextSession)));
		setState("ui", "activities", []);
		setState("ui", "backgroundTasks", []);
		setState("ui", "queued", queuedItems(nextSession));
		setState("ui", "permission", null);
		setState(
			"ui",
			"capabilities",
			reconcile(capabilityStatus(latestShareState(nextSession), null, nextSession.sessionManager.getCwd())),
		);
	}

	async function bindSession(nextSession: AgentSession) {
		unsubscribeSession();
		activeSession = nextSession;
		clearNavigationHistory();
		resetStateForSession(nextSession);
		bindTuiExtensionUI(activeSession);
		unsubscribeSession = subscribeSessionBatched(activeSession);
		await refreshSessions();
	}

	function clearNavigationHistory() {
		navigationForwardStack.length = 0;
	}

	function bindTuiExtensionUI(session: AgentSession) {
		session.extensionRunner.setUIContext(createTuiExtensionUIContext());
	}

	function addToast(input: {
		title?: string;
		message: string;
		variant?: "info" | "success" | "warning" | "error";
		durationMs?: number;
	}) {
		const toast = {
			id: crypto.randomUUID(),
			title: input.title,
			message: input.message,
			variant: input.variant ?? "info",
			createdAt: Date.now(),
			durationMs: input.durationMs ?? 5000,
		};
		setState("ui", "toasts", (items) => [...items, toast]);
		const timeout = setTimeout(() => {
			setState("ui", "toasts", (items) => items.filter((item) => item.id !== toast.id));
			timeouts.delete(timeout);
			notify();
		}, toast.durationMs);
		timeouts.add(timeout);
		notify();
	}

	function ensureAssistantMessage(): string {
		if (currentAssistantMessageId) return currentAssistantMessageId;
		const id = crypto.randomUUID();
		currentAssistantMessageId = id;
		pushMessage({ id, role: "assistant", parts: [], timestamp: Date.now(), completed: false });
		return id;
	}

	function pushMessage(message: TuiMessage) {
		setState("session", "messages", (messages) => [...messages, message]);
	}

	function appendPart(messageId: string, part: TuiPart) {
		setState(
			"session",
			"messages",
			(message) => message.id === messageId,
			"parts",
			(parts) => [...parts, part],
		);
	}

	function appendText(messageId: string, partId: string, delta: string) {
		const message = state.session.messages.find((item) => item.id === messageId);
		const existing = message?.parts.find((part): part is TuiTextPart => part.id === partId && part.type === "text");
		if (!existing) {
			appendPart(messageId, { id: partId, type: "text", text: delta });
			return;
		}
		setState(
			"session",
			"messages",
			(item) => item.id === messageId,
			"parts",
			(part) => part.id === partId,
			produce((part) => {
				if (part.type !== "text") return;
				part.text += delta;
			}),
		);
	}

	function appendThinking(messageId: string, partId: string, delta: string) {
		const message = state.session.messages.find((item) => item.id === messageId);
		const existing = message?.parts.find(
			(part): part is TuiThinkingPart => part.id === partId && part.type === "thinking",
		);
		if (!existing) {
			appendPart(messageId, { id: partId, type: "thinking", text: delta, visible: true });
			return;
		}
		setState(
			"session",
			"messages",
			(item) => item.id === messageId,
			"parts",
			(part) => part.id === partId,
			produce((part) => {
				if (part.type !== "thinking") return;
				part.text += delta;
			}),
		);
	}

	// ===========================================================================
	// 文本渲染节流 (Render throttling for streaming text)
	// ===========================================================================
	//
	// 每个 text_delta / thinking_delta 都直接 setState 会让终端在毫秒级频率下
	// 反复重画整段 message：
	//   1. SolidJS reactivity 触发 <code> 元素的 content prop 更新
	//   2. <code> 标记 yogaNode dirty + 写新 textBuffer
	//   3. 渲染循环下一帧：calculateLayout 全树重测量 → 写 stdout
	// 终端处理一帧 ANSI 重画需要约 5–10ms，60Hz 下勉强追得上；但 AI 提供商的
	// delta 间隔常常 <16ms 就来一次，多帧叠在一起会让光标位置跳变 → "闪动"。
	//
	// 解法：把 text/thinking delta 累积到 per-part Map，统一由 33ms 定时器
	// 一次性 setState 应用所有累积内容。这样 OpenTUI 渲染最多每 33ms（30fps）
	// 重画一次，终端有充分时间处理每帧，闪动消失。
	//
	// 这跟"逐字播放"完全不同：每个 tick 把累积的 **全部** 文本一次性追加，
	// 不人为延后任何字符——只是把"何时通知 SolidJS"控制在合理频率。
	//
	// 设置 LUMEN_TUI_TEXT_RENDER_FPS=off 禁用此节流（每 delta 立即 setState）。
	const RENDER_THROTTLE_MS = process.env.LUMEN_TUI_TEXT_RENDER_FPS === "off" ? 0 : 33;
	type TextKind = "text" | "thinking";
	interface PendingTextEntry {
		messageId: string;
		partId: string;
		kind: TextKind;
		pending: string;
	}
	const pendingText = new Map<string, PendingTextEntry>();
	let renderThrottleTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleTextDelta(messageId: string, partId: string, delta: string, kind: TextKind) {
		if (RENDER_THROTTLE_MS === 0) {
			if (kind === "text") appendText(messageId, partId, delta);
			else appendThinking(messageId, partId, delta);
			return;
		}
		const key = `${kind}:${partId}`;
		const existing = pendingText.get(key);
		if (existing) {
			existing.pending += delta;
		} else {
			pendingText.set(key, { messageId, partId, kind, pending: delta });
		}
		if (!renderThrottleTimer) {
			renderThrottleTimer = setTimeout(flushTextRenderQueue, RENDER_THROTTLE_MS);
		}
	}

	function flushTextRenderQueue() {
		if (renderThrottleTimer) {
			clearTimeout(renderThrottleTimer);
			renderThrottleTimer = undefined;
		}
		if (pendingText.size === 0) return;
		const entries = [...pendingText.values()];
		pendingText.clear();
		suppressNotify++;
		try {
			batch(() => {
				for (const entry of entries) {
					if (!entry.pending) continue;
					if (entry.kind === "text") appendText(entry.messageId, entry.partId, entry.pending);
					else appendThinking(entry.messageId, entry.partId, entry.pending);
				}
			});
		} finally {
			suppressNotify--;
		}
		notify();
	}

	function handleEventInternal(event: AgentSessionEvent): void {
		// 标记是否需要在事件处理后重建派生状态（modelOptions / treeOptions / commands /
		// capabilities）。streaming text_delta / thinking_delta / tool_execution_update
		// 不影响这些派生数据，所以不标记——这是 streaming 流畅度的核心。
		let needsRecompute = false;
		switch (event.type) {
			case "agent_start":
				currentTurnId = crypto.randomUUID();
				wirePublish({ type: "TurnBegin", turnId: currentTurnId, triggerSource: "user_prompt" });
				setState("session", "status", "working");
				setState("session", "error", null);
				break;
			case "agent_end":
				flushTextRenderQueue();
				if (currentTurnId) {
					wirePublish({ type: "TurnEnd", turnId: currentTurnId, reason: "complete" });
					currentTurnId = undefined;
				}
				setState("session", "status", "idle");
				setState("session", "tokenUsage", reconcile(usageFromMessages(event.messages)));
				needsRecompute = true;
				break;
			case "message_start":
				handleMessageStart(event.message);
				break;
			case "message_update":
				handleMessageUpdate(event);
				break;
			case "message_end":
				handleMessageEnd(event.message);
				needsRecompute = true;
				break;
			case "tool_execution_start":
				handleToolStart(event.toolCallId, event.toolName, event.args);
				break;
			case "tool_execution_update":
				handleToolUpdate(event.toolCallId, event.partialResult);
				break;
			case "tool_execution_end":
				handleToolEnd(event.toolCallId, event.result, event.isError);
				needsRecompute = true;
				break;
			case "compaction_start":
				setState("session", "status", "compacting");
				appendSystemStatus(`正在压缩会话（${event.reason}）`, "info");
				break;
			case "compaction_end":
				setState("session", "status", event.willRetry ? "working" : "idle");
				appendSystemStatus(event.aborted ? "压缩已中止" : "压缩完成", event.aborted ? "warning" : "success");
				needsRecompute = true;
				break;
			case "auto_retry_start":
				setState("session", "status", "retrying");
				setState("session", "error", `Retrying ${event.attempt}/${event.maxAttempts}: ${event.errorMessage}`);
				break;
			case "auto_retry_end":
				setState("session", "status", event.success ? "working" : "error");
				setState("session", "error", event.success ? null : (event.finalError ?? "Retry failed"));
				break;
			case "queue_update":
				setState("ui", "queued", reconcile(queueEventItems(event.steering, event.followUp)));
				break;
			case "session_info_changed":
				setState("session", "title", event.name);
				break;
			case "thinking_level_changed":
				addToast({ message: `思考等级: ${event.level}`, variant: "info" });
				break;
		}
		if (needsRecompute) scheduleRecompute();
	}

	function handleMessageStart(message: AgentMessage) {
		if (message.role === "user") {
			const id = crypto.randomUUID();
			pushMessage({
				id,
				role: "user",
				parts: [{ id: `${id}:text`, type: "text", text: textFromMessage(message) }],
				timestamp: Date.now(),
				completed: true,
			});
			return;
		}
		if (message.role === "assistant") {
			currentAssistantMessageId = crypto.randomUUID();
			pushMessage({
				id: currentAssistantMessageId,
				role: "assistant",
				parts: [],
				timestamp: Date.now(),
				completed: false,
			});
		}
	}

	function handleMessageUpdate(event: Extract<AgentSessionEvent, { type: "message_update" }>) {
		const messageId = ensureAssistantMessage();
		const assistantEvent = event.assistantMessageEvent;
		switch (assistantEvent.type) {
			case "text_delta":
				scheduleTextDelta(
					messageId,
					`${messageId}:text:${assistantEvent.contentIndex}`,
					assistantEvent.delta,
					"text",
				);
				if (currentTurnId) {
					wirePublish({
						type: "ContentPart",
						turnId: currentTurnId,
						contentIndex: assistantEvent.contentIndex,
						delta: assistantEvent.delta,
					});
				}
				break;
			case "thinking_delta":
				scheduleTextDelta(
					messageId,
					`${messageId}:thinking:${assistantEvent.contentIndex}`,
					assistantEvent.delta,
					"thinking",
				);
				if (currentTurnId) {
					wirePublish({
						type: "ThinkingPart",
						turnId: currentTurnId,
						contentIndex: assistantEvent.contentIndex,
						delta: assistantEvent.delta,
					});
				}
				break;
			case "toolcall_end":
				handleToolStart(
					assistantEvent.toolCall.id,
					assistantEvent.toolCall.name,
					assistantEvent.toolCall.arguments,
				);
				break;
			case "done":
				setState("session", "tokenUsage", reconcile(usageFromAssistant(assistantEvent.message)));
				break;
			case "error":
				setState("session", "status", "error");
				setState("session", "error", assistantErrorMessage(assistantEvent.error));
				break;
		}
	}

	function handleMessageEnd(message: AgentMessage) {
		if (message.role !== "assistant") return;
		// 把任何尚未 flush 的 paced 文本立即追加到 store，再用最终 message 重建。
		flushTextRenderQueue();
		const messageId = currentAssistantMessageId ?? ensureAssistantMessage();
		// 用 message.content[] 重建 text/thinking parts —— 这是上游"权威"的最终结构。
		// 老界面（interactive AssistantMessageComponent）就是按此模式工作，避免某些
		// 模型（推理 + 正文混合发送、或 thinking 通道也写正文）造成的内容重复。
		// 已存在的 tool parts 保持不动（它们由 tool_execution_* 事件单独维护状态）。
		rebuildAssistantTextParts(messageId, message);
		setState("session", "messages", (item) => item.id === messageId, "completed", true);
		setState("session", "model", reconcile(modelInfo(activeSession.model)));
		setState("session", "tokenUsage", reconcile(usageFromAssistant(message as AssistantMessage)));
		currentAssistantMessageId = undefined;
	}

	function rebuildAssistantTextParts(messageId: string, message: AgentMessage): void {
		const content = "content" in message ? message.content : undefined;
		// 提取最终结构里的 text 和 thinking 块（按出现顺序）。
		const finalText = collectFinalText(content);
		const finalThinking = collectFinalThinking(content);
		const existing = state.session.messages.find((item) => item.id === messageId);
		if (!existing) return;
		// 保留 tool parts（含状态），text/thinking parts 全部丢弃后按最终结构重建。
		const toolParts = existing.parts.filter((part) => part.type === "tool");
		const nextParts: TuiPart[] = [...toolParts];
		if (finalThinking) {
			nextParts.unshift({
				id: `${messageId}:thinking:final`,
				type: "thinking",
				text: finalThinking,
				visible: true,
			});
		}
		if (finalText) {
			nextParts.push({ id: `${messageId}:text:final`, type: "text", text: finalText });
		}
		setState("session", "messages", (item) => item.id === messageId, "parts", reconcile(nextParts));
	}

	function collectFinalText(content: unknown): string {
		if (typeof content === "string") return content;
		if (!Array.isArray(content)) return "";
		return content
			.map((item) => {
				if (!isRecord(item)) return "";
				if (item.type === "text" && typeof item.text === "string") return item.text;
				return "";
			})
			.join("");
	}

	function collectFinalThinking(content: unknown): string {
		if (!Array.isArray(content)) return "";
		return content
			.map((item) => {
				if (!isRecord(item)) return "";
				if (item.type === "thinking" && typeof item.thinking === "string") return item.thinking;
				return "";
			})
			.filter((text) => text.trim().length > 0)
			.join("\n\n");
	}

	function handleToolStart(callId: string, name: string, args: unknown) {
		const messageId = ensureAssistantMessage();
		const partId = `${messageId}:tool:${callId}`;
		if (toolIndex.has(callId)) return;
		const record = recordFromUnknown(args);
		const title = toolTitle(name, args);
		toolIndex.set(callId, { messageId, partId });
		appendPart(messageId, {
			id: partId,
			type: "tool",
			callId,
			name,
			title,
			args: record,
			status: "running",
			startTime: Date.now(),
			display: BLOCK_TOOL_NAMES.has(name) ? "block" : "inline",
		});
		upsertActivity({
			id: callId,
			name,
			title,
			status: "running",
			summary: activitySummary(name, record, undefined),
			startTime: Date.now(),
		});
		upsertBackgroundTask(callId, name, record, "running", undefined);
		if (currentTurnId) {
			wirePublish({ type: "ToolCall", turnId: currentTurnId, toolCallId: callId, toolName: name, args: record });
		}
	}

	function handleToolUpdate(callId: string, partialResult: unknown) {
		const target = toolIndex.get(callId);
		if (!target) return;
		setState(
			"session",
			"messages",
			(message) => message.id === target.messageId,
			"parts",
			(part) => part.id === target.partId,
			produce((part) => {
				if (part.type !== "tool") return;
				part.result = stringifyResult(partialResult);
				part.details = toolResultDetails(partialResult);
			}),
		);
		updateActivity(callId, { summary: activitySummary(undefined, undefined, partialResult) });
		updateBackgroundTask(callId, "running", partialResult);
	}

	function handleToolEnd(callId: string, result: unknown, isError: boolean) {
		const target = toolIndex.get(callId);
		if (!target) return;
		const currentPart = state.session.messages
			.find((message) => message.id === target.messageId)
			?.parts.find((part) => part.id === target.partId);
		const nextStatus =
			currentPart?.type === "tool" && currentPart.status === "aborted" ? "aborted" : isError ? "error" : "success";
		setState(
			"session",
			"messages",
			(message) => message.id === target.messageId,
			"parts",
			(part) => part.id === target.partId,
			produce((part) => {
				if (part.type !== "tool") return;
				part.status = nextStatus;
				if (nextStatus === "error") part.error = stringifyResult(result);
				else if (nextStatus === "success") part.result = stringifyResult(result);
				part.details = toolResultDetails(result);
				part.endTime = Date.now();
			}),
		);
		updateActivity(callId, {
			status: nextStatus,
			summary: activitySummary(undefined, undefined, result),
			endTime: Date.now(),
		});
		updateBackgroundTask(callId, nextStatus, result);
		if (currentTurnId) {
			const toolName = currentPart?.type === "tool" ? currentPart.name : "unknown";
			wirePublish({ type: "ToolResult", turnId: currentTurnId, toolCallId: callId, toolName, result, isError });
		}
	}

	function appendSystemStatus(text: string, variant: TuiStatusPart["variant"]) {
		const id = crypto.randomUUID();
		pushMessage({
			id,
			role: "system",
			parts: [{ id: `${id}:status`, type: "status", text, variant }],
			timestamp: Date.now(),
			completed: true,
		});
	}

	function findLastUndoableUserEntry(): SessionEntry | undefined {
		const branch = activeSession.sessionManager.getBranch();
		for (let index = branch.length - 1; index >= 0; index--) {
			const entry = branch[index];
			if (entry?.type === "message" && entry.message.role === "user") return entry;
		}
		return undefined;
	}

	function canUndoPreviousMessage(): boolean {
		return Boolean(findLastUndoableUserEntry());
	}

	// Stream batching：把高频 agent 事件累积到 16ms 窗口，
	// 然后用 solid `batch()` 一次性应用所有 setState，触发单次 render。
	// 这是 OpenCode TUI 流畅文本输出的关键 (context/sdk.tsx:60-71)。
	//
	// 仅高频流式事件（message_update / tool_execution_update）走 batch；
	// 其他生命周期事件（agent_start/retry/compaction 等）立即处理，
	// 保留语义化的状态转换可观测性。
	let eventQueue: AgentSessionEvent[] = [];
	let flushTimer: ReturnType<typeof setTimeout> | undefined;
	let lastFlushAt = 0;
	const FLUSH_INTERVAL_MS = 16;

	function isStreamingEvent(event: AgentSessionEvent): boolean {
		return event.type === "message_update" || event.type === "tool_execution_update";
	}

	function flushEvents() {
		if (eventQueue.length === 0) return;
		const events = eventQueue;
		eventQueue = [];
		flushTimer = undefined;
		lastFlushAt = Date.now();
		// 在 solid batch() 中应用所有 setState，确保 SolidJS 仅触发一次 render；
		// 同时通过 suppressNotify 抑制嵌套 notify()，由 batch 结束后统一调用一次。
		suppressNotify++;
		try {
			batch(() => {
				for (const event of events) handleEventInternal(event);
			});
		} finally {
			suppressNotify--;
		}
		notify();
		// 如果 batch 期间有事件请求了 recompute，统一在这里跑一次（受 50ms 节流约束）。
		if (recomputeScheduled) {
			recomputeScheduled = false;
			scheduleRecompute();
		}
	}

	function dispatchEvent(event: AgentSessionEvent) {
		if (!isStreamingEvent(event)) {
			// 生命周期事件先把 streaming 队列清空保证顺序，再立即处理。
			if (eventQueue.length > 0) flushEvents();
			handleEventInternal(event);
			notify();
			return;
		}
		eventQueue.push(event);
		if (flushTimer) return;
		const elapsed = Date.now() - lastFlushAt;
		if (elapsed < FLUSH_INTERVAL_MS) {
			flushTimer = setTimeout(flushEvents, FLUSH_INTERVAL_MS - elapsed);
			return;
		}
		flushEvents();
	}

	function subscribeSessionBatched(session: AgentSession) {
		const unsub = session.subscribe(dispatchEvent);
		return () => {
			unsub();
			if (flushTimer) {
				clearTimeout(flushTimer);
				flushTimer = undefined;
			}
			flushEvents();
		};
	}

	bindTuiExtensionUI(activeSession);
	unsubscribeSession = subscribeSessionBatched(activeSession);
	void refreshSessions();

	return {
		get state() {
			return state;
		},
		subscribe(listener: (state: TuiState) => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		async sendPrompt(input: { text: string; mode: "normal" | "shell" }) {
			if (input.mode === "shell") {
				await this.runShell(input.text);
				return;
			}
			setState("session", "status", "working");
			setState("session", "error", null);
			clearNavigationHistory();
			notify();
			try {
				await activeSession.prompt(input.text);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setState("session", "status", "error");
				setState("session", "error", message);
				addToast({ message, variant: "error" });
			} finally {
				flushEvents();
				flushTextRenderQueue();
				scheduleRecompute();
				notify();
			}
		},
		async abort() {
			markRunningToolsAborted();
			if (currentTurnId) {
				wirePublish({ type: "TurnEnd", turnId: currentTurnId, reason: "aborted" });
				currentTurnId = undefined;
			}
			setState("session", "status", "idle");
			addToast({ message: "已中断", variant: "warning" });
			notify();
			await activeSession.abort();
			flushEvents();
			flushTextRenderQueue();
			scheduleRecompute();
			notify();
		},
		async compact() {
			try {
				await activeSession.compact();
				addToast({ message: "会话已压缩", variant: "success" });
			} catch (error) {
				addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
			}
			flushEvents();
		},
		async runShell(command: string) {
			const callId = crypto.randomUUID();
			clearNavigationHistory();
			handleToolStart(callId, "shell", { command });
			notify();
			try {
				const result = await activeSession.executeBash(command);
				handleToolEnd(callId, result.output || `exit ${result.exitCode}`, result.exitCode !== 0);
			} catch (error) {
				handleToolEnd(callId, error instanceof Error ? error.message : String(error), true);
			}
			scheduleRecompute();
			notify();
		},
		async executeCommand(commandId: string) {
			switch (commandId) {
				case "session.new":
					await startNewSession();
					break;
				case "session.fork":
					await forkSession();
					break;
				case commandId.startsWith("session.fork:") ? commandId : "":
					await forkSession(commandId.slice("session.fork:".length));
					break;
				case commandId.startsWith("session.import:") ? commandId : "":
					await importSession(commandId.slice("session.import:".length));
					break;
				case commandId.startsWith("session.delete:") ? commandId : "":
					await deleteSession(commandId.slice("session.delete:".length));
					break;
				case commandId.startsWith("session.navigate:") ? commandId : "":
					await navigateSession(commandId.slice("session.navigate:".length));
					break;
				case commandId.startsWith("session.navigate_summary:") ? commandId : "":
					await navigateSession(commandId.slice("session.navigate_summary:".length), true);
					break;
				case "session.undo":
					await undoPreviousMessage();
					break;
				case "session.redo":
					await redoPreviousMessage();
					break;
				case commandId.startsWith("session.focus:") ? commandId : "":
					setState("ui", "focusMessageId", commandId.slice("session.focus:".length));
					break;
				case commandId.startsWith("session.rename:") ? commandId : "":
					renameSession(commandId.slice("session.rename:".length));
					break;
				case "session.compact":
					await this.compact();
					break;
				case "session.interrupt":
					await this.abort();
					break;
				case "theme.switch":
					await this.setTheme(state.ui.theme === "dark" ? "light" : "dark");
					break;
				case "session.sidebar.toggle":
					setState("ui", "sidebar", state.ui.sidebar === "hide" ? "auto" : "hide");
					break;
				case "session.toggle.thinking":
				case "display_thinking":
					setState("ui", "thinkingVisible", (value) => !value);
					break;
				case "session.toggle.timestamps":
					setState("ui", "showTimestamps", (value) => !value);
					break;
				case "session.toggle.actions":
				case "session.toggle.tool_details":
				case "session.toggle.generic_tool_output":
				case "tool_details":
					setState("ui", "showToolDetails", (value) => !value);
					break;
				case "session.toggle.scrollbar":
					setState("ui", "showScrollbar", (value) => !value);
					break;
				case "session.share":
					await shareSession();
					break;
				case "session.unshare":
					await unshareSession();
					break;
				case "session.toggle.conceal":
					addToast({ message: "隐藏值渲染尚未实现", variant: "warning" });
					break;
				case "prompt.editor":
					setState("ui", "editorRequest", { id: crypto.randomUUID() });
					break;
				case "prompt.editor.missing":
					addToast({ message: "未配置编辑器，请设置 VISUAL 或 EDITOR", variant: "warning" });
					break;
				case "session.copy":
				case "messages.copy":
					await copyLastAssistant();
					break;
				case "session.export.html":
				case "session.export":
					await exportHtml();
					break;
				case "session.export.jsonl":
					exportJsonl();
					break;
				case "model.cycle_recent":
					await cycleModel("forward");
					break;
				case "model.cycle_recent_reverse":
					await cycleModel("backward");
					break;
				case "agent.cycle":
					cycleAgent("forward");
					break;
				case "agent.cycle.reverse":
					cycleAgent("backward");
					break;
				case "opencode.status":
					addToast({
						title: "Status",
						message: `${state.session.status}, ${state.session.messages.length} 条消息`,
						variant: "info",
					});
					break;
				default:
					if (commandId.startsWith("session.switch:")) {
						await switchSession(commandId.slice("session.switch:".length));
						break;
					}
					if (commandId === "session.list") {
						await refreshSessions();
						break;
					}
					if (commandId === "session.import") {
						addToast({ message: "选择要导入的 JSONL 文件", variant: "info" });
						break;
					}
					if (commandId === "session.delete") {
						await refreshSessions();
						addToast({ message: "选择要删除的已保存会话", variant: "info" });
						break;
					}
					if (commandId.startsWith("tool.toggle.")) {
						toggleTool(commandId.slice("tool.toggle.".length));
						break;
					}
					addToast({ message: `${commandId} 尚未接入`, variant: "warning" });
			}
			scheduleRecompute();
			notify();
		},
		respondInteraction(requestId: string, value: string | undefined) {
			const resolve = pendingInteractions.get(requestId);
			if (!resolve) return;
			resolve(value);
		},
		async setModel(modelId: string) {
			const separator = modelId.indexOf("/");
			if (separator === -1) {
				addToast({ message: `Invalid model: ${modelId}`, variant: "error" });
				return;
			}
			const provider = modelId.slice(0, separator);
			const id = modelId.slice(separator + 1);
			const model = activeSession.modelRegistry.find(provider, id);
			if (!model) {
				addToast({ message: `Model not found: ${modelId}`, variant: "error" });
				return;
			}
			try {
				await activeSession.setModel(model);
				setState("session", "model", reconcile(modelInfo(model)));
				addToast({ message: `Model: ${model.name ?? model.id}`, variant: "success" });
			} catch (error) {
				addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
			}
		},
		setAgent(agentId: string) {
			setState("session", "agent", { id: agentId, displayName: titleCase(agentId), color: "#b9e887" });
			scheduleRecompute();
			notify();
		},
		setTheme(themeId: string) {
			setState("ui", "theme", themeId === "light" ? "light" : "dark");
			addToast({ message: `Theme: ${themeId}`, variant: "success" });
			scheduleRecompute();
			notify();
		},
		dispose() {
			unsubscribeSession();
			pendingText.clear();
			if (renderThrottleTimer) {
				clearTimeout(renderThrottleTimer);
				renderThrottleTimer = undefined;
			}
			wireHub.dispose();
			for (const [id, resolve] of pendingInteractions) {
				pendingInteractions.delete(id);
				resolve(undefined);
			}
			for (const timeout of timeouts) clearTimeout(timeout);
			timeouts.clear();
			listeners.clear();
		},
	};

	async function cycleModel(direction: "forward" | "backward") {
		try {
			const result = await activeSession.cycleModel(direction);
			if (!result) {
				addToast({ message: "未配置备选模型", variant: "warning" });
				return;
			}
			setState("session", "model", reconcile(modelInfo(result.model)));
			addToast({ message: `Model: ${result.model.name ?? result.model.id}`, variant: "success" });
		} catch (error) {
			addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
		}
	}

	function cycleAgent(direction: "forward" | "backward") {
		const agents = state.ui.agents.filter((agent) => agent.enabled);
		if (agents.length === 0) {
			addToast({ message: "未配置代理", variant: "warning" });
			return;
		}
		const currentId = state.session.agent?.id;
		const currentIndex = Math.max(
			0,
			agents.findIndex((agent) => agent.id === currentId),
		);
		const offset = direction === "forward" ? 1 : -1;
		const next = agents[(currentIndex + offset + agents.length) % agents.length];
		if (!next) return;
		setState("session", "agent", {
			id: next.id,
			displayName: next.displayName,
			color: next.color,
		});
		addToast({ message: `Agent: ${next.displayName}`, variant: "success" });
	}

	async function startNewSession() {
		if (!hostRuntime) {
			setState("session", "messages", []);
			setState("session", "error", null);
			addToast({ message: "已重置视图", variant: "info" });
			return;
		}
		try {
			const result = await hostRuntime.newSession();
			if (result.cancelled) {
				addToast({ message: "新建会话已取消", variant: "warning" });
				return;
			}
			await bindSession(hostRuntime.session);
			addToast({ message: "已创建新会话", variant: "success" });
		} catch (error) {
			addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
		}
	}

	async function switchSession(sessionPath: string) {
		if (!hostRuntime) {
			addToast({ message: "切换会话需要 Lumen 运行时宿主", variant: "warning" });
			return;
		}
		if (sessionPath === activeSession.sessionFile) {
			addToast({ message: "已在当前会话", variant: "info" });
			return;
		}
		try {
			setState("session", "status", "working");
			const result = await hostRuntime.switchSession(sessionPath);
			if (result.cancelled) {
				setState("session", "status", activeSession.isStreaming ? "working" : "idle");
				addToast({ message: "切换会话已取消", variant: "warning" });
				return;
			}
			await bindSession(hostRuntime.session);
			addToast({
				message: `Switched session: ${hostRuntime.session.sessionName ?? hostRuntime.session.sessionId}`,
				variant: "success",
			});
		} catch (error) {
			setState("session", "status", activeSession.isStreaming ? "working" : "idle");
			addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
		}
	}

	async function importSession(inputPath: string) {
		if (!hostRuntime) {
			addToast({ message: "导入会话需要 Lumen 运行时宿主", variant: "warning" });
			return;
		}
		const path = inputPath.trim();
		if (!path) {
			addToast({ message: "用法: /import <路径.jsonl>", variant: "warning" });
			return;
		}
		const confirmed = await requestConfirm("导入会话", `用 ${path} 替换当前会话？`, undefined);
		if (confirmed !== "confirm") {
			addToast({ message: "导入已取消", variant: "warning" });
			return;
		}
		try {
			const result = await hostRuntime.importFromJsonl(path);
			if (result.cancelled) {
				addToast({ message: "导入已取消", variant: "warning" });
				return;
			}
			await bindSession(hostRuntime.session);
			addToast({ message: `Session imported from ${path}`, variant: "success" });
		} catch (error) {
			if (error instanceof MissingSessionCwdError) {
				await importSessionWithCurrentCwd(path);
				return;
			}
			addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
		}
	}

	async function importSessionWithCurrentCwd(inputPath: string) {
		if (!hostRuntime) return;
		try {
			const fallbackCwd = activeSession.sessionManager.getCwd();
			const result = await hostRuntime.importFromJsonl(inputPath, fallbackCwd);
			if (result.cancelled) {
				addToast({ message: "导入已取消", variant: "warning" });
				return;
			}
			await bindSession(hostRuntime.session);
			addToast({ message: `Session imported with cwd ${fallbackCwd}`, variant: "success" });
		} catch (error) {
			addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
		}
	}

	async function deleteSession(sessionPath: string) {
		const path = sessionPath.trim();
		if (!path) {
			addToast({ message: "无可选会话", variant: "warning" });
			return;
		}
		if (path === activeSession.sessionFile) {
			addToast({ message: "不能删除当前会话", variant: "warning" });
			return;
		}
		if (!isPathInside(path, activeSession.sessionManager.getSessionDir())) {
			addToast({ message: "拒绝删除会话目录外的文件", variant: "error" });
			return;
		}
		const confirmed = await requestConfirm("删除会话", `删除 ${path}？`, undefined);
		if (confirmed !== "confirm") {
			addToast({ message: "删除已取消", variant: "warning" });
			return;
		}
		try {
			await unlink(path);
			addToast({ message: "会话已删除", variant: "success" });
			await refreshSessions();
		} catch (error) {
			addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
		}
	}

	async function forkSession(entryId?: string) {
		if (!hostRuntime) {
			addToast({ message: "分叉会话需要 Lumen 运行时宿主", variant: "warning" });
			return;
		}
		const leafId = entryId ?? activeSession.sessionManager.getLeafId();
		if (!leafId) {
			addToast({ message: "无可分叉的消息", variant: "warning" });
			return;
		}
		try {
			const result = await hostRuntime.fork(leafId, { position: "at" });
			if (result.cancelled) {
				addToast({ message: "分叉已取消", variant: "warning" });
				return;
			}
			await bindSession(hostRuntime.session);
			addToast({ message: "已分叉会话", variant: "success" });
		} catch (error) {
			addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
		}
	}

	async function navigateSession(entryId: string, summarize = false) {
		try {
			const previousLeafId = activeSession.sessionManager.getLeafId();
			const result = await activeSession.navigateTree(entryId, { summarize });
			if (result.cancelled) {
				addToast({ message: "导航已取消", variant: "warning" });
				return;
			}
			if (previousLeafId !== activeSession.sessionManager.getLeafId()) navigationForwardStack.length = 0;
			resetStateForSession(activeSession);
			if (result.editorText) {
				setState("ui", "prefillPrompt", { id: crypto.randomUUID(), text: result.editorText });
			}
			addToast({
				message: summarize ? "Navigated with branch summary" : "Navigated session tree",
				variant: "success",
			});
			await refreshSessions();
		} catch (error) {
			addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
		}
	}

	async function undoPreviousMessage() {
		if (activeSession.isStreaming) await activeSession.abort();
		const target = findLastUndoableUserEntry();
		if (!target) {
			addToast({ message: "无可撤回的用户消息", variant: "warning" });
			return;
		}
		const current = activeSession.sessionManager.getLeafId();
		const success = await navigateSessionFromHistory(target.id, "Undid previous message");
		if (success && current) navigationForwardStack.push(current);
	}

	async function redoPreviousMessage() {
		const target = navigationForwardStack.pop();
		if (!target) {
			addToast({ message: "无可恢复的消息", variant: "warning" });
			return;
		}
		const success = await navigateSessionFromHistory(target, "Redid previous message");
		if (!success) navigationForwardStack.push(target);
	}

	async function navigateSessionFromHistory(entryId: string, message: string): Promise<boolean> {
		try {
			const result = await activeSession.navigateTree(entryId, { summarize: false });
			if (result.cancelled) {
				addToast({ message: "导航已取消", variant: "warning" });
				return false;
			}
			resetStateForSession(activeSession);
			if (result.editorText) {
				setState("ui", "prefillPrompt", { id: crypto.randomUUID(), text: result.editorText });
			}
			addToast({ message, variant: "success" });
			await refreshSessions();
			return true;
		} catch (error) {
			addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
			return false;
		}
	}

	async function copyLastAssistant() {
		const text = activeSession.getLastAssistantText();
		if (!text) {
			addToast({ message: "无可复制的助手消息", variant: "warning" });
			return;
		}
		try {
			await copyToClipboard(text);
			addToast({ message: "已复制最近的助手消息", variant: "success" });
		} catch (error) {
			addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
		}
	}

	async function exportHtml() {
		try {
			const file = await activeSession.exportToHtml();
			addToast({ title: "Exported HTML", message: file, variant: "success", durationMs: 8000 });
			appendSystemStatus(`Exported HTML: ${file}`, "success");
		} catch (error) {
			addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
		}
	}

	function exportJsonl() {
		try {
			const file = activeSession.exportToJsonl();
			addToast({ title: "Exported JSONL", message: file, variant: "success", durationMs: 8000 });
			appendSystemStatus(`Exported JSONL: ${file}`, "success");
		} catch (error) {
			addToast({ message: error instanceof Error ? error.message : String(error), variant: "error" });
		}
	}

	function recordShareState(shareState: TuiShareState) {
		activeSession.sessionManager.appendCustomEntry(SHARE_CUSTOM_TYPE, shareState);
		scheduleRecompute();
		notify();
	}

	async function shareSession() {
		const confirmed = await requestConfirm(
			"Share session",
			"Export this session as HTML and upload it to a private GitHub gist?",
			undefined,
			false,
		);
		if (confirmed !== "confirm") {
			addToast({ message: "分享已取消", variant: "warning" });
			return;
		}

		const authResult = runGitHubCli(["auth", "status"]);
		if (authResult.error) {
			addToast({
				message: "GitHub CLI (gh) 未安装，请从 https://cli.github.com/ 安装",
				variant: "error",
				durationMs: 8000,
			});
			return;
		}
		if (authResult.status !== 0) {
			addToast({ message: "GitHub CLI 未登录，请先运行 'gh auth login'", variant: "error" });
			return;
		}

		const tmpFile = join(tmpdir(), `lumen-session-${activeSession.sessionId}-${Date.now()}.html`);
		try {
			setState("session", "status", "working");
			addToast({ message: "正在创建会话分享...", variant: "info", durationMs: 3000 });
			await activeSession.exportToHtml(tmpFile);
			const gistResult = runGitHubCli(["gist", "create", "--public=false", tmpFile]);
			if (gistResult.error) throw gistResult.error;
			if (gistResult.status !== 0) {
				const errorMessage = gistResult.stderr?.trim() || "Unknown error";
				throw new Error(`Failed to create gist: ${errorMessage}`);
			}
			const gistUrl = gistResult.stdout?.trim();
			const gistId = gistUrl?.split("/").filter(Boolean).pop();
			if (!gistId) throw new Error("Failed to parse gist ID from gh output");
			const shareUrl = getShareViewerUrl(gistId);
			recordShareState({
				version: 1,
				active: true,
				gistId,
				gistUrl,
				shareUrl,
				createdAt: new Date().toISOString(),
			});
			await copyToClipboard(shareUrl);
			addToast({ title: "Share URL copied", message: shareUrl, variant: "success", durationMs: 10000 });
			appendSystemStatus(`Share URL copied: ${shareUrl}`, "success");
		} catch (error) {
			addToast({
				message: error instanceof Error ? error.message : String(error),
				variant: "error",
				durationMs: 8000,
			});
			appendSystemStatus(`Share failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
		} finally {
			setState("session", "status", activeSession.isStreaming ? "working" : "idle");
			try {
				await unlink(tmpFile);
			} catch {
				// Temp cleanup is best-effort; the share result is already reported above.
			}
		}
	}

	async function unshareSession() {
		const shareState = latestShareState(activeSession);
		if (!isActiveShareState(shareState)) {
			addToast({ message: "当前会话无活跃的分享记录", variant: "warning" });
			notify();
			return;
		}

		const confirmed = await requestConfirm(
			"Unshare session",
			`Delete tracked GitHub gist ${shareState.gistId}? This cannot be undone.`,
			undefined,
			false,
		);
		if (confirmed !== "confirm") {
			addToast({ message: "取消分享已取消", variant: "warning" });
			return;
		}

		const authResult = runGitHubCli(["auth", "status"]);
		if (authResult.error) {
			addToast({
				message: "GitHub CLI (gh) 未安装，请从 https://cli.github.com/ 安装",
				variant: "error",
				durationMs: 8000,
			});
			return;
		}
		if (authResult.status !== 0) {
			addToast({ message: "GitHub CLI 未登录，请先运行 'gh auth login'", variant: "error" });
			return;
		}

		try {
			setState("session", "status", "working");
			addToast({ message: "正在删除会话分享...", variant: "info", durationMs: 3000 });
			const deleteResult = runGitHubCli(["gist", "delete", shareState.gistId, "--yes"]);
			if (deleteResult.error) throw deleteResult.error;
			if (deleteResult.status !== 0) {
				const errorMessage = deleteResult.stderr?.trim() || "Unknown error";
				throw new Error(`Failed to delete gist: ${errorMessage}`);
			}
			recordShareState({
				...shareState,
				active: false,
				revokedAt: new Date().toISOString(),
			});
			addToast({ title: "Share removed", message: shareState.gistId, variant: "success", durationMs: 8000 });
			appendSystemStatus(`Share removed: ${shareState.shareUrl}`, "success");
		} catch (error) {
			addToast({
				message: error instanceof Error ? error.message : String(error),
				variant: "error",
				durationMs: 8000,
			});
			appendSystemStatus(`Unshare failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
		} finally {
			setState("session", "status", activeSession.isStreaming ? "working" : "idle");
			notify();
		}
	}

	function toggleTool(toolName: string) {
		const active = new Set(activeSession.getActiveToolNames());
		if (active.has(toolName)) active.delete(toolName);
		else active.add(toolName);
		activeSession.setActiveToolsByName([...active]);
		addToast({
			message: `${titleCase(toolName)} ${active.has(toolName) ? "enabled" : "disabled"}`,
			variant: "success",
		});
	}

	function renameSession(name: string) {
		const title = name.trim();
		if (!title) {
			addToast({ message: "会话标题不能为空", variant: "warning" });
			return;
		}
		activeSession.setSessionName(title);
		setState("session", "title", title);
		addToast({ message: `Renamed session to ${title}`, variant: "success" });
		void refreshSessions();
	}

	function createTuiExtensionUIContext(): ExtensionUIContext {
		return {
			select: (title, options, opts) => requestSelect(title, undefined, options, opts?.signal),
			confirm: async (title, message, opts) => {
				const answer = await requestConfirm(title, message, opts?.signal);
				return answer === "confirm";
			},
			input: (title, placeholder, opts) => requestInput(title, placeholder, opts?.signal),
			notify: (message, type) => addToast({ message, variant: type === "error" ? "error" : (type ?? "info") }),
			onTerminalInput: () => () => {},
			setStatus: (key, text) => {
				if (text) addToast({ title: key, message: text, variant: "info" });
			},
			setWorkingMessage: (message) => {
				if (message) addToast({ message, variant: "info", durationMs: 2000 });
			},
			setWorkingVisible: () => {},
			setWorkingIndicator: () => {},
			setHiddenThinkingLabel: () => {},
			setWidget: () => {},
			setFooter: () => {},
			setHeader: () => {},
			setTitle: () => {},
			custom: async () => {
				addToast({ message: "自定义扩展 UI 在新 TUI 中尚不可用", variant: "warning" });
				return undefined as never;
			},
			pasteToEditor: (text) => {
				setState("ui", "prefillPrompt", { id: crypto.randomUUID(), text });
				notify();
			},
			setEditorText: (text) => {
				setState("ui", "prefillPrompt", { id: crypto.randomUUID(), text });
				notify();
			},
			getEditorText: () => "",
			editor: (title, prefill) => requestInput(title, prefill, undefined, false),
			addAutocompleteProvider: () => {},
			setEditorComponent: () => {},
			getEditorComponent: () => undefined,
			get theme() {
				return undefined as unknown as ExtensionUIContext["theme"];
			},
			getAllThemes: () => [
				{ name: "dark", path: undefined },
				{ name: "light", path: undefined },
			],
			getTheme: () => undefined,
			setTheme: (theme) => {
				const themeId = typeof theme === "string" ? theme : "dark";
				setState("ui", "theme", themeId === "light" ? "light" : "dark");
				notify();
				return { success: true };
			},
			getToolsExpanded: () => state.ui.showToolDetails,
			setToolsExpanded: (expanded) => {
				setState("ui", "showToolDetails", expanded);
				notify();
			},
		};
	}

	function requestSelect(
		title: string,
		message: string | undefined,
		options: string[],
		signal: AbortSignal | undefined,
	): Promise<string | undefined> {
		return requestInteraction(
			(id) => ({
				id,
				kind: "select",
				title,
				message,
				options,
				createdAt: Date.now(),
			}),
			signal,
		);
	}

	function requestInput(
		title: string,
		placeholder: string | undefined,
		signal: AbortSignal | undefined,
		transcript = true,
	): Promise<string | undefined> {
		return requestInteraction(
			(id) => ({
				id,
				kind: "input",
				title,
				placeholder,
				createdAt: Date.now(),
			}),
			signal,
			transcript,
		);
	}

	function requestConfirm(
		title: string,
		message: string,
		signal: AbortSignal | undefined,
		transcript = true,
	): Promise<string | undefined> {
		return requestInteraction(
			(id) => ({
				id,
				kind: "confirm",
				title,
				message,
				confirmLabel: "Confirm",
				cancelLabel: "Cancel",
				createdAt: Date.now(),
			}),
			signal,
			transcript,
		);
	}

	function requestInteraction(
		create: (id: string) => TuiState["ui"]["interaction"],
		signal: AbortSignal | undefined,
		transcript = true,
	): Promise<string | undefined> {
		return new Promise((resolve) => {
			const current = state.ui.interaction;
			if (current) {
				const pending = pendingInteractions.get(current.id);
				pending?.(undefined);
			}
			const id = crypto.randomUUID();
			let settled = false;
			let interaction: TuiState["ui"]["interaction"] | null = null;
			const abort = () => settle(undefined);
			const settle = (value: string | undefined) => {
				if (settled) return;
				settled = true;
				signal?.removeEventListener("abort", abort);
				pendingInteractions.delete(id);
				if (state.ui.interaction?.id === id) setState("ui", "interaction", null);
				if (state.ui.permission?.id === id) setState("ui", "permission", null);
				if (transcript && interaction) appendInteractionTranscript(interaction, value);
				resolve(value);
				notify();
			};
			pendingInteractions.set(id, settle);
			signal?.addEventListener("abort", abort, { once: true });
			if (signal?.aborted) {
				settle(undefined);
				return;
			}
			interaction = create(id);
			setState("ui", "interaction", interaction);
			if (interaction) {
				setState("ui", "permission", {
					id,
					title: interactionTitle(interaction),
					detail: interactionDetail(interaction),
					createdAt: interaction.createdAt,
					actions: permissionActions(interaction.kind),
				});
			}
			notify();
		});
	}

	function appendInteractionTranscript(
		interaction: NonNullable<TuiState["ui"]["interaction"]>,
		value: string | undefined,
	) {
		const title = interactionTitle(interaction);
		if (value === undefined) {
			if (interaction.kind === "confirm") {
				appendSystemStatus(`Interaction rejected: ${title}`, "warning");
				return;
			}
			appendSystemStatus(`Interaction cancelled: ${title}`, "warning");
			return;
		}
		if (interaction.kind === "confirm") {
			appendSystemStatus(`Interaction confirmed: ${title}`, "success");
			return;
		}
		if (interaction.kind === "input") {
			appendSystemStatus(`Interaction answered: ${title} (input provided)`, "success");
			return;
		}
		appendSystemStatus(`Interaction selected: ${title} -> ${value}`, "success");
	}

	function upsertActivity(activity: TuiState["ui"]["activities"][number]) {
		setState("ui", "activities", (items) => {
			const filtered = items.filter((item) => item.id !== activity.id);
			return [...filtered, activity].slice(-8);
		});
	}

	function updateActivity(id: string, patch: Partial<TuiState["ui"]["activities"][number]>) {
		setState("ui", "activities", (items) =>
			items.map((item) => (item.id === id ? { ...item, ...patch, summary: patch.summary || item.summary } : item)),
		);
	}

	function upsertBackgroundTask(
		id: string,
		name: string,
		args: Record<string, unknown>,
		status: TuiState["ui"]["backgroundTasks"][number]["status"],
		details: unknown,
	) {
		if (!isBackgroundTaskTool(name)) return;
		const task = backgroundTaskFromTool(id, name, args, status, details);
		setState("ui", "backgroundTasks", (items) => {
			const filtered = items.filter((item) => item.id !== id);
			return [...filtered, task].slice(-6);
		});
	}

	function updateBackgroundTask(
		id: string,
		status: TuiState["ui"]["backgroundTasks"][number]["status"],
		details: unknown,
	) {
		setState("ui", "backgroundTasks", (items) =>
			items.map((item) => {
				if (item.id !== id) return item;
				return {
					...item,
					status,
					description: activitySummary(undefined, undefined, details) || item.description,
					endTime: status === "running" || status === "pending" ? item.endTime : Date.now(),
					tokenCount: tokenCount(details) ?? item.tokenCount,
					queuedCount: queuedCount(details) ?? item.queuedCount,
				};
			}),
		);
	}

	function markRunningToolsAborted() {
		const endTime = Date.now();
		setState(
			"session",
			"messages",
			(message) => message.parts.some((part) => part.type === "tool"),
			"parts",
			(part) => part.type === "tool" && (part.status === "running" || part.status === "pending"),
			produce((part) => {
				if (part.type !== "tool") return;
				part.status = "aborted";
				part.endTime = endTime;
			}),
		);
		setState("ui", "activities", (items) =>
			items.map((item) =>
				item.status === "running" || item.status === "pending"
					? { ...item, status: "aborted" as const, endTime }
					: item,
			),
		);
		setState("ui", "backgroundTasks", (items) =>
			items.map((item) =>
				item.status === "running" || item.status === "pending"
					? { ...item, status: "aborted" as const, endTime }
					: item,
			),
		);
	}
}

function defaultCommands(canUndo: boolean, canRedo: boolean, canUnshare: boolean): TuiState["ui"]["commands"] {
	return [
		{ id: "session.new", title: "New session", category: "Session", shortcut: "<leader>n", enabled: true },
		{ id: "session.list", title: "Switch session", category: "Session", enabled: true },
		{ id: "session.import", title: "Import session JSONL", category: "Session", enabled: true },
		{ id: "session.delete", title: "Delete saved session", category: "Session", enabled: true },
		{ id: "session.info", title: "Session info", category: "Session", enabled: true },
		{ id: "session.rename", title: "Rename session", category: "Session", shortcut: "Ctrl+R", enabled: true },
		{ id: "session.timeline", title: "Jump to message", category: "Session", shortcut: "<leader>j", enabled: true },
		{ id: "session.tree", title: "Navigate session tree", category: "Session", shortcut: "<leader>g", enabled: true },
		{ id: "session.tree.summary", title: "Navigate tree with summary", category: "Session", enabled: true },
		{ id: "session.fork", title: "Fork session", category: "Session", enabled: true },
		{ id: "session.share", title: "Share session", category: "Session", enabled: true },
		{
			id: "session.unshare",
			title: "Unshare session",
			category: "Session",
			enabled: canUnshare,
			description: canUnshare
				? "Delete the tracked GitHub gist for this session"
				: "Disabled until this session has an active tracked share",
		},
		{
			id: "session.undo",
			title: "Undo previous message",
			category: "Session",
			shortcut: "<leader>u",
			enabled: canUndo,
		},
		{
			id: "session.redo",
			title: "Redo",
			category: "Session",
			shortcut: "<leader>r",
			enabled: canRedo,
		},
		{
			id: "session.copy",
			title: "Copy last assistant message",
			category: "Session",
			shortcut: "<leader>y",
			enabled: true,
		},
		{
			id: "messages.copy",
			title: "Copy message",
			category: "Session",
			shortcut: "<leader>y",
			enabled: true,
			description: "OpenCode alias mapped to copying the last assistant message",
		},
		{
			id: "session.export.html",
			title: "Export session as HTML",
			category: "Session",
			shortcut: "<leader>x",
			enabled: true,
		},
		{
			id: "session.export",
			title: "Export session",
			category: "Session",
			shortcut: "<leader>x",
			enabled: true,
			description: "OpenCode alias mapped to Lumen HTML export",
		},
		{ id: "session.export.jsonl", title: "Export session as JSONL", category: "Session", enabled: true },
		{ id: "session.compact", title: "Compact session", category: "Session", shortcut: "<leader>c", enabled: true },
		{ id: "session.interrupt", title: "Interrupt session", category: "Session", shortcut: "Esc", enabled: true },
		{
			id: "session.sidebar.toggle",
			title: "Toggle sidebar",
			category: "Session",
			shortcut: "<leader>b",
			enabled: true,
		},
		{ id: "session.toggle.thinking", title: "Toggle thinking", category: "Session", enabled: true },
		{
			id: "display_thinking",
			title: "Toggle thinking display",
			category: "Session",
			enabled: true,
			description: "OpenCode alias mapped to Lumen thinking visibility",
		},
		{ id: "session.toggle.timestamps", title: "Toggle timestamps", category: "Session", enabled: true },
		{ id: "session.toggle.actions", title: "Toggle tool details", category: "Session", enabled: true },
		{
			id: "tool_details",
			title: "Toggle tool details",
			category: "Session",
			enabled: true,
			description: "OpenCode alias mapped to Lumen tool details visibility",
		},
		{
			id: "session.toggle.generic_tool_output",
			title: "Toggle generic tool output",
			category: "Session",
			enabled: true,
			description: "Mapped to Lumen tool details visibility",
		},
		{ id: "session.toggle.scrollbar", title: "Toggle scrollbar", category: "Session", enabled: true },
		{
			id: "session.toggle.conceal",
			title: "Toggle concealed values",
			category: "Session",
			enabled: false,
			description: "Disabled: concealed value rendering is not implemented in the Lumen TUI runtime yet",
		},
		{
			id: "session.child.first",
			title: "Go to first child session",
			category: "Session",
			enabled: false,
			description: "Disabled: child session traversal needs a dedicated runtime navigation contract",
		},
		{
			id: "session.child.next",
			title: "Go to next child session",
			category: "Session",
			enabled: false,
			description: "Disabled: child session traversal needs a dedicated runtime navigation contract",
		},
		{
			id: "session.child.previous",
			title: "Go to previous child session",
			category: "Session",
			enabled: false,
			description: "Disabled: child session traversal needs a dedicated runtime navigation contract",
		},
		{
			id: "session.parent",
			title: "Go to parent session",
			category: "Session",
			enabled: false,
			description: "Disabled: parent session traversal needs a dedicated runtime navigation contract",
		},
		...openCodeSessionNavigationPlaceholders(),
		{
			id: "prompt.editor",
			title: "Open external editor",
			category: "Prompt",
			shortcut: "<leader>e",
			enabled: true,
		},
		{
			id: "prompt.clear",
			title: "Clear prompt",
			category: "Prompt",
			enabled: false,
			description: "Disabled in the palette: clearing is handled inside the focused prompt editor",
		},
		{
			id: "prompt.paste",
			title: "Paste",
			category: "Prompt",
			enabled: false,
			description: "Disabled: terminal paste is handled by the OpenTUI textarea paste event",
		},
		{
			id: "prompt.stash",
			title: "Stash prompt",
			category: "Prompt",
			enabled: false,
			description: "Disabled: prompt stash storage is not implemented yet",
		},
		{
			id: "prompt.stash.pop",
			title: "Pop stashed prompt",
			category: "Prompt",
			enabled: false,
			description: "Disabled: prompt stash storage is not implemented yet",
		},
		{
			id: "prompt.stash.list",
			title: "List prompt stashes",
			category: "Prompt",
			enabled: false,
			description: "Disabled: prompt stash storage is not implemented yet",
		},
		disabledCommand(
			"prompt.editor_context.clear",
			"Remove editor context",
			"Prompt",
			"Disabled: editor selection context is not wired to the Lumen TUI runtime yet",
		),
		disabledCommand(
			"prompt.skills",
			"Open skill selector",
			"Prompt",
			"Disabled: skill selector UI is not implemented in the Lumen TUI yet",
		),
		{ id: "model.list", title: "Switch model", category: "Agent", shortcut: "<leader>m", enabled: true },
		{ id: "model.cycle_recent", title: "Cycle model", category: "Agent", shortcut: "F2", enabled: true },
		{
			id: "model.cycle_recent_reverse",
			title: "Cycle model reverse",
			category: "Agent",
			shortcut: "Shift+F2",
			enabled: true,
		},
		{
			id: "model.cycle_favorite",
			title: "Cycle favorite model",
			category: "Agent",
			enabled: false,
			description: "Disabled: favorite model persistence is not implemented in Lumen yet",
		},
		disabledCommand(
			"model.dialog.provider",
			"Open provider list from model dialog",
			"Agent",
			"Disabled: provider drilldown inside the model dialog is not implemented yet",
		),
		disabledCommand(
			"model.dialog.favorite",
			"Toggle model favorite",
			"Agent",
			"Disabled: favorite model persistence is not implemented in Lumen yet",
		),
		{
			id: "model.cycle_favorite_reverse",
			title: "Cycle favorite model reverse",
			category: "Agent",
			enabled: false,
			description: "Disabled: favorite model persistence is not implemented in Lumen yet",
		},
		{ id: "agent.list", title: "Switch agent", category: "Agent", shortcut: "<leader>a", enabled: true },
		{ id: "agent.cycle", title: "Cycle agent", category: "Agent", enabled: true },
		{ id: "agent.cycle.reverse", title: "Cycle agent reverse", category: "Agent", enabled: true },
		{
			id: "agent.activity",
			title: "Show activity",
			category: "Agent",
			enabled: true,
			description: "Inspect running tools, background agents, permission waits, and queued work",
		},
		{
			id: "permission.status",
			title: "Permission status",
			category: "Agent",
			enabled: true,
			description: "Show which approval-style interactions are wired or still backend-limited",
		},
		disabledCommand(
			"permission.prompt.fullscreen",
			"Toggle permission prompt fullscreen",
			"Agent",
			"Disabled in the palette: fullscreen permission mode is triggered automatically by runtime interaction requests",
		),
		{ id: "tools.list", title: "Toggle tools", category: "Agent", enabled: true },
		{
			id: "mcp.list",
			title: "List MCP servers",
			category: "Agent",
			enabled: false,
			description: "Disabled: MCP config discovery is visible in status, but live MCP server control is not wired",
		},
		disabledCommand(
			"dialog.mcp.toggle",
			"Toggle MCP server in dialog",
			"Agent",
			"Disabled: MCP dialog toggle is not implemented because live MCP server control is not wired",
		),
		{
			id: "provider.connect",
			title: "Connect provider",
			category: "Agent",
			enabled: false,
			description: "Disabled: provider login remains in the existing non-TUI auth flow",
		},
		{
			id: "variant.cycle",
			title: "Cycle model variant",
			category: "Agent",
			enabled: false,
			description: "Disabled: Lumen model variants are not exposed by the current runtime adapter",
		},
		{
			id: "variant.list",
			title: "List model variants",
			category: "Agent",
			enabled: false,
			description: "Disabled: Lumen model variants are not exposed by the current runtime adapter",
		},
		disabledCommand(
			"console.org.switch",
			"Switch console organization",
			"Agent",
			"Disabled: console organization switching is OpenCode-specific and not wired in Lumen",
		),
		{ id: "theme.switch", title: "Switch theme", category: "System", shortcut: "<leader>t", enabled: true },
		{ id: "opencode.status", title: "View status", category: "System", shortcut: "<leader>s", enabled: true },
		{ id: "help.show", title: "Help", category: "System", enabled: true },
		disabledCommand(
			"command.palette.show",
			"Show command palette",
			"System",
			"Disabled in the palette: use Ctrl+P or the footer command hint to open it",
			"Ctrl+P",
		),
		{
			id: "docs.open",
			title: "Open documentation",
			category: "System",
			enabled: false,
			description: "Disabled: documentation browser integration is not wired in the TUI yet",
		},
		{
			id: "app.debug",
			title: "Toggle debug panel",
			category: "System",
			enabled: false,
			description: "Disabled: OpenCode debug panel parity is not implemented",
		},
		{
			id: "app.console",
			title: "Toggle console",
			category: "System",
			enabled: false,
			description: "Disabled: OpenCode console parity is not implemented",
		},
		disabledCommand(
			"app.heap_snapshot",
			"Write heap snapshot",
			"System",
			"Disabled: heap snapshot diagnostics are not implemented in the Lumen TUI",
		),
		{
			id: "app.toggle.animations",
			title: "Toggle animations",
			category: "System",
			enabled: false,
			description: "Disabled: animation preferences are not implemented in this terminal renderer",
		},
		{
			id: "app.toggle.file_context",
			title: "Toggle file context",
			category: "System",
			enabled: false,
			description: "Disabled: editor selection file context is not wired to the Lumen runtime yet",
		},
		{
			id: "app.toggle.diffwrap",
			title: "Toggle diff wrapping",
			category: "System",
			enabled: false,
			description: "Disabled: diff wrap preferences are not exposed yet",
		},
		{
			id: "app.toggle.paste_summary",
			title: "Toggle paste summary",
			category: "System",
			enabled: false,
			description: "Disabled: paste summary is always handled by the prompt for large pastes",
		},
		disabledCommand(
			"app.toggle.session_directory_filter",
			"Toggle session directory filtering",
			"System",
			"Disabled: session directory filtering is not implemented in the Lumen TUI yet",
		),
		{
			id: "plugins.list",
			title: "Plugin manager",
			category: "System",
			enabled: false,
			description: "Disabled: plugin manager UI is not implemented in Lumen TUI yet",
		},
		disabledCommand(
			"plugins.install",
			"Install plugin",
			"System",
			"Disabled: plugin installation UI is not implemented in Lumen TUI yet",
		),
		disabledCommand(
			"plugins.toggle",
			"Toggle plugin",
			"System",
			"Disabled: plugin toggling UI is not implemented in Lumen TUI yet",
		),
		disabledCommand(
			"dialog.plugins.install",
			"Install plugin from dialog",
			"System",
			"Disabled: plugin installation from dialog is not implemented in Lumen TUI yet",
		),
		...openCodeSystemPlaceholders(),
		{ id: "app.exit", title: "Exit the app", category: "System", shortcut: "Ctrl+C", enabled: true },
	];
}

function disabledCommand(
	id: string,
	title: string,
	category: TuiState["ui"]["commands"][number]["category"],
	description: string,
	shortcut?: string,
): TuiState["ui"]["commands"][number] {
	return { id, title, category, description, shortcut, enabled: false };
}

function openCodeSessionNavigationPlaceholders(): TuiState["ui"]["commands"] {
	const description =
		"Disabled: message navigation is handled by the current ScrollBox keybindings, not runtime commands";
	return [
		disabledCommand("session.page.up", "Scroll messages up one page", "Session", description, "PgUp"),
		disabledCommand("session.page.down", "Scroll messages down one page", "Session", description, "PgDn"),
		disabledCommand("session.half.page.up", "Scroll messages up half page", "Session", description),
		disabledCommand("session.half.page.down", "Scroll messages down half page", "Session", description),
		disabledCommand("session.line.up", "Scroll messages up one line", "Session", description),
		disabledCommand("session.line.down", "Scroll messages down one line", "Session", description),
		disabledCommand("session.first", "Jump to first message", "Session", description),
		disabledCommand("session.last", "Jump to last message", "Session", description),
		disabledCommand("session.message.next", "Jump to next message", "Session", description),
		disabledCommand("session.message.previous", "Jump to previous message", "Session", description),
		disabledCommand("session.messages_last_user", "Jump to last user message", "Session", description),
	];
}

function openCodeSystemPlaceholders(): TuiState["ui"]["commands"] {
	return [
		disabledCommand(
			"terminal.suspend",
			"Suspend terminal",
			"System",
			"Disabled: terminal suspension is not implemented in the Lumen TUI",
		),
		disabledCommand(
			"terminal.title.toggle",
			"Toggle terminal title",
			"System",
			"Disabled: terminal title management is not implemented in the Lumen TUI",
		),
		disabledCommand(
			"theme.switch_mode",
			"Switch theme mode",
			"System",
			"Disabled: theme mode switching is represented by the existing theme selector",
		),
		disabledCommand(
			"theme.mode.lock",
			"Lock theme mode",
			"System",
			"Disabled: theme mode lock is not implemented in the Lumen TUI",
		),
		disabledCommand("tips.toggle", "Toggle tips", "System", "Disabled: home tips are currently always visible"),
		disabledCommand(
			"workspace.set",
			"Set workspace",
			"System",
			"Disabled: workspace switching is OpenCode-specific and not wired in Lumen",
		),
		disabledCommand(
			"which-key.toggle",
			"Toggle which-key panel",
			"System",
			"Disabled in the palette: press the configured leader key to show which-key",
		),
		disabledCommand(
			"which-key.layout.toggle",
			"Switch which-key layout",
			"System",
			"Disabled: alternate which-key layouts are not implemented",
		),
		disabledCommand(
			"which-key.pending.toggle",
			"Toggle which-key pending preview",
			"System",
			"Disabled: pending preview is not implemented in the Lumen which-key overlay",
		),
		disabledCommand(
			"which-key.group.previous",
			"Previous which-key group",
			"System",
			"Disabled: which-key group navigation is not implemented in the Lumen TUI",
		),
		disabledCommand(
			"which-key.group.next",
			"Next which-key group",
			"System",
			"Disabled: which-key group navigation is not implemented in the Lumen TUI",
		),
		disabledCommand(
			"which-key.scroll.up",
			"Scroll which-key up",
			"System",
			"Disabled: which-key scrolling is not implemented in the Lumen TUI",
		),
		disabledCommand(
			"which-key.scroll.down",
			"Scroll which-key down",
			"System",
			"Disabled: which-key scrolling is not implemented in the Lumen TUI",
		),
		disabledCommand(
			"which-key.page.up",
			"Page which-key up",
			"System",
			"Disabled: which-key paging is not implemented in the Lumen TUI",
		),
		disabledCommand(
			"which-key.page.down",
			"Page which-key down",
			"System",
			"Disabled: which-key paging is not implemented in the Lumen TUI",
		),
		disabledCommand(
			"which-key.home",
			"Jump to first which-key binding",
			"System",
			"Disabled: which-key home/end navigation is not implemented in the Lumen TUI",
		),
		disabledCommand(
			"which-key.end",
			"Jump to last which-key binding",
			"System",
			"Disabled: which-key home/end navigation is not implemented in the Lumen TUI",
		),
		disabledCommand(
			"stash.delete",
			"Delete stash entry",
			"System",
			"Disabled: prompt stash storage is not implemented yet",
		),
	];
}

function permissionActions(
	kind: NonNullable<TuiState["ui"]["interaction"]>["kind"],
): NonNullable<TuiState["ui"]["permission"]>["actions"] {
	return [
		{
			id: "current-request",
			label: interactionActionLabel(kind),
			status: "ready",
			detail: "Handled through Lumen ExtensionUIContext",
		},
		{
			id: "allow-once",
			label: "Allow once",
			status: "unimplemented",
			detail: "Requires a tool approval backend; current AgentSession only exposes ask_user/select/input/confirm",
		},
		{
			id: "allow-always",
			label: "Allow always",
			status: "unimplemented",
			detail: "No persisted approval policy backend is available yet",
		},
		{
			id: "reject-with-message",
			label: "Reject with message",
			status: "unimplemented",
			detail: "No backend contract currently returns a rejection reason to tool execution",
		},
	];
}

function interactionActionLabel(kind: NonNullable<TuiState["ui"]["interaction"]>["kind"]): string {
	if (kind === "select") return "Select answer";
	if (kind === "input") return "Submit input";
	return "Confirm or cancel";
}

function toSessionOptions(
	sessions: readonly SessionInfo[],
	currentSessionFile: string | undefined,
): TuiSessionOption[] {
	return sessions.map((session) => ({
		id: session.id,
		path: session.path,
		title: session.name ?? firstLine(session.firstMessage) ?? session.id,
		cwd: session.cwd,
		description: `${session.messageCount} messages · ${session.cwd || "unknown cwd"}`,
		modified: session.modified.getTime(),
		current: currentSessionFile === session.path,
	}));
}

function queuedItems(session: AgentSession): TuiState["ui"]["queued"] {
	return queueEventItems(session.getSteeringMessages(), session.getFollowUpMessages());
}

function canUnshareSession(session: AgentSession): boolean {
	return isActiveShareState(latestShareState(session));
}

function latestShareState(session: AgentSession): TuiShareState | undefined {
	const entries = session.sessionManager.getEntries();
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry?.type !== "custom" || entry.customType !== SHARE_CUSTOM_TYPE) continue;
		const shareState = shareStateFromData(entry.data);
		if (shareState) return shareState;
	}
	return undefined;
}

function isActiveShareState(shareState: TuiShareState | undefined): shareState is TuiShareState {
	return Boolean(shareState?.active && shareState.gistId);
}

function shareStateFromData(data: unknown): TuiShareState | undefined {
	if (!isRecord(data)) return undefined;
	if (data.version !== 1) return undefined;
	if (typeof data.gistId !== "string" || !data.gistId) return undefined;
	if (typeof data.shareUrl !== "string" || !data.shareUrl) return undefined;
	if (typeof data.createdAt !== "string" || !data.createdAt) return undefined;
	const shareState: TuiShareState = {
		version: 1,
		active: data.active === true,
		gistId: data.gistId,
		shareUrl: data.shareUrl,
		createdAt: data.createdAt,
	};
	if (typeof data.gistUrl === "string" && data.gistUrl) shareState.gistUrl = data.gistUrl;
	if (typeof data.revokedAt === "string" && data.revokedAt) shareState.revokedAt = data.revokedAt;
	return shareState;
}

function runGitHubCli(args: readonly string[]): SpawnSyncReturns<string> {
	let latestResult: SpawnSyncReturns<string> | undefined;
	for (const command of githubCliCandidates()) {
		const result = spawnSync(command, args, { encoding: "utf-8" });
		latestResult = result;
		if (errorCode(result.error) !== "ENOENT") return result;
	}
	return latestResult ?? spawnSync("gh", args, { encoding: "utf-8" });
}

function githubCliCandidates(): string[] {
	const candidates = ["gh"];
	const programFiles = process.env.ProgramFiles;
	const localAppData = process.env.LOCALAPPDATA;
	if (programFiles) candidates.push(join(programFiles, "GitHub CLI", "gh.exe"));
	if (localAppData) candidates.push(join(localAppData, "GitHub CLI", "gh.exe"));
	return [...new Set(candidates)];
}

function errorCode(error: Error | undefined): string | undefined {
	if (!error || !("code" in error)) return undefined;
	const code = (error as { code?: unknown }).code;
	return typeof code === "string" ? code : undefined;
}

function queueEventItems(steering: readonly string[], followUp: readonly string[]): TuiState["ui"]["queued"] {
	const createdAt = Date.now();
	return [
		...steering.map((text, index) => ({
			id: `steering:${index}:${text}`,
			kind: "command" as const,
			text,
			createdAt,
		})),
		...followUp.map((text, index) => ({
			id: `follow-up:${index}:${text}`,
			kind: "prompt" as const,
			text,
			createdAt,
		})),
	];
}

function isBackgroundTaskTool(name: string): boolean {
	const lowerName = name.toLowerCase();
	return lowerName === "task" || lowerName === "subagent" || lowerName === "agent";
}

function backgroundTaskFromTool(
	id: string,
	name: string,
	args: Record<string, unknown>,
	status: TuiState["ui"]["backgroundTasks"][number]["status"],
	details: unknown,
): TuiState["ui"]["backgroundTasks"][number] {
	const agentName = stringValue(args.subagent_type) ?? stringValue(args.agent) ?? titleCase(name);
	const description =
		activitySummary(name, args, details) ??
		stringValue(args.description) ??
		stringValue(args.prompt) ??
		"Background task";
	return {
		id,
		name: agentName,
		title: `${agentName} task`,
		description,
		status,
		startTime: Date.now(),
		tokenCount: tokenCount(details),
		queuedCount: queuedCount(details) ?? 0,
	};
}

function activitySummary(
	name: string | undefined,
	args: Record<string, unknown> | undefined,
	details: unknown,
): string {
	const detailRecord = isRecord(details) ? details : {};
	const record = { ...(args ?? {}), ...detailRecord };
	const summary =
		stringValue(record.summary) ??
		stringValue(record.description) ??
		stringValue(record.message) ??
		stringValue(record.status) ??
		stringValue(record.output) ??
		toolResultText(details) ??
		stringValue(args?.description) ??
		stringValue(args?.prompt);
	if (summary) return firstLine(summary) ?? summary;
	if (name) {
		const path = stringValue(record.filePath) ?? stringValue(record.path);
		if (path) return path;
		const pattern = stringValue(record.pattern);
		if (pattern) return pattern;
		const command = stringValue(record.command);
		if (command) return command;
		return titleCase(name);
	}
	return "";
}

function tokenCount(details: unknown): number | undefined {
	if (!isRecord(details)) return undefined;
	const tokenCountValue = details.tokenCount ?? details.tokens;
	return typeof tokenCountValue === "number" && Number.isFinite(tokenCountValue) ? tokenCountValue : undefined;
}

function queuedCount(details: unknown): number | undefined {
	if (!isRecord(details)) return undefined;
	const queuedValue = details.queuedCount ?? details.queued;
	return typeof queuedValue === "number" && Number.isFinite(queuedValue) ? queuedValue : undefined;
}

function interactionTitle(interaction: NonNullable<TuiState["ui"]["interaction"]>): string {
	if (interaction.kind === "confirm") return interaction.title;
	if (interaction.kind === "select") return interaction.title;
	return interaction.title;
}

function interactionDetail(interaction: NonNullable<TuiState["ui"]["interaction"]>): string | undefined {
	if (interaction.kind === "confirm") return interaction.message;
	if (interaction.kind === "select") return interaction.message ?? `${interaction.options.length} options`;
	return interaction.placeholder;
}

function isPathInside(candidatePath: string, parentPath: string): boolean {
	const candidate = resolve(candidatePath);
	const parent = resolve(parentPath);
	const diff = relative(parent, candidate);
	return diff === "" || (!diff.startsWith("..") && !isAbsolute(diff));
}

function treeOptions(session: AgentSession): TuiTreeItem[] {
	const leafId = session.sessionManager.getLeafId();
	const activeIds = new Set(session.sessionManager.getBranch().map((entry) => entry.id));
	const items: TuiTreeItem[] = [];
	for (const root of session.sessionManager.getTree()) {
		appendTreeNode(items, root, 0, activeIds, leafId);
	}
	return items;
}

function appendTreeNode(
	items: TuiTreeItem[],
	node: SessionTreeNode,
	depth: number,
	activeIds: ReadonlySet<string>,
	leafId: string | null,
) {
	const entry = node.entry;
	const active = activeIds.has(entry.id);
	const leaf = entry.id === leafId;
	const label = node.label ? ` [${node.label}]` : "";
	items.push({
		id: entry.id,
		title: `${treeEntryTitle(entry)}${label}`,
		description: treeEntryDescription(entry),
		right: leaf ? "current leaf" : active ? "current branch" : entry.type,
		enabled: entry.type !== "label" && entry.type !== "session_info",
		depth,
		entryType: entry.type,
		current: active,
		leaf,
	});
	for (const child of node.children) {
		appendTreeNode(items, child, depth + 1, activeIds, leafId);
	}
}

function treeEntryTitle(entry: SessionEntry): string {
	if (entry.type === "message") return entry.message.role;
	if (entry.type === "custom" && entry.customType === SHARE_CUSTOM_TYPE) {
		const shareState = shareStateFromData(entry.data);
		return shareState?.active ? "share active" : "share removed";
	}
	if (entry.type === "custom_message") return entry.customType;
	if (entry.type === "branch_summary") return "branch summary";
	if (entry.type === "compaction") return "compaction";
	if (entry.type === "model_change") return `${entry.provider}/${entry.modelId}`;
	if (entry.type === "thinking_level_change") return `thinking ${entry.thinkingLevel}`;
	if (entry.type === "label") return "label";
	if (entry.type === "session_info") return "session info";
	return entry.type;
}

function treeEntryDescription(entry: SessionEntry): string {
	if (entry.type === "message") return firstLine(textFromMessage(entry.message)) ?? "(empty message)";
	if (entry.type === "custom" && entry.customType === SHARE_CUSTOM_TYPE) {
		const shareState = shareStateFromData(entry.data);
		if (!shareState) return "Share metadata";
		return shareState.active ? `Shared: ${shareState.shareUrl}` : `Removed: ${shareState.shareUrl}`;
	}
	if (entry.type === "custom_message") return firstLine(customMessageText(entry.content)) ?? "(custom message)";
	if (entry.type === "branch_summary") return firstLine(entry.summary) ?? "Branch summary";
	if (entry.type === "compaction") return firstLine(entry.summary) ?? "Compaction summary";
	if (entry.type === "model_change") return "Model change";
	if (entry.type === "thinking_level_change") return "Thinking level change";
	if (entry.type === "label") return entry.label ? `Label: ${entry.label}` : "Label cleared";
	if (entry.type === "session_info") return entry.name ? `Name: ${entry.name}` : "Session name cleared";
	return entry.timestamp;
}

function modelOptions(session: AgentSession): TuiState["ui"]["models"] {
	const available = new Set(session.modelRegistry.getAvailable().map((model) => `${model.provider}/${model.id}`));
	return session.modelRegistry.getAll().map((model) => ({
		key: `${model.provider}/${model.id}`,
		provider: model.provider,
		id: model.id,
		displayName: model.name ?? model.id,
		available: available.has(`${model.provider}/${model.id}`),
		contextWindow: model.contextWindow,
		reasoning: model.reasoning,
	}));
}

function agentOptions(): TuiState["ui"]["agents"] {
	return [
		{
			id: "build",
			displayName: "Build",
			color: "#b9e887",
			description: "Default Lumen coding agent behavior",
			enabled: true,
		},
		{
			id: "plan",
			displayName: "Plan",
			color: "#7cc4ff",
			description: "Planning-oriented UI persona; backend support is incremental",
			enabled: true,
		},
		{
			id: "review",
			displayName: "Review",
			color: "#f2c36b",
			description: "Review-oriented UI persona; backend support is incremental",
			enabled: true,
		},
	];
}

function capabilityStatus(
	shareState: TuiShareState | undefined,
	permission: TuiState["ui"]["permission"],
	cwd: string,
): TuiState["ui"]["capabilities"] {
	const shareDetail = isActiveShareState(shareState)
		? `Shared through secret gist ${shareState.gistId}; /unshare deletes the tracked gist through GitHub CLI`
		: "Share and unshare use GitHub CLI secret gists; requires gh auth login";
	const permissionDetail = permission
		? `Waiting: ${permission.title}${permission.detail ? ` · ${permission.detail}` : ""}`
		: "ask_user/select/input/confirm are wired; allow-always/reject-with-message backend is missing";
	const lsp = lspCapabilityStatus(cwd);
	const mcp = mcpCapabilityStatus(cwd);
	return [
		{
			id: "runtime",
			label: "AgentSession adapter",
			status: "ready",
			detail: "Prompt, streaming, tools, sessions, export, and dialogs are wired",
		},
		{
			id: "share",
			label: "Share",
			status: "ready",
			detail: shareDetail,
		},
		{
			id: "permission",
			label: "Permission prompts",
			status: "partial",
			detail: permissionDetail,
		},
		{
			id: "background-agents",
			label: "Background agents",
			status: "partial",
			detail: "Task/subagent activity is visible; steering and task-specific abort actions are disabled",
		},
		{
			id: "lsp",
			label: "LSP status",
			status: lsp.status,
			detail: lsp.detail,
		},
		{
			id: "mcp",
			label: "MCP status",
			status: mcp.status,
			detail: mcp.detail,
		},
	];
}

function lspCapabilityStatus(cwd: string): Pick<TuiCapabilityStatus, "status" | "detail"> {
	try {
		const config = loadLspConfig(cwd);
		const servers = Object.entries(config.servers);
		const available = servers.filter(([, server]) => isCommandAvailable(server.command));
		const active = getActiveClients().filter((client) => client.cwd === cwd);
		if (active.length > 0) {
			return {
				status: "ready",
				detail: `${active.length} active client(s): ${active.map((client) => client.name).join(", ")}`,
			};
		}
		if (available.length > 0) {
			return {
				status: "ready",
				detail: `${available.length}/${servers.length} configured server(s) available; no active client yet`,
			};
		}
		return {
			status: "disabled",
			detail: `${servers.length} configured server(s), none available on PATH`,
		};
	} catch (error) {
		return {
			status: "partial",
			detail: `LSP status unavailable: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

const mcpStatusCache = new Map<string, Pick<TuiCapabilityStatus, "status" | "detail">>();

function mcpCapabilityStatus(cwd: string): Pick<TuiCapabilityStatus, "status" | "detail"> {
	const cached = mcpStatusCache.get(cwd);
	if (cached) return cached;
	const configs = discoverMcpConfigs(cwd);
	const status: Pick<TuiCapabilityStatus, "status" | "detail"> =
		configs.length > 0
			? {
					status: "partial",
					detail: `${configs.length} config file(s), ${configs.reduce((sum, item) => sum + item.serverCount, 0)} server(s) declared: ${formatMcpConfigs(configs)}; runtime health not wired yet`,
				}
			: {
					status: "disabled",
					detail: "No .mcp.json, mcp.json, or .claude/mcp.json found for this workspace",
				};
	mcpStatusCache.set(cwd, status);
	return status;
}

function formatMcpConfigs(configs: Array<{ path: string; serverCount: number }>): string {
	return configs
		.slice(0, 3)
		.map((item) => `${item.path} (${item.serverCount})`)
		.join(", ");
}

function discoverMcpConfigs(cwd: string): Array<{ path: string; serverCount: number }> {
	const candidates = [join(cwd, ".mcp.json"), join(cwd, "mcp.json"), join(cwd, ".claude", "mcp.json")];
	return candidates
		.filter((file) => existsSync(file))
		.map((file) => ({ path: file, serverCount: countMcpServers(file) }));
}

function countMcpServers(file: string): number {
	try {
		const parsed = JSON.parse(readFileSync(file, "utf-8")) as unknown;
		if (!isRecord(parsed)) return 0;
		if (isRecord(parsed.mcpServers)) return Object.keys(parsed.mcpServers).length;
		if (isRecord(parsed.servers)) return Object.keys(parsed.servers).length;
		return 0;
	} catch {
		return 0;
	}
}

function toolOptions(session: AgentSession): TuiState["ui"]["tools"] {
	const active = new Set(session.getActiveToolNames());
	return session.getAllTools().map((tool) => ({
		id: tool.name,
		displayName: titleCase(tool.name),
		description: tool.description,
		enabled: active.has(tool.name),
	}));
}

function seedMessagesFromSession(session: AgentSession): TuiMessage[] {
	const branchMessages = seedMessagesFromEntries(session.sessionManager.getBranch());
	return branchMessages.length > 0 ? branchMessages : seedMessages(session.messages);
}

function seedMessagesFromEntries(entries: readonly SessionEntry[]): TuiMessage[] {
	const messages: TuiMessage[] = [];
	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const message = entry.message;
		if (message.role !== "user" && message.role !== "assistant") continue;
		const timestamp = new Date(entry.timestamp).getTime();
		messages.push({
			id: entry.id,
			entryId: entry.id,
			role: message.role === "user" ? "user" : "assistant",
			parts: [{ id: `${entry.id}:text`, type: "text", text: textFromMessage(message) }],
			timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
			completed: true,
		});
	}
	return messages;
}

function seedMessages(messages: readonly AgentMessage[]): TuiMessage[] {
	return messages
		.filter((message) => message.role === "user" || message.role === "assistant")
		.map((message) => {
			const id = crypto.randomUUID();
			return {
				id,
				role: message.role === "user" ? "user" : "assistant",
				parts: [{ id: `${id}:text`, type: "text", text: textFromMessage(message) }],
				timestamp: Date.now(),
				completed: true,
			};
		});
}

function modelInfo(model: AgentSession["model"]): TuiState["session"]["model"] {
	if (!model) return null;
	return {
		provider: model.provider,
		id: model.id,
		displayName: model.name ?? model.id,
	};
}

function usageFromMessages(messages: readonly AgentMessage[]): TuiState["session"]["tokenUsage"] {
	return messages.reduce(
		(total, message) => {
			if (message.role !== "assistant") return total;
			const usage = usageFromAssistant(message as AssistantMessage);
			total.input += usage.input;
			total.output += usage.output;
			total.cacheRead += usage.cacheRead;
			total.cacheWrite += usage.cacheWrite;
			return total;
		},
		{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	);
}

function usageFromAssistant(message: AssistantMessage): TuiState["session"]["tokenUsage"] {
	return {
		input: message.usage?.input ?? 0,
		output: message.usage?.output ?? 0,
		cacheRead: message.usage?.cacheRead ?? 0,
		cacheWrite: message.usage?.cacheWrite ?? 0,
	};
}

function textFromMessage(message: AgentMessage): string {
	const content = "content" in message ? message.content : undefined;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	// 只取 text 类型，thinking 是独立通道，不能并入正文
	// （否则当模型把推理也写到 thinking 里时，message_end 会把整段思考再当 text 追加一遍）。
	return content
		.map((item) => {
			if (!isRecord(item)) return "";
			if (item.type === "text" && typeof item.text === "string") return item.text;
			return "";
		})
		.join("");
}

function customMessageText(content: string | Array<{ type: string; text?: string }>): string {
	if (typeof content === "string") return content;
	return content
		.filter((item): item is { type: string; text: string } => item.type === "text" && typeof item.text === "string")
		.map((item) => item.text)
		.join("");
}

function assistantErrorMessage(message: AssistantMessage): string {
	const value = message.errorMessage;
	if (typeof value === "string" && value.trim()) return value;
	return "Assistant response failed";
}

function toolTitle(name: string, args: unknown): string {
	const record = recordFromUnknown(args);
	if (name === "shell" || name === "bash") return `# ${stringValue(record.command) ?? "Shell"}`;
	if (name === "read") return `Read ${stringValue(record.filePath) ?? stringValue(record.path) ?? "file"}`;
	if (name === "write") return `# Wrote ${stringValue(record.filePath) ?? stringValue(record.path) ?? "file"}`;
	if (name === "edit") return `Edit ${stringValue(record.filePath) ?? stringValue(record.path) ?? "file"}`;
	if (name === "grep") return `Grep ${stringValue(record.pattern) ?? ""}`;
	if (name === "glob") return `Glob ${stringValue(record.pattern) ?? ""}`;
	if (name === "ask_user") return `? ${stringValue(record.question) ?? "Ask user"}`;
	return titleCase(name);
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
	if (!isRecord(value)) return {};
	return value;
}

function stringifyResult(value: unknown): string {
	if (typeof value === "string") return value;
	if (value === undefined) return "";
	const text = toolResultText(value);
	if (text) return text;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function toolResultText(value: unknown): string | undefined {
	if (!isRecord(value)) return undefined;
	const content = value.content;
	if (!Array.isArray(content)) return undefined;
	const chunks = content
		.map((item) => {
			if (!isRecord(item)) return "";
			if (item.type === "text" && typeof item.text === "string") return item.text;
			if (item.type === "image") return "[image]";
			return "";
		})
		.filter(Boolean);
	return chunks.length > 0 ? chunks.join("\n") : undefined;
}

function toolResultDetails(value: unknown): unknown {
	if (!isRecord(value)) return undefined;
	return value.details;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value ? value : undefined;
}

function firstLine(value: string): string | undefined {
	const text = value.trim().split(/\r?\n/)[0]?.trim();
	if (!text || text === "(no messages)") return undefined;
	return text.length > 64 ? `${text.slice(0, 61)}...` : text;
}

function titleCase(value: string): string {
	return value
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
		.join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
