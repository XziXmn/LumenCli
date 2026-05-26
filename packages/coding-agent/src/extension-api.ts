/**
 * Lightweight public API surface exposed to extensions.
 *
 * Keep this module free of CLI mode imports. The extension loader imports it
 * eagerly to provide virtual modules, so pulling in main/tui here would make
 * non-TUI tests and extension loading initialize terminal renderer dependencies.
 */

export { getAgentDir, VERSION } from "./config.ts";
export {
	AgentSession,
	type AgentSessionConfig,
	type AgentSessionEvent,
	type AgentSessionEventListener,
	type ModelCycleResult,
	type ParsedSkillBlock,
	type PromptOptions,
	parseSkillBlock,
	type SessionStats,
} from "./core/agent-session.ts";
export {
	type ApiKeyCredential,
	type AuthCredential,
	type AuthStatus,
	AuthStorage,
	type AuthStorageBackend,
	FileAuthStorageBackend,
	InMemoryAuthStorageBackend,
	type OAuthCredential,
} from "./core/auth-storage.ts";
export { createEventBus, type EventBus, type EventBusController } from "./core/event-bus.ts";
export type { ReadonlyFooterDataProvider } from "./core/footer-data-provider.ts";
export { convertToLlm } from "./core/messages.ts";
export { ModelRegistry } from "./core/model-registry.ts";
export type {
	PackageManager,
	PathMetadata,
	ProgressCallback,
	ProgressEvent,
	ResolvedPaths,
	ResolvedResource,
} from "./core/package-manager.ts";
export { DefaultPackageManager } from "./core/package-manager.ts";
export type { ResourceCollision, ResourceDiagnostic, ResourceLoader } from "./core/resource-loader.ts";
export { DefaultResourceLoader, loadProjectContextFiles } from "./core/resource-loader.ts";
export * from "./core/sdk.ts";
export {
	type BranchSummaryEntry,
	buildSessionContext,
	type CompactionEntry,
	CURRENT_SESSION_VERSION,
	type CustomEntry,
	type CustomMessageEntry,
	type FileEntry,
	getLatestCompactionEntry,
	type ModelChangeEntry,
	migrateSessionEntries,
	type NewSessionOptions,
	parseSessionEntries,
	type SessionContext,
	type SessionEntry,
	type SessionEntryBase,
	type SessionHeader,
	type SessionInfo,
	type SessionInfoEntry,
	SessionManager,
	type SessionMessageEntry,
	type ThinkingLevelChangeEntry,
} from "./core/session-manager.ts";
export {
	type CompactionSettings,
	type ImageSettings,
	type PackageSource,
	type RetrySettings,
	SettingsManager,
} from "./core/settings-manager.ts";
export {
	formatSkillsForPrompt,
	type LoadSkillsFromDirOptions,
	type LoadSkillsResult,
	loadSkills,
	loadSkillsFromDir,
	type Skill,
	type SkillFrontmatter,
} from "./core/skills.ts";
export { createSyntheticSourceInfo } from "./core/source-info.ts";
export {
	ArminComponent,
	AssistantMessageComponent,
	BashExecutionComponent,
	BorderedLoader,
	BranchSummaryMessageComponent,
	CompactionSummaryMessageComponent,
	CustomEditor,
	CustomMessageComponent,
	DynamicBorder,
	ExtensionEditorComponent,
	ExtensionInputComponent,
	ExtensionSelectorComponent,
	FooterComponent,
	keyHint,
	keyText,
	LoginDialogComponent,
	ModelSelectorComponent,
	OAuthSelectorComponent,
	type RenderDiffOptions,
	rawKeyHint,
	renderDiff,
	SessionSelectorComponent,
	type SettingsCallbacks,
	type SettingsConfig,
	SettingsSelectorComponent,
	ShowImagesSelectorComponent,
	SkillInvocationMessageComponent,
	ThemeSelectorComponent,
	ThinkingSelectorComponent,
	ToolExecutionComponent,
	type ToolExecutionOptions,
	TreeSelectorComponent,
	truncateToVisualLines,
	UserMessageComponent,
	UserMessageSelectorComponent,
	type VisualTruncateResult,
} from "./modes/interactive/components/index.ts";
export {
	getLanguageFromPath,
	getMarkdownTheme,
	getSelectListTheme,
	getSettingsListTheme,
	highlightCode,
	initTheme,
	Theme,
	type ThemeColor,
} from "./modes/interactive/theme/theme.ts";
export { copyToClipboard } from "./utils/clipboard.ts";
export { parseFrontmatter, stripFrontmatter } from "./utils/frontmatter.ts";
export { getShellConfig } from "./utils/shell.ts";
