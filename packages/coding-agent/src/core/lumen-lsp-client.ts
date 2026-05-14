/**
 * Lumen LSP Client
 *
 * Node.js implementation of a Language Server Protocol client.
 * Spawns a language server as a child process and communicates via JSON-RPC over stdio.
 *
 * Features:
 * - Full JSON-RPC 2.0 message framing (Content-Length headers)
 * - Request/response correlation via auto-incrementing request IDs
 * - Notification handling (publishDiagnostics, etc.)
 * - didOpen/didChange/didSave/didClose document sync
 * - Client lifecycle: initialize → initialized → shutdown → exit
 * - Cancellation via AbortSignal
 *
 * [Provenance] 来源: LSP 3.17 spec + oh-my-pi src/lsp/client.ts
 * [Provenance] 移植方式: 参考重写（Bun.spawn 替换为 node:child_process，去除 Bun.sleep 等）
 */

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import type {
	Diagnostic,
	JsonRpcNotification,
	JsonRpcResponse,
	LspClient,
	PendingRequest,
	PublishDiagnosticsParams,
	ServerCapabilities,
	ServerConfig,
} from "./lumen-lsp-types.js";

// ============================================================================
// URI Helpers
// ============================================================================

export function fileToUri(filePath: string): string {
	// Windows: file:///D:/path → decode backslashes
	const normalized = filePath.replace(/\\/g, "/");
	if (/^[a-zA-Z]:/.test(normalized)) {
		return `file:///${encodeURI(normalized).replace(/#/g, "%23").replace(/\?/g, "%3F")}`;
	}
	return `file://${encodeURI(normalized).replace(/#/g, "%23").replace(/\?/g, "%3F")}`;
}

