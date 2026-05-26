import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { declineLegacyPiImport, detectLegacyPiImport, importLegacyPiConfig } from "../src/legacy-pi-import.ts";

let mockedHome = "";

vi.mock("os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	return {
		...actual,
		homedir: () => mockedHome,
	};
});

function writeTextFile(filePath: string, contents: string): void {
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, contents);
}

describe("legacy-pi-import", () => {
	let tempDir = "";
	let homeDir: string;
	let cwd: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `lumen-legacy-pi-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		homeDir = join(tempDir, "home");
		cwd = join(tempDir, "project");
		agentDir = join(homeDir, ".lumen", "agent");
		mockedHome = homeDir;
		mkdirSync(join(homeDir, ".pi", "agent"), { recursive: true });
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		mockedHome = "";
		if (tempDir) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("prompts once for legacy config and suppresses repeats after decline", () => {
		writeTextFile(join(homeDir, ".pi", "agent", "settings.json"), JSON.stringify({ theme: "dark" }));
		writeTextFile(join(cwd, ".pi", "settings.json"), JSON.stringify({ theme: "light" }));

		const prompt = detectLegacyPiImport(cwd, agentDir);
		expect(prompt?.scopes).toHaveLength(2);
		expect(prompt?.message).toContain(".lumen");

		if (!prompt) {
			throw new Error("expected legacy import prompt");
		}

		declineLegacyPiImport(prompt);
		expect(detectLegacyPiImport(cwd, agentDir)).toBeUndefined();
	});

	it("imports legacy config into .lumen and rewrites legacy paths", () => {
		writeTextFile(
			join(homeDir, ".pi", "agent", "settings.json"),
			JSON.stringify({
				theme: "dark",
				apiKeys: { anthropic: "legacy-key" },
				shellPath: "~/.pi/agent/bin",
				extensions: ["~/.pi/agent/extensions"],
			}),
		);
		writeTextFile(
			join(homeDir, ".pi", "agent", "oauth.json"),
			JSON.stringify({
				openai: { accessToken: "oauth-token", refreshToken: "refresh-token" },
			}),
		);
		writeTextFile(
			join(cwd, ".pi", "settings.json"),
			JSON.stringify({
				apiKeys: { openrouter: "legacy-project-key" },
				extensions: [".pi/extensions"],
			}),
		);
		writeTextFile(join(cwd, ".pi", "extensions", "answer.ts"), "export default 1;\n");
		writeTextFile(
			join(cwd, ".pi", "skills", "guide", "SKILL.md"),
			"---\nname: guide\ndescription: Guide\n---\nbody\n",
		);
		writeTextFile(join(cwd, ".pi", "prompts", "brief.md"), "# prompt\n");
		writeTextFile(join(cwd, ".pi", "themes", "dark.json"), "{}\n");
		writeTextFile(join(cwd, ".pi", "agents", "reviewer.md"), "---\nname: reviewer\ndescription: Review\n---\nbody\n");
		writeTextFile(join(cwd, ".pi", "rules", "safe.md"), "---\ntools: [read]\n---\nrule body\n");
		writeTextFile(join(cwd, ".pi", "lsp.json"), JSON.stringify({ idleTimeoutMs: 1234 }));

		const prompt = detectLegacyPiImport(cwd, agentDir);
		expect(prompt).toBeDefined();
		if (!prompt) {
			throw new Error("expected legacy import prompt");
		}

		const result = importLegacyPiConfig(cwd, agentDir, prompt);

		expect(result.imported.length).toBeGreaterThan(0);
		expect(result.summaryMessage).toContain(".lumen");

		const userSettings = JSON.parse(readFileSync(join(homeDir, ".lumen", "agent", "settings.json"), "utf8"));
		expect(userSettings.apiKeys).toBeUndefined();
		expect(userSettings.shellPath).toBe("~/.lumen/agent/bin");
		expect(userSettings.extensions).toEqual(["~/.lumen/agent/extensions"]);

		const userAuth = JSON.parse(readFileSync(join(homeDir, ".lumen", "agent", "auth.json"), "utf8"));
		expect(userAuth.anthropic?.type).toBe("api_key");
		expect(userAuth.openai?.type).toBe("oauth");

		const projectSettings = JSON.parse(readFileSync(join(cwd, ".lumen", "settings.json"), "utf8"));
		expect(projectSettings.apiKeys).toBeUndefined();
		expect(projectSettings.extensions).toEqual([".lumen/extensions"]);

		const projectAuth = JSON.parse(readFileSync(join(cwd, ".lumen", "auth.json"), "utf8"));
		expect(projectAuth.openrouter?.type).toBe("api_key");

		expect(existsSync(join(cwd, ".lumen", "extensions", "answer.ts"))).toBe(true);
		expect(existsSync(join(cwd, ".lumen", "skills", "guide", "SKILL.md"))).toBe(true);
		expect(existsSync(join(cwd, ".lumen", "prompts", "brief.md"))).toBe(true);
		expect(existsSync(join(cwd, ".lumen", "themes", "dark.json"))).toBe(true);
		expect(existsSync(join(cwd, ".lumen", "agents", "reviewer.md"))).toBe(true);
		expect(existsSync(join(cwd, ".lumen", "rules", "safe.md"))).toBe(true);
		expect(existsSync(join(cwd, ".lumen", "lsp.json"))).toBe(true);
		expect(existsSync(join(homeDir, ".lumen", "agent", ".pi-import-state.json"))).toBe(true);
		expect(existsSync(join(cwd, ".lumen", ".pi-import-state.json"))).toBe(true);
	});
});
