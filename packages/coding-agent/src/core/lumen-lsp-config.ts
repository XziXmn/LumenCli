/**
 * Lumen LSP Server Configuration
 *
 * Default language server configs, loading logic, and file-type routing.
 *
 * Users can override via `.lumen/lsp.json` with the same schema as oh-my-pi's defaults.json.
 *
 * [Provenance] 来源: oh-my-pi src/lsp/defaults.json + config.ts
 * [Provenance] 移植方式: 精简版默认配置 + Node.js 文件发现
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { CONFIG_DIR_NAME, LEGACY_CONFIG_DIR_NAME } from "../config.js";
import type { ServerConfig } from "./lumen-lsp-types.js";

// ============================================================================
// Built-in Server Configs
// ============================================================================

export const DEFAULT_SERVERS: Record<string, ServerConfig> = {
	"typescript-language-server": {
		command: "typescript-language-server",
		args: ["--stdio"],
		fileTypes: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
		rootMarkers: ["package.json", "tsconfig.json", "jsconfig.json"],
		initOptions: {
			hostInfo: "lumen-coding-agent",
			preferences: {
				includeInlayParameterNameHints: "all",
				includeInlayVariableTypeHints: true,
			},
		},
	},
	pyright: {
		command: "pyright-langserver",
		args: ["--stdio"],
		fileTypes: [".py", ".pyi"],
		rootMarkers: ["pyproject.toml", "pyrightconfig.json", "setup.py", "requirements.txt"],
		settings: {
			python: {
				analysis: {
					autoSearchPaths: true,
					diagnosticMode: "openFilesOnly",
					useLibraryCodeForTypes: true,
				},
			},
		},
	},
	basedpyright: {
		command: "basedpyright-langserver",
		args: ["--stdio"],
		fileTypes: [".py", ".pyi"],
		rootMarkers: ["pyproject.toml", "pyrightconfig.json"],
	},
	gopls: {
		command: "gopls",
		args: ["serve"],
		fileTypes: [".go", ".mod", ".sum"],
		rootMarkers: ["go.mod", "go.work"],
		settings: {
			gopls: {
				analyses: { unusedparams: true, shadow: true },
				staticcheck: true,
			},
		},
	},
	"rust-analyzer": {
		command: "rust-analyzer",
		args: [],
		fileTypes: [".rs"],
		rootMarkers: ["Cargo.toml", "rust-analyzer.toml"],
	},
	clangd: {
		command: "clangd",
		args: ["--background-index"],
		fileTypes: [".c", ".cpp", ".cc", ".cxx", ".h", ".hpp"],
		rootMarkers: ["compile_commands.json", "CMakeLists.txt", ".clangd"],
	},
	zls: {
		command: "zls",
		args: [],
		fileTypes: [".zig"],
		rootMarkers: ["build.zig", "zls.json"],
	},
	lua: {
		command: "lua-language-server",
		args: [],
		fileTypes: [".lua"],
		rootMarkers: [".luarc.json", ".luacheckrc", "stylua.toml"],
	},
	bashls: {
		command: "bash-language-server",
		args: ["start"],
		fileTypes: [".sh", ".bash", ".zsh"],
		rootMarkers: [".git"],
	},
	yamlls: {
		command: "yaml-language-server",
		args: ["--stdio"],
		fileTypes: [".yaml", ".yml"],
		rootMarkers: [".git"],
	},
	nixd: {
		command: "nixd",
		args: [],
		fileTypes: [".nix"],
		rootMarkers: ["flake.nix", "default.nix"],
	},
};

// ============================================================================
// Config Loading
// ============================================================================

export interface LspConfig {
	/** Effective servers map (defaults + user overrides) */
	servers: Record<string, ServerConfig>;
	/** Idle timeout for clients (ms). -1 = disabled */
	idleTimeoutMs: number;
}

let cachedConfig: { cwd: string; config: LspConfig } | undefined;

/**
 * Load LSP config from .lumen/lsp.json (or .pi/lsp.json as fallback),
 * merging with built-in defaults.
 */
export function loadLspConfig(cwd: string): LspConfig {
	if (cachedConfig?.cwd === cwd) return cachedConfig.config;

	const candidates = [join(cwd, CONFIG_DIR_NAME, "lsp.json"), join(cwd, LEGACY_CONFIG_DIR_NAME, "lsp.json")];

	let userServers: Record<string, Partial<ServerConfig>> = {};
	let idleTimeoutMs = 10 * 60 * 1000;

	for (const path of candidates) {
		if (existsSync(path)) {
			try {
				const raw = JSON.parse(readFileSync(path, "utf8"));
				if (raw.servers && typeof raw.servers === "object") {
					userServers = raw.servers;
				}
				if (typeof raw.idleTimeoutMs === "number") {
					idleTimeoutMs = raw.idleTimeoutMs;
				}
				break;
			} catch {}
		}
	}

	// Merge: user config can override or extend defaults
	const merged: Record<string, ServerConfig> = { ...DEFAULT_SERVERS };
	for (const [name, userCfg] of Object.entries(userServers)) {
		const base = DEFAULT_SERVERS[name] ?? { command: "", fileTypes: [], rootMarkers: [] };
		merged[name] = {
			...base,
			...(userCfg as ServerConfig),
			initOptions: { ...(base.initOptions ?? {}), ...((userCfg.initOptions ?? {}) as Record<string, unknown>) },
			settings: { ...(base.settings ?? {}), ...((userCfg.settings ?? {}) as Record<string, unknown>) },
		};
	}

	// Filter out disabled servers
	const enabled: Record<string, ServerConfig> = {};
	for (const [name, cfg] of Object.entries(merged)) {
		if (!cfg.disabled) enabled[name] = cfg;
	}

	const config: LspConfig = { servers: enabled, idleTimeoutMs };
	cachedConfig = { cwd, config };
	return config;
}

// ============================================================================
// Server Selection
// ============================================================================

/**
 * Find servers that handle a given file, filtered to those whose command is on PATH.
 */
export function getServersForFile(config: LspConfig, filePath: string): Array<[string, ServerConfig]> {
	const ext = extname(filePath).toLowerCase();
	const matches: Array<[string, ServerConfig]> = [];

	for (const [name, cfg] of Object.entries(config.servers)) {
		if (cfg.fileTypes.some((ft) => ft.toLowerCase() === ext)) {
			matches.push([name, cfg]);
		}
	}

	return matches;
}

/**
 * Check if a given command is available on PATH.
 */
const commandAvailabilityCache = new Map<string, boolean>();

export function isCommandAvailable(cmd: string): boolean {
	if (commandAvailabilityCache.has(cmd)) return commandAvailabilityCache.get(cmd)!;
	try {
		const which = process.platform === "win32" ? "where" : "which";
		execSync(`${which} ${cmd}`, { stdio: "pipe", timeout: 3000 });
		commandAvailabilityCache.set(cmd, true);
		return true;
	} catch {
		commandAvailabilityCache.set(cmd, false);
		return false;
	}
}

export function filterAvailableServers(servers: Array<[string, ServerConfig]>): Array<[string, ServerConfig]> {
	return servers.filter(([, cfg]) => isCommandAvailable(cfg.command));
}
