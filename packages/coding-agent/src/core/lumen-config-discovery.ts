/**
 * Lumen Config Discovery
 *
 * 扫描并复用其他 AI 工具的配置文件，注入到 system prompt。
 * 支持: Claude (.claude/CLAUDE.md), Cursor (.cursor/rules/), Codex (codex.md),
 *       MCP (.mcp.json, mcp.json)
 *
 * 设计原则：
 * - 低优先级合并（不覆盖 .lumen/ 自身配置）
 * - 只读取 context/rules 类文件，不读取 secrets 或 auth
 * - LUMEN_DISABLE_EXTERNAL_CONFIG=1 可完全禁用
 *
 * [Provenance] 来源: oh-my-pi src/discovery/ (claude.ts, cursor.ts, mcp-json.ts)
 * [Provenance] 移植方式: 参考重写，大幅简化为单文件 extension
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "./extensions/types.ts";

// ============================================================================
// Types
// ============================================================================

interface DiscoveredConfig {
	source: string;
	path: string;
	content: string;
	level: "user" | "project";
}

// ============================================================================
// Discovery Functions
// ============================================================================

function readFileSafe(filePath: string): string | null {
	try {
		if (!existsSync(filePath)) return null;
		return readFileSync(filePath, "utf8");
	} catch {
		return null;
	}
}

/**
 * Discover CLAUDE.md context files from .claude/ directories.
 */
function discoverClaudeContext(cwd: string): DiscoveredConfig[] {
	const results: DiscoveredConfig[] = [];

	// User-level: ~/.claude/CLAUDE.md
	const userClaudeMd = join(homedir(), ".claude", "CLAUDE.md");
	const userContent = readFileSafe(userClaudeMd);
	if (userContent) {
		results.push({ source: "claude", path: userClaudeMd, content: userContent, level: "user" });
	}

	// Project-level: .claude/CLAUDE.md
	const projectClaudeMd = join(cwd, ".claude", "CLAUDE.md");
	const projectContent = readFileSafe(projectClaudeMd);
	if (projectContent) {
		results.push({ source: "claude", path: projectClaudeMd, content: projectContent, level: "project" });
	}

	return results;
}

/**
 * Discover Cursor rules from .cursor/rules/ directory.
 */
function discoverCursorRules(cwd: string): DiscoveredConfig[] {
	const results: DiscoveredConfig[] = [];

	const rulesDir = join(cwd, ".cursor", "rules");
	if (!existsSync(rulesDir)) return results;

	let files: string[];
	try {
		files = readdirSync(rulesDir).filter((f) => f.endsWith(".mdc") || f.endsWith(".md"));
	} catch {
		return results;
	}

	for (const file of files) {
		const filePath = join(rulesDir, file);
		const content = readFileSafe(filePath);
		if (content) {
			// Parse MDC frontmatter to check alwaysApply
			const parsed = parseMDCFrontmatter(content);
			if (parsed.alwaysApply) {
				results.push({ source: "cursor", path: filePath, content: parsed.body, level: "project" });
			}
		}
	}

	return results;
}

/**
 * Discover Codex instructions (codex.md or AGENTS.md in project root).
 */
function discoverCodexInstructions(cwd: string): DiscoveredConfig[] {
	const results: DiscoveredConfig[] = [];

	const candidates = ["codex.md", "AGENTS.md"];
	for (const filename of candidates) {
		const filePath = join(cwd, filename);
		const content = readFileSafe(filePath);
		if (content) {
			results.push({ source: "codex", path: filePath, content, level: "project" });
			break; // Only use the first one found
		}
	}

	return results;
}

/**
 * Discover MCP server configurations from .mcp.json or mcp.json.
 * We only report their existence (not inject into prompt), since MCP is handled separately.
 */
