/**
 * System prompt construction and project context loading
 */

import { getDocsPath, getExamplesPath, getReadmePath } from "../config.js";
import { formatSkillsForPrompt, type Skill } from "./skills.js";

export interface BuildSystemPromptOptions {
	/** Custom system prompt (replaces default). */
	customPrompt?: string;
	/** Tools to include in prompt. Default: [read, bash, edit, write] */
	selectedTools?: string[];
	/** Optional one-line tool snippets keyed by tool name. */
	toolSnippets?: Record<string, string>;
	/** Additional guideline bullets appended to the default system prompt guidelines. */
	promptGuidelines?: string[];
	/** Text to append to system prompt. */
	appendSystemPrompt?: string;
	/** Working directory. */
	cwd: string;
	/** Pre-loaded context files. */
	contextFiles?: Array<{ path: string; content: string }>;
	/** Pre-loaded skills. */
	skills?: Skill[];
}

export type SystemPromptSection = "basePrompt" | "appendPrompt" | "projectContext" | "skills" | "runtimeContext";

export interface BuiltSystemPrompt {
	text: string;
	sections: Partial<Record<SystemPromptSection, string>>;
}

function buildProjectContextSection(contextFiles: Array<{ path: string; content: string }>): string {
	if (contextFiles.length === 0) {
		return "";
	}

	let section = "\n\n# Project Context\n\n";
	section += "Project-specific instructions and guidelines:\n\n";
	for (const { path: filePath, content } of contextFiles) {
		section += `## ${filePath}\n\n${content}\n\n`;
	}
	return section;
}

function buildRuntimeContextSection(date: string, promptCwd: string): string {
	return `\nCurrent date: ${date}\nCurrent working directory: ${promptCwd}`;
}

function buildDefaultBasePrompt(
	selectedTools: string[] | undefined,
	toolSnippets: Record<string, string> | undefined,
	promptGuidelines: string[] | undefined,
): string {
	const readmePath = getReadmePath();
	const docsPath = getDocsPath();
	const examplesPath = getExamplesPath();

	const tools = selectedTools || ["read", "bash", "edit", "write"];
	const visibleTools = tools.filter((name) => !!toolSnippets?.[name]);
	const toolsList =
		visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets![name]}`).join("\n") : "(none)";

	const guidelinesList: string[] = [];
	const guidelinesSet = new Set<string>();
	const addGuideline = (guideline: string): void => {
		if (guidelinesSet.has(guideline)) {
			return;
		}
		guidelinesSet.add(guideline);
		guidelinesList.push(guideline);
	};

	const hasBash = tools.includes("bash");
	const hasGrep = tools.includes("grep");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");

	if (hasBash && !hasGrep && !hasFind && !hasLs) {
		addGuideline("Use bash for file operations like ls, rg, find");
	} else if (hasBash && (hasGrep || hasFind || hasLs)) {
		addGuideline("Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)");
	}

	for (const guideline of promptGuidelines ?? []) {
		const normalized = guideline.trim();
		if (normalized.length > 0) {
			addGuideline(normalized);
		}
	}

	addGuideline("Be concise in your responses");
	addGuideline("Show file paths clearly when working with files");

	const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

	return `You are an expert coding assistant operating inside Lumen, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
${toolsList}

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
${guidelines}

Lumen documentation (read only when the user asks about Lumen itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${readmePath}
- Additional docs: ${docsPath}
- Examples: ${examplesPath} (extensions, custom tools, SDK)
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), packages (docs/packages.md)
- When working on Lumen topics, read the docs and examples, and follow .md cross-references before implementing
- Always read Lumen .md files completely and follow links to related docs (e.g., tui.md for TUI API details)

# Language Rules
- Respond in Chinese (Simplified) by default unless the user explicitly uses another language
- Code comments may remain in English for readability
- Error messages and status output should be in Chinese`;
}

/** Build the system prompt with explicit section boundaries. */
export function buildSystemPromptWithSections(options: BuildSystemPromptOptions): BuiltSystemPrompt {
	const {
		customPrompt,
		selectedTools,
		toolSnippets,
		promptGuidelines,
		appendSystemPrompt,
		cwd,
		contextFiles: providedContextFiles,
		skills: providedSkills,
	} = options;
	const promptCwd = cwd.replace(/\\/g, "/");

	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const date = `${year}-${month}-${day}`;

	const contextFiles = providedContextFiles ?? [];
	const skills = providedSkills ?? [];
	const hasRead = !selectedTools || selectedTools.includes("read");

	const basePrompt = customPrompt ?? buildDefaultBasePrompt(selectedTools, toolSnippets, promptGuidelines);
	const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";
	const projectContextSection = buildProjectContextSection(contextFiles);
	const skillsSection = hasRead && skills.length > 0 ? formatSkillsForPrompt(skills) : "";
	const runtimeContextSection = buildRuntimeContextSection(date, promptCwd);

	let text = basePrompt;
	if (appendSection) {
		text += appendSection;
	}
	if (projectContextSection) {
		text += projectContextSection;
	}
	if (skillsSection) {
		text += skillsSection;
	}
	text += runtimeContextSection;

	return {
		text,
		sections: {
			basePrompt,
			...(appendSection ? { appendPrompt: appendSection } : {}),
			...(projectContextSection ? { projectContext: projectContextSection } : {}),
			...(skillsSection ? { skills: skillsSection } : {}),
			runtimeContext: runtimeContextSection,
		},
	};
}

/** Build the final main system prompt text. */
export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
	return buildSystemPromptWithSections(options).text;
}
