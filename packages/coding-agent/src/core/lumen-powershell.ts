/**
 * Lumen PowerShell Tool
 *
 * Windows 原生 PowerShell 执行工具。替代 bash 在 Windows 上的笨拙方案。
 *
 * 设计理念：
 * - 只在 Windows 上注册此 tool（非 Windows 直接跳过注册）
 * - 优先使用 pwsh (PowerShell 7+)，回退到 powershell.exe (Windows PowerShell 5.1)
 * - 10 秒默认超时（可配置），30 秒硬上限
 * - 输出截断（避免 context 爆炸）
 * - 自动设置 `-NoProfile` 和 `-NonInteractive`，避免 profile 加载和交互提示
 *
 * [Provenance] 来源: 自研
 * [Provenance] 移植方式: 自研
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext, ToolRenderResultOptions } from "./extensions/types.js";

// ============================================================================
// Detection
// ============================================================================

let cachedExecutable: string | undefined | null; // null = unavailable, undefined = not checked

function findPowerShell(): string | undefined {
	if (cachedExecutable === null) return undefined;
	if (cachedExecutable) return cachedExecutable;

	if (process.platform !== "win32") {
		cachedExecutable = null;
		return undefined;
	}

	// Try pwsh (PowerShell 7+) first
	const pathEnv = process.env.PATH ?? process.env.Path ?? "";
	const pathDirs = pathEnv.split(";").filter(Boolean);

	for (const dir of pathDirs) {
		const pwsh = `${dir}\\pwsh.exe`;
		if (existsSync(pwsh)) {
			cachedExecutable = pwsh;
			return pwsh;
		}
	}

	// Fallback to Windows PowerShell
	const winDir = process.env.windir ?? process.env.SystemRoot ?? "C:\\Windows";
	const builtin = `${winDir}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
	if (existsSync(builtin)) {
		cachedExecutable = builtin;
		return builtin;
	}

	cachedExecutable = null;
	return undefined;
}

// ============================================================================
// Execution
// ============================================================================

interface PowerShellResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	timedOut: boolean;
	durationMs: number;
}

const MAX_OUTPUT_BYTES = 200_000; // 200KB
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;

async function runPowerShell(
	command: string,
	cwd: string,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<PowerShellResult> {
	const exe = findPowerShell();
	if (!exe) {
		return {
			stdout: "",
			stderr: "PowerShell not available on this system.",
			exitCode: 127,
			timedOut: false,
			durationMs: 0,
		};
	}

	const effectiveTimeout = Math.min(Math.max(timeoutMs, 500), MAX_TIMEOUT_MS);
	const start = Date.now();

	return new Promise<PowerShellResult>((resolve) => {
		const proc = spawn(exe, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});

		let stdout = "";
		let stderr = "";
		let stdoutBytes = 0;
		let stderrBytes = 0;
		let timedOut = false;

		proc.stdout.on("data", (chunk: Buffer) => {
			stdoutBytes += chunk.length;
			if (stdoutBytes <= MAX_OUTPUT_BYTES) {
				stdout += chunk.toString("utf8");
			} else if (!stdout.endsWith("[truncated]")) {
				stdout += `\n[truncated: stdout exceeded ${MAX_OUTPUT_BYTES} bytes]`;
			}
		});

		proc.stderr.on("data", (chunk: Buffer) => {
			stderrBytes += chunk.length;
			if (stderrBytes <= MAX_OUTPUT_BYTES) {
				stderr += chunk.toString("utf8");
			} else if (!stderr.endsWith("[truncated]")) {
				stderr += `\n[truncated: stderr exceeded ${MAX_OUTPUT_BYTES} bytes]`;
			}
		});

		const timer = setTimeout(() => {
			timedOut = true;
			try {
				proc.kill("SIGTERM");
			} catch {}
			// If not dead in 2s, force kill
			setTimeout(() => {
				try {
					proc.kill("SIGKILL");
				} catch {}
			}, 2000).unref();
		}, effectiveTimeout);

		const abortHandler = () => {
			try {
				proc.kill("SIGTERM");
			} catch {}
		};
		if (signal) {
			if (signal.aborted) abortHandler();
			else signal.addEventListener("abort", abortHandler, { once: true });
		}

		proc.on("exit", (code) => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abortHandler);
			resolve({
				stdout: stdout.trimEnd(),
				stderr: stderr.trimEnd(),
				exitCode: code,
				timedOut,
				durationMs: Date.now() - start,
			});
		});

		proc.on("error", (err) => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abortHandler);
			resolve({
				stdout: "",
				stderr: `Spawn error: ${err.message}`,
				exitCode: 127,
				timedOut: false,
				durationMs: Date.now() - start,
			});
		});
	});
}

// ============================================================================
// Schema
// ============================================================================

const PowerShellParams = Type.Object(
	{
		command: Type.String({ description: "PowerShell command to run" }),
		timeout_ms: Type.Optional(Type.Number({ description: "Timeout in milliseconds (default 10000, max 60000)" })),
		cwd: Type.Optional(Type.String({ description: "Working directory (default: agent cwd)" })),
	},
	{
		description:
			"Execute a PowerShell command on Windows. Uses pwsh (PS 7+) if available, " +
			"falls back to powershell.exe. Runs with -NoProfile -NonInteractive.",
	},
);

interface PowerShellDetails {
	exitCode: number | null;
	durationMs: number;
	timedOut: boolean;
}

// ============================================================================
// Extension
// ============================================================================

export default function lumenPowerShellExtension(pi: ExtensionAPI): void {
	// Only register on Windows
	if (process.platform !== "win32") return;

	// Check availability at registration time (cached result reused later)
	if (!findPowerShell()) {
		// No PowerShell found; don't register
		return;
	}

	pi.registerTool({
		name: "powershell",
		label: "PowerShell",
		description:
			"Execute a PowerShell command on Windows. Prefer this over bash on Windows for native shell features " +
			"(Get-ChildItem, Get-Content, Invoke-WebRequest, Test-Path, etc.). " +
			"Runs with -NoProfile -NonInteractive to avoid profile-load side effects and interactive prompts.",
		promptSnippet: "powershell — run a PowerShell command (Windows only)",
		promptGuidelines: [
			"On Windows, prefer powershell over bash for file system operations and system queries.",
			"Use -ErrorAction Stop in scripts that must fail fast; otherwise exit codes may not propagate.",
		],
		parameters: PowerShellParams,

		async execute(
			_toolCallId: string,
			params: { command: string; timeout_ms?: number; cwd?: string },
			signal: AbortSignal | undefined,
			_onUpdate: undefined,
			ctx: ExtensionContext,
		) {
			const cwd = params.cwd ?? ctx.cwd;
			const timeoutMs = params.timeout_ms ?? DEFAULT_TIMEOUT_MS;
			const result = await runPowerShell(params.command, cwd, timeoutMs, signal);

			const parts: string[] = [];
			if (result.stdout) parts.push(result.stdout);
			if (result.stderr) parts.push(`[stderr]\n${result.stderr}`);
			if (result.timedOut) parts.push(`[timed out after ${timeoutMs}ms]`);
			parts.push(`\n[exit ${result.exitCode ?? "?"} in ${result.durationMs}ms]`);

			return {
				content: [{ type: "text" as const, text: parts.join("\n").trim() }],
				details: {
					exitCode: result.exitCode,
					durationMs: result.durationMs,
					timedOut: result.timedOut,
				} as PowerShellDetails,
			};
		},

		renderCall(args: { command?: string }, theme, _context) {
			const cmd = args.command ?? "";
			const preview = cmd.length > 80 ? `${cmd.slice(0, 80)}…` : cmd;
			const text = theme.fg("toolTitle", theme.bold("powershell ")) + theme.fg("muted", preview);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options: ToolRenderResultOptions, theme, _context) {
			const details = result.details as PowerShellDetails | undefined;
			if (!details) return new Text(theme.fg("dim", "—"), 0, 0);
			const icon = details.exitCode === 0 ? theme.fg("success", "\u2713 ") : theme.fg("error", "\u2717 ");
			return new Text(icon + theme.fg("muted", `exit ${details.exitCode ?? "?"} (${details.durationMs}ms)`), 0, 0);
		},
	});
}

// Testing exports
export { findPowerShell, runPowerShell };
