/**
 * Lumen LSP Tool (full protocol implementation)
 *
 * LLM-facing tool that speaks full LSP 3.17 protocol via lumen-lsp-client.
 *
 * Supported actions:
 * - diagnostics: publishDiagnostics after didSave
 * - definition / type_definition / implementation: textDocument/definition etc.
 * - references: textDocument/references (with context.includeDeclaration=true)
 * - hover: textDocument/hover
 * - symbols: textDocument/documentSymbol (per file) or workspace/symbol (global)
 * - rename: textDocument/rename (returns WorkspaceEdit, not applied unless apply=true)
 * - code_actions: textDocument/codeAction
 * - status: list active LSP clients
 *
 * Fallback: when no LSP server is available for a file's language, degrades to
 * ripgrep-based symbol search and CLI-based diagnostics (tsc/pyright/go vet/cargo check).
 *
 * [Provenance] 来源: oh-my-pi src/lsp/ + LSP 3.17 spec
 * [Provenance] 移植方式: 参考重写（Node.js 完整 LSP client）
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { ensureTool } from "../utils/tools-manager.ts";
import type { ExtensionAPI, ExtensionContext, ToolRenderResultOptions } from "./extensions/types.ts";
import {
	disposeAllClients,
	ensureFileOpen,
	fileToUri,
	getActiveClients,
	getOrCreateClient,
	isServerBroken,
	notifySaved,
	sendRequest,
	syncContent,
	uriToFile,
	waitForDiagnostics,
} from "./lumen-lsp-client.ts";
import { filterAvailableServers, getServersForFile, loadLspConfig } from "./lumen-lsp-config.ts";
import type {
	CodeAction,
	Diagnostic,
	DocumentSymbol,
	Hover,
	Location,
	LocationLink,
	Position,
	SymbolInformation,
	WorkspaceEdit,
} from "./lumen-lsp-types.ts";
import { DIAGNOSTIC_SEVERITY_NAMES, SYMBOL_KIND_NAMES } from "./lumen-lsp-types.ts";

// ============================================================================
// Position Helpers
// ============================================================================

/**
 * Find the position of a symbol on a 1-indexed line.
 * Returns 0-indexed line/character as used by LSP.
 */
function findSymbolPosition(absolutePath: string, oneBasedLine: number, symbol?: string): Position | undefined {
	if (!existsSync(absolutePath)) return undefined;
	const content = readFileSync(absolutePath, "utf8");
	const lines = content.split(/\r?\n/);
	const lineIdx = oneBasedLine - 1;
	if (lineIdx < 0 || lineIdx >= lines.length) return undefined;
	const lineText = lines[lineIdx];
	if (!symbol) return { line: lineIdx, character: 0 };
	const col = lineText.indexOf(symbol);
	if (col === -1) return { line: lineIdx, character: 0 };
	return { line: lineIdx, character: col };
}

function formatLocation(loc: Location, cwd: string): string {
	const file = relative(cwd, uriToFile(loc.uri));
	return `${file}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`;
}

function readLineFromFile(absolutePath: string, oneBasedLine: number): string | undefined {
	if (!existsSync(absolutePath)) return undefined;
	try {
		const content = readFileSync(absolutePath, "utf8");
		const lines = content.split(/\r?\n/);
		return lines[oneBasedLine - 1]?.trim();
	} catch {
		return undefined;
	}
}

function normalizeLocationResult(result: unknown): Location[] {
	if (!result) return [];
	const arr = Array.isArray(result) ? result : [result];
	const out: Location[] = [];
	for (const entry of arr) {
		if (!entry || typeof entry !== "object") continue;
		if ("uri" in entry && "range" in entry) {
			out.push(entry as Location);
		} else if ("targetUri" in entry) {
			const link = entry as LocationLink;
			out.push({ uri: link.targetUri, range: link.targetSelectionRange ?? link.targetRange });
		}
	}
	return out;
}

function extractHoverText(hover: Hover | null): string {
	if (!hover) return "";
	const contents = hover.contents;
	if (typeof contents === "string") return contents;
	if (Array.isArray(contents)) {
		return contents
			.map((c) => (typeof c === "string" ? c : (c.value ?? "")))
			.filter(Boolean)
			.join("\n\n");
	}
	if ("value" in contents) return contents.value;
	return "";
}

// ============================================================================
// CLI Fallback Helpers (used when no LSP server is available)
// ============================================================================

const toolCache = new Map<string, boolean>();

function isToolAvailable(cmd: string): boolean {
	if (toolCache.has(cmd)) return toolCache.get(cmd)!;
	try {
		const which = process.platform === "win32" ? "where" : "which";
		execSync(`${which} ${cmd}`, { stdio: "pipe", timeout: 3000 });
		toolCache.set(cmd, true);
		return true;
	} catch {
		toolCache.set(cmd, false);
		return false;
	}
}

interface FallbackDiagnostic {
	file: string;
	line: number;
	column: number;
	severity: "error" | "warning" | "info" | "hint";
	code?: string;
	message: string;
	source: string;
}

function parseTypescriptOutput(output: string, cwd: string): FallbackDiagnostic[] {
	const diagnostics: FallbackDiagnostic[] = [];
	const regex = /^(.+?)\((\d+),(\d+)\):\s+(error|warning|info)\s+(TS\d+):\s+(.+)$/gm;
	for (const match of output.matchAll(regex)) {
		const [, file, line, column, severity, code, message] = match;
		diagnostics.push({
			file: relative(cwd, resolve(cwd, file)),
			line: Number.parseInt(line, 10),
			column: Number.parseInt(column, 10),
			severity: severity as "error" | "warning" | "info",
			code,
			message: message.trim(),
			source: "tsc",
		});
	}
	return diagnostics;
}

