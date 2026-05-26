/**
 * Lumen .novel 项目检测与上下文注入
 *
 * 检测 cwd 下的 .novel 目录，自动将项目元数据注入系统提示词。
 * 通过 extension 的 before_agent_start 事件注入上下文。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "./extensions/types.ts";

export interface NovelProjectInfo {
	/** Absolute path to the .novel directory. */
	root: string;
	/** Project title from project.yaml or project.json. */
	title?: string;
	/** Synopsis (first non-empty line of synopsis.md). */
	synopsis?: string;
	/** Manuscript file paths, relative to cwd. */
	manuscriptFiles: string[];
	/** Note file paths, relative to cwd. */
	noteFiles: string[];
}

/**
 * Detect a .novel project at the given cwd.
 * Conventions:
 *   - <cwd>/.novel/project.yaml or project.json (metadata)
 *   - <cwd>/.novel/synopsis.md (short project summary)
 *   - <cwd>/manuscript/ *.md (chapters/scenes)
 *   - <cwd>/notes/ *.md (character, worldbuilding, outline)
 */
export function detectNovelProject(cwd: string): NovelProjectInfo | undefined {
	const novelRoot = join(cwd, ".novel");
	if (!existsSync(novelRoot)) return undefined;

	const info: NovelProjectInfo = {
		root: novelRoot,
		manuscriptFiles: [],
		noteFiles: [],
	};

	// Read project metadata
	const metadataPaths = [
		join(novelRoot, "project.yaml"),
		join(novelRoot, "project.yml"),
		join(novelRoot, "project.json"),
	];
	for (const metaPath of metadataPaths) {
		try {
			const text = readFileSync(metaPath, "utf8");
			const title = extractTitle(text, metaPath);
			if (title) info.title = title;
			break;
		} catch {
			// Try next
		}
	}

	// Read synopsis
	try {
		const synopsis = readFileSync(join(novelRoot, "synopsis.md"), "utf8");
		const firstLine = synopsis.split("\n").find((l) => l.trim().length > 0);
		if (firstLine) info.synopsis = firstLine.trim().replace(/^#+\s*/, "");
	} catch {
		// Optional
	}

	// Discover manuscript + notes
	info.manuscriptFiles = listMarkdownFiles(join(cwd, "manuscript"), cwd);
	info.noteFiles = listMarkdownFiles(join(cwd, "notes"), cwd);

	return info;
}

function extractTitle(text: string, path: string): string | undefined {
	if (path.endsWith(".json")) {
		try {
			const parsed = JSON.parse(text) as Record<string, unknown>;
			if (typeof parsed.title === "string") return parsed.title;
		} catch {
			return undefined;
		}
	}
	// YAML-ish: look for `title:` line
	for (const line of text.split("\n")) {
		const m = line.match(/^title:\s*["']?(.+?)["']?\s*$/);
		if (m) return m[1].trim();
	}
	return undefined;
}

function listMarkdownFiles(dir: string, cwd: string): string[] {
	const results: string[] = [];
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile() && entry.name.endsWith(".md")) {
				const relative = join(dir, entry.name)
					.slice(cwd.length + 1)
					.replace(/\\/g, "/");
				results.push(relative);
			}
		}
	} catch {
		// Directory doesn't exist
	}
	return results.sort();
}

function formatNovelContext(info: NovelProjectInfo): string {
	const lines: string[] = [];
	lines.push("# .novel 写作项目已检测");
	lines.push("");
	if (info.title) lines.push(`标题: ${info.title}`);
	if (info.synopsis) lines.push(`简介: ${info.synopsis}`);
	if (info.manuscriptFiles.length > 0) {
		lines.push(`手稿文件 (${info.manuscriptFiles.length}):`);
		for (const file of info.manuscriptFiles.slice(0, 10)) {
			lines.push(`  - ${file}`);
		}
		if (info.manuscriptFiles.length > 10) {
			lines.push(`  ... (+${info.manuscriptFiles.length - 10} 更多)`);
		}
	}
	if (info.noteFiles.length > 0) {
		lines.push(`笔记文件 (${info.noteFiles.length}):`);
		for (const file of info.noteFiles.slice(0, 5)) {
			lines.push(`  - ${file}`);
		}
		if (info.noteFiles.length > 5) {
			lines.push(`  ... (+${info.noteFiles.length - 5} 更多)`);
		}
	}
	lines.push("");
	lines.push("使用 /plan /draft /review /revise 命令进行写作工作流。");
	lines.push("在写作模式下，优先保持文风一致性和叙事连贯性。");
	return lines.join("\n");
}

/**
 * Extension that detects .novel projects and injects context into the system prompt.
 */
export default function lumenNovelExtension(pi: ExtensionAPI): void {
	let novelInfo: NovelProjectInfo | undefined;

	pi.on("session_start", (_event, ctx) => {
		novelInfo = detectNovelProject(ctx.cwd);
	});

	pi.on("before_agent_start", (event) => {
		if (!novelInfo) return;
		// Append novel context to the system prompt
		const context = formatNovelContext(novelInfo);
		return {
			systemPrompt: `${event.systemPrompt}\n\n${context}`,
		};
	});
}
