import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { CONFIG_DIR_NAME, LEGACY_CONFIG_DIR_NAME } from "./config.ts";

const IMPORT_STATE_FILE = ".pi-import-state.json";

type LegacyImportScope = "user" | "project";
type LegacyImportStatus = "imported" | "declined";

interface LegacyImportMarker {
	status: LegacyImportStatus;
	scope: LegacyImportScope;
	sourceDir: string;
	updatedAt: string;
}

interface LegacyScopeCandidate {
	scope: LegacyImportScope;
	sourceDir: string;
	targetDir: string;
	markerPath: string;
}

export interface LegacyPiImportPrompt {
	scopes: LegacyScopeCandidate[];
	message: string;
}

export interface LegacyPiImportResult {
	imported: string[];
	skipped: string[];
	warnings: string[];
	summaryMessage: string;
}

function getLegacyUserAgentDir(): string {
	return join(homedir(), LEGACY_CONFIG_DIR_NAME, "agent");
}

function getLegacyProjectDir(cwd: string): string {
	return join(cwd, LEGACY_CONFIG_DIR_NAME);
}

function getProjectConfigDir(cwd: string): string {
	return join(cwd, CONFIG_DIR_NAME);
}

function getImportMarkerPath(targetDir: string): string {
	return join(targetDir, IMPORT_STATE_FILE);
}

function loadImportMarker(markerPath: string): LegacyImportMarker | undefined {
	if (!existsSync(markerPath)) {
		return undefined;
	}
	try {
		return JSON.parse(readFileSync(markerPath, "utf-8")) as LegacyImportMarker;
	} catch {
		return undefined;
	}
}

function saveImportMarker(candidate: LegacyScopeCandidate, status: LegacyImportStatus): void {
	mkdirSync(candidate.targetDir, { recursive: true });
	writeFileSync(
		candidate.markerPath,
		`${JSON.stringify(
			{
				status,
				scope: candidate.scope,
				sourceDir: candidate.sourceDir,
				updatedAt: new Date().toISOString(),
			} satisfies LegacyImportMarker,
			null,
			2,
		)}\n`,
		"utf-8",
	);
}

function hasLegacyImportMarker(candidate: LegacyScopeCandidate): boolean {
	return loadImportMarker(candidate.markerPath) !== undefined;
}

function isDirectoryPresentAndNonEmpty(dir: string): boolean {
	if (!existsSync(dir)) {
		return false;
	}
	try {
		if (!statSync(dir).isDirectory()) {
			return true;
		}
		return readdirSync(dir).some((entry) => entry !== IMPORT_STATE_FILE);
	} catch {
		return false;
	}
}

function shouldPromptForScope(candidate: LegacyScopeCandidate): boolean {
	if (!existsSync(candidate.sourceDir) || !isDirectoryPresentAndNonEmpty(candidate.sourceDir)) {
		return false;
	}
	if (hasLegacyImportMarker(candidate)) {
		return false;
	}
	return !isDirectoryPresentAndNonEmpty(candidate.targetDir);
}

function describeScope(scope: LegacyImportScope): string {
	return scope === "user" ? "user (~/.pi/agent → ~/.lumen/agent)" : "project (.pi → .lumen)";
}

function replaceAll(value: string, from: string, to: string): string {
	return from && value.includes(from) ? value.split(from).join(to) : value;
}

function rewriteLegacyStringPaths(
	value: string,
	options: {
		legacyUserDir: string;
		targetUserDir: string;
		legacyProjectDir: string;
		targetProjectDir: string;
	},
): string {
	let result = value;
	result = replaceAll(result, "~/.pi/agent/", "~/.lumen/agent/");
	result = replaceAll(result, "~/.pi/agent", "~/.lumen/agent");
	result = replaceAll(result, ".pi/", ".lumen/");
	result = replaceAll(result, ".pi\\", ".lumen\\");
	result = replaceAll(result, options.legacyUserDir, options.targetUserDir);
	result = replaceAll(result, options.legacyProjectDir, options.targetProjectDir);
	return result;
}

