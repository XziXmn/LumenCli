/**
 * Lumen LSP Protocol Types
 *
 * TypeScript types for the LSP protocol (subset).
 * Based on LSP 3.17 spec: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
 *
 * [Provenance] 来源: LSP 3.17 spec + oh-my-pi src/lsp/types.ts
 * [Provenance] 移植方式: 参考重写（Node.js 纯实现，去除 Bun 依赖）
 */

import type { ChildProcessWithoutNullStreams } from "node:child_process";

// =============================================================================
// Base Types
// =============================================================================

export interface Position {
	line: number;
	character: number;
}

export interface Range {
	start: Position;
	end: Position;
}

export interface Location {
	uri: string;
	range: Range;
}

export interface LocationLink {
	originSelectionRange?: Range;
	targetUri: string;
	targetRange: Range;
	targetSelectionRange: Range;
}

// =============================================================================
// Diagnostics
// =============================================================================

export type DiagnosticSeverity = 1 | 2 | 3 | 4; // error, warning, info, hint

export const DIAGNOSTIC_SEVERITY_NAMES: Record<DiagnosticSeverity, string> = {
	1: "error",
	2: "warning",
	3: "info",
	4: "hint",
};

export interface DiagnosticRelatedInformation {
	location: Location;
	message: string;
}

export interface Diagnostic {
	range: Range;
	severity?: DiagnosticSeverity;
	code?: string | number;
	codeDescription?: { href: string };
	source?: string;
	message: string;
	tags?: number[];
	relatedInformation?: DiagnosticRelatedInformation[];
	data?: unknown;
}

export interface PublishedDiagnostics {
	diagnostics: Diagnostic[];
	version: number | null;
}

export interface PublishDiagnosticsParams {
	uri: string;
	version?: number | null;
	diagnostics: Diagnostic[];
}

// =============================================================================
// Text Edits
// =============================================================================

export interface TextEdit {
	range: Range;
	newText: string;
}

export interface TextDocumentIdentifier {
	uri: string;
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
	version: number | null;
}

export interface TextDocumentEdit {
	textDocument: VersionedTextDocumentIdentifier;
	edits: TextEdit[];
}

export interface CreateFile {
	kind: "create";
	uri: string;
	options?: { overwrite?: boolean; ignoreIfExists?: boolean };
}

export interface RenameFile {
	kind: "rename";
	oldUri: string;
	newUri: string;
	options?: { overwrite?: boolean; ignoreIfExists?: boolean };
}

export interface DeleteFile {
	kind: "delete";
	uri: string;
	options?: { recursive?: boolean; ignoreIfNotExists?: boolean };
}

export type DocumentChange = TextDocumentEdit | CreateFile | RenameFile | DeleteFile;

export interface WorkspaceEdit {
	changes?: Record<string, TextEdit[]>;
	documentChanges?: DocumentChange[];
}

// =============================================================================
// Symbols
// =============================================================================

export type SymbolKind =
	| 1 // File
	| 2 // Module
	| 3 // Namespace
	| 4 // Package
	| 5 // Class
	| 6 // Method
	| 7 // Property
	| 8 // Field
	| 9 // Constructor
	| 10 // Enum
	| 11 // Interface
	| 12 // Function
	| 13 // Variable
	| 14 // Constant
	| 15 // String
	| 16 // Number
	| 17 // Boolean
	| 18 // Array
	| 19 // Object
	| 20 // Key
	| 21 // Null
	| 22 // EnumMember
	| 23 // Struct
	| 24 // Event
	| 25 // Operator
	| 26; // TypeParameter

export const SYMBOL_KIND_NAMES: Record<number, string> = {
	1: "File",
	2: "Module",
	3: "Namespace",
	4: "Package",
	5: "Class",
	6: "Method",
	7: "Property",
	8: "Field",
	9: "Constructor",
	10: "Enum",
	11: "Interface",
	12: "Function",
	13: "Variable",
	14: "Constant",
	15: "String",
	16: "Number",
	17: "Boolean",
	18: "Array",
	19: "Object",
	20: "Key",
	21: "Null",
	22: "EnumMember",
	23: "Struct",
	24: "Event",
	25: "Operator",
	26: "TypeParameter",
};

