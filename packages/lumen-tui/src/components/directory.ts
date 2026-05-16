/**
 * 目录显示工具：把 cwd 格式化为 "~/path:branch" 形式
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse } from "node:path";

/** 格式化目录显示：home 替换为 ~，正斜杠化，附加 git branch */
export function formatDirectory(cwd: string): string {
	const home = homedir();
	let dir = cwd;
	if (dir.startsWith(home)) {
		dir = `~${dir.slice(home.length)}`;
	}
	dir = dir.replaceAll("\\", "/");
	const branch = findGitBranch(cwd);
	if (branch) return `${dir}:${branch}`;
	return dir;
}

/** 向上递归查找 .git/HEAD（最多 16 层），返回当前 branch 或 commit hash */
export function findGitBranch(startPath: string): string | undefined {
	let current = startPath;
	const root = parse(current).root;
	for (let i = 0; i < 16; i++) {
		const head = readGitHead(current);
		if (head) return head;
		if (current === root) return undefined;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
	return undefined;
}

function readGitHead(dir: string): string | undefined {
	try {
		const headFile = join(dir, ".git", "HEAD");
		if (!existsSync(headFile)) return undefined;
		const head = readFileSync(headFile, "utf-8").trim();
		const match = head.match(/ref:\s+refs\/heads\/(.+)/);
		if (match) return match[1];
		if (head.length >= 7) return head.slice(0, 7);
		return undefined;
	} catch {
		return undefined;
	}
}