function runCliDiagnostics(cwd: string, language: string, filePath?: string): FallbackDiagnostic[] {
	switch (language) {
		case "typescript":
		case "typescriptreact":
		case "javascript":
		case "javascriptreact": {
			if (!isToolAvailable("tsc") && !isToolAvailable("tsgo")) return [];
			const cmd = isToolAvailable("tsgo") ? "tsgo" : "tsc";
			const args = ["--noEmit", "--pretty", "false"];
			if (filePath && !existsSync(`${cwd}/tsconfig.json`)) args.push(filePath);
			try {
				const result = spawnSync(cmd, args, {
					cwd,
					encoding: "utf8",
					timeout: 30000,
					shell: process.platform === "win32",
				});
				return parseTypescriptOutput(result.stdout || "", cwd);
			} catch {
				return [];
			}
		}
		case "python": {
			if (!isToolAvailable("pyright")) return [];
			try {
				const result = spawnSync("pyright", ["--outputjson", filePath ?? "."], {
					cwd,
					encoding: "utf8",
					timeout: 30000,
					shell: process.platform === "win32",
				});
				const data = JSON.parse(result.stdout || "{}");
				const diags: FallbackDiagnostic[] = [];
				for (const d of data.generalDiagnostics ?? []) {
					diags.push({
						file: relative(cwd, d.file),
						line: (d.range?.start?.line ?? 0) + 1,
						column: (d.range?.start?.character ?? 0) + 1,
						severity: (d.severity ?? "error") as FallbackDiagnostic["severity"],
						message: d.message,
						source: "pyright",
					});
				}
				return diags;
			} catch {
				return [];
			}
		}
		case "go": {
			if (!isToolAvailable("go")) return [];
			try {
				const result = spawnSync("go", ["vet", filePath ?? "./..."], {
					cwd,
					encoding: "utf8",
					timeout: 30000,
					shell: process.platform === "win32",
				});
				const diags: FallbackDiagnostic[] = [];
				const regex = /^([^:]+):(\d+)(?::(\d+))?:\s+(.+)$/gm;
				for (const match of (result.stderr || "").matchAll(regex)) {
					diags.push({
						file: relative(cwd, resolve(cwd, match[1])),
						line: Number.parseInt(match[2], 10),
						column: match[3] ? Number.parseInt(match[3], 10) : 1,
						severity: "warning",
						message: match[4].trim(),
						source: "go vet",
					});
				}
				return diags;
			} catch {
				return [];
			}
		}
		case "rust": {
			if (!isToolAvailable("cargo")) return [];
			try {
				const result = spawnSync("cargo", ["check", "--message-format=json"], {
					cwd,
					encoding: "utf8",
					timeout: 60000,
					shell: process.platform === "win32",
				});
				const diags: FallbackDiagnostic[] = [];
				for (const line of (result.stdout || "").split("\n")) {
					if (!line.trim()) continue;
					try {
						const msg = JSON.parse(line);
						if (msg.reason !== "compiler-message") continue;
						const d = msg.message;
						if (!d?.spans?.length) continue;
						const span = d.spans[0];
						diags.push({
							file: relative(cwd, resolve(cwd, span.file_name)),
							line: span.line_start,
							column: span.column_start,
							severity: d.level === "error" ? "error" : "warning",
							code: d.code?.code,
							message: d.message,
							source: "cargo",
						});
					} catch {}
				}
				return diags;
			} catch {
				return [];
			}
		}
		default:
			return [];
	}
}

function detectLanguageFromExt(filePath: string): string {
	const ext = extname(filePath).toLowerCase();
	switch (ext) {
		case ".ts":
		case ".tsx":
			return "typescript";
		case ".js":
		case ".jsx":
		case ".mjs":
		case ".cjs":
			return "javascript";
		case ".py":
		case ".pyi":
			return "python";
		case ".go":
			return "go";
		case ".rs":
			return "rust";
		default:
			return "unknown";
	}
}

// ============================================================================
// Symbol Search (ripgrep fallback when no LSP provides symbols)
// ============================================================================

interface SymbolHit {
	file: string;
	line: number;
	column: number;
	preview?: string;
}

function rgSymbolSearch(cwd: string, symbol: string, language: string, rgPath: string): SymbolHit[] {
	const globs: string[] = [];
	switch (language) {
		case "typescript":
			globs.push("-g", "*.ts", "-g", "*.tsx");
			break;
		case "javascript":
			globs.push("-g", "*.js", "-g", "*.jsx", "-g", "*.mjs");
			break;
		case "python":
			globs.push("-g", "*.py");
			break;
		case "go":
			globs.push("-g", "*.go");
			break;
		case "rust":
			globs.push("-g", "*.rs");
			break;
	}

	const args = ["--line-number", "--column", "--no-heading", "-w", ...globs, symbol, "."];
	try {
		const result = spawnSync(rgPath, args, {
			cwd,
			encoding: "utf8",
			timeout: 15000,
			shell: process.platform === "win32",
		});
		const hits: SymbolHit[] = [];
		for (const line of (result.stdout || "").split("\n")) {
			if (!line.trim()) continue;
			const match = line.match(/^([^:]+):(\d+):(\d+):(.*)$/);
			if (match) {
				hits.push({
					file: match[1],
					line: Number.parseInt(match[2], 10),
					column: Number.parseInt(match[3], 10),
					preview: match[4].trim().slice(0, 120),
				});
			}
		}
		return hits;
	} catch {
		return [];
	}
}