export function uriToFile(uri: string): string {
	let path = uri.replace(/^file:\/\//, "");
	if (/^\/[a-zA-Z]:/.test(path)) {
		path = path.slice(1); // Remove leading slash on Windows
	}
	return decodeURIComponent(path);
}

// ============================================================================
// Language ID Mapping
// ============================================================================

const LANG_ID_MAP: Record<string, string> = {
	".ts": "typescript",
	".tsx": "typescriptreact",
	".js": "javascript",
	".jsx": "javascriptreact",
	".mjs": "javascript",
	".cjs": "javascript",
	".py": "python",
	".pyi": "python",
	".go": "go",
	".rs": "rust",
	".c": "c",
	".cpp": "cpp",
	".cc": "cpp",
	".h": "c",
	".hpp": "cpp",
	".java": "java",
	".rb": "ruby",
	".php": "php",
	".lua": "lua",
	".sh": "shellscript",
	".bash": "shellscript",
	".html": "html",
	".css": "css",
	".json": "json",
	".yaml": "yaml",
	".yml": "yaml",
	".md": "markdown",
	".vue": "vue",
	".svelte": "svelte",
	".swift": "swift",
	".kt": "kotlin",
	".scala": "scala",
	".dart": "dart",
	".zig": "zig",
	".nix": "nix",
};

export function getLanguageId(filePath: string): string {
	return LANG_ID_MAP[extname(filePath).toLowerCase()] ?? "plaintext";
}

// ============================================================================
// Client Registry (shared across calls)
// ============================================================================

const CLIENTS = new Map<string, LspClient>();
const BROKEN_SERVERS = new Set<string>(); // Servers that crashed; don't retry this session
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function clientKey(serverName: string, cwd: string): string {
	return `${serverName}@${cwd}`;
}

/**
 * Check if a server is marked as broken (crashed during this session).
 */
export function isServerBroken(serverName: string, cwd: string): boolean {
	return BROKEN_SERVERS.has(clientKey(serverName, cwd));
}

/**
 * Get all active clients (for debugging/status).
 */
export function getActiveClients(): Array<{ name: string; cwd: string; pid: number | undefined }> {
	return Array.from(CLIENTS.values()).map((c) => ({ name: c.name, cwd: c.cwd, pid: c.proc.pid }));
}

/**
 * Clean up idle clients and all clients on shutdown.
 */
export function disposeAllClients(): void {
	for (const client of CLIENTS.values()) {
		try {
			client.proc.kill("SIGTERM");
		} catch {}
	}
	CLIENTS.clear();
	BROKEN_SERVERS.clear();
}

function startIdleReaper(): void {
	setInterval(() => {
		const now = Date.now();
		for (const [key, client] of CLIENTS) {
			if (now - client.lastActivity > IDLE_TIMEOUT_MS) {
				try {
					client.proc.kill("SIGTERM");
				} catch {}
				CLIENTS.delete(key);
			}
		}
	}, 60_000).unref();
}
startIdleReaper();

// ============================================================================
// Message Framing
// ============================================================================

function encodeMessage(msg: unknown): Buffer {
	const body = Buffer.from(JSON.stringify(msg), "utf8");
	const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii");
	return Buffer.concat([header, body]);
}

function processMessageBuffer(client: LspClient): void {
	while (true) {
		const buf = client.messageBuffer;
		const headerEnd = buf.indexOf("\r\n\r\n");
		if (headerEnd === -1) return;

		const header = buf.slice(0, headerEnd).toString("ascii");
		const match = header.match(/Content-Length:\s*(\d+)/i);
		if (!match) {
			// Malformed header; skip past it
			client.messageBuffer = buf.slice(headerEnd + 4);
			continue;
		}
		const contentLength = Number.parseInt(match[1], 10);
		const totalLength = headerEnd + 4 + contentLength;
		if (buf.length < totalLength) return; // Incomplete message

		const body = buf.slice(headerEnd + 4, totalLength).toString("utf8");
		client.messageBuffer = buf.slice(totalLength);

		try {
			const msg = JSON.parse(body);
			handleIncomingMessage(client, msg);
		} catch {
			// Malformed JSON — swallow; LSP protocol issue not recoverable here
		}
	}
}

// ============================================================================
// Message Handling
// ============================================================================

function handleIncomingMessage(client: LspClient, msg: any): void {
	client.lastActivity = Date.now();

	// Response to a request we sent
	if ("id" in msg && ("result" in msg || "error" in msg)) {
		const response = msg as JsonRpcResponse;
		const pending = client.pendingRequests.get(response.id);
		if (pending) {
			client.pendingRequests.delete(response.id);
			if (response.error) {
				pending.reject(new Error(`${response.error.code}: ${response.error.message}`));
			} else {
				pending.resolve(response.result);
			}
		}
		return;
	}

	// Notification from server
	if (!("id" in msg) && "method" in msg) {
		const notif = msg as JsonRpcNotification;
		handleServerNotification(client, notif);
		return;
	}

	// Request from server (we don't handle any currently)
	// Respond with error to satisfy the server
	if ("id" in msg && "method" in msg) {
		sendRaw(client, {
			jsonrpc: "2.0",
			id: msg.id,
			error: { code: -32601, message: "Method not found" },
		});
	}
}

function handleServerNotification(client: LspClient, notif: JsonRpcNotification): void {
	switch (notif.method) {
		case "textDocument/publishDiagnostics": {
			const params = notif.params as PublishDiagnosticsParams;
			client.diagnostics.set(params.uri, {
				diagnostics: params.diagnostics,
				version: params.version ?? null,
			});
			client.diagnosticsVersion++;
			break;
		}
		case "window/logMessage":
		case "window/showMessage":
			// Silently drop; could be surfaced later
			break;
		case "$/progress":
			// Work-done progress; ignored for now
			break;
		default:
			// Unknown notification; ignore
			break;
	}
}

// ============================================================================
// Low-level I/O
// ============================================================================

function sendRaw(client: LspClient, msg: unknown): void {
	const encoded = encodeMessage(msg);
	client.proc.stdin.write(encoded);
}

export async function sendRequest<T = unknown>(
	client: LspClient,
	method: string,
	params: unknown,
	signal?: AbortSignal,
	timeoutMs = 30_000,
): Promise<T> {
	const id = ++client.requestId;
	return new Promise<T>((resolve, reject) => {
		const cleanup = () => {
			client.pendingRequests.delete(id);
			if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
			clearTimeout(timer);
		};

		const pending: PendingRequest = {
			method,
			resolve: (result) => {
				cleanup();
				resolve(result as T);
			},
			reject: (err) => {
				cleanup();
				reject(err);
			},
		};
		client.pendingRequests.set(id, pending);

		let abortHandler: (() => void) | undefined;
		if (signal) {
			if (signal.aborted) {
				cleanup();
				reject(new Error("Request aborted"));
				return;
			}
			abortHandler = () => {
				cleanup();
				// Best-effort: send $/cancelRequest notification
				try {
					sendRaw(client, { jsonrpc: "2.0", method: "$/cancelRequest", params: { id } });
				} catch {}
				reject(new Error("Request aborted"));
			};
			signal.addEventListener("abort", abortHandler);
		}

		const timer = setTimeout(() => {
			cleanup();
			reject(new Error(`LSP request timeout: ${method} (${timeoutMs}ms)`));
		}, timeoutMs);

		sendRaw(client, { jsonrpc: "2.0", id, method, params });
	});
}

export function sendNotification(client: LspClient, method: string, params: unknown): void {
	sendRaw(client, { jsonrpc: "2.0", method, params });
}

// ============================================================================
// Client Creation / Initialization
// ============================================================================

/**
 * Get or create an LSP client for the given server config.
 * Clients are cached per (serverName, cwd) pair.
 */
export async function getOrCreateClient(
	serverName: string,
	config: ServerConfig,
	cwd: string,
	warmupTimeoutMs = 15_000,
): Promise<LspClient> {
	const key = clientKey(serverName, cwd);

	// Don't retry servers that crashed this session
	if (BROKEN_SERVERS.has(key)) {
		throw new Error(`LSP server ${serverName} previously crashed; skipping for this session.`);
	}

	const existing = CLIENTS.get(key);
	if (existing && !existing.proc.killed) {
		return existing;
	}

	// On Windows, .cmd/.bat wrappers require shell; native binaries don't.
	// Use shell only when the command is not an absolute path to an .exe.
	const useShell = process.platform === "win32" && !/\.exe$/i.test(config.command);

	const proc = spawn(config.command, config.args ?? [], {
		cwd,
		stdio: ["pipe", "pipe", "pipe"],
		env: { ...process.env, ...(config.env ?? {}) },
		windowsHide: true,
		shell: useShell,
	}) as ChildProcessWithoutNullStreams;

	let resolveInit!: () => void;
	let rejectInit!: (err: Error) => void;
	const initPromise = new Promise<void>((resolve, reject) => {
		resolveInit = resolve;
		rejectInit = reject;
	});

	const client: LspClient = {
		name: serverName,
		cwd,
		config,
		proc,
		requestId: 0,
		diagnostics: new Map(),
		diagnosticsVersion: 0,
		openFiles: new Map(),
		pendingRequests: new Map(),
		messageBuffer: Buffer.alloc(0),
		lastActivity: Date.now(),
		initialized: false,
		initializedPromise: initPromise,
		resolveInitialized: resolveInit,
		rejectInitialized: rejectInit,
	};

	proc.stdout.on("data", (chunk: Buffer) => {
		client.messageBuffer = Buffer.concat([client.messageBuffer, chunk]);
		processMessageBuffer(client);
	});

	proc.stderr.on("data", () => {
		// Silently discard stderr; language servers are chatty
	});

	proc.on("exit", (code) => {
		for (const pending of client.pendingRequests.values()) {
			pending.reject(new Error(`LSP server exited with code ${code}`));
		}
		client.pendingRequests.clear();
		CLIENTS.delete(key);
		// Mark as broken so we don't retry this session
		BROKEN_SERVERS.add(key);
		if (!client.initialized) {
			rejectInit(new Error(`LSP server ${serverName} exited before initialization (code ${code})`));
		}
	});

	proc.on("error", (err) => {
		BROKEN_SERVERS.add(key);
		if (!client.initialized) rejectInit(err);
	});

	CLIENTS.set(key, client);

	// Send initialize request
	try {
		const initResult = (await sendRequest(
			client,
			"initialize",
			{
				processId: process.pid,
				clientInfo: { name: "lumen", version: "0.1.0" },
				rootUri: fileToUri(cwd),
				workspaceFolders: [{ uri: fileToUri(cwd), name: "workspace" }],
				capabilities: getClientCapabilities(),
				initializationOptions: config.initOptions ?? {},
			},
			undefined,
			warmupTimeoutMs,
		)) as { capabilities?: ServerCapabilities };

		client.serverCapabilities = initResult.capabilities;

		// Send initialized notification
		sendNotification(client, "initialized", {});

		// Apply workspace settings if any
		if (config.settings) {
			sendNotification(client, "workspace/didChangeConfiguration", { settings: config.settings });
		}

		client.initialized = true;
		resolveInit();
	} catch (err) {
		try {
			proc.kill("SIGTERM");
		} catch {}
		CLIENTS.delete(key);
		rejectInit(err instanceof Error ? err : new Error(String(err)));
		throw err;
	}

	return client;
}

function getClientCapabilities(): Record<string, unknown> {
	return {
		workspace: {
			configuration: true,
			workspaceFolders: true,
			didChangeConfiguration: { dynamicRegistration: false },
			symbol: { dynamicRegistration: false },
		},
		textDocument: {
			synchronization: {
				dynamicRegistration: false,
				willSave: false,
				willSaveWaitUntil: false,
				didSave: true,
			},
			publishDiagnostics: {
				relatedInformation: true,
				versionSupport: true,
				tagSupport: { valueSet: [1, 2] },
			},
			hover: {
				contentFormat: ["markdown", "plaintext"],
			},
			definition: { linkSupport: true },
			typeDefinition: { linkSupport: true },
			implementation: { linkSupport: true },
			references: {},
			documentSymbol: {
				hierarchicalDocumentSymbolSupport: true,
				symbolKind: { valueSet: Array.from({ length: 26 }, (_, i) => i + 1) },
			},
			codeAction: {
				dynamicRegistration: false,
				codeActionLiteralSupport: {
					codeActionKind: {
						valueSet: [
							"",
							"quickfix",
							"refactor",
							"refactor.extract",
							"refactor.inline",
							"refactor.rewrite",
							"source",
							"source.organizeImports",
							"source.fixAll",
						],
					},
				},
				dataSupport: true,
				resolveSupport: { properties: ["edit"] },
			},
			rename: { prepareSupport: true },
			formatting: {},
		},
	};
}

// ============================================================================
// Document Sync
// ============================================================================

/**
 * Ensure a file is open in the server, sending didOpen with current content.
 * If already open, does nothing.
 */
export async function ensureFileOpen(client: LspClient, absolutePath: string): Promise<void> {
	const uri = fileToUri(absolutePath);
	if (client.openFiles.has(uri)) return;

	if (!existsSync(absolutePath)) {
		throw new Error(`File does not exist: ${absolutePath}`);
	}

	const content = readFileSync(absolutePath, "utf8");
	const languageId = getLanguageId(absolutePath);

	sendNotification(client, "textDocument/didOpen", {
		textDocument: {
			uri,
			languageId,
			version: 1,
			text: content,
		},
	});

	client.openFiles.set(uri, { version: 1, languageId });
}

/**
 * Sync new content for a file (sends didChange).
 * Opens the file if not already open.
 */
export async function syncContent(client: LspClient, absolutePath: string, content: string): Promise<void> {
	const uri = fileToUri(absolutePath);
	const openFile = client.openFiles.get(uri);

	if (!openFile) {
		// Open with the new content directly
		const languageId = getLanguageId(absolutePath);
		sendNotification(client, "textDocument/didOpen", {
			textDocument: {
				uri,
				languageId,
				version: 1,
				text: content,
			},
		});
		client.openFiles.set(uri, { version: 1, languageId });
		return;
	}

	openFile.version++;
	sendNotification(client, "textDocument/didChange", {
		textDocument: { uri, version: openFile.version },
		contentChanges: [{ text: content }], // Full document sync
	});
}

/**
 * Notify server that a file was saved.
 */
export function notifySaved(client: LspClient, absolutePath: string): void {
	const uri = fileToUri(absolutePath);
	if (!client.openFiles.has(uri)) return;
	sendNotification(client, "textDocument/didSave", {
		textDocument: { uri },
	});
}

/**
 * Close a file in the server.
 */
export function notifyClosed(client: LspClient, absolutePath: string): void {
	const uri = fileToUri(absolutePath);
	if (!client.openFiles.has(uri)) return;
	sendNotification(client, "textDocument/didClose", {
		textDocument: { uri },
	});
	client.openFiles.delete(uri);
}

/**
 * Wait for diagnostics to be published for a URI.
 * Resolves when diagnostics arrive or timeout expires.
 */
export async function waitForDiagnostics(
	client: LspClient,
	uri: string,
	timeoutMs = 3000,
	signal?: AbortSignal,
): Promise<Diagnostic[]> {
	const start = Date.now();
	const startVersion = client.diagnosticsVersion;
	while (Date.now() - start < timeoutMs) {
		if (signal?.aborted) throw new Error("Aborted");
		if (client.diagnosticsVersion > startVersion && client.diagnostics.has(uri)) {
			return client.diagnostics.get(uri)?.diagnostics ?? [];
		}
		await new Promise((r) => setTimeout(r, 50));
	}
	// Return whatever we have (may be empty)
	return client.diagnostics.get(uri)?.diagnostics ?? [];
}
