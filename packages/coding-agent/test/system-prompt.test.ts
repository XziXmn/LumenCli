import { describe, expect, test } from "vitest";
import { buildSystemPrompt, buildSystemPromptWithSections } from "../src/core/system-prompt.js";

describe("buildSystemPrompt", () => {
	describe("empty tools", () => {
		test("shows (none) for empty tools list", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Available tools:\n(none)");
		});

		test("shows file paths guideline even with no tools", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Show file paths clearly");
		});
	});

	describe("default tools", () => {
		test("includes all default tools when snippets are provided", () => {
			const prompt = buildSystemPrompt({
				toolSnippets: {
					read: "Read file contents",
					bash: "Execute bash commands",
					edit: "Make surgical edits",
					write: "Create or overwrite files",
				},
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- read:");
			expect(prompt).toContain("- bash:");
			expect(prompt).toContain("- edit:");
			expect(prompt).toContain("- write:");
		});
	});

	describe("custom tool snippets", () => {
		test("includes custom tools in available tools section when promptSnippet is provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				toolSnippets: {
					dynamic_tool: "Run dynamic test behavior",
				},
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- dynamic_tool: Run dynamic test behavior");
		});

		test("omits custom tools from available tools section when promptSnippet is not provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).not.toContain("dynamic_tool");
		});
	});

	describe("prompt guidelines", () => {
		test("appends promptGuidelines to default guidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for project summaries."],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- Use dynamic_tool for project summaries.");
		});

		test("deduplicates and trims promptGuidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for summaries.", "  Use dynamic_tool for summaries.  ", "   "],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt.match(/- Use dynamic_tool for summaries\./g)).toHaveLength(1);
		});
	});

	describe("prompt layering", () => {
		test("returns explicit section boundaries for the default prompt chain", () => {
			const result = buildSystemPromptWithSections({
				selectedTools: ["read"],
				toolSnippets: { read: "Read file contents" },
				appendSystemPrompt: "APPEND OVERLAY",
				contextFiles: [{ path: "/project/AGENTS.md", content: "Project rules" }],
				skills: [
					{
						name: "review",
						description: "Review code carefully",
						filePath: "/skills/review/SKILL.md",
						baseDir: "/skills/review",
						sourceInfo: { path: "/skills/review/SKILL.md", source: "local", scope: "user", origin: "top-level" },
						disableModelInvocation: false,
					},
				],
				cwd: "/tmp/project",
			});

			expect(result.sections.basePrompt).toContain("You are an expert coding assistant operating inside Lumen");
			expect(result.sections.appendPrompt).toContain("APPEND OVERLAY");
			expect(result.sections.projectContext).toContain("# Project Context");
			expect(result.sections.skills).toContain("<available_skills>");
			expect(result.sections.runtimeContext).toContain("Current working directory: /tmp/project");
			expect(result.text.indexOf(result.sections.basePrompt!)).toBeLessThan(result.text.indexOf("APPEND OVERLAY"));
			expect(result.text.indexOf("APPEND OVERLAY")).toBeLessThan(result.text.indexOf("# Project Context"));
			expect(result.text.indexOf("# Project Context")).toBeLessThan(result.text.indexOf("<available_skills>"));
		});

		test("treats customPrompt as the base layer and keeps append/context/skills separate", () => {
			const result = buildSystemPromptWithSections({
				customPrompt: "CUSTOM BASE",
				appendSystemPrompt: "APPEND OVERLAY",
				contextFiles: [{ path: "/project/AGENTS.md", content: "Project rules" }],
				skills: [],
				cwd: "/tmp/project",
			});

			expect(result.sections.basePrompt).toBe("CUSTOM BASE");
			expect(result.sections.appendPrompt).toContain("APPEND OVERLAY");
			expect(result.sections.projectContext).toContain("# Project Context");
			expect(result.sections.skills).toBeUndefined();
			expect(result.text).toContain("CUSTOM BASE");
			expect(result.text).toContain("APPEND OVERLAY");
			expect(result.text).toContain("Project rules");
		});
	});
});