// ============================================================================
// Tool Schema
// ============================================================================

const LspParams = Type.Object(
	{
		action: Type.Union(
			[
				Type.Literal("diagnostics"),
				Type.Literal("definition"),
				Type.Literal("type_definition"),
				Type.Literal("implementation"),
				Type.Literal("references"),
				Type.Literal("hover"),
				Type.Literal("symbols"),
				Type.Literal("rename"),
				Type.Literal("code_actions"),
				Type.Literal("status"),
			],
			{ description: "LSP operation" },
		),
		file: Type.Optional(Type.String({ description: "File path (required for most actions)" })),
		line: Type.Optional(Type.Number({ description: "1-indexed line number" })),
		symbol: Type.Optional(
			Type.String({ description: "Symbol to locate on the line (or query for workspace symbols)" }),
		),
		query: Type.Optional(Type.String({ description: "Query for workspace/symbol search" })),
		new_name: Type.Optional(Type.String({ description: "New name for rename operation" })),
		apply: Type.Optional(Type.Boolean({ description: "Apply rename edits to disk (default false)" })),
	},
	{
		description:
			"Language-aware code intelligence via LSP (or CLI fallback). " +
			"Actions: diagnostics, definition, type_definition, implementation, references, " +
			"hover, symbols, rename, code_actions, status.",
	},
);

// ============================================================================
// Action Handlers
// ============================================================================

interface ActionResult {
	text: string;
	count?: number;
	serverName?: string;
}

async function handleDiagnostics(
	file: string,
	absolutePath: string,
	cwd: string,
	signal?: AbortSignal,
): Promise<ActionResult> {
	const config = loadLspConfig(cwd);
	const servers = filterAvailableServers(getServersForFile(config, absolutePath));

	if (servers.length === 0) {
		// Fallback to CLI
		const lang = detectLanguageFromExt(absolutePath);
		const diags = runCliDiagnostics(cwd, lang, absolutePath);
		if (diags.length === 0) {
			return { text: `No ${lang} diagnostics (no LSP server available; CLI fallback returned nothing).` };
		}
		const lines = diags.map(
			(d) =>
				`${d.severity.toUpperCase()} ${d.file}:${d.line}:${d.column}${d.code ? ` [${d.code}]` : ""} — ${d.message}`,
		);
		return { text: lines.join("\n"), count: diags.length, serverName: `CLI:${lang}` };
	}

	// Use LSP
	const [serverName, serverConfig] = servers[0];
	const client = await getOrCreateClient(serverName, serverConfig, cwd);
	await ensureFileOpen(client, absolutePath);
	// Force re-sync to ensure latest content is analyzed
	const content = readFileSync(absolutePath, "utf8");
	await syncContent(client, absolutePath, content);
	notifySaved(client, absolutePath);

	const uri = fileToUri(absolutePath);
	const diagnostics = await waitForDiagnostics(client, uri, 5000, signal);

	if (diagnostics.length === 0) {
		return { text: "No diagnostics.", count: 0, serverName };
	}

	const lines = diagnostics.map((d: Diagnostic) => {
		const sev = DIAGNOSTIC_SEVERITY_NAMES[d.severity ?? 1].toUpperCase();
		const loc = `${file}:${d.range.start.line + 1}:${d.range.start.character + 1}`;
		const code = d.code ? ` [${d.code}]` : "";
		return `${sev} ${loc}${code} — ${d.message}`;
	});
	return { text: lines.join("\n"), count: diagnostics.length, serverName };
}

async function handleLocation(
	action: "definition" | "type_definition" | "implementation",
	file: string,
	absolutePath: string,
	line: number,
	symbol: string | undefined,
	cwd: string,
	signal?: AbortSignal,
): Promise<ActionResult> {
	const config = loadLspConfig(cwd);
	const servers = filterAvailableServers(getServersForFile(config, absolutePath));

	if (servers.length === 0) {
		return { text: `No LSP server available for ${extname(absolutePath)}. Use lsp_diagnostics with CLI fallback.` };
	}

	const [serverName, serverConfig] = servers[0];
	const client = await getOrCreateClient(serverName, serverConfig, cwd);
	await ensureFileOpen(client, absolutePath);

	const position = findSymbolPosition(absolutePath, line, symbol);
	if (!position) {
		return { text: `Could not locate symbol "${symbol ?? ""}" on ${file}:${line}` };
	}

	const lspMethod =
		action === "definition"
			? "textDocument/definition"
			: action === "type_definition"
				? "textDocument/typeDefinition"
				: "textDocument/implementation";

	let raw: unknown;
	try {
		raw = await sendRequest(client, lspMethod, { textDocument: { uri: fileToUri(absolutePath) }, position }, signal);
	} catch (err) {
		return { text: `LSP error: ${err instanceof Error ? err.message : String(err)}`, serverName };
	}

	const locations = normalizeLocationResult(raw);
	if (locations.length === 0) {
		return { text: `No ${action} found for "${symbol ?? ""}" at ${file}:${line}`, count: 0, serverName };
	}

	const lines = locations.map((loc) => {
		const header = formatLocation(loc, cwd);
		const preview = readLineFromFile(uriToFile(loc.uri), loc.range.start.line + 1);
		return preview ? `  ${header}\n    ${preview}` : `  ${header}`;
	});
	return { text: lines.join("\n"), count: locations.length, serverName };
}

