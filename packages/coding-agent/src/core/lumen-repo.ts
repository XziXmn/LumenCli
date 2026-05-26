/**
 * Lumen Repo Clone + Overview
 *
 * 克隆外部仓库到缓存目录，并提供项目概览分析。
 * - repo_clone: 克隆/缓存外部仓库
 * - repo_overview: 分析项目结构、生态系统、入口文件
 *
 * [Provenance] 来源: opencode src/tool/repo_clone.ts + repo_overview.ts
 * [Provenance] 移植方式: 参考重写，适配 extension API
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext, ToolRenderResultOptions } from "./extensions/types.ts";

// ============================================================================
// Constants
// ============================================================================

interface RepoCloneDetails {
	repository: string;
	localPath: string;
	status: "cloned" | "cached" | "refreshed" | "error";
	branch?: string;
	head?: string;
}

interface RepoOverviewDetails {
	path: string;
	ecosystems: string[];
	packageManager?: string;
	dependencyFiles: string[];
	entrypoints: string[];
	truncated: boolean;
}

const REPOS_DIR = join(homedir(), ".lumen", "agent", "repos");

const IGNORED_DIRS = new Set([
	".git",
	"node_modules",
	"__pycache__",
	".venv",
	"dist",
	"build",
	".next",
	"target",
	"vendor",
	".cache",
	".turbo",
]);

const DEPENDENCY_FILES = [
	"package.json",
	"package-lock.json",
	"bun.lock",
	"pnpm-lock.yaml",
	"yarn.lock",
	"requirements.txt",
	"pyproject.toml",
	"go.mod",
	"Cargo.toml",
	"Gemfile",
	"build.gradle",
	"pom.xml",
	"composer.json",
	"Makefile",
	"CMakeLists.txt",
];

const STRUCTURE_LIMIT = 200;

// ============================================================================
// Helpers
// ============================================================================

function runGit(args: string[], cwd: string): { exitCode: number; stdout: string; stderr: string } {
	try {
		const stdout = execSync(`git ${args.join(" ")}`, {
			cwd,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			timeout: 60000,
		}).trim();
		return { exitCode: 0, stdout, stderr: "" };
	} catch (err: any) {
		return {
			exitCode: err.status ?? 1,
			stdout: (err.stdout ?? "").toString().trim(),
			stderr: (err.stderr ?? "").toString().trim(),
		};
	}
}

/**
 * Parse repository reference: GitHub shorthand, git URL, or local path.
 */
function parseRepoRef(input: string): { remote: string; label: string; cacheDir: string } | null {
	const trimmed = input.trim();

	// GitHub shorthand: owner/repo
	if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
		const remote = `https://github.com/${trimmed}.git`;
		const hash = createHash("md5").update(remote).digest("hex").slice(0, 8);
		return { remote, label: trimmed, cacheDir: join(REPOS_DIR, `${trimmed.replace("/", "_")}-${hash}`) };
	}

	// Git URL (https:// or git@)
	if (trimmed.startsWith("https://") || trimmed.startsWith("git@") || trimmed.startsWith("ssh://")) {
		const label = trimmed
			.replace(/^(https?:\/\/|git@|ssh:\/\/)/, "")
			.replace(/\.git$/, "")
			.replace(/:/g, "/");
		const hash = createHash("md5").update(trimmed).digest("hex").slice(0, 8);
		const safeName = label.replace(/[^a-zA-Z0-9_.-]/g, "_");
		return { remote: trimmed, label, cacheDir: join(REPOS_DIR, `${safeName}-${hash}`) };
	}

	return null;
}

function detectEcosystems(topLevelFiles: Set<string>): string[] {
	const eco: string[] = [];
	if (topLevelFiles.has("package.json")) eco.push("Node.js");
	if (topLevelFiles.has("pyproject.toml") || topLevelFiles.has("requirements.txt")) eco.push("Python");
	if (topLevelFiles.has("go.mod")) eco.push("Go");
	if (topLevelFiles.has("Cargo.toml")) eco.push("Rust");
	if (topLevelFiles.has("Gemfile")) eco.push("Ruby");
	if (topLevelFiles.has("build.gradle") || topLevelFiles.has("pom.xml")) eco.push("Java/Kotlin");
	if (topLevelFiles.has("composer.json")) eco.push("PHP");
	if (topLevelFiles.has("CMakeLists.txt") || topLevelFiles.has("Makefile")) eco.push("C/C++");
	return eco;
}

