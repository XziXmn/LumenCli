/**
 * Lumen Agent System
 *
 * 子 agent 派发系统。主 agent 可以通过 agent tool 将任务委派给专门的子 agent。
 * 每个子 agent 有独立的 context window、tools 限制和 system prompt。
 *
 * 执行方式：进程外（spawn `lumen -p --mode json --no-session`）
 * 这样完全不碰 Pi 内部 API，零合并冲突风险。
 *
 * [Provenance] 来源: Pi examples/extensions/subagent/ + opencode agent 设计理念
 * [Provenance] 移植方式: 参考重写
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
import { APP_NAME, CONFIG_DIR_NAME, getAgentDir, LEGACY_CONFIG_DIR_NAME } from "../config.js";
import type { ExtensionAPI, ToolDefinition } from "./extensions/types.js";

// ============================================================================
// Types
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

interface SingleResult {
	agent: string;
	task: string;
	exitCode: number;
	output: string;
	stderr: string;
	tokens: number;
	durationMs: number;
}

interface AgentToolDetails {
	mode: "single" | "parallel" | "chain";
	results: SingleResult[];
}

// ============================================================================
// Agent Discovery
// ============================================================================

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

function discoverAgents(cwd: string): AgentConfig[] {
	const userDir = join(getAgentDir(), "agents");
	const projectDir = join(cwd, CONFIG_DIR_NAME, "agents");
	const legacyDir = join(cwd, LEGACY_CONFIG_DIR_NAME, "agents");

	const userAgents = loadAgentsFromDir(userDir, "user");
	const projectAgents = [...loadAgentsFromDir(projectDir, "project"), ...loadAgentsFromDir(legacyDir, "project")];

	// Project agents override user agents with same name
	const agentMap = new Map<string, AgentConfig>();
	for (const agent of userAgents) agentMap.set(agent.name, agent);
	for (const agent of projectAgents) agentMap.set(agent.name, agent);

	return Array.from(agentMap.values());
}

// ============================================================================
// Agent Runner (process-external)
// ============================================================================

function getLumenBinary(): { command: string; args: string[] } {
	// Try to find the current script to re-invoke
	const currentScript = process.argv[1];
	if (currentScript && existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript] };
	}
	return { command: APP_NAME, args: [] };
}

async function runSingleAgent(
	agent: AgentConfig,
	task: string,
	cwd: string,
	signal: AbortSignal | undefined,
	onUpdate?: (partial: string) => void,
): Promise<SingleResult> {
	const startTime = Date.now();
	const result: SingleResult = {
		agent: agent.name,
		task,
		exitCode: 0,
		output: "",
		stderr: "",
		tokens: 0,
		durationMs: 0,
	};

	const binary = getLumenBinary();
	const args = [...binary.args, "--mode", "json", "-p", "--no-session"];
	if (agent.model) args.push("--model", agent.model);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

	// Write system prompt to temp file
	let tmpDir: string | undefined;
	if (agent.systemPrompt) {
		tmpDir = join(homedir(), ".lumen", "agent", "tmp");
		if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
		const tmpFile = join(tmpDir, `agent-${agent.name}-${Date.now()}.md`);
		writeFileSync(tmpFile, agent.systemPrompt, "utf8");
		args.push("--append-system-prompt", tmpFile);
	}

	args.push(`Task: ${task}`);

	return new Promise<SingleResult>((resolvePromise) => {
		const proc = spawn(binary.command, args, {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		proc.stdout?.on("data", (data: Buffer) => {
			const chunk = data.toString();
			stdout += chunk;
			// Try to parse JSON lines for streaming progress
			for (const line of chunk.split("\n")) {
				if (!line.trim()) continue;
				try {
					const msg = JSON.parse(line);
					if (msg.type === "assistant" && msg.message?.content) {
						for (const block of msg.message.content) {
							if (block.type === "text" && block.text) {
								onUpdate?.(block.text);
							}
						}
					}
					if (msg.message?.usage?.totalTokens) {
						result.tokens = msg.message.usage.totalTokens;
					}
				} catch {
					// Not JSON, ignore
				}
			}
		});

		proc.stderr?.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		const abortHandler = () => {
			proc.kill("SIGTERM");
		};
		signal?.addEventListener("abort", abortHandler);

		proc.on("close", (code) => {
			signal?.removeEventListener("abort", abortHandler);
			result.exitCode = code ?? 1;
			result.stderr = stderr;
			result.durationMs = Date.now() - startTime;

			// Extract final text output from JSON messages
			const outputLines: string[] = [];
			for (const line of stdout.split("\n")) {
				if (!line.trim()) continue;
				try {
					const msg = JSON.parse(line);
					if (msg.type === "assistant" && msg.message?.content) {
						for (const block of msg.message.content) {
							if (block.type === "text" && block.text) {
								outputLines.push(block.text);
							}
						}
					}
				} catch {
					// Not JSON
				}
			}
			result.output = outputLines.join("\n") || stderr || "(no output)";

			// Cleanup temp file
			if (tmpDir) {
				try {
					const tmpFile = join(tmpDir, `agent-${agent.name}-${Date.now()}.md`);
					if (existsSync(tmpFile)) {
						// Don't delete immediately, let it be cleaned up later
					}
				} catch {
					// Ignore cleanup errors
				}
			}

			resolvePromise(result);
		});

		proc.on("error", (error) => {
			signal?.removeEventListener("abort", abortHandler);
			result.exitCode = 1;
			result.stderr = error.message;
			result.durationMs = Date.now() - startTime;
			result.output = `Error spawning agent: ${error.message}`;
			resolvePromise(result);
		});
	});
}

// ============================================================================
// Extension Registration
// ============================================================================

const AgentToolParams = Type.Object({
	agent: Type.String({ description: "要使用的 agent 类型名称" }),
	task: Type.String({ description: "要执行的任务描述" }),
});

export default function lumenAgentsExtension(pi: ExtensionAPI): void {
	let agents: AgentConfig[] = [];
	let cwd = process.cwd();

	pi.on("session_start", (_event, ctx) => {
		cwd = ctx.cwd;
		agents = discoverAgents(cwd);
	});

	// Register agent tool (LLM-callable)
	pi.registerTool({
		name: "agent",
		label: "Agent",
		description: buildAgentToolDescription([]),
		parameters: AgentToolParams,
		async execute(_toolCallId, params, signal, onUpdate, _ctx) {
			const { agent: agentName, task } = params as { agent: string; task: string };
			// Re-discover agents each invocation (allows editing mid-session)
			agents = discoverAgents(cwd);

			const agentConfig = agents.find((a) => a.name === agentName);
			if (!agentConfig) {
				const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
				return {
					content: [{ type: "text", text: `Unknown agent: "${agentName}". Available: ${available}` }],
					isError: true,
					details: { mode: "single", results: [] } as AgentToolDetails,
				};
			}

			const result = await runSingleAgent(agentConfig, task, cwd, signal, (partial) => {
				onUpdate?.({
					content: [{ type: "text", text: partial }],
					details: { mode: "single", results: [] } as AgentToolDetails,
				});
			});

			const details: AgentToolDetails = { mode: "single", results: [result] };

			if (result.exitCode !== 0) {
				return {
					content: [
						{ type: "text", text: `Agent "${agentName}" failed (exit ${result.exitCode}):\n${result.output}` },
					],
					isError: true,
					details,
				};
			}

			return {
				content: [{ type: "text", text: result.output }],
				details,
			};
		},
	} as ToolDefinition);

	// /agent command for listing available agents
	pi.registerCommand("agent", {
		description: "列出可用的 agents 或查看 agent 详情",
		handler: async (args) => {
			agents = discoverAgents(cwd);
			const name = args.trim();

			if (name) {
				const agent = agents.find((a) => a.name === name);
				if (!agent) {
					pi.sendUserMessage(`未找到 agent "${name}"。使用 /agent 查看可用列表。`);
					return;
				}
				const lines = [
					`**${agent.name}** (${agent.source})`,
					agent.description,
					"",
					agent.tools ? `Tools: ${agent.tools.join(", ")}` : "Tools: all",
					agent.model ? `Model: ${agent.model}` : "Model: inherit",
					agent.filePath ? `File: ${agent.filePath}` : "",
				];
				pi.sendUserMessage(lines.filter(Boolean).join("\n"));
				return;
			}

			if (agents.length === 0) {
				pi.sendUserMessage(
					"没有可用的 agents。\n\n在 `~/.lumen/agent/agents/` 或 `.lumen/agents/` 下创建 .md 文件定义 agent。",
				);
				return;
			}

			const lines = agents.map((a) => `- **${a.name}** (${a.source}): ${a.description}`);
			pi.sendUserMessage(`可用 agents (${agents.length}):\n\n${lines.join("\n")}`);
		},
	});
}

function buildAgentToolDescription(agents: AgentConfig[]): string {
	const base = "派发任务给专门的子 agent 执行。每个 agent 有独立的 context 和 tools。";
	if (agents.length === 0) {
		return `${base} 使用前先用 /agent 命令查看可用 agents。`;
	}
	const list = agents.map((a) => `- ${a.name}: ${a.description}`).join("\n");
	return `${base}\n\nAvailable agents:\n${list}`;
}
