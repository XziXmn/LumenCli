/**
 * Lumen Commit Tool
 *
 * AI 驱动的 git commit 工具。
 * 分析 staged/unstaged changes，生成 conventional commit message，用户确认后执行。
 */

import { execSync } from "node:child_process";
import type { ExtensionAPI } from "./extensions/types.ts";

function runGit(args: string[], cwd: string): string {
	try {
		return execSync(`git ${args.join(" ")}`, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch {
		return "";
	}
}

function getStagedDiff(cwd: string): string {
	return runGit(["diff", "--cached", "--stat"], cwd);
}

function getStagedDiffFull(cwd: string): string {
	return runGit(["diff", "--cached"], cwd);
}

function getUnstagedDiff(cwd: string): string {
	return runGit(["diff", "--stat"], cwd);
}

function hasStaged(cwd: string): boolean {
	return getStagedDiff(cwd).length > 0;
}

function hasUnstaged(cwd: string): boolean {
	return getUnstagedDiff(cwd).length > 0;
}

export default function lumenCommitExtension(pi: ExtensionAPI): void {
	pi.registerCommand("commit", {
		description: "AI 分析变更并生成 commit message",
		handler: async (args) => {
			const cwd = process.cwd();
			// Use sendUserMessage to trigger the agent to analyze and commit
			const staged = hasStaged(cwd);
			const unstaged = hasUnstaged(cwd);

			if (!staged && !unstaged) {
				pi.sendUserMessage("没有检测到任何变更。请先修改文件或 `git add` 暂存变更。");
				return;
			}

			const diff = staged ? getStagedDiffFull(cwd) : "";
			const stat = staged ? getStagedDiff(cwd) : getUnstagedDiff(cwd);

			const instructions = args.trim();
			const prompt = [
				"请帮我生成 git commit。",
				"",
				staged ? "已暂存的变更：" : "未暂存的变更（需要先 git add）：",
				"```",
				stat,
				"```",
				...(staged && diff
					? [
							"",
							"完整 diff：",
							"```diff",
							diff.slice(0, 8000),
							diff.length > 8000 ? "\n... (truncated)" : "",
							"```",
						]
					: []),
				"",
				"要求：",
				"- 生成 conventional commit message（type(scope): description）",
				"- 不要 emoji",
				"- 简洁、技术性",
				"- 如果变更跨多个关注点，建议拆分为多个 commit",
				...(staged
					? ['- 直接用 bash tool 执行 `git commit -m "message"`']
					: ["- 先建议需要 `git add` 的文件，等我确认后再 commit"]),
				...(instructions ? ["", `额外指示：${instructions}`] : []),
			].join("\n");

			pi.sendUserMessage(prompt);
		},
	});
}