function rewriteLegacyJsonPaths<T>(value: T, options: Parameters<typeof rewriteLegacyStringPaths>[1]): T {
	if (typeof value === "string") {
		return rewriteLegacyStringPaths(value, options) as T;
	}
	if (Array.isArray(value)) {
		return value.map((entry) => rewriteLegacyJsonPaths(entry, options)) as T;
	}
	if (value && typeof value === "object") {
		const rewritten: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			rewritten[key] = rewriteLegacyJsonPaths(entry, options);
		}
		return rewritten as T;
	}
	return value;
}

function copyFileIfMissing(
	sourcePath: string,
	targetPath: string,
	result: LegacyPiImportResult,
	label: string,
	transform?: (raw: string) => string,
): void {
	if (!existsSync(sourcePath)) {
		return;
	}
	if (existsSync(targetPath)) {
		result.skipped.push(`${label} (target exists)`);
		return;
	}
	mkdirSync(dirname(targetPath), { recursive: true });
	if (transform) {
		const raw = readFileSync(sourcePath, "utf-8");
		writeFileSync(targetPath, transform(raw), "utf-8");
	} else {
		cpSync(sourcePath, targetPath, { recursive: false, errorOnExist: false, force: false });
	}
	result.imported.push(label);
}

function copyDirectoryIfMissing(
	sourceDir: string,
	targetDir: string,
	result: LegacyPiImportResult,
	label: string,
): void {
	if (!existsSync(sourceDir)) {
		return;
	}
	if (existsSync(targetDir)) {
		result.skipped.push(`${label} (target exists)`);
		return;
	}
	mkdirSync(dirname(targetDir), { recursive: true });
	cpSync(sourceDir, targetDir, { recursive: true, errorOnExist: false, force: false });
	result.imported.push(label);
}

function buildPathRewriteOptions(cwd: string, agentDir: string) {
	return {
		legacyUserDir: getLegacyUserAgentDir(),
		targetUserDir: agentDir,
		legacyProjectDir: getLegacyProjectDir(cwd),
		targetProjectDir: getProjectConfigDir(cwd),
	};
}

function importLegacySettingsFile(
	sourcePath: string,
	targetPath: string,
	result: LegacyPiImportResult,
	label: string,
	rewriteOptions: ReturnType<typeof buildPathRewriteOptions>,
): void {
	copyFileIfMissing(sourcePath, targetPath, result, label, (raw) => {
		try {
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			delete parsed.apiKeys;
			const rewritten = rewriteLegacyJsonPaths(parsed, rewriteOptions);
			return `${JSON.stringify(rewritten, null, 2)}\n`;
		} catch {
			result.warnings.push(`${label}: invalid JSON, skipped path rewrite`);
			return raw;
		}
	});
}

