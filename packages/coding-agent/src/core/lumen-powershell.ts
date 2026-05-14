/**
 * Lumen PowerShell Tool
 *
 * Windows 原生 PowerShell 执行工具。替代 bash 在 Windows 上的笨拙方案。
 *
 * 设计理念：
 * - 只在 Windows 上注册此 tool（非 Windows 直接跳过注册）
 * - 优先使用 pwsh (PowerShell 7+)，回退到 powershell.exe (Windows PowerShell 5.1)
 * - 版本检测：区分 Core (pwsh 7+) 和 Desktop (5.1)，提供版本感知的 prompt
 * - 退出码正确捕获：使用 $LASTEXITCODE + $? 组合（参考 Claude Code）
 * - CWD 追踪：命令执行后捕获工作目录变化
 * - 自动设置 `-NoProfile` 和 `-NonInteractive`，避免 profile 加载和交互提示
 *
 * [Provenance] 来源: 自研 + Claude Code powershellProvider.ts 参考
 * [Provenance] 移植方式: 参考重写
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { CachedOutputBlock } from "../modes/interactive/components/lumen-output-block.js";
import { renderStatusLine } from "../modes/interactive/components/lumen-status-line.js";
import type { ExtensionAPI, ExtensionContext, ToolRenderResultOptions } from "./extensions/types.js";
import { killProcessTree } from "./lumen-process-utils.js";

// ============================================================================
// Detection
// ============================================================================

export type PowerShellEdition = "core" | "desktop" | "unknown";

interface PowerShellInfo {
	path: string;
	edition: PowerShellEdition;
}

let cachedInfo: PowerShellInfo | null | undefined; // null = unavailable, undefined = not checked

function detectPowerShell(): PowerShellInfo | null {
	if (cachedInfo === null) return null;
	if (cachedInfo) return cachedInfo;

	if (process.platform !== "win32") {
		cachedInfo = null;
		return null;
	}

	// Try pwsh (PowerShell 7+) first — better performance, more features
	const pathEnv = process.env.PATH ?? process.env.Path ?? "";
	const pathDirs = pathEnv.split(";").filter(Boolean);

	for (const dir of pathDirs) {
		const pwsh = `${dir}\\pwsh.exe`;
		if (existsSync(pwsh)) {
			cachedInfo = { path: pwsh, edition: "core" };
			return cachedInfo;
		}
	}

	// Fallback to Windows PowerShell 5.1
	const winDir = process.env.windir ?? process.env.SystemRoot ?? "C:\\Windows";
	const builtin = `${winDir}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
	if (existsSync(builtin)) {
		cachedInfo = { path: builtin, edition: "desktop" };
		return cachedInfo;
	}

	cachedInfo = null;
	return null;
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
	newCwd?: string;
}

const MAX_OUTPUT_BYTES = 200_000; // 200KB
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

/**
 * Build the PowerShell command with exit code capture and CWD tracking.
 * Follows Claude Code's pattern for reliable exit code propagation.
 */