async function handleReferences(
	file: string,
	absolutePath: string,
	line: number,
	symbol: string | undefined,
	cwd: string,
	signal?: AbortSignal,
): Promise<ActionResult> {
	const config = loadLspConfig(cwd);
	const servers = filterAvailableServers(getServersForFile(config, absolutePath));

	if (servers.length === 0) {
		if (!symbol) return { text: "No LSP and no symbol provided for ripgrep fallback." };
		const rgPath = await ensureTool("rg", true);
		if (!rgPath) return { text: "No LSP server and ripgrep not available." };
		const hits = rgSymbolSearch(cwd, symbol, detectLanguageFromExt(absolutePath), rgPath);
		if (hits.length === 0) return { text: `No references found via ripgrep for "${symbol}".`, count: 0 };
		const lines = hits.map((h) => `  ${h.file}:${h.line}:${h.column}${h.preview ? ` — ${h.preview}` : ""}`);
		return { text: lines.join("\n"), count: hits.length, serverName: "rg (fallback)" };
	}

	const [serverName, serverConfig] = servers[0];
	const client = await getOrCreateClient(serverName, serverConfig, cwd);
	await ensureFileOpen(client, absolutePath);

	const position = findSymbolPosition(absolutePath, line, symbol);
	if (!position) return { text: `Could not locate symbol "${symbol ?? ""}" on ${file}:${line}` };

	let raw: unknown;
	try {
		raw = await sendRequest(
			client,
			"textDocument/references",
			{
				textDocument: { uri: fileToUri(absolutePath) },
				position,
				context: { includeDeclaration: true },
			},
			signal,
		);
	} catch (err) {
		return { text: `LSP error: ${err instanceof Error ? err.message : String(err)}`, serverName };
	}

	const locations = normalizeLocationResult(raw);
	if (locations.length === 0) return { text: `No references found.`, count: 0, serverName };

	const lines = locations.slice(0, 50).map((loc) => {
		const header = formatLocation(loc, cwd);
		const preview = readLineFromFile(uriToFile(loc.uri), loc.range.start.line + 1);
		return preview ? `  ${header}\n    ${preview}` : `  ${header}`;
	});
	if (locations.length > 50) lines.push(`  ... (${locations.length} total, 50 shown)`);
	return { text: lines.join("\n"), count: locations.length, serverName };
}

async function handleHover(
	file: string,
	absolutePath: string,
	line: number,
	symbol: string | undefined,
	cwd: string,
	signal?: AbortSignal,
): Promise<ActionResult> {
	const config = loadLspConfig(cwd);
	const servers = filterAvailableServers(getServersForFile(config, absolutePath));
	if (servers.length === 0) return { text: "No LSP server available for hover." };

	const [serverName, serverConfig] = servers[0];
	const client = await getOrCreateClient(serverName, serverConfig, cwd);
	await ensureFileOpen(client, absolutePath);

	const position = findSymbolPosition(absolutePath, line, symbol);
	if (!position) return { text: `Could not locate symbol at ${file}:${line}` };

	try {
		const hover = (await sendRequest(
			client,
			"textDocument/hover",
			{ textDocument: { uri: fileToUri(absolutePath) }, position },
			signal,
		)) as Hover | null;
		const text = extractHoverText(hover);
		return { text: text || "No hover info.", serverName };
	} catch (err) {
		return { text: `LSP error: ${err instanceof Error ? err.message : String(err)}`, serverName };
	}
}