function detectPackageManager(topLevelFiles: Set<string>): string | undefined {
	if (topLevelFiles.has("bun.lock")) return "bun";
	if (topLevelFiles.has("pnpm-lock.yaml")) return "pnpm";
	if (topLevelFiles.has("yarn.lock")) return "yarn";
	if (topLevelFiles.has("package-lock.json")) return "npm";
	return undefined;
}

function buildStructureTree(dir: string, maxDepth: number): { lines: string[]; truncated: boolean } {
	const lines: string[] = [];
	let truncated = false;

	function visit(currentDir: string, depth: number, prefix: string): void {
		if (depth >= maxDepth || lines.length >= STRUCTURE_LIMIT) {
			truncated = truncated || lines.length >= STRUCTURE_LIMIT;
			return;
		}

		let entries: string[];
		try {
			entries = readdirSync(currentDir);
		} catch {
			return;
		}

		// Sort: directories first, then alphabetical
		const sorted = entries
			.filter((e) => !IGNORED_DIRS.has(e) && !e.startsWith("."))
			.map((name) => {
				const fullPath = join(currentDir, name);
				let isDir = false;
				try {
					isDir = statSync(fullPath).isDirectory();
				} catch {}
				return { name, fullPath, isDir };
			})
			.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));

		for (const entry of sorted) {
			if (lines.length >= STRUCTURE_LIMIT) {
				truncated = true;
				return;
			}
			lines.push(`${prefix}${entry.name}${entry.isDir ? "/" : ""}`);
			if (entry.isDir) {
				visit(entry.fullPath, depth + 1, `${prefix}  `);
			}
		}
	}

	visit(dir, 0, "");
	return { lines, truncated };
}

// ============================================================================
// Schemas
// ============================================================================

const RepoCloneParams = Type.Object(
	{
		repository: Type.String({
			description: "Repository to clone: GitHub owner/repo shorthand, git URL (https:// or git@)",
		}),
		refresh: Type.Optional(Type.Boolean({ description: "When true, fetches latest remote state into cache" })),
		branch: Type.Optional(Type.String({ description: "Branch or ref to checkout" })),
	},
	{ description: "Clone an external repository into the local cache" },
);

const RepoOverviewParams = Type.Object(
	{
		path: Type.Optional(Type.String({ description: "Directory path to inspect (absolute or relative to cwd)" })),
		repository: Type.Optional(
			Type.String({ description: "Cached repository to inspect (GitHub shorthand or git URL)" }),
		),
		depth: Type.Optional(Type.Number({ description: "Maximum structure depth (1-6, default 3)" })),
	},
	{ description: "Analyze a repository or directory structure" },
);

// ============================================================================
// Extension
// ============================================================================