function buildWrappedCommand(command: string, cwdFilePath: string): string {
	const escapedPath = cwdFilePath.replace(/'/g, "''");
	// $LASTEXITCODE is set by native exe calls; $? covers cmdlet failures.
	// On PS 5.1, stderr from native commands can falsely set $? = $false,
	// so prefer $LASTEXITCODE when available.
	return [
		command,
		`; $_ec = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 }`,
		`; (Get-Location).Path | Out-File -FilePath '${escapedPath}' -Encoding utf8 -NoNewline`,
		`; exit $_ec`,
	].join("");
}

async function runPowerShell(
	command: string,
	cwd: string,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<PowerShellResult> {
	const info = detectPowerShell();
	if (!info) {
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
	const cwdFile = join(tmpdir(), `lumen-ps-cwd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
	const wrappedCommand = buildWrappedCommand(command, cwdFile);

	return new Promise<PowerShellResult>((resolve) => {
		const proc = spawn(
			info.path,
			["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", wrappedCommand],
			{
				cwd,
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			},
		);

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
			const pid = proc.pid;
			if (pid) {
				killProcessTree(pid);
			} else {
				try {
					proc.kill("SIGTERM");
				} catch {}
			}
		}, effectiveTimeout);

		const abortHandler = () => {
			const pid = proc.pid;
			if (pid) {
				killProcessTree(pid);
			} else {
				try {
					proc.kill("SIGTERM");
				} catch {}
			}
		};
		if (signal) {
			if (signal.aborted) abortHandler();
			else signal.addEventListener("abort", abortHandler, { once: true });
		}

		// Use 'exit' not 'close' to avoid hanging on inherited stdio handles
		proc.on("exit", (code) => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abortHandler);

			// Read CWD tracking file
			let newCwd: string | undefined;
			try {
				if (existsSync(cwdFile)) {
					newCwd = readFileSync(cwdFile, "utf8").trim();
					unlinkSync(cwdFile);
				}
			} catch {
				// CWD tracking is best-effort
			}

			resolve({
				stdout: stdout.trimEnd(),
				stderr: stderr.trimEnd(),
				exitCode: code,
				timedOut,
				durationMs: Date.now() - start,
				newCwd,
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
		timeout_ms: Type.Optional(Type.Number({ description: "Timeout in milliseconds (default 30000, max 120000)" })),
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
	edition: PowerShellEdition;
}

// ============================================================================
// Prompt Guidelines (version-aware)
// ============================================================================

function getEditionGuidelines(edition: PowerShellEdition): string[] {
	if (edition === "core") {
		return [
			"PowerShell 7+ (pwsh): && and || operators available. Prefer `cmd1 && cmd2` for conditional chaining.",
			"Ternary ($cond ? $a : $b), null-coalescing (??), null-conditional (?.) operators available.",
			"Default encoding is UTF-8 without BOM.",
		];
	}
	if (edition === "desktop") {
		return [
			"Windows PowerShell 5.1: && and || are NOT available (parser error). Use `A; if ($?) { B }` for conditional chaining.",
			"Ternary, null-coalescing, null-conditional operators NOT available. Use if/else.",
			"Avoid 2>&1 on native executables — it falsely sets $? to $false even on exit 0.",
			"Default encoding is UTF-16 LE. Use -Encoding utf8 with Out-File/Set-Content.",
		];
	}
	return [
		"PowerShell edition unknown — assume 5.1 for compatibility. Do NOT use &&, ||, ternary, or null-coalescing.",
	];
}

// ============================================================================
// Extension
// ============================================================================

export default function lumenPowerShellExtension(pi: ExtensionAPI): void {
	// Only register on Windows
	if (process.platform !== "win32") return;

	// Check availability at registration time
	const psInfo = detectPowerShell();
	if (!psInfo) return;

	const editionLabel = psInfo.edition === "core" ? "pwsh 7+" : psInfo.edition === "desktop" ? "PS 5.1" : "PS";

	pi.registerTool({
		name: "powershell",
		label: "PowerShell",
		description:
			`Execute a PowerShell command on Windows (${editionLabel}). Prefer this over bash on Windows for native shell features ` +
			"(Get-ChildItem, Get-Content, Invoke-WebRequest, Test-Path, etc.). " +
			"Runs with -NoProfile -NonInteractive. Exit codes are correctly captured via $LASTEXITCODE.",
		promptSnippet: `powershell — run a PowerShell command (Windows, ${editionLabel})`,
		promptGuidelines: [
			"On Windows, prefer powershell over bash for file system operations and system queries.",
			"Use -ErrorAction Stop in scripts that must fail fast; otherwise exit codes may not propagate.",
			"Variables use $ prefix: $myVar = 'value'. Escape character is backtick (`), not backslash.",
			'String interpolation: "Hello $name" or "Hello $($obj.Property)". Single quotes are literal.',
			"For multiline strings to native exe, use here-string: @'\\n...\\n'@ (closing '@ must be at column 0).",
			"Never use Read-Host, Get-Credential, Out-GridView, or pause — this runs non-interactively.",
			"Add -Confirm:$false to destructive cmdlets (Remove-Item, Stop-Process) to avoid prompts.",
			...getEditionGuidelines(psInfo.edition),
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
					edition: psInfo.edition,
				} as PowerShellDetails,
			};
		},

		renderCall(args: { command?: string }, theme, _context) {
			const cmd = args.command ?? "";
			const preview = cmd.length > 80 ? `${cmd.slice(0, 80)}...` : cmd;
			const line = renderStatusLine(
				{
					icon: "running",
					title: "PowerShell",
					titleColor: "accent",
					description: `$ ${preview}`,
				},
				theme,
			);
			return new Text(line, 0, 0);
		},

		renderResult(result, options: ToolRenderResultOptions, theme, context) {
			const details = result.details as PowerShellDetails | undefined;
			if (!details) return new Text(theme.fg("dim", "\u2014"), 0, 0);

			const icon = details.exitCode === 0 ? "success" : "error";
			const duration = `${details.durationMs}ms`;
			const args = context.args as { command?: string } | undefined;
			const cmd = args?.command ?? "";

			if (options.expanded) {
				// Expanded: show bordered output block
				const stateObj = context.state as { outputBlock?: CachedOutputBlock };
				if (!stateObj.outputBlock) {
					stateObj.outputBlock = new CachedOutputBlock();
				}
				const outputBlock = stateObj.outputBlock;
				const textContent = result.content
					?.filter((c: { type: string }) => c.type === "text")
					.map((c) => (c as { text?: string }).text ?? "")
					.join("\n")
					.trim();
				return {
					render: (width: number) => {
						return outputBlock.render(
							{
								header: `${icon === "success" ? "\u2713" : "\u2717"} PowerShell`,
								headerMeta: duration,
								state: icon === "success" ? "success" : "error",
								sections: [
									{ label: "Command", lines: [`$ ${cmd}`] },
									...(textContent ? [{ label: "Output", lines: textContent.split("\n") }] : []),
								],
								width,
							},
							theme,
						);
					},
					invalidate: () => {
						outputBlock.invalidate();
					},
				};
			}

			// Collapsed: status line
			const line = renderStatusLine(
				{
					icon,
					title: "PowerShell",
					titleColor: "toolTitle",
					description: `exit ${details.exitCode ?? "?"}`,
					meta: [duration],
				},
				theme,
			);
			return new Text(line, 0, 0);
		},
	});
}

// Testing exports
export { buildWrappedCommand, detectPowerShell, runPowerShell };
