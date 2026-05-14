/**
 * Lumen Background Agent + Messaging
 *
 * Extends the existing `agent` tool (lumen-agents.ts) with:
 * - `agent_spawn` — start an agent in the background (don't block)
 * - `agent_status` — check status / progress of background agents
 * - `agent_send` — send a message to a running agent (steering)
 * - `agent_wait` — wait for a specific agent to finish
 * - `agent_kill` — kill a running agent
 *
 * State machine: pending → running → completed | failed | killed
 *
 * Implementation: uses `child_process.spawn` (same as synchronous agent tool)
 * but retains the process handle keyed by agent name. Messages are sent
 * via a temp file (not stdin, since the agent is launched with -p). The
 * agent is expected to poll the steering file periodically; or the send
 * command re-launches the agent with the new steer as a fresh prompt.
 *
 * [Provenance] 来源: 自研 (Claude Code parallel agents + opencode team 概念)
 * [Provenance] 移植方式: 自研 (process-external spawn 模式)
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { APP_NAME } from "../config.js";
import type { ExtensionAPI, ExtensionContext, ToolRenderResultOptions } from "./extensions/types.js";

// ============================================================================
// State
// ============================================================================

export type BgAgentStatus = "pending" | "running" | "completed" | "failed" | "killed";

export interface BgAgent {
	id: string; // unique per spawn
	name: string; // agent type (explore / worker / reviewer / ...)
	task: string;
	status: BgAgentStatus;
	output: string;
	stderr: string;
	exitCode?: number;
	startedAt: number;
	finishedAt?: number;
	durationMs?: number;
	proc?: ChildProcess;
	cwd: string;
	messageFile: string; // path to a file where main agent can steer this agent
	pendingMessages: string[];
}

const BG_AGENTS = new Map<string, BgAgent>();

const TMP_DIR = join(homedir(), ".lumen", "agent", "bg-agents");

function ensureTmpDir(): void {
	if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
}

function makeId(): string {
	return `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// Spawn
// ============================================================================

function getLumenBinary(): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	if (currentScript && existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript] };
	}
	return { command: APP_NAME, args: [] };
}

function spawnBgAgent(name: string, task: string, cwd: string): BgAgent {
	ensureTmpDir();
	const id = makeId();
	const messageFile = join(TMP_DIR, `${id}.steer`);

	// Write a system prompt addendum that tells the agent about the steer file.
	// This way, if the main agent sends messages via agent_send, the sub-agent
	// can read them by checking this file path.
	const steerPromptFile = join(TMP_DIR, `${id}.system.md`);
	const steerPrompt = [
		`You are a background sub-agent (id: ${id}, type: ${name}).`,
		"",
		"If you receive a steering message from the main agent, it will be written to:",
		`  ${messageFile}`,
		"",
		"Check this file periodically if your task is long-running.",
		"Each message is separated by '---'. Follow the latest instruction.",
	].join("\n");
	writeFileSync(steerPromptFile, steerPrompt, "utf8");

	const binary = getLumenBinary();
	const args = [
		...binary.args,
		"--mode",
		"json",
		"-p",
		"--no-session",
		"--append-system-prompt",
		steerPromptFile,
		`Task: ${task}`,
	];

	const agent: BgAgent = {
		id,
		name,
		task,
		status: "pending",
		output: "",
		stderr: "",
		startedAt: Date.now(),
		cwd,
		messageFile,
		pendingMessages: [],
	};

	try {
		const proc = spawn(binary.command, args, {
			cwd,
			shell: false,
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		agent.proc = proc;
		agent.status = "running";

		proc.stdout?.on("data", (chunk: Buffer) => {
			agent.output += chunk.toString();
		});
		proc.stderr?.on("data", (chunk: Buffer) => {
			agent.stderr += chunk.toString();
		});
		proc.on("exit", (code) => {
			agent.exitCode = code ?? 1;
			agent.finishedAt = Date.now();
			agent.durationMs = agent.finishedAt - agent.startedAt;
			if (agent.status === "killed") {
				// Already marked
			} else if (code === 0) {
				agent.status = "completed";
			} else {
				agent.status = "failed";
			}
		});
		proc.on("error", (err) => {
			agent.stderr += `\n[spawn error] ${err.message}`;
			agent.status = "failed";
			agent.finishedAt = Date.now();
			agent.durationMs = agent.finishedAt - agent.startedAt;
		});
	} catch (err) {
		agent.status = "failed";
		agent.stderr = `Failed to spawn: ${err instanceof Error ? err.message : String(err)}`;
		agent.finishedAt = Date.now();
	}

	BG_AGENTS.set(id, agent);
	return agent;
}

// ============================================================================
// Messaging
// ============================================================================

function sendMessageToAgent(agentId: string, message: string): { ok: boolean; reason?: string } {
	const agent = BG_AGENTS.get(agentId);
	if (!agent) return { ok: false, reason: "Agent not found" };
	if (agent.status !== "running") {
		return { ok: false, reason: `Agent is ${agent.status}; cannot accept messages` };
	}

	agent.pendingMessages.push(message);
	try {
		writeFileSync(agent.messageFile, agent.pendingMessages.join("\n---\n"), "utf8");
		return { ok: true };
	} catch (err) {
		return { ok: false, reason: `Failed to write steer file: ${err instanceof Error ? err.message : String(err)}` };
	}
}

function killAgent(agentId: string): { ok: boolean; reason?: string } {
	const agent = BG_AGENTS.get(agentId);
	if (!agent) return { ok: false, reason: "Agent not found" };
	if (agent.status !== "running" || !agent.proc) {
		return { ok: false, reason: `Agent is ${agent.status}` };
	}
	try {
		agent.proc.kill("SIGTERM");
		agent.status = "killed";
		agent.finishedAt = Date.now();
		agent.durationMs = agent.finishedAt - agent.startedAt;
		return { ok: true };
	} catch (err) {
		return { ok: false, reason: `Failed to kill: ${err instanceof Error ? err.message : String(err)}` };
	}
}

function waitForAgent(agentId: string, timeoutMs = 300_000): Promise<BgAgent | undefined> {
	return new Promise((resolve) => {
		const agent = BG_AGENTS.get(agentId);
		if (!agent) return resolve(undefined);
		if (agent.status !== "running") return resolve(agent);

		const interval = setInterval(() => {
			const current = BG_AGENTS.get(agentId);
			if (!current) {
				clearInterval(interval);
				clearTimeout(timer);
				return resolve(undefined);
			}
			if (current.status !== "running") {
				clearInterval(interval);
				clearTimeout(timer);
				return resolve(current);
			}
		}, 200);

		const timer = setTimeout(() => {
			clearInterval(interval);
			resolve(BG_AGENTS.get(agentId));
		}, timeoutMs);
	});
}

// ============================================================================
// Schemas
// ============================================================================

const SpawnParams = Type.Object(
	{
		name: Type.String({ description: "Agent type name (must match an agent defined in .lumen/agents/)" }),
		task: Type.String({ description: "Task description for the agent" }),
	},
	{ description: "Spawn an agent in the background (non-blocking)" },
);

const StatusParams = Type.Object(
	{
		id: Type.Optional(Type.String({ description: "Specific agent id; omit to list all" })),
	},
	{ description: "Check status of background agents" },
);

const SendParams = Type.Object(
	{
		id: Type.String({ description: "Agent id (from agent_spawn result)" }),
		message: Type.String({ description: "Message to send to the agent" }),
	},
	{ description: "Send a steering message to a running background agent" },
);

const WaitParams = Type.Object(
	{
		id: Type.String({ description: "Agent id" }),
		timeout_ms: Type.Optional(Type.Number({ description: "Max wait time (default 300000 = 5 min)" })),
	},
	{ description: "Block until a background agent finishes (or timeout)" },
);

const KillParams = Type.Object(
	{ id: Type.String({ description: "Agent id" }) },
	{ description: "Kill a running background agent" },
);

// ============================================================================
// Helpers for rendering
// ============================================================================

function summarizeAgent(agent: BgAgent): string {
	const elapsedMs = (agent.finishedAt ?? Date.now()) - agent.startedAt;
	const elapsed = `${(elapsedMs / 1000).toFixed(1)}s`;
	return `[${agent.id}] ${agent.name} → ${agent.status} (${elapsed})`;
}

interface BgAgentDetails {
	id?: string;
	status?: string;
	exitCode?: number;
	count?: number;
	found?: boolean;
	ok?: boolean;
	durationMs?: number;
	name?: string;
}

// ============================================================================
// Extension
// ============================================================================

export default function lumenAgentsBgExtension(pi: ExtensionAPI): void {
	// Clean up all background agents on session shutdown
	pi.on("session_shutdown", () => {
		for (const agent of BG_AGENTS.values()) {
			if (agent.status === "running" && agent.proc) {
				try {
					agent.proc.kill("SIGTERM");
				} catch {}
			}
		}
	});

	pi.registerTool<typeof SpawnParams, BgAgentDetails>({
		name: "agent_spawn",
		label: "Agent Spawn",
		description:
			"Spawn a named sub-agent (from .lumen/agents/) in the background. Returns immediately with an agent id. " +
			"Use agent_status to check progress, agent_wait to block until done, agent_kill to stop early.",
		promptSnippet: "agent_spawn — run a sub-agent in the background",
		promptGuidelines: [
			"Use agent_spawn for long-running tasks that can progress while you continue other work.",
			"For synchronous one-off tasks, use the 'agent' tool instead (blocks until done).",
		],
		parameters: SpawnParams,

		async execute(
			_toolCallId: string,
			params: { name: string; task: string },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			ctx: ExtensionContext,
		) {
			const agent = spawnBgAgent(params.name, params.task, ctx.cwd);
			return {
				content: [
					{
						type: "text" as const,
						text: `Spawned ${summarizeAgent(agent)}\n\nPoll with agent_status(id="${agent.id}")`,
					},
				],
				details: { id: agent.id, status: agent.status, name: agent.name },
			};
		},

		renderCall(args: { name?: string; task?: string }, theme, _context) {
			const text =
				theme.fg("toolTitle", theme.bold("agent_spawn ")) +
				theme.fg("muted", `${args.name ?? "?"}: ${args.task ?? ""}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options: ToolRenderResultOptions, theme, _context) {
			const details = result.details as { id?: string; status?: string; name?: string } | undefined;
			if (!details) return new Text(theme.fg("dim", "—"), 0, 0);
			return new Text(
				theme.fg("success", "\u2713 ") + theme.fg("muted", `${details.name} [${details.id}] ${details.status}`),
				0,
				0,
			);
		},
	});

	pi.registerTool<typeof StatusParams, BgAgentDetails>({
		name: "agent_status",
		label: "Agent Status",
		description: "Check status of a specific background agent, or list all agents if id is omitted.",
		parameters: StatusParams,

		async execute(
			_toolCallId: string,
			params: { id?: string },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			_ctx: ExtensionContext,
		) {
			if (params.id) {
				const agent = BG_AGENTS.get(params.id);
				if (!agent) {
					return {
						content: [{ type: "text" as const, text: `Agent ${params.id} not found.` }],
						details: { found: false },
					};
				}
				const outputPreview = agent.output.slice(-2000);
				const text = [
					summarizeAgent(agent),
					"",
					outputPreview ? `--- output (last 2000 chars) ---\n${outputPreview}` : "(no output yet)",
					agent.stderr ? `\n--- stderr ---\n${agent.stderr.slice(-500)}` : "",
				]
					.filter(Boolean)
					.join("\n");
				return {
					content: [{ type: "text" as const, text }],
					details: { id: agent.id, status: agent.status, exitCode: agent.exitCode },
				};
			}

			// List all
			const agents = Array.from(BG_AGENTS.values());
			if (agents.length === 0) {
				return {
					content: [{ type: "text" as const, text: "No background agents." }],
					details: { count: 0 },
				};
			}
			const lines = agents.map(summarizeAgent);
			return {
				content: [{ type: "text" as const, text: `${agents.length} agent(s):\n${lines.join("\n")}` }],
				details: { count: agents.length },
			};
		},

		renderCall(args: { id?: string }, theme, _context) {
			const text = theme.fg("toolTitle", theme.bold("agent_status ")) + theme.fg("muted", args.id ?? "all");
			return new Text(text, 0, 0);
		},

		renderResult(result, _options: ToolRenderResultOptions, theme, _context) {
			const details = result.details as { status?: string; count?: number } | undefined;
			if (!details) return new Text(theme.fg("dim", "—"), 0, 0);
			if (details.count !== undefined) {
				return new Text(theme.fg("success", "\u2713 ") + theme.fg("muted", `${details.count} agents`), 0, 0);
			}
			return new Text(theme.fg("success", "\u2713 ") + theme.fg("muted", details.status ?? "?"), 0, 0);
		},
	});

	pi.registerTool<typeof SendParams, BgAgentDetails>({
		name: "agent_send",
		label: "Agent Send",
		description: "Send a steering message to a running background agent (written to a steer file).",
		parameters: SendParams,

		async execute(
			_toolCallId: string,
			params: { id: string; message: string },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			_ctx: ExtensionContext,
		) {
			const result = sendMessageToAgent(params.id, params.message);
			return {
				content: [
					{
						type: "text" as const,
						text: result.ok ? `Message queued for agent ${params.id}.` : `Failed: ${result.reason}`,
					},
				],
				details: { ok: result.ok },
			};
		},

		renderCall(args: { id?: string }, theme, _context) {
			const text = theme.fg("toolTitle", theme.bold("agent_send ")) + theme.fg("muted", args.id ?? "");
			return new Text(text, 0, 0);
		},

		renderResult(result, _options: ToolRenderResultOptions, theme, _context) {
			const details = result.details as { ok?: boolean } | undefined;
			const icon = details?.ok ? theme.fg("success", "\u2713 ") : theme.fg("error", "\u2717 ");
			return new Text(icon + theme.fg("muted", details?.ok ? "sent" : "failed"), 0, 0);
		},
	});

	pi.registerTool<typeof WaitParams, BgAgentDetails>({
		name: "agent_wait",
		label: "Agent Wait",
		description: "Block until a background agent finishes, or timeout.",
		parameters: WaitParams,

		async execute(
			_toolCallId: string,
			params: { id: string; timeout_ms?: number },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			_ctx: ExtensionContext,
		) {
			const agent = await waitForAgent(params.id, params.timeout_ms);
			if (!agent) {
				return {
					content: [{ type: "text" as const, text: `Agent ${params.id} not found.` }],
					details: { found: false },
				};
			}
			const text = [summarizeAgent(agent), "", agent.output.slice(-4000)].join("\n");
			return {
				content: [{ type: "text" as const, text }],
				details: { id: agent.id, status: agent.status, durationMs: agent.durationMs },
			};
		},

		renderCall(args: { id?: string }, theme, _context) {
			const text = theme.fg("toolTitle", theme.bold("agent_wait ")) + theme.fg("muted", args.id ?? "");
			return new Text(text, 0, 0);
		},

		renderResult(result, _options: ToolRenderResultOptions, theme, _context) {
			const details = result.details as { status?: string; durationMs?: number } | undefined;
			if (!details) return new Text(theme.fg("dim", "—"), 0, 0);
			const duration = details.durationMs ? ` (${(details.durationMs / 1000).toFixed(1)}s)` : "";
			return new Text(theme.fg("success", "\u2713 ") + theme.fg("muted", `${details.status}${duration}`), 0, 0);
		},
	});

	pi.registerTool<typeof KillParams, BgAgentDetails>({
		name: "agent_kill",
		label: "Agent Kill",
		description: "Kill a running background agent (SIGTERM).",
		parameters: KillParams,

		async execute(
			_toolCallId: string,
			params: { id: string },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			_ctx: ExtensionContext,
		) {
			const result = killAgent(params.id);
			return {
				content: [
					{ type: "text" as const, text: result.ok ? `Killed agent ${params.id}.` : `Failed: ${result.reason}` },
				],
				details: { ok: result.ok },
			};
		},

		renderCall(args: { id?: string }, theme, _context) {
			const text = theme.fg("toolTitle", theme.bold("agent_kill ")) + theme.fg("muted", args.id ?? "");
			return new Text(text, 0, 0);
		},

		renderResult(result, _options: ToolRenderResultOptions, theme, _context) {
			const details = result.details as { ok?: boolean } | undefined;
			const icon = details?.ok ? theme.fg("success", "\u2713 ") : theme.fg("error", "\u2717 ");
			return new Text(icon + theme.fg("muted", details?.ok ? "killed" : "failed"), 0, 0);
		},
	});

	// /agents command for viewing all background agents
	pi.registerCommand("agents-bg", {
		description: "查看后台 agent 列表和状态",
		handler: async () => {
			const agents = Array.from(BG_AGENTS.values());
			if (agents.length === 0) {
				pi.sendUserMessage("没有后台 agent。用 LLM 的 agent_spawn tool 启动一个。");
				return;
			}
			const lines = agents.map((a) => {
				const elapsed = `${((a.finishedAt ?? Date.now()) - a.startedAt) / 1000}s`;
				return `- ${a.id} [${a.name}] ${a.status} (${elapsed})\n  task: ${a.task.slice(0, 80)}`;
			});
			pi.sendUserMessage(`共 ${agents.length} 个后台 agent:\n\n${lines.join("\n")}`);
		},
	});
}

// Testing exports
export { BG_AGENTS, killAgent, sendMessageToAgent, spawnBgAgent, waitForAgent };