export default function lumenRepoExtension(pi: ExtensionAPI): void {
	// repo_clone tool
	pi.registerTool({
		name: "repo_clone",
		label: "Repo Clone",
		description:
			"Clone an external repository into a local cache for inspection. " +
			"Supports GitHub shorthand (owner/repo), git URLs (https:// or git@). " +
			"Cached repos are reused on subsequent calls unless refresh=true.",
		promptSnippet: "repo_clone — clone external repos for inspection",
		parameters: RepoCloneParams,

		async execute(
			_toolCallId: string,
			params: { repository: string; refresh?: boolean; branch?: string },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			_ctx: ExtensionContext,
		) {
			const ref = parseRepoRef(params.repository);
			if (!ref) {
				return {
					content: [
						{
							type: "text" as const,
							text: "Error: Invalid repository reference. Use GitHub owner/repo shorthand or a git URL.",
						},
					],
					details: {
						repository: params.repository,
						localPath: "",
						status: "error",
					} as RepoCloneDetails,
				};
			}

			// Ensure cache directory exists
			if (!existsSync(dirname(ref.cacheDir))) {
				mkdirSync(dirname(ref.cacheDir), { recursive: true });
			}

			const alreadyCached = existsSync(join(ref.cacheDir, ".git"));
			let status: "cloned" | "cached" | "refreshed";

			if (alreadyCached && !params.refresh) {
				status = "cached";
			} else if (alreadyCached && params.refresh) {
				// Fetch latest
				const fetch = runGit(["fetch", "--all", "--prune"], ref.cacheDir);
				if (fetch.exitCode !== 0) {
					return {
						content: [{ type: "text" as const, text: `Error fetching: ${fetch.stderr}` }],
						details: {
							repository: ref.label,
							localPath: ref.cacheDir,
							status: "error",
						} as RepoCloneDetails,
					};
				}

				// Reset to target branch
				const target = params.branch ? `origin/${params.branch}` : "origin/HEAD";
				runGit(["reset", "--hard", target], ref.cacheDir);
				status = "refreshed";
			} else {
				// Fresh clone
				const cloneArgs = ["clone", "--depth", "100"];
				if (params.branch) cloneArgs.push("--branch", params.branch);
				cloneArgs.push("--", ref.remote, ref.cacheDir);

				const clone = runGit(cloneArgs, dirname(ref.cacheDir));
				if (clone.exitCode !== 0) {
					return {
						content: [{ type: "text" as const, text: `Error cloning: ${clone.stderr}` }],
						details: {
							repository: ref.label,
							localPath: ref.cacheDir,
							status: "error",
						} as RepoCloneDetails,
					};
				}
				status = "cloned";
			}

			// Get HEAD info
			const head = runGit(["rev-parse", "--short", "HEAD"], ref.cacheDir);
			const branch = runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], ref.cacheDir);

			const lines = [
				`Repository: ${ref.label}`,
				`Status: ${status}`,
				`Local path: ${ref.cacheDir}`,
				...(branch.exitCode === 0 ? [`Branch: ${branch.stdout}`] : []),
				...(head.exitCode === 0 ? [`HEAD: ${head.stdout}`] : []),
			];

			return {
				content: [{ type: "text" as const, text: lines.join("\n") }],
				details: {
					repository: ref.label,
					localPath: ref.cacheDir,
					status,
					branch: branch.exitCode === 0 ? branch.stdout : undefined,
					head: head.exitCode === 0 ? head.stdout : undefined,
				} as RepoCloneDetails,
			};
		},

		renderCall(args: { repository?: string }, theme, _context) {
			const text = theme.fg("toolTitle", theme.bold("repo_clone ")) + theme.fg("muted", args.repository ?? "");
			return new Text(text, 0, 0);
		},

		renderResult(result, _options: ToolRenderResultOptions, theme, _context) {
			const text = result.content[0];
			const content = text?.type === "text" ? (text.text ?? "") : "";
			const firstLine = content.split("\n")[0] ?? "";
			return new Text(theme.fg("success", "\u2713 ") + theme.fg("muted", firstLine), 0, 0);
		},
	});

	// repo_overview tool
	pi.registerTool({
		name: "repo_overview",
		label: "Repo Overview",
		description:
			"Analyze a repository or directory: detect ecosystems, package manager, dependency files, " +
			"entry points, and directory structure. Use after repo_clone or on any local directory.",
		promptSnippet: "repo_overview — analyze project structure and ecosystems",
		parameters: RepoOverviewParams,

		async execute(
			_toolCallId: string,
			params: { path?: string; repository?: string; depth?: number },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			ctx: ExtensionContext,
		) {
			let targetPath: string;

			if (params.path) {
				targetPath = resolve(ctx.cwd, params.path);
			} else if (params.repository) {
				const ref = parseRepoRef(params.repository);
				if (!ref) {
					return {
						content: [{ type: "text" as const, text: "Error: Invalid repository reference." }],
						details: {
							path: "",
							ecosystems: [],
							dependencyFiles: [],
							entrypoints: [],
							truncated: false,
						} as RepoOverviewDetails,
					};
				}
				if (!existsSync(ref.cacheDir)) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Error: Repository not cached. Use repo_clone first: ${params.repository}`,
							},
						],
						details: {
							path: ref.cacheDir,
							ecosystems: [],
							dependencyFiles: [],
							entrypoints: [],
							truncated: false,
						} as RepoOverviewDetails,
					};
				}
				targetPath = ref.cacheDir;
			} else {
				targetPath = ctx.cwd;
			}

			if (!existsSync(targetPath)) {
				return {
					content: [{ type: "text" as const, text: `Error: Directory not found: ${targetPath}` }],
					details: {
						path: targetPath,
						ecosystems: [],
						dependencyFiles: [],
						entrypoints: [],
						truncated: false,
					} as RepoOverviewDetails,
				};
			}

			const depth = params.depth && params.depth >= 1 && params.depth <= 6 ? params.depth : 3;

			// Read top-level entries
			let topEntries: string[];
			try {
				topEntries = readdirSync(targetPath);
			} catch {
				return {
					content: [{ type: "text" as const, text: `Error: Cannot read directory: ${targetPath}` }],
					details: {
						path: targetPath,
						ecosystems: [],
						dependencyFiles: [],
						entrypoints: [],
						truncated: false,
					} as RepoOverviewDetails,
				};
			}

			const topLevelFiles = new Set(topEntries);
			const depFiles = DEPENDENCY_FILES.filter((f) => topLevelFiles.has(f));
			const eco = detectEcosystems(topLevelFiles);
			const pkgMgr = detectPackageManager(topLevelFiles);

			// Detect entrypoints from package.json
			const entrypoints: string[] = [];
			const pkgJsonPath = join(targetPath, "package.json");
			if (existsSync(pkgJsonPath)) {
				try {
					const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
					if (pkg.main) entrypoints.push(`main: ${pkg.main}`);
					if (pkg.module) entrypoints.push(`module: ${pkg.module}`);
					if (pkg.types) entrypoints.push(`types: ${pkg.types}`);
					if (typeof pkg.bin === "string") entrypoints.push(`bin: ${pkg.bin}`);
					if (pkg.bin && typeof pkg.bin === "object") {
						for (const name of Object.keys(pkg.bin).slice(0, 5)) {
							entrypoints.push(`bin: ${name}`);
						}
					}
				} catch {}
			}

			// Git info
			const branch = runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], targetPath);
			const head = runGit(["rev-parse", "--short", "HEAD"], targetPath);

			// Structure tree
			const { lines: structureLines, truncated } = buildStructureTree(targetPath, depth);

			const output: string[] = [
				`Path: ${targetPath}`,
				...(branch.exitCode === 0 ? [`Branch: ${branch.stdout}`] : []),
				...(head.exitCode === 0 ? [`HEAD: ${head.stdout}`] : []),
				...(eco.length > 0 ? [`Ecosystems: ${eco.join(", ")}`] : []),
				...(pkgMgr ? [`Package manager: ${pkgMgr}`] : []),
				...(depFiles.length > 0 ? [`Dependency files: ${depFiles.join(", ")}`] : []),
				...(entrypoints.length > 0 ? ["Entrypoints:", ...entrypoints.map((e) => `  - ${e}`)] : []),
				"",
				"Structure:",
				...structureLines,
				...(truncated ? ["  ... (truncated)"] : []),
			];

			return {
				content: [{ type: "text" as const, text: output.join("\n") }],
				details: {
					path: targetPath,
					ecosystems: eco,
					packageManager: pkgMgr,
					dependencyFiles: depFiles,
					entrypoints,
					truncated,
				} as RepoOverviewDetails,
			};
		},

		renderCall(args: { path?: string; repository?: string }, theme, _context) {
			const target = args.repository ?? args.path ?? ".";
			const text = theme.fg("toolTitle", theme.bold("repo_overview ")) + theme.fg("muted", target);
			return new Text(text, 0, 0);
		},

		renderResult(result, options: ToolRenderResultOptions, theme, _context) {
			const details = result.details as RepoOverviewDetails | undefined;
			if (!details) {
				const text = result.content[0];
				const content = text?.type === "text" ? (text.text ?? "") : "";
				return new Text(theme.fg("muted", content.split("\n")[0] ?? ""), 0, 0);
			}

			// Compact one-line summary (Claude Code style)
			const parts: string[] = [];
			if (details.ecosystems?.length) parts.push(details.ecosystems.join(", "));
			if (details.packageManager) parts.push(details.packageManager);
			const summary = parts.length > 0 ? parts.join(" \u00B7 ") : "analyzed";

			if (options.expanded) {
				// Expanded: show full output
				const text = result.content[0];
				const content = text?.type === "text" ? (text.text ?? "") : "";
				return new Text(theme.fg("muted", content), 0, 0);
			}

			return new Text(theme.fg("dim", summary), 0, 0);
		},
	});
}