function discoverMCPConfigs(cwd: string): DiscoveredConfig[] {
	const results: DiscoveredConfig[] = [];

	const candidates = [join(cwd, ".mcp.json"), join(cwd, "mcp.json"), join(cwd, ".claude", "mcp.json")];

	for (const filePath of candidates) {
		const content = readFileSafe(filePath);
		if (content) {
			results.push({ source: "mcp", path: filePath, content, level: "project" });
		}
	}

	return results;
}

// ============================================================================
// MDC Frontmatter Parser
// ============================================================================

interface MDCParsed {
	description?: string;
	globs?: string;
	alwaysApply: boolean;
	body: string;
}

function parseMDCFrontmatter(content: string): MDCParsed {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
	if (!match) return { alwaysApply: false, body: content };

	const frontmatter = match[1];
	const body = match[2];

	let description: string | undefined;
	let globs: string | undefined;
	let alwaysApply = false;

	for (const line of frontmatter.split("\n")) {
		const colonIdx = line.indexOf(":");
		if (colonIdx <= 0) continue;
		const key = line.slice(0, colonIdx).trim().toLowerCase();
		const value = line.slice(colonIdx + 1).trim();

		if (key === "description") description = value;
		else if (key === "globs") globs = value;
		else if (key === "alwaysapply") alwaysApply = value === "true";
	}

	return { description, globs, alwaysApply, body };
}

// ============================================================================
// Extension
// ============================================================================

export default function lumenConfigDiscoveryExtension(pi: ExtensionAPI): void {
	// Check if disabled
	if (process.env.LUMEN_DISABLE_EXTERNAL_CONFIG === "1") return;

	// Inject discovered configs into system prompt
	pi.on("before_agent_start", (event) => {
		const cwd = process.cwd();

		const claudeConfigs = discoverClaudeContext(cwd);
		const cursorRules = discoverCursorRules(cwd);
		const codexInstructions = discoverCodexInstructions(cwd);

		const allConfigs = [...claudeConfigs, ...cursorRules, ...codexInstructions];
		if (allConfigs.length === 0) return;

		const sections: string[] = [];
		sections.push("# External Config (auto-discovered)");
		sections.push("");

		for (const config of allConfigs) {
			const label = `[${config.source}] ${config.path}`;
			sections.push(`## ${label}`);
			sections.push("");
			// Truncate very long configs
			const maxLen = 4000;
			if (config.content.length > maxLen) {
				sections.push(config.content.slice(0, maxLen));
				sections.push(`\n... (truncated, ${config.content.length} chars total)`);
			} else {
				sections.push(config.content);
			}
			sections.push("");
		}

		return {
			systemPrompt: `${event.systemPrompt}\n\n${sections.join("\n")}`,
		};
	});

	// Register /config-discovery command to show what was found
	pi.registerCommand("config-discovery", {
		description: "显示发现的外部 AI 工具配置",
		handler: async () => {
			const cwd = process.cwd();

			const claudeConfigs = discoverClaudeContext(cwd);
			const cursorRules = discoverCursorRules(cwd);
			const codexInstructions = discoverCodexInstructions(cwd);
			const mcpConfigs = discoverMCPConfigs(cwd);

			const allConfigs = [...claudeConfigs, ...cursorRules, ...codexInstructions, ...mcpConfigs];

			if (allConfigs.length === 0) {
				pi.sendUserMessage(
					"未发现外部 AI 工具配置。\n\n支持的来源: .claude/CLAUDE.md, .cursor/rules/*.mdc, codex.md, .mcp.json",
				);
				return;
			}

			const lines: string[] = [];
			lines.push(`发现 ${allConfigs.length} 个外部配置:`);
			lines.push("");

			for (const config of allConfigs) {
				const sizeKb = (config.content.length / 1024).toFixed(1);
				lines.push(`- [${config.source}] ${config.path} (${sizeKb}KB, ${config.level})`);
			}

			lines.push("");
			lines.push("设置 LUMEN_DISABLE_EXTERNAL_CONFIG=1 可禁用外部配置发现。");

			pi.sendUserMessage(lines.join("\n"));
		},
	});
}
