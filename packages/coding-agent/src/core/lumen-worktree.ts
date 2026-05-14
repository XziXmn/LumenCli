/**
 * Lumen Worktree Isolation
 *
 * Git worktree helpers for running agents in isolated working directories.
 * Use case: sub-agent modifies files in a worktree, main agent extracts diff
 * and reviews before applying to the main tree.
 *
 * Usage:
 *   const wt = createWorktree("/path/to/repo");
 *   // ... run agent in wt.path ...
 *   const patch = extractPatch(wt.path);
 *   cleanupWorktree(wt);
 *
 * Registers:
 *   - /worktree list — list active worktrees
 *   - /worktree create [branch] — create a new worktree
 *   - /worktree remove <path> — remove a worktree
 *   - /worktree patch <path> — show the diff from a worktree
 *
 * [Provenance] 来源: 自研，灵感来自 opencode + Claude Code 的 parallel agent 设计
 * [Provenance] 移植方式: 自研 (纯 git CLI)
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "./extensions/types.js";

// ============================================================================
// Types
// ============================================================================

export interface WorktreeHandle {
	/** Absolute path to the worktree directory */
	path: string;
	/** Branch name in the worktree */
	branch: string;
	/** Original repo root */
	sourceRepo: string;
	/** Timestamp when created */
	createdAt: number;
}

// ============================================================================
// Git Helpers
// ============================================================================

function git(args: string[], cwd: string): { ok: boolean; output: string; stderr: string } {
	try {
		const output = execSync(`git ${args.join(" ")}`, {
			cwd,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			timeout: 30_000,
		}).trim();
		return { ok: true, output, stderr: "" };
	} catch (error) {
		const err = error as { stdout?: Buffer; stderr?: Buffer };
		const stderr = err.stderr?.toString() ?? "";
		const stdout = err.stdout?.toString() ?? "";
		return { ok: false, output: stdout.trim(), stderr: stderr.trim() };
	}
}

function isGitRepo(cwd: string): boolean {
	return git(["rev-parse", "--git-dir"], cwd).ok;
}

function getRepoRoot(cwd: string): string | undefined {
	const result = git(["rev-parse", "--show-toplevel"], cwd);
	return result.ok ? result.output : undefined;
}

// ============================================================================
// Worktree Lifecycle
// ============================================================================

const WORKTREES_BASE = join(homedir(), ".lumen", "agent", "worktrees");

/**
 * Create a new git worktree at `~/.lumen/agent/worktrees/<repo-hash>/<id>/`
 * attached to a new branch based on the current HEAD.
 *
 * @param sourceRepo - Absolute path to the source repo (must be a git repo)
 * @param branchPrefix - Optional prefix for the branch name
 * @returns Handle with path/branch/sourceRepo/createdAt, or throws on failure
 */
export function createWorktree(sourceRepo: string, branchPrefix = "lumen-agent"): WorktreeHandle {
	if (!isGitRepo(sourceRepo)) {
		throw new Error(`Not a git repository: ${sourceRepo}`);
	}
	const root = getRepoRoot(sourceRepo);
	if (!root) throw new Error(`Failed to determine repo root for ${sourceRepo}`);

	// Hash the repo path to avoid collisions
	const repoHash = createHash("sha256").update(root).digest("hex").slice(0, 12);
	const timestamp = Date.now().toString(36);
	const id = `${branchPrefix}-${timestamp}`;
	const branch = `${branchPrefix}/${timestamp}`;
	const worktreePath = join(WORKTREES_BASE, repoHash, id);

	if (!existsSync(WORKTREES_BASE)) {
		mkdirSync(WORKTREES_BASE, { recursive: true });
	}

	// Create worktree with new branch based on current HEAD
	const result = git(["worktree", "add", "-b", branch, worktreePath, "HEAD"], root);
	if (!result.ok) {
		throw new Error(`Failed to create worktree: ${result.stderr || "unknown error"}`);
	}

	return {
		path: worktreePath,
		branch,
		sourceRepo: root,
		createdAt: Date.now(),
	};
}

/**
 * Remove a worktree and delete its branch.
 * Use `force=true` to discard uncommitted changes.
 */
export function cleanupWorktree(handle: WorktreeHandle, force = false): { ok: boolean; message: string } {
	if (!existsSync(handle.path)) {
		return { ok: true, message: "Worktree path does not exist; nothing to clean up." };
	}

	const removeArgs = ["worktree", "remove"];
	if (force) removeArgs.push("--force");
	removeArgs.push(handle.path);

	const removeResult = git(removeArgs, handle.sourceRepo);
	if (!removeResult.ok) {
		return {
			ok: false,
			message: `Failed to remove worktree: ${removeResult.stderr || removeResult.output || "unknown error"}`,
		};
	}

	// Delete the branch
	const branchResult = git(["branch", "-D", handle.branch], handle.sourceRepo);
	if (!branchResult.ok) {
		// Branch deletion failure is non-fatal; worktree is gone
		return { ok: true, message: `Worktree removed (branch delete failed: ${branchResult.stderr.trim()})` };
	}

	return { ok: true, message: `Worktree ${handle.path} removed; branch ${handle.branch} deleted.` };
}

