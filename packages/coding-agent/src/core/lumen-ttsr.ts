/**
 * Lumen TTSR (Token-efficient Tool-call Streaming Response)
 *
 * 零上下文成本的规则按需注入。规则只在匹配的 tool 被调用或关键词出现时
 * 才注入到 system prompt，平时不占用 token。
 *
 * 规则文件放在 .lumen/rules/ 目录，用 YAML frontmatter 定义触发条件。
 *
 * [Provenance] 来源: oh-my-pi src/prompts/ (ttsrTrigger 概念)
 * [Provenance] 移植方式: 参考重写（简化版）
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, LEGACY_CONFIG_DIR_NAME } from "../config.js";
import type { ExtensionAPI } from "./extensions/types.js";

// ============================================================================
// Types
// ============================================================================

interface TriggerPattern {
	tools?: string[];
	keywords?: string[];
}

interface TtsrRule {
	name: string;
	triggers: TriggerPattern;
	content: string;
	filePath?: string;
}

// ============================================================================
// Rule Loading
// ============================================================================

function parseFrontmatter(text: string): { frontmatter: Record<string, unknown>; body: string } {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
	if (!match) return { frontmatter: {}, body: text };

	const frontmatter: Record<string, unknown> = {};
	let currentKey = "";
	let currentArray: string[] | undefined;

	for (const line of match[1].split("\n")) {
		const trimmed = line.trim();
		if (trimmed.startsWith("- ") && currentArray) {
			currentArray.push(trimmed.slice(2).trim());
		} else {
			if (currentArray && currentKey) {
				frontmatter[currentKey] = currentArray;
				currentArray = undefined;
			}
			const colonIdx = line.indexOf(":");
			if (colonIdx > 0) {
				currentKey = line.slice(0, colonIdx).trim();
				const value = line.slice(colonIdx + 1).trim();
				if (value === "") {
					currentArray = [];
				} else if (value.startsWith("[") && value.endsWith("]")) {
					frontmatter[currentKey] = value
						.slice(1, -1)
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean);
				} else {
					frontmatter[currentKey] = value;
				}
			}
		}
	}
	if (currentArray && currentKey) {
		frontmatter[currentKey] = currentArray;
	}

	return { frontmatter, body: match[2] };
}

function loadRulesFromDir(dir: string): TtsrRule[] {
	if (!existsSync(dir)) return [];

	const rules: TtsrRule[] = [];
	let files: string[];
	try {
		files = readdirSync(dir).filter((f) => f.endsWith(".md"));
	} catch {
		return [];
	}

	for (const file of files) {
		const filePath = join(dir, file);
		try {
			const content = readFileSync(filePath, "utf8");
			const { frontmatter, body } = parseFrontmatter(content);

			const triggers: TriggerPattern = {};
			if (frontmatter.tools) {
				triggers.tools = Array.isArray(frontmatter.tools)
					? frontmatter.tools
					: String(frontmatter.tools)
							.split(",")
							.map((s) => s.trim());
			}
			if (frontmatter.keywords) {
				triggers.keywords = Array.isArray(frontmatter.keywords)
					? frontmatter.keywords
					: String(frontmatter.keywords)
							.split(",")
							.map((s) => s.trim());
			}

			if (body.trim() && (triggers.tools?.length || triggers.keywords?.length)) {
				rules.push({
					name: file.replace(/\.md$/, ""),
					triggers,
					content: body.trim(),
					filePath,
				});
			}
		} catch {}
	}

	return rules;
}

function discoverRules(cwd: string): TtsrRule[] {
	const dirs = [
		join(getAgentDir(), "rules"),
		join(cwd, CONFIG_DIR_NAME, "rules"),
		join(cwd, LEGACY_CONFIG_DIR_NAME, "rules"),
	];

	const allRules: TtsrRule[] = [];
	for (const dir of dirs) {
		allRules.push(...loadRulesFromDir(dir));
	}
	return allRules;
}

// ============================================================================
// Matching
// ============================================================================

function matchesPrompt(rule: TtsrRule, prompt: string): boolean {
	if (!rule.triggers.keywords?.length) return false;
	const lower = prompt.toLowerCase();
	return rule.triggers.keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

// ============================================================================
// Extension
// ============================================================================

export default function lumenTtsrExtension(pi: ExtensionAPI): void {
	let rules: TtsrRule[] = [];
	let cwd = process.cwd();
	let lastInjectedTools = new Set<string>();

	pi.on("session_start", (_event, ctx) => {
		cwd = ctx.cwd;
		rules = discoverRules(cwd);
	});

	// Inject rules based on prompt keywords
	pi.on("before_agent_start", (event) => {
		if (rules.length === 0) return;

		const matched: TtsrRule[] = [];
		for (const rule of rules) {
			if (matchesPrompt(rule, event.prompt)) {
				matched.push(rule);
			}
		}

		if (matched.length === 0) return;

		const injection = matched.map((r) => `<!-- TTSR: ${r.name} -->\n${r.content}`).join("\n\n");
		return {
			systemPrompt: `${event.systemPrompt}\n\n${injection}`,
		};
	});

	// Inject rules based on tool calls
	pi.on("tool_call", (event) => {
		if (rules.length === 0) return;

		// Find rules triggered by this tool
		const triggered = rules.filter(
			(r) => r.triggers.tools?.includes(event.toolName) && !lastInjectedTools.has(r.name),
		);

		if (triggered.length === 0) return;

		// Mark as injected (avoid re-injecting same rule in same session)
		for (const r of triggered) {
			lastInjectedTools.add(r.name);
		}

		// We can't modify system prompt from tool_call, but we can steer
		// by sending a user message with the rules
		const injection = triggered.map((r) => r.content).join("\n\n");
		pi.sendUserMessage(`[规则提醒]\n${injection}`, { deliverAs: "steer" });

		return undefined;
	});

	// Reset on new session
	pi.on("session_start", () => {
		lastInjectedTools = new Set();
	});
}
