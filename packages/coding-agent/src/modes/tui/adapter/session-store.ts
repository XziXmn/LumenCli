/**
 * Reactive store that bridges AgentSession events to SolidJS signals.
 * This is the core adapter layer — it subscribes to AgentSession events
 * and updates a SolidJS store that TUI components can reactively consume.
 */

import { createStore, produce } from "solid-js/store";
import type { AgentSession, AgentSessionEvent } from "../../../core/agent-session.js";
import type { TuiAppState, TuiMessage, TuiToolCall } from "./types.js";

export interface SessionStoreOptions {
	session: AgentSession;
	cwd: string;
	version: string;
}

export function createSessionStore(options: SessionStoreOptions) {
	const { session, cwd, version } = options;

	const initialState: TuiAppState = {
		session: {
			id: session.sessionManager.getSessionId() ?? "new",
			status: "idle",
			messages: [],
			toolCalls: [],
			model: session.model
				? {
						provider: session.model.provider,
						id: session.model.id,
						displayName: session.model.name ?? session.model.id,
					}
				: null,
			thinking: { content: "", visible: false },
			tokenUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			error: null,
		},
		cwd,
		version,
		autoCompact: session.autoCompactionEnabled,
	};

	const [store, setStore] = createStore(initialState);

	// Current streaming message ID
	let currentAssistantMessageId: string | null = null;

	function handleEvent(event: AgentSessionEvent): void {
		switch (event.type) {
			case "agent_start":
				setStore("session", "status", "working");
				setStore("session", "error", null);
				break;

			case "agent_end":
				setStore("session", "status", "idle");
				break;

			case "message_start": {
				const msg = event.message;
				if (msg.role === "user") {
					const tuiMsg: TuiMessage = {
						id: crypto.randomUUID(),
						role: "user",
						content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
						timestamp: Date.now(),
						completed: true,
					};
					setStore("session", "messages", (msgs) => [...msgs, tuiMsg]);
				} else if (msg.role === "assistant") {
					currentAssistantMessageId = crypto.randomUUID();
					const tuiMsg: TuiMessage = {
						id: currentAssistantMessageId,
						role: "assistant",
						content: "",
						timestamp: Date.now(),
						completed: false,
					};
					setStore("session", "messages", (msgs) => [...msgs, tuiMsg]);
				}
				break;
			}

			case "message_update": {
				if (!currentAssistantMessageId) break;
				const evt = event.assistantMessageEvent;

				if (evt.type === "text_delta") {
					setStore(
						"session",
						"messages",
						(m) => m.id === currentAssistantMessageId,
						"content",
						(prev) => prev + evt.delta,
					);
				} else if (evt.type === "thinking_delta") {
					setStore("session", "thinking", "content", (prev) => prev + evt.delta);
					setStore("session", "thinking", "visible", true);
				} else if (evt.type === "done" || evt.type === "error") {
					// Usage is on the final message
					const msg = evt.type === "done" ? evt.message : evt.error;
					if (msg.usage) {
						setStore("session", "tokenUsage", {
							input: msg.usage.input ?? 0,
							output: msg.usage.output ?? 0,
							cacheRead: msg.usage.cacheRead ?? 0,
							cacheWrite: msg.usage.cacheWrite ?? 0,
						});
					}
				}
				break;
			}

			case "message_end": {
				if (currentAssistantMessageId && event.message.role === "assistant") {
					setStore("session", "messages", (m) => m.id === currentAssistantMessageId, "completed", true);
					// Hide thinking after message completes
					setStore("session", "thinking", { content: "", visible: false });
					currentAssistantMessageId = null;
				}
				break;
			}

			case "tool_execution_start": {
				const toolCall: TuiToolCall = {
					id: event.toolCallId,
					messageId: currentAssistantMessageId ?? "",
					name: event.toolName,
					args: event.args ?? {},
					status: "running",
					startTime: Date.now(),
				};
				setStore("session", "toolCalls", (calls) => [...calls, toolCall]);
				break;
			}

			case "tool_execution_end": {
				setStore(
					"session",
					"toolCalls",
					(tc) => tc.id === event.toolCallId,
					produce((draft) => {
						draft.status = event.isError ? "error" : "success";
						draft.result = typeof event.result === "string" ? event.result : JSON.stringify(event.result);
						draft.endTime = Date.now();
					}),
				);
				break;
			}

			case "compaction_start":
				setStore("session", "status", "compacting");
				break;

			case "compaction_end":
				setStore("session", "status", event.willRetry ? "working" : "idle");
				break;

			case "auto_retry_start":
				setStore("session", "error", `Retrying (${event.attempt}/${event.maxAttempts}): ${event.errorMessage}`);
				break;

			case "auto_retry_end":
				if (event.success) {
					setStore("session", "error", null);
				} else if (event.finalError) {
					setStore("session", "error", event.finalError);
					setStore("session", "status", "error");
				}
				break;
		}
	}

	// Subscribe to session events
	const unsubscribe = session.subscribe(handleEvent);

	return {
		store,
		setStore,
		dispose: unsubscribe,
		/** Send a user message to the session */
		async sendMessage(text: string): Promise<void> {
			setStore("session", "status", "working");
			await session.prompt(text);
		},
		/** Cancel the current operation */
		cancel(): void {
			session.agent.abort();
		},
		setError(message: string): void {
			setStore("session", "error", message);
			setStore("session", "status", "error");
		},
	};
}

export type SessionStore = ReturnType<typeof createSessionStore>;