/**
 * Extract a unified diff (patch text) representing all changes in the worktree
 * relative to the source repo's HEAD.
 */
export function extractPatch(handle: WorktreeHandle): string {
	if (!existsSync(handle.path)) {
		return "";
	}
	// Ensure untracked files are staged so they appear in diff
	git(["add", "-A"], handle.path);
	const result = git(["diff", "--cached", "HEAD"], handle.path);
	// Reset the staging; we want non-destructive extraction
	git(["reset"], handle.path);
	return result.output;
}

/**
 * List all active worktrees for a repo.
 */
export function listWorktrees(sourceRepo: string): Array<{ path: string; branch: string; head: string }> {
	if (!isGitRepo(sourceRepo)) return [];
	const root = getRepoRoot(sourceRepo);
	if (!root) return [];

	const result = git(["worktree", "list", "--porcelain"], root);
	if (!result.ok) return [];

	const worktrees: Array<{ path: string; branch: string; head: string }> = [];
	let current: Partial<{ path: string; branch: string; head: string }> = {};
	for (const line of result.output.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			if (current.path) {
				worktrees.push({
					path: current.path,
					branch: current.branch ?? "",
					head: current.head ?? "",
				});
			}
			current = {};
			continue;
		}
		if (trimmed.startsWith("worktree ")) current.path = trimmed.slice(9);
		else if (trimmed.startsWith("HEAD ")) current.head = trimmed.slice(5);
		else if (trimmed.startsWith("branch ")) current.branch = trimmed.slice(7).replace(/^refs\/heads\//, "");
	}
	// Flush the last entry
	if (current.path) {
		worktrees.push({
			path: current.path,
			branch: current.branch ?? "",
			head: current.head ?? "",
		});
	}
	return worktrees;
}

// ============================================================================
// Extension (commands)
// ============================================================================

export default function lumenWorktreeExtension(pi: ExtensionAPI): void {
	pi.registerCommand("worktree", {
		description: "管理 git worktree（list / create / remove / patch）",
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const sub = parts[0] || "list";
			const param = parts[1];

			const cwd = ctx.cwd;

			if (!isGitRepo(cwd)) {
				pi.sendUserMessage("当前目录不是 git 仓库，无法使用 worktree 功能。");
				return;
			}

			switch (sub) {
				case "list": {
					const wts = listWorktrees(cwd);
					if (wts.length === 0) {
						pi.sendUserMessage("没有活动的 worktree。");
						return;
					}
					const lines = wts.map(
						(w) => `- ${w.path}\n    branch: ${w.branch || "(detached)"}\n    head: ${w.head.slice(0, 12)}`,
					);
					pi.sendUserMessage(`${wts.length} 个 worktree:\n\n${lines.join("\n")}`);
					return;
				}
				case "create": {
					try {
						const handle = createWorktree(cwd, param ?? "lumen-agent");
						pi.sendUserMessage(
							`已创建 worktree:\n  路径: ${handle.path}\n  分支: ${handle.branch}\n\n` +
								`可以在该目录运行 agent，完成后用 \`/worktree patch ${handle.path}\` 查看 diff，` +
								`\`/worktree remove ${handle.path}\` 清理。`,
						);
					} catch (err) {
						pi.sendUserMessage(`创建 worktree 失败: ${err instanceof Error ? err.message : String(err)}`);
					}
					return;
				}
				case "remove": {
					if (!param) {
						pi.sendUserMessage("用法：/worktree remove <path> [force]");
						return;
					}
					const force = parts[2] === "force";
					const wts = listWorktrees(cwd);
					const match = wts.find((w) => w.path === param || w.path.endsWith(param));
					if (!match) {
						pi.sendUserMessage(`找不到 worktree: ${param}`);
						return;
					}
					const handle: WorktreeHandle = {
						path: match.path,
						branch: match.branch,
						sourceRepo: getRepoRoot(cwd) ?? cwd,
						createdAt: 0,
					};
					const result = cleanupWorktree(handle, force);
					pi.sendUserMessage(result.message);
					return;
				}
				case "patch": {
					if (!param) {
						pi.sendUserMessage("用法：/worktree patch <path>");
						return;
					}
					const wts = listWorktrees(cwd);
					const match = wts.find((w) => w.path === param || w.path.endsWith(param));
					if (!match) {
						pi.sendUserMessage(`找不到 worktree: ${param}`);
						return;
					}
					const handle: WorktreeHandle = {
						path: match.path,
						branch: match.branch,
						sourceRepo: getRepoRoot(cwd) ?? cwd,
						createdAt: 0,
					};
					const patch = extractPatch(handle);
					if (!patch) {
						pi.sendUserMessage(`Worktree ${match.path} 没有变更。`);
						return;
					}
					pi.sendUserMessage(`Worktree ${match.path} 的变更:\n\n\`\`\`diff\n${patch.slice(0, 10000)}\n\`\`\``);
					return;
				}
				default:
					pi.sendUserMessage("用法：/worktree [list | create [prefix] | remove <path> [force] | patch <path>]");
			}
		},
	});
}