async function handleSymbols(
	file: string | undefined,
	absolutePath: string | undefined,
	query: string | undefined,
	cwd: string,
	signal?: AbortSignal,
): Promise<ActionResult> {
	const config = loadLspConfig(cwd);

	// File-level symbols
	if (file && absolutePath) {
		const servers = filterAvailableServers(getServersForFile(config, absolutePath));
		if (servers.length === 0) return { text: "No LSP server available for symbols." };
		const [serverName, serverConfig] = servers[0];
		const client = await getOrCreateClient(serverName, serverConfig, cwd);
		await ensureFileOpen(client, absolutePath);

		try {
			const raw = (await sendRequest(
				client,
				"textDocument/documentSymbol",
				{ textDocument: { uri: fileToUri(absolutePath) } },
				signal,
			)) as DocumentSymbol[] | SymbolInformation[] | null;

			if (!raw || raw.length === 0) return { text: "No symbols.", count: 0, serverName };

			const lines: string[] = [];
			const flatten = (syms: DocumentSymbol[], depth: number): void => {
				for (const s of syms) {
					const kind = SYMBOL_KIND_NAMES[s.kind] ?? "Unknown";
					const indent = "  ".repeat(depth);
					lines.push(`${indent}[${kind}] ${s.name} (${file}:${s.range.start.line + 1})`);
					if (s.children && s.children.length > 0) flatten(s.children, depth + 1);
				}
			};

			// documentSymbol can return DocumentSymbol[] or SymbolInformation[]
			if (raw[0] && "range" in raw[0] && "selectionRange" in raw[0]) {
				flatten(raw as DocumentSymbol[], 0);
			} else {
				for (const s of raw as SymbolInformation[]) {
					const kind = SYMBOL_KIND_NAMES[s.kind] ?? "Unknown";
					const loc = formatLocation(s.location, cwd);
					lines.push(`[${kind}] ${s.name}${s.containerName ? ` (in ${s.containerName})` : ""} — ${loc}`);
				}
			}
			return { text: lines.slice(0, 100).join("\n"), count: lines.length, serverName };
		} catch (err) {
			return { text: `LSP error: ${err instanceof Error ? err.message : String(err)}`, serverName };
		}
	}

	// Workspace-level symbol search
	if (!query) return { text: "Provide 'file' for document symbols, or 'query' for workspace symbols." };

	// Try all available servers
	const allServers = filterAvailableServers(Object.entries(config.servers));
	if (allServers.length === 0) return { text: "No LSP servers available for workspace symbol search." };

	const [serverName, serverConfig] = allServers[0];
	const client = await getOrCreateClient(serverName, serverConfig, cwd);

	try {
		const raw = (await sendRequest(client, "workspace/symbol", { query }, signal)) as SymbolInformation[] | null;
		if (!raw || raw.length === 0) return { text: `No symbols matching "${query}".`, count: 0, serverName };

		const lines = raw.slice(0, 100).map((s) => {
			const kind = SYMBOL_KIND_NAMES[s.kind] ?? "Unknown";
			const loc = formatLocation(s.location, cwd);
			return `[${kind}] ${s.name}${s.containerName ? ` (in ${s.containerName})` : ""} — ${loc}`;
		});
		if (raw.length > 100) lines.push(`... (${raw.length} total, 100 shown)`);
		return { text: lines.join("\n"), count: raw.length, serverName };
	} catch (err) {
		return { text: `LSP error: ${err instanceof Error ? err.message : String(err)}`, serverName };
	}
}

async function handleRename(
	file: string,
	absolutePath: string,
	line: number,
	symbol: string | undefined,
	newName: string,
	apply: boolean,
	cwd: string,
	signal?: AbortSignal,
): Promise<ActionResult> {
	const config = loadLspConfig(cwd);
	const servers = filterAvailableServers(getServersForFile(config, absolutePath));
	if (servers.length === 0) return { text: "No LSP server available for rename." };

	const [serverName, serverConfig] = servers[0];
	const client = await getOrCreateClient(serverName, serverConfig, cwd);
	await ensureFileOpen(client, absolutePath);

	const position = findSymbolPosition(absolutePath, line, symbol);
	if (!position) return { text: `Could not locate symbol "${symbol}" on ${file}:${line}` };

	try {
		const edit = (await sendRequest(
			client,
			"textDocument/rename",
			{ textDocument: { uri: fileToUri(absolutePath) }, position, newName },
			signal,
		)) as WorkspaceEdit | null;

		if (!edit) return { text: "Server returned no edit.", serverName };

		const changes: string[] = [];
		const touched = new Set<string>();
		if (edit.changes) {
			for (const [uri, edits] of Object.entries(edit.changes)) {
				touched.add(uri);
				const fpath = relative(cwd, uriToFile(uri));
				changes.push(`  ${fpath}: ${edits.length} edit(s)`);
			}
		}
		if (edit.documentChanges) {
			for (const change of edit.documentChanges) {
				if ("textDocument" in change) {
					touched.add(change.textDocument.uri);
					const fpath = relative(cwd, uriToFile(change.textDocument.uri));
					changes.push(`  ${fpath}: ${change.edits.length} edit(s)`);
				}
			}
		}

		if (!apply) {
			return {
				text: `Rename "${symbol}" → "${newName}" would affect ${touched.size} file(s):\n${changes.join("\n")}\n\n(Dry run — pass apply=true to write changes.)`,
				count: touched.size,
				serverName,
			};
		}

		// Apply the WorkspaceEdit
		const applied = applyWorkspaceEdit(edit, cwd);
		return {
			text: `Applied rename "${symbol}" → "${newName}" to ${applied} file(s):\n${changes.join("\n")}`,
			count: applied,
			serverName,
		};
	} catch (err) {
		return { text: `LSP error: ${err instanceof Error ? err.message : String(err)}`, serverName };
	}
}

async function handleCodeActions(
	_file: string,
	absolutePath: string,
	line: number,
	cwd: string,
	signal?: AbortSignal,
): Promise<ActionResult> {
	const config = loadLspConfig(cwd);
	const servers = filterAvailableServers(getServersForFile(config, absolutePath));
	if (servers.length === 0) return { text: "No LSP server available for code_actions." };

	const [serverName, serverConfig] = servers[0];
	const client = await getOrCreateClient(serverName, serverConfig, cwd);
	await ensureFileOpen(client, absolutePath);

	const position = findSymbolPosition(absolutePath, line, undefined);
	if (!position) return { text: `Could not locate line ${line}` };

	const uri = fileToUri(absolutePath);
	const currentDiags = client.diagnostics.get(uri)?.diagnostics ?? [];
	const matchingDiags = currentDiags.filter(
		(d) => d.range.start.line <= position.line && d.range.end.line >= position.line,
	);

	try {
		const actions = (await sendRequest(
			client,
			"textDocument/codeAction",
			{
				textDocument: { uri },
				range: {
					start: position,
					end: { line: position.line, character: position.character + 1 },
				},
				context: { diagnostics: matchingDiags, triggerKind: 1 },
			},
			signal,
		)) as CodeAction[] | null;

		if (!actions || actions.length === 0) {
			return { text: "No code actions available.", count: 0, serverName };
		}

		const lines = actions.map((a, i) => {
			const kind = a.kind ? ` [${a.kind}]` : "";
			const preferred = a.isPreferred ? " (preferred)" : "";
			return `  ${i + 1}. ${a.title}${kind}${preferred}`;
		});
		return { text: lines.join("\n"), count: actions.length, serverName };
	} catch (err) {
		return { text: `LSP error: ${err instanceof Error ? err.message : String(err)}`, serverName };
	}
}