export interface DocumentSymbol {
	name: string;
	detail?: string;
	kind: SymbolKind;
	tags?: number[];
	deprecated?: boolean;
	range: Range;
	selectionRange: Range;
	children?: DocumentSymbol[];
}

export interface SymbolInformation {
	name: string;
	kind: SymbolKind;
	tags?: number[];
	deprecated?: boolean;
	location: Location;
	containerName?: string;
}

// =============================================================================
// Hover
// =============================================================================

export interface MarkupContent {
	kind: "plaintext" | "markdown";
	value: string;
}

export type MarkedString = string | { language: string; value: string };

export interface Hover {
	contents: MarkupContent | MarkedString | MarkedString[];
	range?: Range;
}

// =============================================================================
// Code Actions
// =============================================================================

export interface Command {
	title: string;
	command: string;
	arguments?: unknown[];
}

export interface CodeAction {
	title: string;
	kind?: string;
	diagnostics?: Diagnostic[];
	isPreferred?: boolean;
	disabled?: { reason: string };
	edit?: WorkspaceEdit;
	command?: Command;
	data?: unknown;
}

export interface CodeActionContext {
	diagnostics: Diagnostic[];
	only?: string[];
	triggerKind?: 1 | 2;
}

// =============================================================================
// Server Configuration
// =============================================================================

export interface ServerConfig {
	/** Executable name or absolute path */
	command: string;
	/** Arguments to pass */
	args?: string[];
	/** File extensions this server handles (e.g., [".ts", ".tsx"]) */
	fileTypes: string[];
	/** File/directory names that indicate a project root */
	rootMarkers: string[];
	/** InitializationOptions passed to server during initialize */
	initOptions?: Record<string, unknown>;
	/** Workspace settings pushed via workspace/didChangeConfiguration */
	settings?: Record<string, unknown>;
	/** Whether the server is disabled */
	disabled?: boolean;
	/** Custom warmup timeout (ms) */
	warmupTimeoutMs?: number;
	/** Environment variables to pass to the server process */
	env?: Record<string, string>;
}

// =============================================================================
// Client State (internal)
// =============================================================================

export interface OpenFile {
	version: number;
	languageId: string;
}

export interface PendingRequest {
	resolve: (result: unknown) => void;
	reject: (error: Error) => void;
	method: string;
}

export interface ServerCapabilities {
	renameProvider?: boolean | { prepareProvider?: boolean };
	codeActionProvider?: boolean | { resolveProvider?: boolean; codeActionKinds?: string[] };
	hoverProvider?: boolean;
	definitionProvider?: boolean;
	typeDefinitionProvider?: boolean;
	implementationProvider?: boolean;
	referencesProvider?: boolean;
	documentSymbolProvider?: boolean;
	workspaceSymbolProvider?: boolean;
	documentFormattingProvider?: boolean;
	documentRangeFormattingProvider?: boolean;
	textDocumentSync?: number | { change?: number; save?: boolean | { includeText?: boolean } };
	[key: string]: unknown;
}

export interface LspClient {
	name: string;
	cwd: string;
	config: ServerConfig;
	proc: ChildProcessWithoutNullStreams;
	requestId: number;
	diagnostics: Map<string, PublishedDiagnostics>;
	diagnosticsVersion: number;
	openFiles: Map<string, OpenFile>;
	pendingRequests: Map<number, PendingRequest>;
	messageBuffer: Buffer;
	serverCapabilities?: ServerCapabilities;
	lastActivity: number;
	initialized: boolean;
	initializedPromise: Promise<void>;
	resolveInitialized: () => void;
	rejectInitialized: (err: Error) => void;
}

// =============================================================================
// JSON-RPC
// =============================================================================

export interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: number;
	method: string;
	params?: unknown;
}

export interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: number;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
	jsonrpc: "2.0";
	method: string;
	params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;
