import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import type { TuiPart, TuiToolPart } from "../../lumen-tui/src/runtime/types.js";
import { createAgentSessionTuiRuntime } from "../src/modes/tui/adapter/agent-session-runtime.js";
import { createHarness, type Harness } from "./suite/harness.js";

describe("AgentSessionTuiRuntime", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("exposes the initial TUI state through a backend-agnostic runtime contract", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		const runtime = createAgentSessionTuiRuntime({
			session: harness.session,
			cwd: harness.tempDir,
			version: "test",
		});

		try {
			expect(runtime.state.session.id).toBe(harness.session.sessionId);
			expect(runtime.state.ui.cwd).toBe(harness.tempDir);
			expect(runtime.state.ui.commands.map((command) => command.id)).toContain("session.compact");
			expect(runtime.state.ui.commands.map((command) => command.id)).toContain("session.interrupt");
			expect(runtime.state.ui.commands.map((command) => command.id)).toContain("messages.copy");
			expect(runtime.state.ui.commands.map((command) => command.id)).toContain("display_thinking");
			expect(runtime.state.ui.commands.map((command) => command.id)).toContain("docs.open");
			expect(runtime.state.ui.commands.map((command) => command.id)).toContain("mcp.list");
			expect(runtime.state.ui.commands.map((command) => command.id)).toContain("model.dialog.favorite");
			expect(runtime.state.ui.commands.map((command) => command.id)).toContain("terminal.suspend");
			expect(runtime.state.ui.commands.find((command) => command.id === "docs.open")?.enabled).toBe(false);
			expect(runtime.state.ui.commands.find((command) => command.id === "mcp.list")?.enabled).toBe(false);
			expect(runtime.state.ui.commands.find((command) => command.id === "model.dialog.favorite")?.enabled).toBe(
				false,
			);
			expect(runtime.state.ui.commands.find((command) => command.id === "terminal.suspend")?.enabled).toBe(false);
			expect(runtime.state.ui.models.some((model) => model.id === harness.getModel().id)).toBe(true);
			expect(runtime.state.ui.capabilities.find((capability) => capability.id === "runtime")?.status).toBe("ready");
			expect(runtime.state.ui.capabilities.find((capability) => capability.id === "permission")?.status).toBe(
				"partial",
			);
		} finally {
			runtime.dispose();
		}
	});

	it("maps prompt streaming, thinking, and tool execution into OpenCode-like TUI parts", async () => {
		const echoTool: AgentTool = {
			name: "echo",
			label: "Echo",
			description: "Echo text back",
			parameters: Type.Object({ text: Type.String() }),
			execute: async (_toolCallId, params) => {
				const text = readParam(params, "text");
				return {
					content: [{ type: "text", text: `echo:${text}` }],
					details: { text },
				};
			},
		};
		const harness = await createHarness({ tools: [echoTool] });
		harnesses.push(harness);
		harness.setResponses([
			fauxAssistantMessage(
				[fauxThinking("plan"), fauxToolCall("echo", { text: "hello" }, { id: "tool-echo" }), fauxText("done")],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("final answer"),
		]);
		const runtime = createAgentSessionTuiRuntime({
			session: harness.session,
			cwd: harness.tempDir,
			version: "test",
		});

		try {
			const snapshots: string[] = [];
			const unsubscribe = runtime.subscribe((state) => snapshots.push(state.session.status));

			await runtime.sendPrompt({ text: "start", mode: "normal" });
			unsubscribe();

			expect(snapshots).toContain("working");
			expect(runtime.state.session.status).toBe("idle");
			expect(runtime.state.session.messages.some((message) => message.role === "user")).toBe(true);
			expect(allTextParts(runtime.state.session.messages.flatMap((message) => message.parts))).toContain("start");
			expect(allThinkingParts(runtime.state.session.messages.flatMap((message) => message.parts))).toContain("plan");
			expect(allTextParts(runtime.state.session.messages.flatMap((message) => message.parts))).toContain(
				"final answer",
			);
			const tool = allToolParts(runtime.state.session.messages.flatMap((message) => message.parts)).find(
				(part) => part.name === "echo",
			);
			expect(tool).toMatchObject({
				callId: "tool-echo",
				status: "success",
				result: "echo:hello",
			});
			expect(runtime.state.ui.activities.find((activity) => activity.id === "tool-echo")?.status).toBe("success");
		} finally {
			runtime.dispose();
		}
	});

	it("runs shell mode through a tool part and keeps UI toggles in runtime state", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		const runtime = createAgentSessionTuiRuntime({
			session: harness.session,
			cwd: harness.tempDir,
			version: "test",
		});

		try {
			await runtime.sendPrompt({ text: "node -e \"console.log('hi')\"", mode: "shell" });
			const shellPart = allToolParts(runtime.state.session.messages.flatMap((message) => message.parts)).find(
				(part) => part.name === "shell",
			);
			expect(shellPart?.status).toBe("success");
			expect(shellPart?.result).toContain("hi");

			expect(runtime.state.ui.thinkingVisible).toBe(true);
			await runtime.executeCommand("session.toggle.thinking");
			expect(runtime.state.ui.thinkingVisible).toBe(false);
			await runtime.executeCommand("display_thinking");
			expect(runtime.state.ui.thinkingVisible).toBe(true);
			await runtime.executeCommand("session.toggle.timestamps");
			expect(runtime.state.ui.showTimestamps).toBe(true);
			expect(runtime.state.ui.showToolDetails).toBe(true);
			await runtime.executeCommand("tool_details");
			expect(runtime.state.ui.showToolDetails).toBe(false);
			await runtime.executeCommand("session.toggle.generic_tool_output");
			expect(runtime.state.ui.showToolDetails).toBe(true);
			expect(runtime.state.session.agent?.id).toBe("build");
			await runtime.executeCommand("agent.cycle");
			expect(runtime.state.session.agent?.id).toBe("plan");
			await runtime.executeCommand("agent.cycle.reverse");
			expect(runtime.state.session.agent?.id).toBe("build");
		} finally {
			runtime.dispose();
		}
	});

	it("maps extension select interactions to permission state and transcript entries", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		const runtime = createAgentSessionTuiRuntime({
			session: harness.session,
			cwd: harness.tempDir,
			version: "test",
		});

		try {
			const answer = harness.session.extensionRunner.getUIContext().select("Pick target", ["Alpha", "Beta"]);
			const interaction = runtime.state.ui.interaction;

			expect(interaction).toMatchObject({
				kind: "select",
				title: "Pick target",
				options: ["Alpha", "Beta"],
			});
			expect(runtime.state.ui.permission).toMatchObject({
				id: interaction?.id,
				title: "Pick target",
			});
			expect(runtime.state.ui.permission?.actions).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: "current-request", status: "ready" }),
					expect.objectContaining({ id: "allow-once", status: "unimplemented" }),
					expect.objectContaining({ id: "allow-always", status: "unimplemented" }),
					expect.objectContaining({ id: "reject-with-message", status: "unimplemented" }),
				]),
			);

			runtime.respondInteraction(interaction?.id ?? "", "Beta");

			await expect(answer).resolves.toBe("Beta");
			expect(runtime.state.ui.interaction).toBeNull();
			expect(runtime.state.ui.permission).toBeNull();
			expect(allStatusText(runtime.state.session.messages.flatMap((message) => message.parts))).toContain(
				"Interaction selected: Pick target -> Beta",
			);
		} finally {
			runtime.dispose();
		}
	});

	it("resolves confirm and input interactions without leaking input text into transcripts", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		const runtime = createAgentSessionTuiRuntime({
			session: harness.session,
			cwd: harness.tempDir,
			version: "test",
		});

		try {
			const confirm = harness.session.extensionRunner
				.getUIContext()
				.confirm("Run command", "Allow the extension command?");
			const confirmInteraction = runtime.state.ui.interaction;

			expect(confirmInteraction).toMatchObject({
				kind: "confirm",
				title: "Run command",
				message: "Allow the extension command?",
			});
			runtime.respondInteraction(confirmInteraction?.id ?? "", "confirm");
			await expect(confirm).resolves.toBe(true);

			const input = harness.session.extensionRunner.getUIContext().input("Secret token", "Paste token");
			const inputInteraction = runtime.state.ui.interaction;

			expect(inputInteraction).toMatchObject({
				kind: "input",
				title: "Secret token",
				placeholder: "Paste token",
			});
			runtime.respondInteraction(inputInteraction?.id ?? "", "super-secret");
			await expect(input).resolves.toBe("super-secret");

			const rejected = harness.session.extensionRunner
				.getUIContext()
				.confirm("Delete workspace", "Reject this operation?");
			const rejectedInteraction = runtime.state.ui.interaction;

			expect(rejectedInteraction).toMatchObject({
				kind: "confirm",
				title: "Delete workspace",
				message: "Reject this operation?",
			});
			runtime.respondInteraction(rejectedInteraction?.id ?? "", undefined);
			await expect(rejected).resolves.toBe(false);

			const transcript = allStatusText(runtime.state.session.messages.flatMap((message) => message.parts));
			expect(transcript).toContain("Interaction confirmed: Run command");
			expect(transcript).toContain("Interaction rejected: Delete workspace");
			expect(transcript).toContain("Interaction answered: Secret token (input provided)");
			expect(transcript).not.toContain("super-secret");
		} finally {
			runtime.dispose();
		}
	});

	it("cancels active extension interactions on abort signals and runtime disposal", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		const runtime = createAgentSessionTuiRuntime({
			session: harness.session,
			cwd: harness.tempDir,
			version: "test",
		});

		try {
			const controller = new AbortController();
			const cancelled = harness.session.extensionRunner
				.getUIContext()
				.select("Abort me", ["Continue"], { signal: controller.signal });
			const cancelledInteraction = runtime.state.ui.interaction;

			controller.abort();

			await expect(cancelled).resolves.toBeUndefined();
			expect(runtime.state.ui.interaction).toBeNull();
			expect(runtime.state.ui.permission).toBeNull();
			expect(allStatusText(runtime.state.session.messages.flatMap((message) => message.parts))).toContain(
				"Interaction cancelled: Abort me",
			);

			const disposed = harness.session.extensionRunner.getUIContext().input("Dispose me");
			expect(runtime.state.ui.interaction).toMatchObject({ kind: "input", title: "Dispose me" });
			runtime.dispose();

			await expect(disposed).resolves.toBeUndefined();
			expect(cancelledInteraction?.title).toBe("Abort me");
		} finally {
			runtime.dispose();
		}
	});

	it("surfaces retry and compaction events as session status and transcript parts", async () => {
		const harness = await createHarness({
			settings: { retry: { enabled: true, maxRetries: 2, baseDelayMs: 1 } },
			extensionFactories: [
				(pi) => {
					pi.on("session_before_compact", async (event) => ({
						compaction: {
							summary: "summary from TUI runtime test",
							firstKeptEntryId: event.preparation.firstKeptEntryId,
							tokensBefore: event.preparation.tokensBefore,
							details: { source: "test" },
						},
					}));
				},
			],
		});
		harnesses.push(harness);
		harness.setResponses([
			fauxAssistantMessage("", { stopReason: "error", errorMessage: "overloaded_error" }),
			fauxAssistantMessage("recovered"),
			fauxAssistantMessage("second turn"),
		]);
		const runtime = createAgentSessionTuiRuntime({
			session: harness.session,
			cwd: harness.tempDir,
			version: "test",
		});

		try {
			const statuses: string[] = [];
			const unsubscribe = runtime.subscribe((state) => statuses.push(state.session.status));

			await runtime.sendPrompt({ text: "retry this", mode: "normal" });
			await runtime.sendPrompt({ text: "prepare compaction", mode: "normal" });
			await runtime.compact();
			unsubscribe();

			expect(statuses).toContain("retrying");
			expect(runtime.state.session.status).toBe("idle");
			expect(runtime.state.session.error).toBeNull();
			const transcript = allStatusText(runtime.state.session.messages.flatMap((message) => message.parts));
			expect(transcript).toContain("正在压缩会话（manual）");
			expect(transcript).toContain("压缩完成");
			expect(runtime.state.ui.toasts.some((toast) => toast.message === "会话已压缩")).toBe(true);
		} finally {
			runtime.dispose();
		}
	});

	it("keeps tool and background activity aborted when an abort races with tool completion", async () => {
		let releaseToolExecution: (() => void) | undefined;
		const toolRelease = new Promise<void>((resolve) => {
			releaseToolExecution = resolve;
		});
		const waitTool: AgentTool = {
			name: "task",
			label: "Task",
			description: "Wait for release",
			parameters: Type.Object({}),
			execute: async () => {
				await toolRelease;
				return {
					content: [{ type: "text", text: "released" }],
					details: { summary: "released" },
				};
			},
		};
		const harness = await createHarness({ tools: [waitTool] });
		harnesses.push(harness);
		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("task", {}, { id: "tool-wait" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("after wait"),
		]);
		const runtime = createAgentSessionTuiRuntime({
			session: harness.session,
			cwd: harness.tempDir,
			version: "test",
		});

		try {
			const sawToolStart = new Promise<void>((resolve) => {
				const unsubscribe = harness.session.subscribe((event) => {
					if (event.type === "tool_execution_start") {
						unsubscribe();
						resolve();
					}
				});
			});
			const prompt = runtime.sendPrompt({ text: "start wait", mode: "normal" });

			await sawToolStart;
			expect(findToolPart(runtime, "tool-wait")?.status).toBe("running");

			const abort = runtime.abort();
			expect(findToolPart(runtime, "tool-wait")?.status).toBe("aborted");
			expect(runtime.state.ui.activities.find((activity) => activity.id === "tool-wait")?.status).toBe("aborted");
			expect(runtime.state.ui.backgroundTasks.find((task) => task.id === "tool-wait")?.status).toBe("aborted");

			releaseToolExecution?.();
			await abort;
			await prompt;

			expect(findToolPart(runtime, "tool-wait")?.status).toBe("aborted");
			expect(runtime.state.ui.activities.find((activity) => activity.id === "tool-wait")?.status).toBe("aborted");
		} finally {
			releaseToolExecution?.();
			runtime.dispose();
		}
	});
});

function readParam(params: unknown, key: string): string {
	if (typeof params !== "object" || params === null || !(key in params)) return "";
	const value = (params as Record<string, unknown>)[key];
	return typeof value === "string" ? value : "";
}

function allTextParts(parts: TuiPart[]): string {
	return parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

function allThinkingParts(parts: TuiPart[]): string {
	return parts
		.filter((part) => part.type === "thinking")
		.map((part) => part.text)
		.join("\n");
}

function allToolParts(parts: TuiPart[]): TuiToolPart[] {
	return parts.filter((part): part is TuiToolPart => part.type === "tool");
}

function allStatusText(parts: TuiPart[]): string {
	return parts
		.filter((part) => part.type === "status")
		.map((part) => part.text)
		.join("\n");
}

function findToolPart(
	runtime: ReturnType<typeof createAgentSessionTuiRuntime>,
	callId: string,
): TuiToolPart | undefined {
	return allToolParts(runtime.state.session.messages.flatMap((message) => message.parts)).find(
		(part) => part.callId === callId,
	);
}
