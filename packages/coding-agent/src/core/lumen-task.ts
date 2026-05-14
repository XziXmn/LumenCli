/**
 * Lumen Task Tool — In-process sub-agent execution
 *
 * Replaces the process-external agent_spawn/status/wait/kill approach with
 * a single `task` tool that runs sub-agents in-process using the Agent class.
 *
 * Key advantages:
 * - Zero token waste (no LLM polling for status)
 * - Real-time progress via EventBus
 * - Batch parallel execution (one tool call → N agents)
 * - Shared API keys and stream function
 *
 * [Provenance] 来源: oh-my-pi task/executor.ts 设计理念
 * [Provenance] 移植方式: 自研 (用我们的 Agent 类 API)
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentEvent, AgentMessage, AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Agent } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { CONFIG_DIR_NAME, getAgentDir, LEGACY_CONFIG_DIR_NAME } from "../config.js";
import { renderStatusLine } from "../modes/interactive/components/lumen-status-line.js";
import { SPINNER_FRAMES, STATUS_SYMBOLS, TREE_SYMBOLS } from "../modes/interactive/components/lumen-tui-utils.js";
import { theme } from "../modes/interactive/theme/theme.js";
import { createEventBus, type EventBus } from "./event-bus.js";
import type { ExtensionAPI, ExtensionContext, ToolDefinition, ToolRenderResultOptions } from "./extensions/types.js";
import { createAllTools } from "./tools/index.js";

// ============================================================================
// Agent Discovery (moved from lumen-agents.ts)
// ============================================================================

export type AgentSource = "built-in" | "user" | "project";

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: AgentSource;
	filePath?: string;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
	if (!match) return { frontmatter: {}, body: content };

	const frontmatter: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const colonIdx = line.indexOf(":");
		if (colonIdx > 0) {
			const key = line.slice(0, colonIdx).trim();
			const value = line.slice(colonIdx + 1).trim();
			frontmatter[key] = value;
		}
	}
	return { frontmatter, body: match[2] };
}

function loadAgentsFromDir(dir: string, source: AgentSource): AgentConfig[] {
	if (!existsSync(dir)) return [];

	const agents: AgentConfig[] = [];
	let entries: string[];
	try {
		entries = readdirSync(dir).filter((f) => f.endsWith(".md"));
	} catch {
		return [];
	}

	for (const file of entries) {
		const filePath = join(dir, file);
		try {
			const content = readFileSync(filePath, "utf8");
			const { frontmatter, body } = parseFrontmatter(content);

			if (!frontmatter.name || !frontmatter.description) continue;

			const tools = frontmatter.tools
				?.split(",")
				.map((t) => t.trim())
				.filter(Boolean);

			agents.push({
				name: frontmatter.name,
				description: frontmatter.description,
				tools: tools && tools.length > 0 ? tools : undefined,
				model: frontmatter.model,
				systemPrompt: body.trim(),
				source,
				filePath,
			});
		} catch {}
	}

	return agents;
}

export function discoverAgents(cwd: string): AgentConfig[] {
	const userDir = join(getAgentDir(), "agents");
	const projectDir = join(cwd, CONFIG_DIR_NAME, "agents");
	const legacyDir = join(cwd, LEGACY_CONFIG_DIR_NAME, "agents");

	const userAgents = loadAgentsFromDir(userDir, "user");
	const projectAgents = [...loadAgentsFromDir(projectDir, "project"), ...loadAgentsFromDir(legacyDir, "project")];

	const agentMap = new Map<string, AgentConfig>();
	for (const agent of userAgents) agentMap.set(agent.name, agent);
	for (const agent of projectAgents) agentMap.set(agent.name, agent);

	return Array.from(agentMap.values());
}

// ============================================================================
// Types
// ============================================================================

export interface TaskItem {
	id: string;
	description: string;
	assignment: string;
}

export interface SubagentProgress {
	index: number;
	id: string;
	agent: string;
	status: "pending" | "running" | "completed" | "failed" | "aborted";
	description: string;
	currentTool?: string;
	currentToolArgs?: string;
	toolCount: number;
	tokens: number;
	durationMs: number;
	startedAt: number;
}

export interface TaskResult {
	id: string;
	agent: string;
	description: string;
	output: string;
	exitCode: number;
	tokens: number;
	durationMs: number;
	error?: string;
}

interface TaskToolDetails {
	results: TaskResult[];
	totalDurationMs: number;
	progress?: SubagentProgress[];
}

// ============================================================================
// EventBus Channels
// ============================================================================

export const TASK_PROGRESS_CHANNEL = "task:progress";
export const TASK_LIFECYCLE_CHANNEL = "task:lifecycle";

// ============================================================================
// Sub-agent Executor
// ============================================================================

interface ExecuteSubagentOptions {
	agentConfig: AgentConfig;
	task: TaskItem;
	index: number;
	cwd: string;
	model: Model<any>;
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	tools: AgentTool<any>[];
	context?: string;
	signal?: AbortSignal;
	eventBus: EventBus;
	onProgress?: (progress: SubagentProgress) => void;
}

async function executeSubagent(options: ExecuteSubagentOptions): Promise<TaskResult> {
	const { agentConfig, task, index, model, getApiKey, tools, context, signal, eventBus, onProgress } = options;
	const startTime = Date.now();
	const id = task.id;

	// Build progress tracker
	const progress: SubagentProgress = {
		index,
		id,
		agent: agentConfig.name,
		status: "running",
		description: task.description,
		toolCount: 0,
		tokens: 0,
		durationMs: 0,
		startedAt: startTime,
	};

	// Filter tools based on agent config
	const allowedTools = filterToolsForAgent(tools, agentConfig.tools);

	// Build system prompt
	const systemPrompt = buildSubagentSystemPrompt(agentConfig, context);

	// Create sub-agent
	const subAgent = new Agent({
		initialState: {
			systemPrompt,
			model,
			tools: allowedTools,
		},
		getApiKey,
		toolExecution: "parallel",
	});

	// Subscribe to events for progress tracking
	const unsubscribe = subAgent.subscribe((event: AgentEvent) => {
		updateProgress(progress, event);
		progress.durationMs = Date.now() - startTime;
		onProgress?.(progress);
		eventBus.emit(TASK_PROGRESS_CHANNEL, { ...progress });
	});

	// Handle abort
	if (signal) {
		const onAbort = () => subAgent.abort();
		if (signal.aborted) {
			onAbort();
		} else {
			signal.addEventListener("abort", onAbort, { once: true });
		}
	}

	// Emit lifecycle start
	eventBus.emit(TASK_LIFECYCLE_CHANNEL, { id, agent: agentConfig.name, status: "started", index });

	try {
		await subAgent.prompt(task.assignment);
		await subAgent.waitForIdle();

		// Extract output from messages
		const output = extractOutput(subAgent.state.messages);
		const tokens = countTokens(subAgent.state.messages);
		const durationMs = Date.now() - startTime;

		progress.status = "completed";
		progress.tokens = tokens;
		progress.durationMs = durationMs;
		onProgress?.(progress);
		eventBus.emit(TASK_PROGRESS_CHANNEL, { ...progress });
		eventBus.emit(TASK_LIFECYCLE_CHANNEL, { id, agent: agentConfig.name, status: "completed", index });

		return {
			id,
			agent: agentConfig.name,
			description: task.description,
			output,
			exitCode: 0,
			tokens,
			durationMs,
		};
	} catch (err) {
		const durationMs = Date.now() - startTime;
		const errorMessage = err instanceof Error ? err.message : String(err);

		progress.status = "failed";
		progress.durationMs = durationMs;
		onProgress?.(progress);
		eventBus.emit(TASK_PROGRESS_CHANNEL, { ...progress });
		eventBus.emit(TASK_LIFECYCLE_CHANNEL, { id, agent: agentConfig.name, status: "failed", index });

		return {
			id,
			agent: agentConfig.name,
			description: task.description,
			output: "",
			exitCode: 1,
			tokens: countTokens(subAgent.state.messages),
			durationMs,
			error: errorMessage,
		};
	} finally {
		unsubscribe();
	}
}

// ============================================================================
// Helpers
// ============================================================================

function filterToolsForAgent(allTools: AgentTool<any>[], allowedNames?: string[]): AgentTool<any>[] {
	if (!allowedNames || allowedNames.length === 0) return allTools;
	const allowed = new Set(allowedNames);
	return allTools.filter((t) => allowed.has(t.name));
}

function buildSubagentSystemPrompt(agentConfig: AgentConfig, context?: string): string {
	const parts: string[] = [];
	parts.push(agentConfig.systemPrompt);
	if (context) {
		parts.push(`\n\n## Context\n\n${context}`);
	}
	parts.push(
		"\n\nIMPORTANT: You are a sub-agent executing a specific task. Focus only on the assigned task. Be concise in your final response — summarize what you did and any findings.",
	);
	return parts.join("");
}

function updateProgress(progress: SubagentProgress, event: AgentEvent): void {
	switch (event.type) {
		case "tool_execution_start":
			progress.toolCount++;
			progress.currentTool = event.toolName;
			progress.currentToolArgs = extractToolPreview(event.args);
			break;
		case "tool_execution_end":
			progress.currentTool = undefined;
			progress.currentToolArgs = undefined;
			break;
		case "message_end":
			if (event.message && "usage" in event.message) {
				const usage = (event.message as any).usage;
				if (usage?.totalTokens) {
					progress.tokens = usage.totalTokens;
				}
			}
			break;
	}
}

function extractToolPreview(args: any): string {
	if (!args || typeof args !== "object") return "";
	const preview = args.command ?? args.path ?? args.file_path ?? args.pattern ?? args.query ?? args.task ?? "";
	if (typeof preview !== "string") return "";
	return preview.length > 50 ? `${preview.slice(0, 47)}...` : preview;
}

function extractOutput(messages: AgentMessage[]): string {
	const outputParts: string[] = [];
	for (const msg of messages) {
		if (!msg || typeof msg !== "object" || !("role" in msg)) continue;
		if (msg.role === "assistant" && "content" in msg && Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block.type === "text" && block.text) {
					outputParts.push(block.text);
				}
			}
		}
	}
	// Return the last assistant text (most relevant)
	return outputParts[outputParts.length - 1] ?? "(no output)";
}

function countTokens(messages: AgentMessage[]): number {
	let total = 0;
	for (const msg of messages) {
		if (!msg || typeof msg !== "object" || !("usage" in msg)) continue;
		const usage = (msg as any).usage;
		if (usage?.totalTokens) {
			total = usage.totalTokens; // Use last cumulative value
		}
	}
	return total;
}

function formatDuration(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================================
// Tool Schema
// ============================================================================

const TaskItemSchema = Type.Object({
	id: Type.String({ description: "CamelCase identifier for this task (max 48 chars)" }),
	description: Type.String({ description: "Short one-liner for UI display" }),
	assignment: Type.String({ description: "Full task instructions for the sub-agent" }),
});

const TaskParams = Type.Object({
	agent: Type.String({ description: "Agent type name (from .lumen/agents/)" }),
	context: Type.Optional(Type.String({ description: "Shared context prepended to all task assignments" })),
	tasks: Type.Array(TaskItemSchema, { description: "Tasks to execute (parallel when multiple)" }),
});

// ============================================================================
// Render Helpers
// ============================================================================

type TaskRenderState = {
	startedAt?: number;
	interval?: ReturnType<typeof setInterval>;
	progressMap: Map<string, SubagentProgress>;
};

function renderTaskProgress(progressMap: Map<string, SubagentProgress>, _expanded: boolean): string[] {
	const entries = Array.from(progressMap.values()).sort((a, b) => a.index - b.index);
	const lines: string[] = [];

	for (let i = 0; i < entries.length; i++) {
		const p = entries[i];
		const isLast = i === entries.length - 1;
		const branch = isLast ? TREE_SYMBOLS.last : TREE_SYMBOLS.branch;
		const branchStr = theme.fg("dim", branch);

		// Status icon
		let icon: string;
		if (p.status === "completed") {
			icon = theme.fg("success", STATUS_SYMBOLS.success);
		} else if (p.status === "failed" || p.status === "aborted") {
			icon = theme.fg("error", STATUS_SYMBOLS.error);
		} else if (p.status === "running") {
			const elapsed = Date.now() - p.startedAt;
			const frameIdx = Math.floor(elapsed / 80) % SPINNER_FRAMES.length;
			icon = theme.fg("accent", SPINNER_FRAMES[frameIdx]);
		} else {
			icon = theme.fg("muted", STATUS_SYMBOLS.pending);
		}

		// Main line
		let line = ` ${branchStr} ${icon} ${theme.fg("accent", p.description)}`;

		// Meta info
		const meta: string[] = [];
		if (p.currentTool) {
			meta.push(p.currentTool + (p.currentToolArgs ? `: ${p.currentToolArgs}` : ""));
		}
		if (p.status === "completed" || p.status === "failed") {
			meta.push(formatDuration(p.durationMs));
		}
		if (p.tokens > 0) {
			meta.push(`${p.tokens} tok`);
		}
		if (meta.length > 0) {
			line += ` ${theme.fg("dim", meta.join(" \u00B7 "))}`;
		}

		lines.push(line);
	}

	return lines;
}

// ============================================================================
// Extension Registration
// ============================================================================

export default function lumenTaskExtension(pi: ExtensionAPI): void {
	let cwd = process.cwd();
	let agents: AgentConfig[] = [];
	const taskEventBus = createEventBus();

	pi.on("session_start", (_event, ctx) => {
		cwd = ctx.cwd;
		agents = discoverAgents(cwd);
	});

	pi.on("session_shutdown", () => {
		taskEventBus.clear();
	});

	pi.registerTool({
		name: "task",
		label: "Task",
		description:
			"Execute tasks using specialized sub-agents (from .lumen/agents/). " +
			"Each task runs in parallel with its own context. " +
			"Use this for delegating work to explore, worker, reviewer, or other configured agents. " +
			"Prefer this over running many sequential tool calls yourself when the work can be parallelized.",
		promptSnippet: "task — delegate work to specialized sub-agents (parallel execution)",
		promptGuidelines: [
			"Use task for work that benefits from specialization (explore for research, worker for implementation).",
			"Each task gets its own agent with independent context — keep assignments self-contained.",
			"Use the context field for shared background that all tasks need.",
			"Prefer fewer, well-scoped tasks over many tiny ones.",
		],
		parameters: TaskParams,

		async execute(
			_toolCallId: string,
			params: { agent: string; context?: string; tasks: TaskItem[] },
			signal: AbortSignal | undefined,
			onUpdate: ((result: AgentToolResult<TaskToolDetails>) => void) | undefined,
			ctx: ExtensionContext,
		) {
			// Re-discover agents
			agents = discoverAgents(cwd);

			const agentConfig = agents.find((a) => a.name === params.agent);
			if (!agentConfig) {
				const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
				return {
					content: [{ type: "text" as const, text: `Unknown agent: "${params.agent}". Available: ${available}` }],
					details: { results: [], totalDurationMs: 0 } as TaskToolDetails,
				};
			}

			if (params.tasks.length === 0) {
				return {
					content: [{ type: "text" as const, text: "No tasks provided." }],
					details: { results: [], totalDurationMs: 0 } as TaskToolDetails,
				};
			}

			// Get model and tools from parent context
			const model = ctx.model;
			if (!model) {
				return {
					content: [{ type: "text" as const, text: "No model available." }],
					details: { results: [], totalDurationMs: 0 } as TaskToolDetails,
				};
			}

			// Create tools for sub-agents (all built-in tools)
			const allTools = Object.values(createAllTools(cwd));

			const startTime = Date.now();
			const progressMap = new Map<string, SubagentProgress>();

			// Progress update callback
			const emitUpdate = () => {
				if (!onUpdate) return;
				const results: TaskResult[] = [];
				onUpdate({
					content: [{ type: "text" as const, text: "Running..." }],
					details: {
						results,
						totalDurationMs: Date.now() - startTime,
						progress: Array.from(progressMap.values()),
					},
				});
			};

			// Execute tasks in parallel
			const promises = params.tasks.map((task, index) =>
				executeSubagent({
					agentConfig,
					task,
					index,
					cwd,
					model,
					getApiKey: (provider: string) => ctx.modelRegistry.getApiKeyForProvider(provider),
					tools: allTools,
					context: params.context,
					signal,
					eventBus: taskEventBus,
					onProgress: (p) => {
						progressMap.set(p.id, p);
						emitUpdate();
					},
				}),
			);

			const results = await Promise.all(promises);
			const totalDurationMs = Date.now() - startTime;

			// Format output
			const outputParts: string[] = [];
			for (const result of results) {
				if (result.error) {
					outputParts.push(`[${result.id}] FAILED: ${result.error}`);
				} else {
					outputParts.push(`[${result.id}] ${result.output}`);
				}
			}

			const hasErrors = results.some((r) => r.exitCode !== 0);

			return {
				content: [{ type: "text" as const, text: outputParts.join("\n\n---\n\n") }],
				details: { results, totalDurationMs, progress: Array.from(progressMap.values()) } as TaskToolDetails,
				...(hasErrors ? {} : {}),
			};
		},

		renderShell: "self" as const,

		renderCall(args: { agent?: string; tasks?: TaskItem[] }, _theme, context) {
			const state = context.state as TaskRenderState;
			if (!state.progressMap) {
				state.progressMap = new Map();
			}

			const agentName = args.agent ?? "?";
			const taskCount = args.tasks?.length ?? 0;
			const noun = taskCount === 1 ? "task" : "tasks";

			// Determine overall status
			const allDone =
				state.progressMap.size > 0 &&
				Array.from(state.progressMap.values()).every(
					(p) => p.status === "completed" || p.status === "failed" || p.status === "aborted",
				);
			const hasError = Array.from(state.progressMap.values()).some((p) => p.status === "failed");

			let icon: string;
			if (context.isError || hasError) {
				icon = "error";
			} else if (allDone) {
				icon = "success";
			} else if (context.executionStarted) {
				icon = "running";
			} else {
				icon = "pending";
			}

			const line = renderStatusLine(
				{
					icon: icon as any,
					title: `task`,
					titleColor: "toolTitle",
					description: `${agentName} \u00B7 ${taskCount} ${noun}`,
				},
				theme,
			);

			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(line);
			return text;
		},

		renderResult(result, options: ToolRenderResultOptions, _theme, context) {
			const state = context.state as TaskRenderState;
			if (!state.progressMap) {
				state.progressMap = new Map();
			}

			const details = result.details as TaskToolDetails | undefined;

			// Update progress from details
			if (details?.progress) {
				for (const p of details.progress) {
					state.progressMap.set(p.id, p);
				}
			}

			// Start interval for spinner animation during partial results
			if (options.isPartial && !state.interval) {
				state.startedAt ??= Date.now();
				state.interval = setInterval(() => context.invalidate(), 80);
			}
			if (!options.isPartial && state.interval) {
				clearInterval(state.interval);
				state.interval = undefined;
			}

			// Render tree progress
			const lines = renderTaskProgress(state.progressMap, options.expanded);

			if (!options.isPartial && details) {
				const totalDuration = formatDuration(details.totalDurationMs);
				const totalTokens = details.results.reduce((sum, r) => sum + r.tokens, 0);
				const meta = [totalDuration];
				if (totalTokens > 0) meta.push(`${totalTokens} tokens`);
				lines.push(theme.fg("dim", `  ${meta.join(" \u00B7 ")}`));
			}

			return {
				render: () => (lines.length > 0 ? lines : [""]),
				invalidate: () => {},
			};
		},
	} as ToolDefinition);
}