function handleStatus(): ActionResult {
	const clients = getActiveClients();
	if (clients.length === 0) {
		return { text: "No active LSP clients." };
	}
	const lines = clients.map((c) => `  ${c.name} @ ${c.cwd} (pid=${c.pid ?? "?"})`);
	return { text: `${clients.length} active LSP client(s):\n${lines.join("\n")}`, count: clients.length };
}

// ============================================================================
// WorkspaceEdit Apply (minimal implementation)
// ============================================================================

function applyWorkspaceEdit(edit: WorkspaceEdit, cwd: string): number {
	const { writeFileSync } = require("node:fs") as typeof import("node:fs");
	let appliedFiles = 0;

	const editsByUri = new Map<string, Array<{ range: { start: Position; end: Position }; newText: string }>>();

	if (edit.changes) {
		for (const [uri, edits] of Object.entries(edit.changes)) {
			editsByUri.set(uri, edits);
		}
	}
	if (edit.documentChanges) {
		for (const change of edit.documentChanges) {
			if ("textDocument" in change) {
				editsByUri.set(change.textDocument.uri, change.edits);
			}
		}
	}

	for (const [uri, edits] of editsByUri) {
		const filePath = uriToFile(uri);
		if (!existsSync(filePath)) continue;
		const content = readFileSync(filePath, "utf8");
		const updated = applyTextEdits(content, edits);
		writeFileSync(filePath, updated, "utf8");
		appliedFiles++;
	}

	// Suppress unused warning for cwd (reserved for future relative-path logic)
	void cwd;
	return appliedFiles;
}

function applyTextEdits(
	content: string,
	edits: Array<{ range: { start: Position; end: Position }; newText: string }>,
): string {
	// Sort edits in reverse order so earlier edits don't shift later positions
	const sorted = [...edits].sort((a, b) => {
		const cmp = b.range.start.line - a.range.start.line;
		if (cmp !== 0) return cmp;
		return b.range.start.character - a.range.start.character;
	});

	const lines = content.split(/\r?\n/);
	for (const edit of sorted) {
		const startLine = edit.range.start.line;
		const endLine = edit.range.end.line;
		const startChar = edit.range.start.character;
		const endChar = edit.range.end.character;

		if (startLine === endLine) {
			const line = lines[startLine] ?? "";
			lines[startLine] = line.slice(0, startChar) + edit.newText + line.slice(endChar);
		} else {
			const startLineText = lines[startLine] ?? "";
			const endLineText = lines[endLine] ?? "";
			const replacement = startLineText.slice(0, startChar) + edit.newText + endLineText.slice(endChar);
			lines.splice(startLine, endLine - startLine + 1, ...replacement.split("\n"));
		}
	}

	return lines.join("\n");
}

interface LspToolDetails {
	action: string;
	success: boolean;
	server?: string;
	count?: number;
	error?: string;
}

// ============================================================================
// Extension
// ============================================================================

