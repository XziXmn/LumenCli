/**
 * Cross-platform process management utilities.
 *
 * Provides reliable process tree killing on Windows (taskkill) and Unix (SIGKILL
 * to process group). Follows the same pattern as pi upstream (shell.ts) and
 * Claude Code (tree-kill + taskkill).
 *
 * [Provenance] 来源: pi shell.ts killProcessTree + Claude Code genericProcessUtils.ts
 * [Provenance] 移植方式: 参考重写
 */

import { spawn } from "node:child_process";

/**
 * Kill a process and all its children (cross-platform).
 *
 * - Windows: `taskkill /F /T /PID` (force kill entire tree)
 * - Unix: `kill(-pid, SIGKILL)` (kill process group via negative PID)
 *
 * Fails silently if the process is already dead.
 */
export function killProcessTree(pid: number): void {
	if (process.platform === "win32") {
		try {
			spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
				stdio: "ignore",
				windowsHide: true,
			});
		} catch {
			// Process may already be dead
		}
	} else {
		try {
			// Negative PID kills the entire process group
			process.kill(-pid, "SIGKILL");
		} catch {
			// Fallback: kill just the process if group kill fails
			try {
				process.kill(pid, "SIGKILL");
			} catch {
				// Process already dead
			}
		}
	}
}
