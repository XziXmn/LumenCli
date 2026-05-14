/**
 * Lumen Snapshot/Checkpoint
 *
 * 每次 write/edit tool 执行前自动快照工作区状态。
 * 出错时可以通过 /snapshot restore 回滚到之前的状态。
 *
 * 实现方式：在项目 .git 之外维护一个独立的 snapshot git repo，
 * 用 git worktree 指向当前项目目录，每次快照就是一次 commit。
 *
 * [Provenance] 来源: opencode/packages/opencode/src/snapshot/
 * [Provenance] 移植方式: 参考重写（简化版，纯 git CLI 实现）
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "./extensions/types.js";

const SNAPSHOT_BASE = join(homedir(), ".lumen", "agent", "snapshots");
const MAX_SNAPSHOTS = 50;

function getSnapshotDir(cwd: string): string {
	const hash = createHash("sha256").update(cwd).digest("hex").slice(0, 12);
	return join(SNAPSHOT_BASE, hash);
}

function git(args: string[], cwd: string): { ok: boolean; output: string } {
	try {
		const output = execSync(`git ${args.join(" ")}`, {
			cwd,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			timeout: 10000,
		}).trim();
		return { ok: true, output };
	} catch (error) {
		const msg = error instanceof Error ? ((error as { stderr?: string }).stderr ?? error.message) : "";
		return { ok: false, output: typeof msg === "string" ? msg : "" };
	}
}

function isGitRepo(cwd: string): boolean {
	return git(["rev-parse", "--git-dir"], cwd).ok;
}

function initSnapshotRepo(snapshotDir: string): boolean {
	if (!existsSync(snapshotDir)) {
		mkdirSync(snapshotDir, { recursive: true });
	}

	// Initialize bare-like repo with worktree pointing to project
	if (!existsSync(join(snapshotDir, "HEAD"))) {
		const init = git(["init", "--bare"], snapshotDir);
		if (!init.ok) return false;
	}

	return true;
}

function snapshotGitArgs(snapshotDir: string, cwd: string): string[] {
	return [`--git-dir=${snapshotDir}`, `--work-tree=${cwd}`];
}

function takeSnapshot(snapshotDir: string, cwd: string, message: string): string | undefined {
	const core = snapshotGitArgs(snapshotDir, cwd);

	// Add all files (respecting .gitignore of the snapshot repo — we don't have one, so add all)
	const add = git([...core, "add", "-A"], cwd);
	if (!add.ok) return undefined;

	// Check if there are changes to commit
	const status = git([...core, "status", "--porcelain"], cwd);
	if (!status.ok || !status.output.trim()) return undefined; // Nothing to snapshot

	// Commit
	const commit = git([...core, "commit", "-m", message, "--allow-empty-message"], cwd);
	if (!commit.ok) return undefined;

	// Get the commit hash
	const hash = git([...core, "rev-parse", "--short", "HEAD"], cwd);
	return hash.ok ? hash.output : undefined;
}

function listSnapshots(
	snapshotDir: string,
	cwd: string,
	count: number,
): Array<{ hash: string; date: string; message: string }> {
	const core = snapshotGitArgs(snapshotDir, cwd);
	const log = git([...core, "log", `--max-count=${count}`, "--format=%h|%ci|%s"], cwd);
	if (!log.ok || !log.output) return [];

	return log.output.split("\n").map((line) => {
		const [hash, date, ...msgParts] = line.split("|");
		return { hash: hash ?? "", date: (date ?? "").split(" ")[0] ?? "", message: msgParts.join("|") };
	});
}

function restoreSnapshot(snapshotDir: string, cwd: string, hash: string): boolean {
	const core = snapshotGitArgs(snapshotDir, cwd);

	// Checkout the snapshot
	const checkout = git([...core, "checkout", hash, "--", "."], cwd);
	return checkout.ok;
}

function diffSnapshot(snapshotDir: string, cwd: string, hash: string): string {
	const core = snapshotGitArgs(snapshotDir, cwd);
	const diff = git([...core, "diff", hash, "--stat"], cwd);
	return diff.ok ? diff.output : "无法获取 diff";
}

function pruneOldSnapshots(snapshotDir: string, cwd: string): void {
	const core = snapshotGitArgs(snapshotDir, cwd);
	const count = git([...core, "rev-list", "--count", "HEAD"], cwd);
	if (!count.ok) return;

	const total = Number.parseInt(count.output, 10);
	if (total <= MAX_SNAPSHOTS) return;

	// Aggressive GC to keep repo small
	git([...core, "gc", "--aggressive", "--prune=now"], cwd);
}

export default function lumenSnapshotExtension(pi: ExtensionAPI): void {
	let snapshotDir: string | undefined;
	let cwd: string | undefined;
	let enabled = false;

	pi.on("session_start", (_event, ctx) => {
		cwd = ctx.cwd;
		if (!isGitRepo(cwd)) {
			enabled = false;
			return;
		}

		snapshotDir = getSnapshotDir(cwd);
		enabled = initSnapshotRepo(snapshotDir);
	});

	// Auto-snapshot before write/edit/apply_patch tool calls
	pi.on("tool_call", (event) => {
		if (!enabled || !snapshotDir || !cwd) return;
		if (event.toolName !== "write" && event.toolName !== "edit" && event.toolName !== "apply_patch") return;

		const file =
			(event.input as { path?: string }).path ?? (event.toolName === "apply_patch" ? "multi-file" : "unknown");
		takeSnapshot(snapshotDir, cwd, `before ${event.toolName}: ${file}`);
		pruneOldSnapshots(snapshotDir, cwd);
		return undefined;
	});

	// /snapshot command
	pi.registerCommand("snapshot", {
		description: "管理工作区快照（list/restore/diff）",
		handler: async (args) => {
			if (!enabled || !snapshotDir || !cwd) {
				pi.sendUserMessage("Snapshot 未启用（需要在 git 仓库中使用）。");
				return;
			}

			const parts = args.trim().split(/\s+/);
			const subcommand = parts[0] || "list";
			const param = parts[1];

			switch (subcommand) {
				case "list": {
					const snapshots = listSnapshots(snapshotDir, cwd, 15);
					if (snapshots.length === 0) {
						pi.sendUserMessage("没有快照记录。快照会在 write/edit 操作前自动创建。");
						return;
					}
					const lines = snapshots.map((s) => `- \`${s.hash}\` ${s.date} ${s.message}`);
					pi.sendUserMessage(`最近快照 (${snapshots.length} 条):\n\n${lines.join("\n")}`);
					return;
				}
				case "restore": {
					if (!param) {
						pi.sendUserMessage("用法：/snapshot restore <hash>\n\n用 /snapshot list 查看可用快照。");
						return;
					}
					const ok = restoreSnapshot(snapshotDir, cwd, param);
					pi.sendUserMessage(ok ? `已恢复到快照 ${param}` : `恢复失败：找不到快照 ${param}`);
					return;
				}
				case "diff": {
					if (!param) {
						pi.sendUserMessage("用法：/snapshot diff <hash>");
						return;
					}
					const diff = diffSnapshot(snapshotDir, cwd, param);
					pi.sendUserMessage(`快照 ${param} 以来的变更:\n\n\`\`\`\n${diff}\n\`\`\``);
					return;
				}
				case "now": {
					const hash = takeSnapshot(snapshotDir, cwd, param || "manual snapshot");
					pi.sendUserMessage(hash ? `手动快照已创建: ${hash}` : "没有变更需要快照。");
					return;
				}
				default:
					pi.sendUserMessage("用法：/snapshot [list|restore <hash>|diff <hash>|now [message]]");
			}
		},
	});
}