function importLegacyAuthFile(
	sourceDir: string,
	targetDir: string,
	result: LegacyPiImportResult,
	labelPrefix: string,
): void {
	const targetAuthPath = join(targetDir, "auth.json");
	if (existsSync(targetAuthPath)) {
		result.skipped.push(`${labelPrefix} auth.json (target exists)`);
		return;
	}

	const legacyAuthPath = join(sourceDir, "auth.json");
	if (existsSync(legacyAuthPath)) {
		copyFileIfMissing(legacyAuthPath, targetAuthPath, result, `${labelPrefix} auth.json`);
		return;
	}

	const migrated: Record<string, unknown> = {};
	const legacyOauthPath = join(sourceDir, "oauth.json");
	if (existsSync(legacyOauthPath)) {
		try {
			const oauth = JSON.parse(readFileSync(legacyOauthPath, "utf-8")) as Record<string, object>;
			for (const [provider, credentials] of Object.entries(oauth)) {
				migrated[provider] = { type: "oauth", ...credentials };
			}
		} catch {
			result.warnings.push(`${labelPrefix} oauth.json is invalid and was not migrated`);
		}
	}

	const legacySettingsPath = join(sourceDir, "settings.json");
	if (existsSync(legacySettingsPath)) {
		try {
			const settings = JSON.parse(readFileSync(legacySettingsPath, "utf-8")) as {
				apiKeys?: Record<string, string>;
			};
			for (const [provider, key] of Object.entries(settings.apiKeys ?? {})) {
				if (!migrated[provider] && typeof key === "string" && key.trim()) {
					migrated[provider] = { type: "api_key", key };
				}
			}
		} catch {
			result.warnings.push(`${labelPrefix} settings.json API keys could not be migrated`);
		}
	}

	if (Object.keys(migrated).length === 0) {
		return;
	}

	mkdirSync(targetDir, { recursive: true });
	writeFileSync(targetAuthPath, `${JSON.stringify(migrated, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
	result.imported.push(`${labelPrefix} auth.json`);
}

function importLegacyScope(
	candidate: LegacyScopeCandidate,
	cwd: string,
	agentDir: string,
	result: LegacyPiImportResult,
): void {
	const rewriteOptions = buildPathRewriteOptions(cwd, agentDir);

	importLegacyAuthFile(candidate.sourceDir, candidate.targetDir, result, candidate.scope);
	importLegacySettingsFile(
		join(candidate.sourceDir, "settings.json"),
		join(candidate.targetDir, "settings.json"),
		result,
		`${candidate.scope} settings.json`,
		rewriteOptions,
	);

	for (const fileName of ["models.json", "lsp.json", "keybindings.json", "SYSTEM.md", "APPEND_SYSTEM.md"] as const) {
		copyFileIfMissing(
			join(candidate.sourceDir, fileName),
			join(candidate.targetDir, fileName),
			result,
			`${candidate.scope} ${fileName}`,
			fileName.endsWith(".json")
				? (raw) => {
						try {
							const parsed = JSON.parse(raw) as unknown;
							return `${JSON.stringify(rewriteLegacyJsonPaths(parsed, rewriteOptions), null, 2)}\n`;
						} catch {
							return raw;
						}
					}
				: undefined,
		);
	}

	for (const dirName of ["extensions", "skills", "prompts", "themes", "agents", "rules", "npm", "git"] as const) {
		copyDirectoryIfMissing(
			join(candidate.sourceDir, dirName),
			join(candidate.targetDir, dirName),
			result,
			`${candidate.scope} ${dirName}/`,
		);
	}

	saveImportMarker(candidate, "imported");
}

function formatImportSummary(result: LegacyPiImportResult): string {
	if (result.imported.length === 0 && result.warnings.length === 0) {
		return "Legacy .pi configuration was checked, but nothing needed to be imported.";
	}

	const parts: string[] = [];
	if (result.imported.length > 0) {
		parts.push(`Imported ${result.imported.length} legacy items from .pi into .lumen.`);
	}
	if (result.skipped.length > 0) {
		parts.push(`Skipped ${result.skipped.length} item(s) that already existed in .lumen.`);
	}
	if (result.warnings.length > 0) {
		parts.push(`Warnings: ${result.warnings.join(" | ")}`);
	}
	return parts.join(" ");
}

export function detectLegacyPiImport(cwd: string, agentDir: string): LegacyPiImportPrompt | undefined {
	const candidates = [
		{
			scope: "user" as const,
			sourceDir: getLegacyUserAgentDir(),
			targetDir: agentDir,
			markerPath: getImportMarkerPath(agentDir),
		},
		{
			scope: "project" as const,
			sourceDir: getLegacyProjectDir(cwd),
			targetDir: getProjectConfigDir(cwd),
			markerPath: getImportMarkerPath(getProjectConfigDir(cwd)),
		},
	].filter(shouldPromptForScope);

	if (candidates.length === 0) {
		return undefined;
	}

	const scopeList = candidates.map((candidate) => describeScope(candidate.scope)).join(", ");
	return {
		scopes: candidates,
		message: `Found legacy .pi configuration in ${scopeList}. Lumen now uses .lumen as its only live config surface. Import the legacy config into .lumen now?`,
	};
}

export function declineLegacyPiImport(prompt: LegacyPiImportPrompt): void {
	for (const candidate of prompt.scopes) {
		saveImportMarker(candidate, "declined");
	}
}

export function importLegacyPiConfig(
	cwd: string,
	agentDir: string,
	prompt: LegacyPiImportPrompt,
): LegacyPiImportResult {
	const result: LegacyPiImportResult = {
		imported: [],
		skipped: [],
		warnings: [],
		summaryMessage: "",
	};

	for (const candidate of prompt.scopes) {
		importLegacyScope(candidate, cwd, agentDir, result);
	}

	result.summaryMessage = formatImportSummary(result);
	return result;
}