export default function lumenLspExtension(pi: ExtensionAPI): void {
	let cwd = process.cwd();

	pi.on("session_start", (_event, ctx) => {
		cwd = ctx.cwd;
	});

	// Cleanup on session shutdown
	pi.on("session_shutdown", () => {
		disposeAllClients();
	});

	// =========================================================================
	// Writethrough: auto-diagnostics after edit/write/apply_patch
	//
	// After the LLM modifies a file, we automatically run diagnostics and
	// inject any errors into the tool result. This lets the LLM see type errors
	// immediately and self-correct without the user having to ask.
	//
	// Degradation chain:
	//   1. LSP server available → use it (fast, incremental)
	//   2. LSP broken/unavailable → try CLI (tsc/pyright/cargo check)
	//   3. CLI unavailable → silently skip (no error shown to user or LLM)
	// =========================================================================
	pi.on("tool_result", async (event, _ctx) => {
		// Only trigger for file-modifying tools
		if (event.toolName !== "edit" && event.toolName !== "write" && event.toolName !== "apply_patch") {
			return;
		}
		// Don't inject diagnostics if the tool already errored
		if (event.isError) return;

		// Extract the file path from tool input
		const input = event.input as { path?: string; patch?: string };
		const filePath = input.path;

		// For apply_patch, we can extract touched files from the tool result details.
		// The details contain filesAdded/filesUpdated/filesMoved arrays.
		if (event.toolName === "apply_patch") {
			const details = event.details as
				| {
						filesAdded?: string[];
						filesUpdated?: string[];
						filesMoved?: string[];
						success?: boolean;
				  }
				| undefined;
			if (!details?.success) return;

			const touchedFiles = [
				...(details.filesAdded ?? []),
				...(details.filesUpdated ?? []),
				...(details.filesMoved ?? []).map((m: string) => m.split(" → ").pop() ?? m),
			];

			// Run diagnostics on the first touched file (to avoid flooding)
			const firstFile = touchedFiles[0];
			if (!firstFile) return;
			const absPath = resolve(cwd, firstFile);
			if (!existsSync(absPath)) return;

			let diagnosticText: string | undefined;
			try {
				const config = loadLspConfig(cwd);
				const servers = filterAvailableServers(getServersForFile(config, absPath));
				if (servers.length > 0 && !isServerBroken(servers[0][0], cwd)) {
					const [serverName, serverConfig] = servers[0];
					const client = await getOrCreateClient(serverName, serverConfig, cwd, 10_000);
					await ensureFileOpen(client, absPath);
					const content = readFileSync(absPath, "utf8");
					await syncContent(client, absPath, content);
					notifySaved(client, absPath);
					const uri = fileToUri(absPath);
					const diagnostics = await waitForDiagnostics(client, uri, 3000);
					if (diagnostics.length > 0) {
						const lines = diagnostics.slice(0, 10).map((d) => {
							const sev = DIAGNOSTIC_SEVERITY_NAMES[d.severity ?? 1].toUpperCase();
							return `${sev} ${firstFile}:${d.range.start.line + 1}:${d.range.start.character + 1} — ${d.message}`;
						});
						diagnosticText = `\n\n[LSP diagnostics after patch]\n${lines.join("\n")}`;
					}
				} else {
					const lang = detectLanguageFromExt(absPath);
					const cliDiags = runCliDiagnostics(cwd, lang, absPath);
					if (cliDiags.length > 0) {
						const lines = cliDiags
							.slice(0, 10)
							.map((d) => `${d.severity.toUpperCase()} ${d.file}:${d.line}:${d.column} — ${d.message}`);
						diagnosticText = `\n\n[diagnostics after patch]\n${lines.join("\n")}`;
					}
				}
			} catch {
				// Silent fallback
			}

			if (diagnosticText) {
				const newContent = event.content.map((block, idx) => {
					if (idx === event.content.length - 1 && block.type === "text") {
						return { ...block, text: `${block.text}${diagnosticText}` };
					}
					return block;
				});
				return { content: newContent };
			}
			return;
		}

		if (!filePath) return;

		const absolutePath = resolve(cwd, filePath);
		if (!existsSync(absolutePath)) return;

		// Try to get diagnostics (with full degradation chain)
		let diagnosticText: string | undefined;
		try {
			const config = loadLspConfig(cwd);
			const servers = filterAvailableServers(getServersForFile(config, absolutePath));

			if (servers.length > 0 && !isServerBroken(servers[0][0], cwd)) {
				// Path 1: LSP
				const [serverName, serverConfig] = servers[0];
				const client = await getOrCreateClient(serverName, serverConfig, cwd, 10_000);
				await ensureFileOpen(client, absolutePath);
				const content = readFileSync(absolutePath, "utf8");
				await syncContent(client, absolutePath, content);
				notifySaved(client, absolutePath);

				const uri = fileToUri(absolutePath);
				const diagnostics = await waitForDiagnostics(client, uri, 3000);

				if (diagnostics.length > 0) {
					const errors = diagnostics.filter((d) => d.severity === 1);
					const warnings = diagnostics.filter((d) => d.severity === 2);
					if (errors.length > 0 || warnings.length > 0) {
						const lines = diagnostics.slice(0, 10).map((d) => {
							const sev = DIAGNOSTIC_SEVERITY_NAMES[d.severity ?? 1].toUpperCase();
							return `${sev} ${filePath}:${d.range.start.line + 1}:${d.range.start.character + 1} — ${d.message}`;
						});
						if (diagnostics.length > 10) lines.push(`... and ${diagnostics.length - 10} more`);
						diagnosticText = `\n\n[LSP diagnostics after edit]\n${lines.join("\n")}`;
					}
				}
			} else {
				// Path 2: CLI fallback
				const lang = detectLanguageFromExt(absolutePath);
				const cliDiags = runCliDiagnostics(cwd, lang, absolutePath);
				if (cliDiags.length > 0) {
					const lines = cliDiags
						.slice(0, 10)
						.map((d) => `${d.severity.toUpperCase()} ${d.file}:${d.line}:${d.column} — ${d.message}`);
					if (cliDiags.length > 10) lines.push(`... and ${cliDiags.length - 10} more`);
					diagnosticText = `\n\n[diagnostics after edit]\n${lines.join("\n")}`;
				}
			}
		} catch {
			// Path 3: silently skip — don't disrupt the tool result
		}

		// If we found diagnostics, append them to the tool result content
		if (diagnosticText) {
			const newContent = event.content.map((block, idx) => {
				if (idx === event.content.length - 1 && block.type === "text") {
					return { ...block, text: `${block.text}${diagnosticText}` };
				}
				return block;
			});
			return { content: newContent };
		}
		return;
	});

	pi.registerTool<typeof LspParams, LspToolDetails>({
		name: "lsp",
		label: "LSP",
		description:
			"Language-aware code intelligence via LSP protocol (or CLI fallback). " +
			"Actions: diagnostics (type check), definition, type_definition, implementation, " +
			"references, hover, symbols, rename, code_actions, status. " +
			"Auto-detects language from file extension and spawns appropriate language server " +
			"(typescript-language-server, pyright, gopls, rust-analyzer, clangd, etc.).",
		promptSnippet: "lsp — code intelligence (diagnostics, definitions, references, rename, ...)",
		promptGuidelines: [
			"Use 'lsp action=diagnostics file=path' after edits to catch type errors.",
			"Use 'lsp action=references file=path line=N symbol=Name' to find all usages.",
			"Rename with 'action=rename apply=false' first to preview, then apply=true.",
			"Falls back silently if the language server is not installed.",
		],
		parameters: LspParams,

		async execute(
			_toolCallId: string,
			params: {
				action:
					| "diagnostics"
					| "definition"
					| "type_definition"
					| "implementation"
					| "references"
					| "hover"
					| "symbols"
					| "rename"
					| "code_actions"
					| "status";
				file?: string;
				line?: number;
				symbol?: string;
				query?: string;
				new_name?: string;
				apply?: boolean;
			},
			signal: AbortSignal | undefined,
			_onUpdate: undefined,
			ctx: ExtensionContext,
		) {
			const action = params.action;
			const cwd = ctx.cwd;

			try {
				let result: ActionResult;

				if (action === "status") {
					result = handleStatus();
				} else if (action === "symbols") {
					const absolutePath = params.file ? resolve(cwd, params.file) : undefined;
					result = await handleSymbols(params.file, absolutePath, params.query, cwd, signal);
				} else {
					// All other actions require a file
					if (!params.file) {
						return {
							content: [{ type: "text" as const, text: `Action "${action}" requires 'file' parameter.` }],
							details: { action, success: false } satisfies LspToolDetails,
						};
					}
					const absolutePath = resolve(cwd, params.file);
					if (!existsSync(absolutePath)) {
						return {
							content: [{ type: "text" as const, text: `File not found: ${params.file}` }],
							details: { action, success: false } satisfies LspToolDetails,
						};
					}

					switch (action) {
						case "diagnostics":
							result = await handleDiagnostics(params.file, absolutePath, cwd, signal);
							break;
						case "definition":
						case "type_definition":
						case "implementation":
							if (!params.line) {
								return {
									content: [{ type: "text" as const, text: `Action "${action}" requires 'line' parameter.` }],
									details: { action, success: false } satisfies LspToolDetails,
								};
							}
							result = await handleLocation(
								action,
								params.file,
								absolutePath,
								params.line,
								params.symbol,
								cwd,
								signal,
							);
							break;
						case "references":
							if (!params.line) {
								return {
									content: [{ type: "text" as const, text: `Action "references" requires 'line' parameter.` }],
									details: { action, success: false } satisfies LspToolDetails,
								};
							}
							result = await handleReferences(
								params.file,
								absolutePath,
								params.line,
								params.symbol,
								cwd,
								signal,
							);
							break;
						case "hover":
							if (!params.line) {
								return {
									content: [{ type: "text" as const, text: `Action "hover" requires 'line' parameter.` }],
									details: { action, success: false } satisfies LspToolDetails,
								};
							}
							result = await handleHover(params.file, absolutePath, params.line, params.symbol, cwd, signal);
							break;
						case "rename":
							if (!params.line || !params.new_name) {
								return {
									content: [
										{
											type: "text" as const,
											text: `Action "rename" requires 'line' and 'new_name' parameters.`,
										},
									],
									details: { action, success: false } satisfies LspToolDetails,
								};
							}
							result = await handleRename(
								params.file,
								absolutePath,
								params.line,
								params.symbol,
								params.new_name,
								params.apply ?? false,
								cwd,
								signal,
							);
							break;
						case "code_actions":
							if (!params.line) {
								return {
									content: [
										{ type: "text" as const, text: `Action "code_actions" requires 'line' parameter.` },
									],
									details: { action, success: false } satisfies LspToolDetails,
								};
							}
							result = await handleCodeActions(params.file, absolutePath, params.line, cwd, signal);
							break;
						default:
							return {
								content: [{ type: "text" as const, text: `Unknown action: ${action}` }],
								details: { action, success: false } satisfies LspToolDetails,
							};
					}
				}

				return {
					content: [{ type: "text" as const, text: result.text }],
					details: {
						action,
						success: true,
						server: result.serverName,
						count: result.count,
					},
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text" as const, text: `LSP error: ${msg}` }],
					details: { action, success: false, error: msg } satisfies LspToolDetails,
				};
			}
		},

		renderCall(args: { action?: string; file?: string; symbol?: string }, theme, _context) {
			const parts: string[] = [args.action ?? "?"];
			if (args.file) parts.push(args.file);
			if (args.symbol) parts.push(`"${args.symbol}"`);
			const text = theme.fg("toolTitle", theme.bold("lsp ")) + theme.fg("muted", parts.join(" "));
			return new Text(text, 0, 0);
		},

		renderResult(result, _options: ToolRenderResultOptions, theme, _context) {
			const details = result.details as
				| { action?: string; success?: boolean; count?: number; server?: string }
				| undefined;
			if (!details) return new Text(theme.fg("dim", "—"), 0, 0);
			if (!details.success) return new Text(theme.fg("error", "\u2717 ") + theme.fg("muted", "failed"), 0, 0);

			const icon = theme.fg("success", "\u2713 ");
			const count = details.count !== undefined ? ` ${details.count}` : "";
			const server = details.server ? ` [${details.server}]` : "";
			return new Text(icon + theme.fg("muted", `${details.action}${count}${server}`), 0, 0);
		},
	});
}

// Exports for testing
export { parseTypescriptOutput, detectLanguageFromExt, applyTextEdits, rgSymbolSearch };
