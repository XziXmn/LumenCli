/**
 * Interactive mode for the coding agent.
 * Handles TUI rendering and user interaction, delegating business logic to AgentSession.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
	type AssistantMessage,
	getProviders,
	type ImageContent,
	type Message,
	type Model,
	type OAuthProviderId,
	type OAuthSelectPrompt,
} from "@earendil-works/pi-ai";
import type {
	AutocompleteItem,
	AutocompleteProvider,
	EditorComponent,
	Keybinding,
	KeyId,
	MarkdownTheme,
	OverlayHandle,
	OverlayOptions,
	SlashCommand,
} from "@earendil-works/pi-tui";
import {
	CombinedAutocompleteProvider,
	type Component,
	Container,
	fuzzyFilter,
	getCapabilities,
	hyperlink,
	Loader,
	type LoaderIndicatorOptions,
	Markdown,
	matchesKey,
	ProcessTerminal,
	Spacer,
	setKeybindings,
	Text,
	TruncatedText,
	TUI,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { spawn, spawnSync } from "child_process";
import {
	APP_NAME,
	APP_TITLE,
	getAgentDir,
	getAuthPath,
	getDebugLogPath,
	getDocsPath,
	getShareViewerUrl,
	VERSION,
} from "../../config.ts";
import { type AgentSession, type AgentSessionEvent, parseSkillBlock } from "../../core/agent-session.ts";
import { type AgentSessionRuntime, SessionImportFileNotFoundError } from "../../core/agent-session-runtime.ts";
import type {
	AutocompleteProviderFactory,
	EditorFactory,
	ExtensionCommandContext,
	ExtensionContext,
	ExtensionRunner,
	ExtensionUIContext,
	ExtensionUIDialogOptions,
	ExtensionWidgetOptions,
	SpinnerUiState,
} from "../../core/extensions/index.ts";
import { FooterDataProvider, type ReadonlyFooterDataProvider } from "../../core/footer-data-provider.ts";
import { type AppKeybinding, KeybindingsManager } from "../../core/keybindings.ts";
import { createCompactionSummaryMessage } from "../../core/messages.ts";
import { defaultModelPerProvider, findExactModelReferenceMatch, resolveModelScope } from "../../core/model-resolver.ts";
import type { PackageCompatibilityReevaluationResult } from "../../core/package-manager.ts";
import { DefaultPackageManager } from "../../core/package-manager.ts";
import { BUILT_IN_PROVIDER_DISPLAY_NAMES } from "../../core/provider-display-names.ts";
import type { ResourceDiagnostic } from "../../core/resource-loader.ts";
import { formatMissingSessionCwdPrompt, MissingSessionCwdError } from "../../core/session-cwd.ts";
import { type SessionContext, SessionManager } from "../../core/session-manager.ts";
import { BUILTIN_SLASH_COMMANDS } from "../../core/slash-commands.ts";
import type { SourceInfo } from "../../core/source-info.ts";
import { isInstallTelemetryEnabled } from "../../core/telemetry.ts";
import type { TruncationResult } from "../../core/tools/truncate.ts";
import { formatStartupCompatibilityNotice } from "../../startup-compatibility.ts";
import { getLumenChangelogPath, getNewEntries, parseChangelog } from "../../utils/changelog.ts";
import { copyToClipboard } from "../../utils/clipboard.ts";
import { extensionForImageMimeType, readClipboardImage } from "../../utils/clipboard-image.ts";
import { parseGitUrl } from "../../utils/git.ts";
import { formatPathRelativeToCwdOrAbsolute, getCwdRelativePath } from "../../utils/paths.ts";
import { getPiUserAgent } from "../../utils/pi-user-agent.ts";
import { killTrackedDetachedChildren } from "../../utils/shell.ts";
import { ensureTool } from "../../utils/tools-manager.ts";
import { checkForNewPiVersion } from "../../utils/version-check.ts";
import { ArminComponent } from "./components/armin.ts";
import { AssistantMessageComponent } from "./components/assistant-message.ts";
import { AssistantToolBatchSummaryComponent } from "./components/assistant-tool-batch-summary.ts";
import { AssistantToolSummaryComponent } from "./components/assistant-tool-summary.ts";
import { BashExecutionComponent } from "./components/bash-execution.ts";
import { BorderedLoader } from "./components/bordered-loader.ts";
import { BranchSummaryMessageComponent } from "./components/branch-summary-message.ts";
import { CollapsedToolGroupComponent } from "./components/collapsed-tool-group.ts";
import { CompactionSummaryMessageComponent } from "./components/compaction-summary-message.ts";
import { CountdownTimer } from "./components/countdown-timer.ts";
import { CustomEditor } from "./components/custom-editor.ts";
import { CustomMessageComponent } from "./components/custom-message.ts";
import { DaxnutsComponent } from "./components/daxnuts.ts";
import { DynamicBorder } from "./components/dynamic-border.ts";
import { EarendilAnnouncementComponent } from "./components/earendil-announcement.ts";
import { ExtensionEditorComponent } from "./components/extension-editor.ts";
import { ExtensionInputComponent } from "./components/extension-input.ts";
import { ExtensionSelectorComponent } from "./components/extension-selector.ts";
import { FooterComponent } from "./components/footer.ts";
import { TUI_COPY } from "./components/interactive-strings.ts";
import { formatKeyText, keyDisplayText, keyHint, keyText, rawKeyHint } from "./components/keybinding-hints.ts";
import { LoginDialogComponent } from "./components/login-dialog.ts";
import { ModelSelectorComponent } from "./components/model-selector.ts";
import { type AuthSelectorProvider, OAuthSelectorComponent } from "./components/oauth-selector.ts";
import {
	createProgressSurfaceWorkingState,
	ProgressSurfaceComponent,
	type ProgressSurfaceSnapshot,
	shouldRenderProgressSurface,
} from "./components/progress-surface.ts";
import { ScopedModelsSelectorComponent } from "./components/scoped-models-selector.ts";
import { SessionSelectorComponent } from "./components/session-selector.ts";
import { SettingsSelectorComponent } from "./components/settings-selector.ts";
import { SkillInvocationMessageComponent } from "./components/skill-invocation-message.ts";
import { ToolExecutionComponent } from "./components/tool-execution.ts";
import { TreeSelectorComponent } from "./components/tree-selector.ts";
import { UserMessageComponent } from "./components/user-message.ts";
import { UserMessageSelectorComponent } from "./components/user-message-selector.ts";
import { collapseReadSearchGroups, isCollapsibleToolName } from "./output-flow/collapse.ts";
import {
	canUseSingleToolSummary,
	collectSequentialToolResults,
	projectAssistantTurn,
	projectTranscript,
} from "./output-flow/projector.ts";
import {
	getAvailableThemes,
	getAvailableThemesWithPaths,
	getEditorTheme,
	getMarkdownTheme,
	getThemeByName,
	initTheme,
	onThemeChange,
	setRegisteredThemes,
	setTheme,
	setThemeInstance,
	stopThemeWatcher,
	Theme,
	type ThemeColor,
	theme,
} from "./theme/theme.ts";

/** Interface for components that can be expanded/collapsed */
interface Expandable {
	setExpanded(expanded: boolean): void;
}

function isExpandable(obj: unknown): obj is Expandable {
	return typeof obj === "object" && obj !== null && "setExpanded" in obj && typeof obj.setExpanded === "function";
}

class ExpandableText extends Text implements Expandable {
	private readonly getCollapsedText: () => string;
	private readonly getExpandedText: () => string;

	constructor(
		getCollapsedText: () => string,
		getExpandedText: () => string,
		expanded = false,
		paddingX = 0,
		paddingY = 0,
	) {
		const collapsed = getCollapsedText();
		const expandedText = getExpandedText();
		const initialText = expanded ? expandedText : collapsed;
		super(initialText, paddingX, paddingY);
		this.getCollapsedText = getCollapsedText;
		this.getExpandedText = getExpandedText;
	}

	setExpanded(expanded: boolean): void {
		this.setText(expanded ? this.getExpandedText() : this.getCollapsedText());
	}
}

type CompactionQueuedMessage = {
	text: string;
	mode: "steer" | "followUp";
};

const DEAD_TERMINAL_ERROR_CODES = new Set(["EIO", "EPIPE", "ENOTCONN"]);

function isDeadTerminalError(error: unknown): boolean {
	if (!error || typeof error !== "object" || !("code" in error)) {
		return false;
	}
	const code = (error as NodeJS.ErrnoException).code;
	return code !== undefined && DEAD_TERMINAL_ERROR_CODES.has(code);
}

const ANTHROPIC_SUBSCRIPTION_AUTH_WARNING =
	"Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits. Manage extra usage at https://claude.ai/settings/usage.";

function isAnthropicSubscriptionAuthKey(apiKey: string | undefined): boolean {
	return typeof apiKey === "string" && apiKey.startsWith("sk-ant-oat");
}

function isUnknownModel(model: Model<any> | undefined): boolean {
	return !!model && model.provider === "unknown" && model.id === "unknown" && model.api === "unknown";
}

function hasDefaultModelProvider(providerId: string): providerId is keyof typeof defaultModelPerProvider {
	return providerId in defaultModelPerProvider;
}

const BEDROCK_PROVIDER_ID = "amazon-bedrock";

const BUILT_IN_MODEL_PROVIDERS = new Set<string>(getProviders());

export function isApiKeyLoginProvider(
	providerId: string,
	oauthProviderIds: ReadonlySet<string>,
	builtInProviderIds: ReadonlySet<string> = BUILT_IN_MODEL_PROVIDERS,
): boolean {
	if (BUILT_IN_PROVIDER_DISPLAY_NAMES[providerId]) {
		return true;
	}
	if (builtInProviderIds.has(providerId)) {
		return false;
	}
	return !oauthProviderIds.has(providerId);
}

/**
 * Options for InteractiveMode initialization.
 */
export interface InteractiveModeOptions {
	/** Providers that were migrated to auth.json (shows warning) */
	migratedProviders?: string[];
	/** Info/warning message about one-time legacy .pi import flow */
	legacyImportMessage?: string;
	/** Startup package/plugin reevaluation result collected before interactive mode boot */
	compatibilityReevaluation?: PackageCompatibilityReevaluationResult;
	/** Warning message if session model couldn't be restored */
	modelFallbackMessage?: string;
	/** Initial message to send on startup (can include @file content) */
	initialMessage?: string;
	/** Images to attach to the initial message */
	initialImages?: ImageContent[];
	/** Additional messages to send after the initial message */
	initialMessages?: string[];
	/** Force verbose startup (overrides quietStartup setting) */
	verbose?: boolean;
}

interface BottomPaneSections {
	container: Container;
	taskbarRow: Container;
	pendingRow: Container;
	composerRow: Container;
	extensionRow: Container;
	passiveFooterRow: Container;
	gap: Container;
	taskbarContent: Container;
	pendingContent: Container;
	composerContent: Container;
	extensionContent: Container;
	footerContent: Container;
}

type BottomPaneRenderTarget = "taskbar" | "pending";

type ComposerRenderOptions = {
	focus?: Component;
	forceRender?: boolean;
	respectInput?: boolean;
};

function createBottomPaneSections(
	container: Container,
	taskbarRow: Container,
	pendingRow: Container,
	composerRow: Container,
	extensionRow: Container,
	passiveFooterRow: Container,
	gap: Container,
	taskbarContent: Container,
	pendingContent: Container,
	composerContent: Container,
	extensionContent: Container,
	footerContent: Container,
): BottomPaneSections {
	return {
		container,
		taskbarRow,
		pendingRow,
		composerRow,
		extensionRow,
		passiveFooterRow,
		gap,
		taskbarContent,
		pendingContent,
		composerContent,
		extensionContent,
		footerContent,
	};
}

export class InteractiveMode {
	private runtimeHost: AgentSessionRuntime;
	private ui: TUI;
	private chatContainer: Container;
	private bottomPane: BottomPaneSections;
	private defaultEditor: CustomEditor;
	private editor: EditorComponent;
	private editorComponentFactory: EditorFactory | undefined;
	private autocompleteProvider: AutocompleteProvider | undefined;
	private autocompleteProviderWrappers: AutocompleteProviderFactory[] = [];
	private fdPath: string | undefined;
	private editorContainer: Container;
	private footer: FooterComponent;
	private footerDataProvider: FooterDataProvider;
	// Stored so the same manager can be injected into custom editors, selectors, and extension UI.
	private keybindings: KeybindingsManager;
	private version: string;
	private isInitialized = false;
	private onInputCallback?: (text: string) => void;
	private loadingAnimation: Loader | undefined = undefined;
	private workingMessage: string | undefined = undefined;
	private workingDetailsLines: string[] | undefined = undefined;
	private workingDetailsComponent: (Component & { dispose?(): void }) | undefined = undefined;
	private workingVisible = true;
	private workingIndicatorOptions: LoaderIndicatorOptions | undefined = undefined;
	private taskbarOverlayComponent: Component | undefined = undefined;
	private taskbarNoticeTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
	private readonly defaultWorkingMessage = "Working...";
	private readonly defaultHiddenThinkingLabel = "Thinking...";
	private hiddenThinkingLabel = this.defaultHiddenThinkingLabel;
	private spinnerStartedAt = 0;
	private spinnerResponseChars = 0;
	private spinnerReportedOutputTokens = 0;
	private spinnerThinkingStartedAt: number | null = null;
	private spinnerThinkingMinimumVisibleUntil: number | null = null;
	private spinnerThinkingDurationMs: number | null = null;
	private spinnerThoughtForVisibleUntil: number | null = null;
	private spinnerSystemOverrideMessage: string | undefined = undefined;
	private spinnerCurrentToolLabel: string | undefined = undefined;
	private spinnerBanner: SpinnerUiState["banner"] | undefined = undefined;
	private spinnerBannerTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
	private spinnerActiveToolCount = 0;
	private progressSurfaceRefreshTimer: ReturnType<typeof setInterval> | undefined = undefined;
	private progressSurfaceWorkingState = createProgressSurfaceWorkingState();
	private progressSurfaceComponent!: ProgressSurfaceComponent;
	private agentRunActive = false;
	private static readonly INPUT_ACTIVITY_SUPPRESSION_MS = 200;
	private inputActivitySuppressedUntil = 0;
	private inputActivityResumeTimer: ReturnType<typeof setTimeout> | undefined;
	private inputActivityListenerCleanup: (() => void) | undefined;
	private terminalProgressActive = false;
	private lastStatusSpacer: Spacer | undefined = undefined;
	private lastStatusText: Text | undefined = undefined;

	private lastSigintTime = 0;
	private lastEscapeTime = 0;
	private changelogMarkdown: string | undefined = undefined;
	private startupNoticesShown = false;
	private anthropicSubscriptionWarningShown = false;

	// Streaming message tracking
	private streamingComponent: AssistantMessageComponent | undefined = undefined;
	private streamingMessage: AssistantMessage | undefined = undefined;

	// Tool execution tracking: toolCallId -> component
	private pendingTools = new Map<string, ToolExecutionComponent>();
	private activeCollapsedToolGroup: CollapsedToolGroupComponent | undefined = undefined;
	private collapsedGroupByToolCallId = new Map<string, CollapsedToolGroupComponent>();
	private activeToolSummary: AssistantToolSummaryComponent | undefined = undefined;
	private toolSummaryByToolCallId = new Map<string, AssistantToolSummaryComponent>();
	private activeToolBatchSummary: AssistantToolBatchSummaryComponent | undefined = undefined;
	private toolBatchSummaryByToolCallId = new Map<string, AssistantToolBatchSummaryComponent>();

	// Tool output expansion state
	private toolOutputExpanded = false;
	private toolDisplayMode: "collapsed" | "expanded" = "collapsed";

	// Thinking block visibility state
	private hideThinkingBlock = false;

	// Skill commands: command name -> skill file path
	private skillCommands = new Map<string, string>();

	// Agent subscription unsubscribe function
	private unsubscribe?: () => void;
	private signalCleanupHandlers: Array<() => void> = [];

	// Track if editor is in bash mode (text starts with !)
	private isBashMode = false;

	// Track current bash execution component
	private bashComponent: BashExecutionComponent | undefined = undefined;

	// Track pending bash components (shown in pending area, moved to chat on submit)
	private pendingBashComponents: BashExecutionComponent[] = [];

	// Auto-compaction state
	private autoCompactionLoader: Loader | undefined = undefined;
	private autoCompactionEscapeHandler?: () => void;

	// Auto-retry state
	private retryLoader: Loader | undefined = undefined;
	private retryCountdown: CountdownTimer | undefined = undefined;
	private retryEscapeHandler?: () => void;

	// Messages queued while compaction is running
	private compactionQueuedMessages: CompactionQueuedMessage[] = [];

	// Shutdown state
	private shutdownRequested = false;

	// Extension UI state
	private extensionSelector: ExtensionSelectorComponent | undefined = undefined;
	private extensionInput: ExtensionInputComponent | undefined = undefined;
	private extensionEditor: ExtensionEditorComponent | undefined = undefined;
	private extensionTerminalInputUnsubscribers = new Set<() => void>();

	// Extension widgets rendered in the lower extension area beneath the editor.
	private extensionWidgetsAbove = new Map<string, Component & { dispose?(): void }>();
	private extensionWidgetsBelow = new Map<string, Component & { dispose?(): void }>();
	private extensionAreaContainer!: Container;
	private widgetContainerAbove!: Container;
	private widgetContainerBelow!: Container;

	// Custom footer from extension (undefined = use built-in footer)
	private customFooter: (Component & { dispose?(): void }) | undefined = undefined;

	// Header container that holds the built-in or custom header
	private headerContainer: Container;

	// Built-in header (logo + keybinding hints + changelog)
	private builtInHeader: Component | undefined = undefined;

	// Custom header from extension (undefined = use built-in header)
	private customHeader: (Component & { dispose?(): void }) | undefined = undefined;

	// Convenience accessors
	private get session(): AgentSession {
		return this.runtimeHost.session;
	}
	private get agent() {
		return this.session.agent;
	}
	private get sessionManager() {
		return this.session.sessionManager;
	}
	private get settingsManager() {
		return this.session.settingsManager;
	}

	private options: InteractiveModeOptions;

	constructor(runtimeHost: AgentSessionRuntime, options: InteractiveModeOptions = {}) {
		this.runtimeHost = runtimeHost;
		this.options = options;
		this.runtimeHost.setBeforeSessionInvalidate(() => {
			this.resetExtensionUI();
		});
		this.runtimeHost.setRebindSession(async () => {
			await this.rebindCurrentSession();
		});
		this.version = VERSION;
		this.ui = new TUI(new ProcessTerminal(), this.settingsManager.getShowHardwareCursor());
		this.ui.setClearOnShrink(this.settingsManager.getClearOnShrink());
		this.ui.shouldSuppressBackgroundRenderUpdates = () => this.isInputActivitySuppressed();
		this.inputActivityListenerCleanup = this.ui.addInputListener((data) => {
			if (data.length > 0) {
				this.markInputActivity();
			}
			return undefined;
		});
		this.headerContainer = new Container();
		this.chatContainer = new Container();
		const bottomPaneContainer = new Container();
		const taskbarRowContainer = new Container();
		const pendingRowContainer = new Container();
		const composerRowContainer = new Container();
		const extensionRowContainer = new Container();
		const passiveFooterRowContainer = new Container();
		const composerGap = new Container();
		const taskbarContent = new Container();
		const pendingContent = new Container();
		const editorContainer = new Container();
		const extensionAreaContainer = new Container();
		const footerContent = new Container();
		this.bottomPane = createBottomPaneSections(
			bottomPaneContainer,
			taskbarRowContainer,
			pendingRowContainer,
			composerRowContainer,
			extensionRowContainer,
			passiveFooterRowContainer,
			composerGap,
			taskbarContent,
			pendingContent,
			editorContainer,
			extensionAreaContainer,
			footerContent,
		);
		this.extensionAreaContainer = extensionAreaContainer;
		this.widgetContainerAbove = new Container();
		this.widgetContainerBelow = new Container();
		this.extensionAreaContainer.addChild(this.widgetContainerAbove);
		this.extensionAreaContainer.addChild(this.widgetContainerBelow);
		this.progressSurfaceComponent = new ProgressSurfaceComponent(
			() => this.getProgressSurfaceSnapshot(),
			theme,
			this.progressSurfaceWorkingState,
		);
		this.keybindings = KeybindingsManager.create();
		setKeybindings(this.keybindings);
		const editorPaddingX = this.settingsManager.getEditorPaddingX();
		const autocompleteMaxVisible = this.settingsManager.getAutocompleteMaxVisible();
		this.defaultEditor = new CustomEditor(this.ui, getEditorTheme(), this.keybindings, {
			paddingX: editorPaddingX,
			autocompleteMaxVisible,
		});
		this.editor = this.defaultEditor;
		this.editorContainer = editorContainer;
		this.editorContainer.addChild(this.editor as Component);
		this.footerDataProvider = new FooterDataProvider(this.sessionManager.getCwd());
		this.footer = new FooterComponent(this.session, this.footerDataProvider);
		this.footer.setAutoCompactEnabled(this.session.autoCompactionEnabled);

		this.hideThinkingBlock = this.settingsManager.getHideThinkingBlock();
		this.toolDisplayMode = this.settingsManager.getToolDisplayMode();
		this.toolOutputExpanded = this.toolDisplayMode === "expanded";

		// Register themes from resource loader and initialize
		setRegisteredThemes(this.session.resourceLoader.getThemes().themes);
		initTheme(this.settingsManager.getTheme(), true);
	}

	private getAutocompleteSourceTag(sourceInfo?: SourceInfo): string | undefined {
		if (!sourceInfo) {
			return undefined;
		}

		const scopePrefix = sourceInfo.scope === "user" ? "u" : sourceInfo.scope === "project" ? "p" : "t";
		const source = sourceInfo.source.trim();

		if (source === "auto" || source === "local" || source === "cli") {
			return scopePrefix;
		}

		if (source.startsWith("npm:")) {
			return `${scopePrefix}:${source}`;
		}

		const gitSource = parseGitUrl(source);
		if (gitSource) {
			const ref = gitSource.ref ? `@${gitSource.ref}` : "";
			return `${scopePrefix}:git:${gitSource.host}/${gitSource.path}${ref}`;
		}

		return scopePrefix;
	}

	private prefixAutocompleteDescription(description: string | undefined, sourceInfo?: SourceInfo): string | undefined {
		const sourceTag = this.getAutocompleteSourceTag(sourceInfo);
		if (!sourceTag) {
			return description;
		}
		return description ? `[${sourceTag}] ${description}` : `[${sourceTag}]`;
	}

	private getBuiltInCommandConflictDiagnostics(extensionRunner: ExtensionRunner): ResourceDiagnostic[] {
		const builtinNames = new Set(BUILTIN_SLASH_COMMANDS.map((command) => command.name));
		return extensionRunner
			.getRegisteredCommands()
			.filter((command) => builtinNames.has(command.name))
			.map((command) => ({
				type: "warning" as const,
				message:
					command.invocationName === command.name
						? `Extension command '/${command.name}' conflicts with built-in interactive command. Skipping in autocomplete.`
						: `Extension command '/${command.name}' conflicts with built-in interactive command. Available as '/${command.invocationName}'.`,
				path: command.sourceInfo.path,
			}));
	}

	private createBaseAutocompleteProvider(): AutocompleteProvider {
		// Define commands for autocomplete
		const slashCommands: SlashCommand[] = BUILTIN_SLASH_COMMANDS.map((command) => ({
			name: command.name,
			description: command.description,
		}));

		const modelCommand = slashCommands.find((command) => command.name === "model");
		if (modelCommand) {
			modelCommand.getArgumentCompletions = (prefix: string): AutocompleteItem[] | null => {
				// Get available models (scoped or from registry)
				const models =
					this.session.scopedModels.length > 0
						? this.session.scopedModels.map((s) => s.model)
						: this.session.modelRegistry.getAvailable();

				if (models.length === 0) return null;

				// Create items with provider/id format
				const items = models.map((m) => ({
					id: m.id,
					provider: m.provider,
					label: `${m.provider}/${m.id}`,
				}));

				// Fuzzy filter by model ID + provider (allows "opus anthropic" to match)
				const filtered = fuzzyFilter(items, prefix, (item) => `${item.id} ${item.provider}`);

				if (filtered.length === 0) return null;

				return filtered.map((item) => ({
					value: item.label,
					label: item.id,
					description: item.provider,
				}));
			};
		}

		// Convert prompt templates to SlashCommand format for autocomplete
		const templateCommands: SlashCommand[] = this.session.promptTemplates.map((cmd) => ({
			name: cmd.name,
			description: this.prefixAutocompleteDescription(cmd.description, cmd.sourceInfo),
			...(cmd.argumentHint && { argumentHint: cmd.argumentHint }),
		}));

		// Convert extension commands to SlashCommand format
		const builtinCommandNames = new Set(slashCommands.map((c) => c.name));
		const extensionCommands: SlashCommand[] = this.session.extensionRunner
			.getRegisteredCommands()
			.filter((cmd) => !builtinCommandNames.has(cmd.name))
			.map((cmd) => ({
				name: cmd.invocationName,
				description: this.prefixAutocompleteDescription(cmd.description, cmd.sourceInfo),
				getArgumentCompletions: cmd.getArgumentCompletions,
			}));

		// Build skill commands from session.skills (if enabled)
		this.skillCommands.clear();
		const skillCommandList: SlashCommand[] = [];
		if (this.settingsManager.getEnableSkillCommands()) {
			for (const skill of this.session.resourceLoader.getSkills().skills) {
				const commandName = `skill:${skill.name}`;
				this.skillCommands.set(commandName, skill.filePath);
				skillCommandList.push({
					name: commandName,
					description: this.prefixAutocompleteDescription(skill.description, skill.sourceInfo),
				});
			}
		}

		return new CombinedAutocompleteProvider(
			[...slashCommands, ...templateCommands, ...extensionCommands, ...skillCommandList],
			this.sessionManager.getCwd(),
			this.fdPath,
		);
	}

	private setupAutocompleteProvider(): void {
		let provider = this.createBaseAutocompleteProvider();
		for (const wrapProvider of this.autocompleteProviderWrappers) {
			provider = wrapProvider(provider);
		}

		this.autocompleteProvider = provider;
		this.defaultEditor.setAutocompleteProvider(provider);
		if (this.editor !== this.defaultEditor) {
			this.editor.setAutocompleteProvider?.(provider);
		}
	}

	private showStartupNoticesIfNeeded(): void {
		if (this.startupNoticesShown) {
			return;
		}
		this.startupNoticesShown = true;

		if (!this.changelogMarkdown) {
			return;
		}

		if (this.chatContainer.children.length > 0) {
			this.chatContainer.addChild(new Spacer(1));
		}
		this.chatContainer.addChild(new DynamicBorder());
		if (this.settingsManager.getCollapseChangelog()) {
			const versionMatch = this.changelogMarkdown.match(/##\s+\[?(\d+\.\d+\.\d+)\]?/);
			const latestVersion = versionMatch ? versionMatch[1] : this.version;
			const condensedText = `已更新到 v${latestVersion}。使用 ${theme.bold("/changelog")} 查看完整更新日志。`;
			this.chatContainer.addChild(new Text(condensedText, 1, 0));
		} else {
			this.chatContainer.addChild(new Text(theme.bold(theme.fg("accent", TUI_COPY.changelog.title)), 1, 0));
			this.chatContainer.addChild(new Spacer(1));
			this.chatContainer.addChild(
				new Markdown(this.changelogMarkdown.trim(), 1, 0, this.getMarkdownThemeWithSettings()),
			);
			this.chatContainer.addChild(new Spacer(1));
		}
		this.chatContainer.addChild(new DynamicBorder());
	}

	async init(): Promise<void> {
		if (this.isInitialized) return;

		this.registerSignalHandlers();

		// Load changelog (only show new entries, skip for resumed sessions)
		this.changelogMarkdown = this.getChangelogForDisplay();

		// Ensure fd and rg are available (downloads if missing, adds to PATH via getBinDir)
		// Both are needed: fd for autocomplete, rg for grep tool and bash commands
		const [fdPath] = await Promise.all([ensureTool("fd"), ensureTool("rg")]);
		this.fdPath = fdPath;

		// Add header container as first child
		this.ui.addChild(this.headerContainer);

		// Add header with keybindings from config (unless silenced)
		if (this.options.verbose || !this.settingsManager.getQuietStartup()) {
			const logo = theme.bold(theme.fg("accent", APP_NAME)) + theme.fg("dim", ` v${this.version}`);

			// Build startup instructions using keybinding hint helpers
			const hint = (keybinding: AppKeybinding, description: string) => keyHint(keybinding, description);

			const expandedInstructions = [
				hint("app.interrupt", TUI_COPY.startupHeader.interrupt),
				hint("app.clear", TUI_COPY.startupHeader.clear),
				rawKeyHint(`${keyText("app.clear")} twice`, TUI_COPY.startupHeader.exitLumen),
				hint("app.exit", TUI_COPY.startupHeader.exitWhenEmpty),
				hint("app.suspend", TUI_COPY.startupHeader.suspend),
				keyHint("tui.editor.deleteToLineEnd", TUI_COPY.startupHeader.deleteToLineEnd),
				hint("app.thinking.cycle", TUI_COPY.startupHeader.cycleThinking),
				rawKeyHint(
					`${keyText("app.model.cycleForward")}/${keyText("app.model.cycleBackward")}`,
					TUI_COPY.startupHeader.cycleModels,
				),
				hint("app.model.select", TUI_COPY.startupHeader.openModelSelector),
				hint("app.tools.expand", TUI_COPY.startupHeader.expandToolOutput),
				hint("app.thinking.toggle", TUI_COPY.startupHeader.expandThinking),
				hint("app.editor.external", TUI_COPY.startupHeader.openExternalEditor),
				rawKeyHint("/", TUI_COPY.startupHeader.openCommandMenu),
				rawKeyHint("!", TUI_COPY.startupHeader.runBash),
				rawKeyHint("!!", TUI_COPY.startupHeader.runBashExcluded),
				hint("app.message.followUp", TUI_COPY.startupHeader.queueFollowUp),
				hint("app.message.dequeue", TUI_COPY.startupHeader.editQueuedMessages),
				hint("app.clipboard.pasteImage", TUI_COPY.startupHeader.pasteClipboardImage),
				rawKeyHint("drop files", TUI_COPY.startupHeader.attachFiles),
			].join("\n");
			const compactInstructions = [
				hint("app.interrupt", TUI_COPY.startupHeader.interruptShort),
				rawKeyHint(`${keyText("app.clear")}/${keyText("app.exit")}`, TUI_COPY.startupHeader.clearExitShort),
				rawKeyHint("/", TUI_COPY.startupHeader.commandShort),
				rawKeyHint("!", "bash"),
				hint("app.tools.expand", TUI_COPY.startupHeader.moreShort),
			].join(theme.fg("muted", " · "));
			const compactOnboarding = theme.fg(
				"dim",
				TUI_COPY.startupHeader.compactOnboarding(keyText("app.tools.expand")),
			);
			const onboarding = theme.fg("dim", TUI_COPY.startupHeader.onboarding);
			this.builtInHeader = new ExpandableText(
				() => `${logo}\n${compactInstructions}\n${compactOnboarding}\n\n${onboarding}`,
				() => `${logo}\n${expandedInstructions}\n\n${onboarding}`,
				this.getStartupExpansionState(),
				1,
				0,
			);

			// Setup UI layout
			this.headerContainer.addChild(new Spacer(1));
			this.headerContainer.addChild(this.builtInHeader);
			this.headerContainer.addChild(new Spacer(1));
		} else {
			// Minimal header when silenced
			this.builtInHeader = new Text("", 0, 0);
			this.headerContainer.addChild(this.builtInHeader);
		}

		this.attachMainLayout();
		this.ui.setFocus(this.editor);

		this.setupKeyHandlers();
		this.setupEditorSubmitHandler();

		// Start the UI before initializing extensions so session_start handlers can use interactive dialogs
		this.ui.start();
		this.isInitialized = true;

		// Initialize extensions first so resources are shown before messages
		await this.rebindCurrentSession();

		// Render initial messages AFTER showing loaded resources
		this.renderInitialMessages();

		// Set up theme file watcher
		onThemeChange(() => {
			this.ui.invalidate();
			this.updateEditorBorderColor();
			this.requestRenderUnlessInputSuppressed();
		});

		// Set up git branch watcher (uses provider instead of footer)
		this.footerDataProvider.onBranchChange(() => {
			this.requestRenderUnlessInputSuppressed();
		});

		// Initialize available provider count for footer display
		await this.updateAvailableProviderCount();
	}

	private attachMainLayout(): void {
		const bottomPane = this.bottomPane;
		bottomPane.taskbarRow.clear();
		bottomPane.taskbarRow.addChild(bottomPane.taskbarContent);

		bottomPane.pendingRow.clear();
		bottomPane.pendingRow.addChild(bottomPane.pendingContent);

		bottomPane.composerRow.clear();
		bottomPane.composerRow.addChild(bottomPane.gap);
		bottomPane.composerRow.addChild(bottomPane.composerContent);

		bottomPane.extensionRow.clear();
		bottomPane.extensionRow.addChild(bottomPane.extensionContent);

		bottomPane.passiveFooterRow.clear();
		bottomPane.footerContent.clear();
		bottomPane.footerContent.addChild(this.customFooter ?? this.footer);
		bottomPane.passiveFooterRow.addChild(bottomPane.footerContent);

		bottomPane.container.clear();
		bottomPane.container.addChild(bottomPane.taskbarRow);
		bottomPane.container.addChild(bottomPane.pendingRow);
		bottomPane.container.addChild(bottomPane.composerRow);
		bottomPane.container.addChild(bottomPane.extensionRow);
		bottomPane.container.addChild(bottomPane.passiveFooterRow);
		this.syncBottomPaneGap();

		this.ui.addChild(this.chatContainer);
		this.renderWidgets(); // Initialize with default spacer
		this.ui.addChild(bottomPane.container);
	}

	private syncBottomPaneGap(): void {
		const bottomPane = this.bottomPane;
		bottomPane.gap.clear();
		// Always keep a breathing gap between the transcript and the composer.
		bottomPane.gap.addChild(new Spacer(1));
	}

	private replaceBottomPaneContent(target: Container, render: (target: Container) => void): void {
		target.clear();
		render(target);
		this.syncBottomPaneGap();
	}

	private getBottomPaneSlot(target: BottomPaneRenderTarget): Container {
		const bottomPane = this.bottomPane;
		return target === "taskbar" ? bottomPane.taskbarContent : bottomPane.pendingContent;
	}

	private updateTaskbarContent(render: (target: Container) => void): void {
		this.replaceBottomPaneContent(this.getBottomPaneSlot("taskbar"), render);
	}

	private updatePendingContent(render: (target: Container) => void): void {
		this.replaceBottomPaneContent(this.getBottomPaneSlot("pending"), render);
	}

	private updatePassiveFooterContent(content: Component): void {
		const bottomPane = this.bottomPane;
		bottomPane.footerContent.clear();
		bottomPane.footerContent.addChild(content);
	}

	private setComposerContent(component: Component, options: ComposerRenderOptions = {}): void {
		this.editorContainer.clear();
		this.editorContainer.addChild(component);
		this.ui.setFocus(options.focus ?? component);
		if (options.respectInput) {
			this.requestRenderRespectingInput(options.forceRender ?? false);
			return;
		}
		this.ui.requestRender(options.forceRender ?? false);
	}

	private restoreComposerEditor(options: ComposerRenderOptions = {}): void {
		this.setComposerContent(this.editor as Component, {
			focus: this.editor as Component,
			forceRender: options.forceRender,
			respectInput: options.respectInput,
		});
	}

	/**
	 * Update terminal title with session name and cwd.
	 */
	private updateTerminalTitle(): void {
		const cwdBasename = path.basename(this.sessionManager.getCwd());
		const sessionName = this.sessionManager.getSessionName();
		if (sessionName) {
			this.ui.terminal.setTitle(`${APP_TITLE} - ${sessionName} - ${cwdBasename}`);
		} else {
			this.ui.terminal.setTitle(`${APP_TITLE} - ${cwdBasename}`);
		}
	}

	/**
	 * Run the interactive mode. This is the main entry point.
	 * Initializes the UI, shows warnings, processes initial messages, and starts the interactive loop.
	 */
	async run(): Promise<void> {
		await this.init();

		// Start version check asynchronously
		checkForNewPiVersion(this.version).then((newVersion) => {
			if (newVersion) {
				this.showNewVersionNotification(newVersion);
			}
		});

		// Start package update check asynchronously
		this.checkForPackageUpdates().then((updates) => {
			if (updates.length > 0) {
				this.showPackageUpdateNotification(updates);
			}
		});

		// Check tmux keyboard setup asynchronously
		this.checkTmuxKeyboardSetup().then((warning) => {
			if (warning) {
				this.showWarning(warning);
			}
		});

		// Show startup warnings
		const {
			migratedProviders,
			legacyImportMessage,
			compatibilityReevaluation,
			modelFallbackMessage,
			initialMessage,
			initialImages,
			initialMessages,
		} = this.options;

		if (migratedProviders && migratedProviders.length > 0) {
			this.showWarning(TUI_COPY.interactiveNotices.migratedCredentials(migratedProviders.join(", ")));
		}

		if (legacyImportMessage) {
			this.showTaskbarNotice(legacyImportMessage);
		}

		await this.showCompatibilityReminderIfNeeded(compatibilityReevaluation);

		const modelsJsonError = this.session.modelRegistry.getError();
		if (modelsJsonError) {
			this.showError(TUI_COPY.interactiveNotices.modelsJsonError(modelsJsonError));
		}

		if (modelFallbackMessage) {
			this.showWarning(modelFallbackMessage);
		}

		void this.maybeWarnAboutAnthropicSubscriptionAuth();

		// Process initial messages
		if (initialMessage) {
			try {
				await this.session.prompt(initialMessage, { images: initialImages });
			} catch (error: unknown) {
				const errorMessage = error instanceof Error ? error.message : TUI_COPY.interactiveNotices.unknownError;
				this.showError(errorMessage);
			}
		}

		if (initialMessages) {
			for (const message of initialMessages) {
				try {
					await this.session.prompt(message);
				} catch (error: unknown) {
					const errorMessage = error instanceof Error ? error.message : TUI_COPY.interactiveNotices.unknownError;
					this.showError(errorMessage);
				}
			}
		}

		// Main interactive loop
		while (true) {
			const userInput = await this.getUserInput();
			try {
				await this.session.prompt(userInput);
			} catch (error: unknown) {
				const errorMessage = error instanceof Error ? error.message : TUI_COPY.interactiveNotices.unknownError;
				this.showError(errorMessage);
			}
		}
	}

	private async checkForPackageUpdates(): Promise<string[]> {
		if (process.env.PI_OFFLINE) {
			return [];
		}

		try {
			const packageManager = new DefaultPackageManager({
				cwd: this.sessionManager.getCwd(),
				agentDir: getAgentDir(),
				settingsManager: this.settingsManager,
			});
			const updates = await packageManager.checkForAvailableUpdates();
			return updates.map((update) => update.displayName);
		} catch {
			return [];
		}
	}

	private async checkTmuxKeyboardSetup(): Promise<string | undefined> {
		if (!process.env.TMUX) return undefined;

		const runTmuxShow = (option: string): Promise<string | undefined> => {
			return new Promise((resolve) => {
				const proc = spawn("tmux", ["show", "-gv", option], {
					stdio: ["ignore", "pipe", "ignore"],
				});
				let stdout = "";
				const timer = setTimeout(() => {
					proc.kill();
					resolve(undefined);
				}, 2000);

				proc.stdout?.on("data", (data) => {
					stdout += data.toString();
				});
				proc.on("error", () => {
					clearTimeout(timer);
					resolve(undefined);
				});
				proc.on("close", (code) => {
					clearTimeout(timer);
					resolve(code === 0 ? stdout.trim() : undefined);
				});
			});
		};

		const [extendedKeys, extendedKeysFormat] = await Promise.all([
			runTmuxShow("extended-keys"),
			runTmuxShow("extended-keys-format"),
		]);

		// If we couldn't query tmux (timeout, sandbox, etc.), don't warn
		if (extendedKeys === undefined) return undefined;

		if (extendedKeys !== "on" && extendedKeys !== "always") {
			return TUI_COPY.interactiveNotices.tmuxExtendedKeysOff;
		}

		if (extendedKeysFormat === "xterm") {
			return TUI_COPY.interactiveNotices.tmuxExtendedKeysFormatXterm;
		}

		return undefined;
	}

	/**
	 * Get changelog entries to display on startup.
	 * Only shows new entries since last seen version, skips for resumed sessions.
	 */
	private getChangelogForDisplay(): string | undefined {
		// Skip changelog for resumed/continued sessions (already have messages)
		if (this.session.state.messages.length > 0) {
			return undefined;
		}

		const lastVersion = this.settingsManager.getLastChangelogVersion();
		const changelogPath = getLumenChangelogPath();
		const entries = parseChangelog(changelogPath);

		if (!lastVersion) {
			// Fresh install - record the version, send telemetry, don't show changelog
			this.settingsManager.setLastChangelogVersion(VERSION);
			this.reportInstallTelemetry(VERSION);
			return undefined;
		}

		const newEntries = getNewEntries(entries, lastVersion);
		if (newEntries.length > 0) {
			this.settingsManager.setLastChangelogVersion(VERSION);
			this.reportInstallTelemetry(VERSION);
			return newEntries.map((e) => e.content).join("\n\n");
		}

		return undefined;
	}

	private reportInstallTelemetry(version: string): void {
		if (process.env.PI_OFFLINE) {
			return;
		}

		if (!isInstallTelemetryEnabled(this.settingsManager)) {
			return;
		}

		void fetch(`https://pi.dev/api/report-install?version=${encodeURIComponent(version)}`, {
			headers: {
				"User-Agent": getPiUserAgent(version),
			},
			signal: AbortSignal.timeout(5000),
		})
			.then(() => undefined)
			.catch(() => undefined);
	}

	private getMarkdownThemeWithSettings(): MarkdownTheme {
		return {
			...getMarkdownTheme(),
			codeBlockIndent: this.settingsManager.getCodeBlockIndent(),
		};
	}

	// =========================================================================
	// Extension System
	// =========================================================================

	private formatDisplayPath(p: string): string {
		const home = os.homedir();
		let result = p;

		// Replace home directory with ~
		if (result.startsWith(home)) {
			result = `~${result.slice(home.length)}`;
		}

		return result;
	}

	private formatExtensionDisplayPath(path: string): string {
		let result = this.formatDisplayPath(path);
		result = result.replace(/\/index\.ts$/, "").replace(/\/index\.js$/, "");
		return result;
	}

	private formatContextPath(p: string): string {
		const cwd = path.resolve(this.sessionManager.getCwd());
		const absolutePath = path.isAbsolute(p) ? path.resolve(p) : path.resolve(cwd, p);
		const relativePath = getCwdRelativePath(absolutePath, cwd);
		if (relativePath !== undefined) {
			return relativePath;
		}

		return this.formatDisplayPath(absolutePath);
	}

	private getStartupExpansionState(): boolean {
		return this.options.verbose || this.toolOutputExpanded;
	}

	/**
	 * Get a short path relative to the package root for display.
	 */
	private getShortPath(fullPath: string, sourceInfo?: SourceInfo): string {
		const baseDir = sourceInfo?.baseDir;
		if (baseDir && this.isPackageSource(sourceInfo)) {
			const relativePath = path.relative(path.resolve(baseDir), path.resolve(fullPath));
			if (
				relativePath &&
				relativePath !== "." &&
				!relativePath.startsWith("..") &&
				!relativePath.startsWith(`..${path.sep}`) &&
				!path.isAbsolute(relativePath)
			) {
				return relativePath.replace(/\\/g, "/");
			}
		}

		const source = sourceInfo?.source ?? "";
		const npmMatch = fullPath.match(/node_modules\/(@?[^/]+(?:\/[^/]+)?)\/(.*)/);
		if (npmMatch && source.startsWith("npm:")) {
			return npmMatch[2];
		}

		const gitMatch = fullPath.match(/git\/[^/]+\/[^/]+\/(.*)/);
		if (gitMatch && source.startsWith("git:")) {
			return gitMatch[1];
		}

		return this.formatDisplayPath(fullPath);
	}

	private getCompactPathLabel(resourcePath: string, sourceInfo?: SourceInfo): string {
		const shortPath = this.getShortPath(resourcePath, sourceInfo);
		const normalizedPath = shortPath.replace(/\\/g, "/");
		const segments = normalizedPath.split("/").filter((segment) => segment.length > 0 && segment !== "~");
		if (segments.length > 0) {
			return segments[segments.length - 1]!;
		}
		return shortPath;
	}

	private getCompactPackageSourceLabel(sourceInfo?: SourceInfo): string {
		const source = sourceInfo?.source ?? "";
		if (source.startsWith("npm:")) {
			return source.slice("npm:".length) || source;
		}

		const gitSource = parseGitUrl(source);
		if (gitSource) {
			return gitSource.path || source;
		}

		return source;
	}

	private getCompactExtensionLabel(resourcePath: string, sourceInfo?: SourceInfo): string {
		if (!this.isPackageSource(sourceInfo)) {
			return this.getCompactPathLabel(resourcePath, sourceInfo);
		}

		const sourceLabel = this.getCompactPackageSourceLabel(sourceInfo);
		if (!sourceLabel) {
			return this.getCompactPathLabel(resourcePath, sourceInfo);
		}

		const shortPath = this.getShortPath(resourcePath, sourceInfo).replace(/\\/g, "/");
		const packagePath = shortPath.startsWith("extensions/") ? shortPath.slice("extensions/".length) : shortPath;
		const parsedPath = path.posix.parse(packagePath);

		if (parsedPath.name === "index") {
			return !parsedPath.dir || parsedPath.dir === "." ? sourceLabel : `${sourceLabel}:${parsedPath.dir}`;
		}

		return `${sourceLabel}:${packagePath}`;
	}

	private getCompactDisplayPathSegments(resourcePath: string): string[] {
		return this.formatDisplayPath(resourcePath)
			.replace(/\\/g, "/")
			.split("/")
			.filter((segment) => segment.length > 0 && segment !== "~");
	}

	private getCompactNonPackageExtensionLabel(
		resourcePath: string,
		index: number,
		allPaths: Array<{ path: string; segments: string[] }>,
	): string {
		const segments = allPaths[index]?.segments;
		if (!segments || segments.length === 0) {
			return this.getCompactPathLabel(resourcePath);
		}

		for (let segmentCount = 1; segmentCount <= segments.length; segmentCount += 1) {
			const candidate = segments.slice(-segmentCount).join("/");
			const isUnique = allPaths.every((item, itemIndex) => {
				if (itemIndex === index) {
					return true;
				}
				return item.segments.slice(-segmentCount).join("/") !== candidate;
			});

			if (isUnique) {
				return candidate;
			}
		}

		return segments.join("/");
	}

	private getCompactExtensionLabels(extensions: Array<{ path: string; sourceInfo?: SourceInfo }>): string[] {
		const nonPackageExtensions = extensions
			.map((extension) => {
				const segments = this.getCompactDisplayPathSegments(extension.path);
				const lastSegment = segments[segments.length - 1];
				if (segments.length > 1 && (lastSegment === "index.ts" || lastSegment === "index.js")) {
					segments.pop();
				}
				return {
					path: extension.path,
					sourceInfo: extension.sourceInfo,
					segments,
				};
			})
			.filter((extension) => !this.isPackageSource(extension.sourceInfo));

		return extensions.map((extension) => {
			if (this.isPackageSource(extension.sourceInfo)) {
				return this.getCompactExtensionLabel(extension.path, extension.sourceInfo);
			}

			const nonPackageIndex = nonPackageExtensions.findIndex((item) => item.path === extension.path);
			if (nonPackageIndex === -1) {
				return this.getCompactPathLabel(extension.path, extension.sourceInfo);
			}

			return this.getCompactNonPackageExtensionLabel(extension.path, nonPackageIndex, nonPackageExtensions);
		});
	}

	private getDisplaySourceInfo(sourceInfo?: SourceInfo): {
		label: string;
		scopeLabel?: string;
		color: "accent" | "muted";
	} {
		const source = sourceInfo?.source ?? "local";
		const scope = sourceInfo?.scope ?? "project";
		if (source === "local") {
			if (scope === "user") {
				return { label: "user", color: "muted" };
			}
			if (scope === "project") {
				return { label: "project", color: "muted" };
			}
			if (scope === "temporary") {
				return { label: "path", scopeLabel: "temp", color: "muted" };
			}
			return { label: "path", color: "muted" };
		}

		if (source === "cli") {
			return { label: "path", scopeLabel: scope === "temporary" ? "temp" : undefined, color: "muted" };
		}

		const scopeLabel =
			scope === "user" ? "user" : scope === "project" ? "project" : scope === "temporary" ? "temp" : undefined;
		return { label: source, scopeLabel, color: "accent" };
	}

	private getScopeGroup(sourceInfo?: SourceInfo): "user" | "project" | "path" {
		const source = sourceInfo?.source ?? "local";
		const scope = sourceInfo?.scope ?? "project";
		if (source === "cli" || scope === "temporary") return "path";
		if (scope === "user") return "user";
		if (scope === "project") return "project";
		return "path";
	}

	private isPackageSource(sourceInfo?: SourceInfo): boolean {
		const source = sourceInfo?.source ?? "";
		return source.startsWith("npm:") || source.startsWith("git:");
	}

	private buildScopeGroups(items: Array<{ path: string; sourceInfo?: SourceInfo }>): Array<{
		scope: "user" | "project" | "path";
		paths: Array<{ path: string; sourceInfo?: SourceInfo }>;
		packages: Map<string, Array<{ path: string; sourceInfo?: SourceInfo }>>;
	}> {
		const groups: Record<
			"user" | "project" | "path",
			{
				scope: "user" | "project" | "path";
				paths: Array<{ path: string; sourceInfo?: SourceInfo }>;
				packages: Map<string, Array<{ path: string; sourceInfo?: SourceInfo }>>;
			}
		> = {
			user: { scope: "user", paths: [], packages: new Map() },
			project: { scope: "project", paths: [], packages: new Map() },
			path: { scope: "path", paths: [], packages: new Map() },
		};

		for (const item of items) {
			const groupKey = this.getScopeGroup(item.sourceInfo);
			const group = groups[groupKey];
			const source = item.sourceInfo?.source ?? "local";

			if (this.isPackageSource(item.sourceInfo)) {
				const list = group.packages.get(source) ?? [];
				list.push(item);
				group.packages.set(source, list);
			} else {
				group.paths.push(item);
			}
		}

		return [groups.project, groups.user, groups.path].filter(
			(group) => group.paths.length > 0 || group.packages.size > 0,
		);
	}

	private formatScopeGroups(
		groups: Array<{
			scope: "user" | "project" | "path";
			paths: Array<{ path: string; sourceInfo?: SourceInfo }>;
			packages: Map<string, Array<{ path: string; sourceInfo?: SourceInfo }>>;
		}>,
		options: {
			formatPath: (item: { path: string; sourceInfo?: SourceInfo }) => string;
			formatPackagePath: (item: { path: string; sourceInfo?: SourceInfo }, source: string) => string;
		},
	): string {
		const lines: string[] = [];

		for (const group of groups) {
			lines.push(`  ${theme.fg("accent", group.scope)}`);

			const sortedPaths = [...group.paths].sort((a, b) => a.path.localeCompare(b.path));
			for (const item of sortedPaths) {
				lines.push(theme.fg("dim", `    ${options.formatPath(item)}`));
			}

			const sortedPackages = Array.from(group.packages.entries()).sort(([a], [b]) => a.localeCompare(b));
			for (const [source, items] of sortedPackages) {
				lines.push(`    ${theme.fg("mdLink", source)}`);
				const sortedPackagePaths = [...items].sort((a, b) => a.path.localeCompare(b.path));
				for (const item of sortedPackagePaths) {
					lines.push(theme.fg("dim", `      ${options.formatPackagePath(item, source)}`));
				}
			}
		}

		return lines.join("\n");
	}

	private findSourceInfoForPath(p: string, sourceInfos: Map<string, SourceInfo>): SourceInfo | undefined {
		const exact = sourceInfos.get(p);
		if (exact) return exact;

		let current = p;
		while (current.includes("/")) {
			current = current.substring(0, current.lastIndexOf("/"));
			const parent = sourceInfos.get(current);
			if (parent) return parent;
		}

		return undefined;
	}

	private formatPathWithSource(p: string, sourceInfo?: SourceInfo): string {
		if (sourceInfo) {
			const shortPath = this.getShortPath(p, sourceInfo);
			const { label, scopeLabel } = this.getDisplaySourceInfo(sourceInfo);
			const labelText = scopeLabel ? `${label} (${scopeLabel})` : label;
			return `${labelText} ${shortPath}`;
		}
		return this.formatDisplayPath(p);
	}

	private formatDiagnostics(diagnostics: readonly ResourceDiagnostic[], sourceInfos: Map<string, SourceInfo>): string {
		const lines: string[] = [];

		// Group collision diagnostics by name
		const collisions = new Map<string, ResourceDiagnostic[]>();
		const otherDiagnostics: ResourceDiagnostic[] = [];

		for (const d of diagnostics) {
			if (d.type === "collision" && d.collision) {
				const list = collisions.get(d.collision.name) ?? [];
				list.push(d);
				collisions.set(d.collision.name, list);
			} else {
				otherDiagnostics.push(d);
			}
		}

		// Format collision diagnostics grouped by name
		for (const [name, collisionList] of collisions) {
			const first = collisionList[0]?.collision;
			if (!first) continue;
			lines.push(theme.fg("warning", `  "${name}" collision:`));
			lines.push(
				theme.fg(
					"dim",
					`    ${theme.fg("success", "✓")} ${this.formatPathWithSource(first.winnerPath, this.findSourceInfoForPath(first.winnerPath, sourceInfos))}`,
				),
			);
			for (const d of collisionList) {
				if (d.collision) {
					lines.push(
						theme.fg(
							"dim",
							`    ${theme.fg("warning", "✗")} ${this.formatPathWithSource(d.collision.loserPath, this.findSourceInfoForPath(d.collision.loserPath, sourceInfos))} (skipped)`,
						),
					);
				}
			}
		}

		for (const d of otherDiagnostics) {
			if (d.path) {
				const formattedPath = this.formatPathWithSource(d.path, this.findSourceInfoForPath(d.path, sourceInfos));
				lines.push(theme.fg(d.type === "error" ? "error" : "warning", `  ${formattedPath}`));
				lines.push(theme.fg(d.type === "error" ? "error" : "warning", `    ${d.message}`));
			} else {
				lines.push(theme.fg(d.type === "error" ? "error" : "warning", `  ${d.message}`));
			}
		}

		return lines.join("\n");
	}

	private showLoadedResources(options?: {
		extensions?: Array<{ path: string; sourceInfo?: SourceInfo }>;
		force?: boolean;
		showDiagnosticsWhenQuiet?: boolean;
	}): void {
		const showListing = options?.force || this.options.verbose || !this.settingsManager.getQuietStartup();
		const showDiagnostics = showListing || options?.showDiagnosticsWhenQuiet === true;
		if (!showListing && !showDiagnostics) {
			return;
		}

		const sectionHeader = (name: string, color: ThemeColor = "mdHeading") => theme.fg(color, `[${name}]`);
		const formatCompactList = (items: string[], options?: { sort?: boolean }): string => {
			const labels = items.map((item) => item.trim()).filter((item) => item.length > 0);
			if (options?.sort !== false) {
				labels.sort((a, b) => a.localeCompare(b));
			}
			return theme.fg("dim", `  ${labels.join(", ")}`);
		};
		const addLoadedSection = (
			name: string,
			collapsedBody: string,
			expandedBody = collapsedBody,
			color: ThemeColor = "mdHeading",
		): void => {
			const section = new ExpandableText(
				() => `${sectionHeader(name, color)}\n${collapsedBody}`,
				() => `${sectionHeader(name, color)}\n${expandedBody}`,
				this.getStartupExpansionState(),
				0,
				0,
			);
			this.chatContainer.addChild(section);
			this.chatContainer.addChild(new Spacer(1));
		};

		const skillsResult = this.session.resourceLoader.getSkills();
		const promptsResult = this.session.resourceLoader.getPrompts();
		const themesResult = this.session.resourceLoader.getThemes();
		const extensions =
			options?.extensions ??
			this.session.resourceLoader.getExtensions().extensions.map((extension) => ({
				path: extension.path,
				sourceInfo: extension.sourceInfo,
			}));
		const sourceInfos = new Map<string, SourceInfo>();
		for (const extension of extensions) {
			if (extension.sourceInfo) {
				sourceInfos.set(extension.path, extension.sourceInfo);
			}
		}
		for (const skill of skillsResult.skills) {
			if (skill.sourceInfo) {
				sourceInfos.set(skill.filePath, skill.sourceInfo);
			}
		}
		for (const prompt of promptsResult.prompts) {
			if (prompt.sourceInfo) {
				sourceInfos.set(prompt.filePath, prompt.sourceInfo);
			}
		}
		for (const loadedTheme of themesResult.themes) {
			if (loadedTheme.sourcePath && loadedTheme.sourceInfo) {
				sourceInfos.set(loadedTheme.sourcePath, loadedTheme.sourceInfo);
			}
		}

		if (showListing) {
			const contextFiles = this.session.resourceLoader.getAgentsFiles().agentsFiles;
			if (contextFiles.length > 0) {
				this.chatContainer.addChild(new Spacer(1));
				const contextList = contextFiles
					.map((f) => theme.fg("dim", `  ${this.formatDisplayPath(f.path)}`))
					.join("\n");
				const contextCompactList = formatCompactList(
					contextFiles.map((contextFile) => this.formatContextPath(contextFile.path)),
					{ sort: false },
				);
				addLoadedSection(TUI_COPY.loadedResources.context, contextCompactList, contextList);
			}

			const skills = skillsResult.skills;
			if (skills.length > 0) {
				const groups = this.buildScopeGroups(
					skills.map((skill) => ({ path: skill.filePath, sourceInfo: skill.sourceInfo })),
				);
				const skillList = this.formatScopeGroups(groups, {
					formatPath: (item) => this.formatDisplayPath(item.path),
					formatPackagePath: (item) => this.getShortPath(item.path, item.sourceInfo),
				});
				const skillCompactList = formatCompactList(skills.map((skill) => skill.name));
				addLoadedSection(TUI_COPY.loadedResources.skills, skillCompactList, skillList);
			}

			const templates = this.session.promptTemplates;
			if (templates.length > 0) {
				const groups = this.buildScopeGroups(
					templates.map((template) => ({ path: template.filePath, sourceInfo: template.sourceInfo })),
				);
				const templateByPath = new Map(templates.map((t) => [t.filePath, t]));
				const templateList = this.formatScopeGroups(groups, {
					formatPath: (item) => {
						const template = templateByPath.get(item.path);
						return template ? `/${template.name}` : this.formatDisplayPath(item.path);
					},
					formatPackagePath: (item) => {
						const template = templateByPath.get(item.path);
						return template ? `/${template.name}` : this.formatDisplayPath(item.path);
					},
				});
				const promptCompactList = formatCompactList(templates.map((template) => `/${template.name}`));
				addLoadedSection(TUI_COPY.loadedResources.prompts, promptCompactList, templateList);
			}

			if (extensions.length > 0) {
				const groups = this.buildScopeGroups(extensions);
				const extList = this.formatScopeGroups(groups, {
					formatPath: (item) => this.formatExtensionDisplayPath(item.path),
					formatPackagePath: (item) =>
						this.formatExtensionDisplayPath(this.getShortPath(item.path, item.sourceInfo)),
				});
				const extensionCompactList = formatCompactList(this.getCompactExtensionLabels(extensions));
				addLoadedSection(TUI_COPY.loadedResources.extensions, extensionCompactList, extList, "mdHeading");
			}

			// Show loaded themes (excluding built-in)
			const loadedThemes = themesResult.themes;
			const customThemes = loadedThemes.filter((t) => t.sourcePath);
			if (customThemes.length > 0) {
				const groups = this.buildScopeGroups(
					customThemes.map((loadedTheme) => ({
						path: loadedTheme.sourcePath!,
						sourceInfo: loadedTheme.sourceInfo,
					})),
				);
				const themeList = this.formatScopeGroups(groups, {
					formatPath: (item) => this.formatDisplayPath(item.path),
					formatPackagePath: (item) => this.getShortPath(item.path, item.sourceInfo),
				});
				const themeCompactList = formatCompactList(
					customThemes.map(
						(loadedTheme) =>
							loadedTheme.name ?? this.getCompactPathLabel(loadedTheme.sourcePath!, loadedTheme.sourceInfo),
					),
				);
				addLoadedSection(TUI_COPY.loadedResources.themes, themeCompactList, themeList);
			}
		}

		if (showDiagnostics) {
			const skillDiagnostics = skillsResult.diagnostics;
			if (skillDiagnostics.length > 0) {
				const warningLines = this.formatDiagnostics(skillDiagnostics, sourceInfos);
				this.chatContainer.addChild(
					new Text(`${theme.fg("warning", TUI_COPY.loadedResources.skillConflicts)}\n${warningLines}`, 0, 0),
				);
				this.chatContainer.addChild(new Spacer(1));
			}

			const promptDiagnostics = promptsResult.diagnostics;
			if (promptDiagnostics.length > 0) {
				const warningLines = this.formatDiagnostics(promptDiagnostics, sourceInfos);
				this.chatContainer.addChild(
					new Text(`${theme.fg("warning", TUI_COPY.loadedResources.promptConflicts)}\n${warningLines}`, 0, 0),
				);
				this.chatContainer.addChild(new Spacer(1));
			}

			const extensionDiagnostics: ResourceDiagnostic[] = [];
			const extensionErrors = this.session.resourceLoader.getExtensions().errors;
			if (extensionErrors.length > 0) {
				for (const error of extensionErrors) {
					extensionDiagnostics.push({ type: "error", message: error.error, path: error.path });
				}
			}

			const commandDiagnostics = this.session.extensionRunner.getCommandDiagnostics();
			extensionDiagnostics.push(...commandDiagnostics);
			extensionDiagnostics.push(...this.getBuiltInCommandConflictDiagnostics(this.session.extensionRunner));

			const shortcutDiagnostics = this.session.extensionRunner.getShortcutDiagnostics();
			extensionDiagnostics.push(...shortcutDiagnostics);

			if (extensionDiagnostics.length > 0) {
				const warningLines = this.formatDiagnostics(extensionDiagnostics, sourceInfos);
				this.chatContainer.addChild(
					new Text(`${theme.fg("warning", TUI_COPY.loadedResources.extensionIssues)}\n${warningLines}`, 0, 0),
				);
				this.chatContainer.addChild(new Spacer(1));
			}

			const themeDiagnostics = themesResult.diagnostics;
			if (themeDiagnostics.length > 0) {
				const warningLines = this.formatDiagnostics(themeDiagnostics, sourceInfos);
				this.chatContainer.addChild(
					new Text(`${theme.fg("warning", TUI_COPY.loadedResources.themeConflicts)}\n${warningLines}`, 0, 0),
				);
				this.chatContainer.addChild(new Spacer(1));
			}
		}
	}

	/**
	 * Initialize the extension system with TUI-based UI context.
	 */
	private async bindCurrentSessionExtensions(): Promise<void> {
		const uiContext = this.createExtensionUIContext();
		await this.session.bindExtensions({
			uiContext,
			commandContextActions: {
				waitForIdle: () => this.session.agent.waitForIdle(),
				newSession: async (options) => {
					if (this.loadingAnimation) {
						this.loadingAnimation.stop();
						this.loadingAnimation = undefined;
					}
					this.renderWorkingArea();
					try {
						const result = await this.runtimeHost.newSession(options);
						if (!result.cancelled) {
							this.renderCurrentSessionState();
							this.ui.requestRender();
						}
						return result;
					} catch (error: unknown) {
						return this.handleFatalRuntimeError(TUI_COPY.interactiveNotices.fatalCreateSession, error);
					}
				},
				fork: async (entryId, options) => {
					try {
						const result = await this.runtimeHost.fork(entryId, options);
						if (!result.cancelled) {
							this.renderCurrentSessionState();
							this.editor.setText(result.selectedText ?? "");
							this.showTaskbarNotice(TUI_COPY.interactiveNotices.forkedToNewSession);
						}
						return { cancelled: result.cancelled };
					} catch (error: unknown) {
						return this.handleFatalRuntimeError(TUI_COPY.interactiveNotices.fatalForkSession, error);
					}
				},
				navigateTree: async (targetId, options) => {
					const result = await this.session.navigateTree(targetId, {
						summarize: options?.summarize,
						customInstructions: options?.customInstructions,
						replaceInstructions: options?.replaceInstructions,
						label: options?.label,
					});
					if (result.cancelled) {
						return { cancelled: true };
					}

					this.chatContainer.clear();
					this.renderInitialMessages();
					if (result.editorText && !this.editor.getText().trim()) {
						this.editor.setText(result.editorText);
					}
					this.showTaskbarNotice(TUI_COPY.interactiveNotices.treeJumped);
					void this.flushCompactionQueue({ willRetry: false });
					return { cancelled: false };
				},
				switchSession: async (sessionPath, options) => {
					return this.handleResumeSession(sessionPath, options);
				},
				reload: async () => {
					await this.handleReloadCommand();
				},
			},
			shutdownHandler: () => {
				this.shutdownRequested = true;
				if (!this.session.isStreaming) {
					void this.shutdown();
				}
			},
			onError: (error) => {
				this.showExtensionError(error.extensionPath, error.error, error.stack);
			},
		});

		setRegisteredThemes(this.session.resourceLoader.getThemes().themes);
		this.setupAutocompleteProvider();

		const extensionRunner = this.session.extensionRunner;
		this.setupExtensionShortcuts(extensionRunner);
		this.showLoadedResources({ force: false, showDiagnosticsWhenQuiet: true });
		this.showStartupNoticesIfNeeded();
	}

	private applyRuntimeSettings(): void {
		this.footer.setSession(this.session);
		this.footer.setAutoCompactEnabled(this.session.autoCompactionEnabled);
		this.footerDataProvider.setCwd(this.sessionManager.getCwd());
		this.hideThinkingBlock = this.settingsManager.getHideThinkingBlock();
		this.ui.setShowHardwareCursor(this.settingsManager.getShowHardwareCursor());
		this.ui.setClearOnShrink(this.settingsManager.getClearOnShrink());
		const editorPaddingX = this.settingsManager.getEditorPaddingX();
		const autocompleteMaxVisible = this.settingsManager.getAutocompleteMaxVisible();
		this.defaultEditor.setPaddingX(editorPaddingX);
		this.defaultEditor.setAutocompleteMaxVisible(autocompleteMaxVisible);
		if (this.editor !== this.defaultEditor) {
			this.editor.setPaddingX?.(editorPaddingX);
			this.editor.setAutocompleteMaxVisible?.(autocompleteMaxVisible);
		}
	}

	private async rebindCurrentSession(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.applyRuntimeSettings();
		await this.bindCurrentSessionExtensions();
		this.subscribeToAgent();
		await this.updateAvailableProviderCount();
		this.updateEditorBorderColor();
		this.updateTerminalTitle();
	}

	private async handleFatalRuntimeError(prefix: string, error: unknown): Promise<never> {
		const message = error instanceof Error ? error.message : String(error);
		this.showError(`${prefix}: ${message}`);
		stopThemeWatcher();
		this.stop();
		process.exit(1);
	}

	private renderCurrentSessionState(): void {
		this.chatContainer.clear();
		this.compactionQueuedMessages = [];
		this.pendingBashComponents = [];
		this.streamingComponent = undefined;
		this.streamingMessage = undefined;
		this.pendingTools.clear();
		this.renderInitialMessages();
		this.updatePendingMessagesDisplay();
	}

	/**
	 * Get a registered tool definition by name (for custom rendering).
	 */
	private getRegisteredToolDefinition(toolName: string) {
		return this.session.getToolDefinition(toolName);
	}

	private shouldRenderToolAsExecutionComponent(toolName: string): boolean {
		if (this.toolDisplayMode === "collapsed" && toolName !== "task" && toolName !== "todo") {
			return false;
		}
		return toolName === "task" || toolName === "todo";
	}

	/**
	 * Set up keyboard shortcuts registered by extensions.
	 */
	private setupExtensionShortcuts(extensionRunner: ExtensionRunner): void {
		const shortcuts = extensionRunner.getShortcuts(this.keybindings.getEffectiveConfig());
		if (shortcuts.size === 0) return;

		// Create a context for shortcut handlers
		const createContext = (): ExtensionContext => ({
			ui: this.createExtensionUIContext(),
			hasUI: true,
			cwd: this.sessionManager.getCwd(),
			sessionManager: this.sessionManager,
			modelRegistry: this.session.modelRegistry,
			model: this.session.model,
			isIdle: () => !this.session.isStreaming,
			signal: this.session.agent.signal,
			abort: () => this.session.abort(),
			hasPendingMessages: () => this.session.pendingMessageCount > 0,
			shutdown: () => {
				this.shutdownRequested = true;
			},
			getContextUsage: () => this.session.getContextUsage(),
			getSpinnerBudgetUsage: () => this.session.getSpinnerBudgetUsage(),
			compact: (options) => {
				void (async () => {
					try {
						const result = await this.session.compact(options?.customInstructions);
						options?.onComplete?.(result);
					} catch (error) {
						const err = error instanceof Error ? error : new Error(String(error));
						options?.onError?.(err);
					}
				})();
			},
			getSystemPrompt: () => this.session.systemPrompt,
		});

		// Set up the extension shortcut handler on the default editor
		this.defaultEditor.onExtensionShortcut = (data: string) => {
			for (const [shortcutStr, shortcut] of shortcuts) {
				// Cast to KeyId - extension shortcuts use the same format
				if (matchesKey(data, shortcutStr as KeyId)) {
					// Run handler async, don't block input
					Promise.resolve(shortcut.handler(createContext())).catch((err) => {
						this.showError(`Shortcut handler error: ${err instanceof Error ? err.message : String(err)}`);
					});
					return true;
				}
			}
			return false;
		};
	}

	/**
	 * Set extension status text in the footer.
	 */
	private setExtensionStatus(key: string, text: string | undefined): void {
		this.footerDataProvider.setExtensionStatus(key, text);
		this.requestRenderRespectingInput();
	}

	private buildDefaultSpinnerState(): SpinnerUiState | undefined {
		const summary = this.session.getTaskUiSummary();
		const usage = this.session.getContextUsage();
		const now = Date.now();
		const hasLiveExecution =
			this.session.isStreaming ||
			this.session.isCompacting ||
			this.session.isRetrying ||
			this.spinnerActiveToolCount > 0;
		const elapsedMs =
			hasLiveExecution && this.spinnerStartedAt > 0 ? Math.max(0, now - this.spinnerStartedAt) : undefined;

		let tip: string | undefined;
		if (this.settingsManager.getSpinnerTipsEnabled() && !summary?.next && elapsedMs !== undefined) {
			if (elapsedMs > 1_800_000) {
				tip = TUI_COPY.progressSurface.tips.clearContext;
			} else if (elapsedMs > 30_000) {
				tip = TUI_COPY.progressSurface.tips.queueHint;
			} else if (usage?.percent !== null && usage?.percent !== undefined && usage.percent >= 90) {
				tip = TUI_COPY.progressSurface.tips.contextPressure;
			}
		}

		const outputTokens =
			hasLiveExecution && this.spinnerReportedOutputTokens > 0
				? this.spinnerReportedOutputTokens
				: hasLiveExecution && this.spinnerResponseChars > 0
					? Math.round(this.spinnerResponseChars / 4)
					: undefined;
		const isThinking =
			this.spinnerThinkingStartedAt !== null ||
			(this.spinnerThinkingMinimumVisibleUntil !== null && now < this.spinnerThinkingMinimumVisibleUntil);
		const lastThinkingDurationMs =
			this.spinnerThinkingDurationMs !== null &&
			this.spinnerThoughtForVisibleUntil !== null &&
			now < this.spinnerThoughtForVisibleUntil
				? this.spinnerThinkingDurationMs
				: undefined;
		const budgetText = this.buildDefaultBudgetText(outputTokens, elapsedMs);

		const mode: SpinnerUiState["mode"] | undefined =
			!hasLiveExecution && !isThinking
				? undefined
				: isThinking
					? "thinking"
					: this.spinnerActiveToolCount > 0
						? "tool-use"
						: this.spinnerResponseChars > 0
							? "responding"
							: "requesting";

		if (
			this.spinnerBanner === undefined &&
			this.spinnerSystemOverrideMessage === undefined &&
			tip === undefined &&
			budgetText === undefined &&
			elapsedMs === undefined &&
			outputTokens === undefined &&
			!isThinking &&
			lastThinkingDurationMs === undefined &&
			mode === undefined
		) {
			return undefined;
		}

		const spinner: SpinnerUiState = {
			...(this.spinnerBanner ? { banner: this.spinnerBanner } : {}),
			...(tip ? { tip } : {}),
			...(budgetText ? { budgetText } : {}),
			...(this.spinnerSystemOverrideMessage ? { overrideMessage: this.spinnerSystemOverrideMessage } : {}),
			...(elapsedMs !== undefined ? { elapsedMs } : {}),
			...(outputTokens !== undefined ? { outputTokens } : {}),
			...(isThinking ? { isThinking: true } : {}),
			...(lastThinkingDurationMs !== undefined ? { lastThinkingDurationMs } : {}),
			...(this.spinnerCurrentToolLabel ? { currentToolLabel: this.spinnerCurrentToolLabel } : {}),
		};
		if (mode !== undefined) {
			spinner.mode = mode;
		}
		return spinner;
	}

	private buildDefaultBudgetText(outputTokens?: number, elapsedMs?: number): string | undefined {
		const requestBudget = this.session.getSpinnerBudgetUsage()?.requestMaxOutputTokens;
		if (!requestBudget || requestBudget <= 0) return undefined;

		const used = outputTokens ?? 0;
		if (used <= 0) return undefined;
		if (used >= requestBudget) {
			return `Target: ${used.toLocaleString()} used (${requestBudget.toLocaleString()} min)`;
		}

		const pct = Math.max(0, Math.min(100, Math.round((used / requestBudget) * 100)));
		let etaSuffix = "";
		if (elapsedMs !== undefined && elapsedMs >= 5_000 && used >= 2_000) {
			const rate = used / elapsedMs;
			const remaining = requestBudget - used;
			if (rate > 0 && remaining > 0) {
				etaSuffix = ` · ~${this.formatDurationForBudget(Math.round(remaining / rate))}`;
			}
		}
		return `Target: ${used.toLocaleString()} / ${requestBudget.toLocaleString()} (${pct}% used${etaSuffix})`;
	}

	private formatDurationForBudget(ms: number): string {
		const totalSec = Math.max(1, Math.floor(ms / 1000));
		if (totalSec < 60) return `${totalSec}s`;
		const minutes = Math.floor(totalSec / 60);
		const seconds = totalSec % 60;
		if (minutes < 60) return `${minutes}m ${seconds}s`;
		const hours = Math.floor(minutes / 60);
		const remainingMinutes = minutes % 60;
		return `${hours}h ${remainingMinutes}m`;
	}

	private getWorkingLoaderMessage(): string {
		return this.workingMessage ?? this.defaultWorkingMessage;
	}

	private isInputActivitySuppressed(): boolean {
		return Date.now() < this.inputActivitySuppressedUntil;
	}

	private markInputActivity(): void {
		const wasSuppressed = this.isInputActivitySuppressed();
		this.inputActivitySuppressedUntil = Date.now() + InteractiveMode.INPUT_ACTIVITY_SUPPRESSION_MS;
		if (this.inputActivityResumeTimer) {
			clearTimeout(this.inputActivityResumeTimer);
		}
		if (!wasSuppressed) {
			this.syncTerminalProgressIndicator();
		}
		this.inputActivityResumeTimer = setTimeout(() => {
			this.inputActivityResumeTimer = undefined;
			this.requestRenderUnlessInputSuppressed();
			this.syncProgressSurfaceRefreshLoop();
			this.syncTerminalProgressIndicator();
		}, InteractiveMode.INPUT_ACTIVITY_SUPPRESSION_MS + 1);
		this.syncProgressSurfaceRefreshLoop();
	}

	private requestRenderUnlessInputSuppressed(force = false): void {
		if (this.isInputActivitySuppressed()) {
			return;
		}
		this.ui.requestRender(force);
	}

	private requestRenderRespectingInput(force = false): void {
		this.ui.requestRender(force);
	}

	private createWorkingLoader(): Loader {
		return new Loader(
			this.ui,
			(spinner) => theme.fg("accent", spinner),
			(text) => theme.fg("muted", text),
			this.getWorkingLoaderMessage(),
			this.workingIndicatorOptions,
			{ skipInitialRender: true },
		);
	}

	private renderWorkingArea(): void {
		const snapshot = this.getProgressSurfaceSnapshot();
		const shouldRenderSurface = shouldRenderProgressSurface(snapshot);
		const shouldRenderLoader = this.workingVisible && this.agentRunActive && !shouldRenderSurface;
		const hasTaskbarOverlay = this.taskbarOverlayComponent !== undefined;
		const hasWorkingDetails =
			this.workingDetailsComponent !== undefined ||
			(this.workingDetailsLines !== undefined && this.workingDetailsLines.length > 0);
		if (!shouldRenderSurface && !shouldRenderLoader && !hasTaskbarOverlay && !hasWorkingDetails) {
			this.updateTaskbarContent(() => {});
			return;
		}

		this.updateTaskbarContent((target) => {
			target.addChild(new Spacer(1));
			if (this.taskbarOverlayComponent) {
				target.addChild(this.taskbarOverlayComponent);
				return;
			}
			if (shouldRenderSurface) {
				target.addChild(this.progressSurfaceComponent);
			}
			if (shouldRenderLoader) {
				if (!this.loadingAnimation) {
					this.loadingAnimation = this.createWorkingLoader();
				}
				target.addChild(this.loadingAnimation);
			}
			if (this.workingDetailsComponent) {
				target.addChild(this.workingDetailsComponent);
			} else if (this.workingDetailsLines && this.workingDetailsLines.length > 0) {
				for (const line of this.workingDetailsLines) {
					target.addChild(new Text(line, 0, 0));
				}
			}
		});
	}

	private stopWorkingLoader(): void {
		if (this.loadingAnimation) {
			this.loadingAnimation.stop();
			this.loadingAnimation = undefined;
		}
		this.renderWorkingArea();
	}

	private setTaskbarOverlay(component: Component | undefined): void {
		this.taskbarOverlayComponent = component;
		this.renderWorkingArea();
	}

	private clearTaskbarNoticeTimeout(): void {
		if (this.taskbarNoticeTimeout) {
			clearTimeout(this.taskbarNoticeTimeout);
			this.taskbarNoticeTimeout = undefined;
		}
	}

	private showTaskbarNotice(message: string, tone: "dim" | "warning" = "dim", durationMs = 2200): void {
		this.clearTaskbarNoticeTimeout();
		const text =
			tone === "warning" ? new Text(theme.fg("warning", message), 1, 0) : new Text(theme.fg("dim", message), 1, 0);
		this.setTaskbarOverlay(text);
		this.requestRenderRespectingInput();
		this.taskbarNoticeTimeout = setTimeout(() => {
			this.taskbarNoticeTimeout = undefined;
			if (this.taskbarOverlayComponent === text) {
				this.setTaskbarOverlay(undefined);
				this.requestRenderUnlessInputSuppressed();
			}
		}, durationMs);
	}

	private getProgressSurfaceSnapshot(): ProgressSurfaceSnapshot {
		return {
			tasks: this.session.getTaskUiItems() ?? [],
			queued: undefined,
			spinner: this.buildDefaultSpinnerState(),
			expanded: false,
		};
	}

	private syncProgressSurfaceRefreshLoop(): void {
		const snapshot = this.getProgressSurfaceSnapshot();
		const needsRefresh = snapshot.spinner !== undefined && shouldRenderProgressSurface(snapshot);
		if (this.isInputActivitySuppressed()) {
			if (this.progressSurfaceRefreshTimer) {
				clearInterval(this.progressSurfaceRefreshTimer);
				this.progressSurfaceRefreshTimer = undefined;
			}
			return;
		}
		if (needsRefresh) {
			if (this.progressSurfaceRefreshTimer) {
				return;
			}
			this.progressSurfaceRefreshTimer = setInterval(() => {
				this.requestRenderUnlessInputSuppressed();
			}, 250);
			return;
		}
		if (this.progressSurfaceRefreshTimer) {
			clearInterval(this.progressSurfaceRefreshTimer);
			this.progressSurfaceRefreshTimer = undefined;
		}
	}

	private setTerminalProgressActive(active: boolean): void {
		this.terminalProgressActive = active;
		this.syncTerminalProgressIndicator();
	}

	private syncTerminalProgressIndicator(): void {
		if (!this.settingsManager.getShowTerminalProgress()) {
			this.ui.terminal.setProgress(false);
			return;
		}
		if (this.isInputActivitySuppressed()) {
			this.ui.terminal.setProgress(false);
			return;
		}
		this.ui.terminal.setProgress(this.terminalProgressActive);
	}

	private setWorkingVisible(visible: boolean): void {
		this.workingVisible = visible;
		if (!visible) {
			this.stopWorkingLoader();
			this.requestRenderRespectingInput();
			return;
		}
		if (this.agentRunActive && !this.loadingAnimation) {
			this.loadingAnimation = this.createWorkingLoader();
		}
		this.renderWorkingArea();
		this.requestRenderRespectingInput();
	}

	private setWorkingIndicator(options?: LoaderIndicatorOptions): void {
		this.workingIndicatorOptions = options;
		this.loadingAnimation?.setIndicator(options);
		this.renderWorkingArea();
		this.requestRenderRespectingInput();
	}

	private setHiddenThinkingLabel(label?: string): void {
		this.hiddenThinkingLabel = label ?? this.defaultHiddenThinkingLabel;
		for (const child of this.chatContainer.children) {
			if (child instanceof AssistantMessageComponent) {
				child.setHiddenThinkingLabel(this.hiddenThinkingLabel);
			}
		}
		if (this.streamingComponent) {
			this.streamingComponent.setHiddenThinkingLabel(this.hiddenThinkingLabel);
		}
		this.requestRenderRespectingInput();
	}

	private clearSpinnerBannerTimeout(): void {
		if (this.spinnerBannerTimeout) {
			clearTimeout(this.spinnerBannerTimeout);
			this.spinnerBannerTimeout = undefined;
		}
	}

	private setSpinnerBanner(banner: SpinnerUiState["banner"] | undefined, options?: { expiresMs?: number }): void {
		this.clearSpinnerBannerTimeout();
		this.spinnerBanner = banner;
		if (banner && options?.expiresMs && options.expiresMs > 0) {
			this.spinnerBannerTimeout = setTimeout(() => {
				this.spinnerBannerTimeout = undefined;
				if (this.spinnerBanner === banner) {
					this.spinnerBanner = undefined;
					this.requestRenderUnlessInputSuppressed();
				}
			}, options.expiresMs);
		}
		this.syncProgressSurfaceRefreshLoop();
		this.requestRenderUnlessInputSuppressed();
	}

	private describeSpinnerToolLabel(toolName: string, args: Record<string, unknown>): string | undefined {
		const path =
			typeof args.path === "string" && args.path.length > 0
				? formatPathRelativeToCwdOrAbsolute(args.path, this.sessionManager.getCwd())
				: typeof args.file_path === "string" && args.file_path.length > 0
					? formatPathRelativeToCwdOrAbsolute(args.file_path, this.sessionManager.getCwd())
					: undefined;

		switch (toolName) {
			case "read":
				return `Reading ${path ?? "file"}`;
			case "grep":
			case "find": {
				const pattern = typeof args.pattern === "string" ? args.pattern : undefined;
				return pattern ? `Searching ${pattern}` : `Searching ${path ?? "files"}`;
			}
			case "ls":
				return `Listing ${path ?? "."}`;
			case "edit":
				return `Editing ${path ?? "file"}`;
			case "write":
				return `Writing ${path ?? "file"}`;
			case "bash":
				return "Running command";
			default:
				return undefined;
		}
	}

	private setWorkingDetails(
		content?: string[] | ((tui: TUI, theme: Theme) => Component & { dispose?(): void }),
	): void {
		if (this.workingDetailsComponent?.dispose) {
			this.workingDetailsComponent.dispose();
		}
		this.workingDetailsComponent = undefined;
		this.workingDetailsLines = undefined;

		if (Array.isArray(content)) {
			this.workingDetailsLines = content.length > 0 ? [...content] : undefined;
		} else if (content) {
			this.workingDetailsComponent = content(this.ui, theme);
		}

		this.renderWorkingArea();
		this.requestRenderUnlessInputSuppressed();
	}

	private resetSpinnerRuntimeState(): void {
		this.spinnerStartedAt = 0;
		this.spinnerResponseChars = 0;
		this.spinnerReportedOutputTokens = 0;
		this.spinnerThinkingStartedAt = null;
		this.spinnerThinkingMinimumVisibleUntil = null;
		this.spinnerThinkingDurationMs = null;
		this.spinnerThoughtForVisibleUntil = null;
		this.spinnerSystemOverrideMessage = undefined;
		this.spinnerCurrentToolLabel = undefined;
		this.clearSpinnerBannerTimeout();
		this.spinnerBanner = undefined;
		this.syncProgressSurfaceRefreshLoop();
	}

	/**
	 * Set an extension widget in the lower extension area (upper or lower slot).
	 */
	private setExtensionWidget(
		key: string,
		content: string[] | ((tui: TUI, thm: Theme) => Component & { dispose?(): void }) | undefined,
		options?: ExtensionWidgetOptions,
	): void {
		const placement = options?.placement ?? "aboveEditor";
		const removeExisting = (map: Map<string, Component & { dispose?(): void }>) => {
			const existing = map.get(key);
			if (existing?.dispose) existing.dispose();
			map.delete(key);
		};

		removeExisting(this.extensionWidgetsAbove);
		removeExisting(this.extensionWidgetsBelow);

		if (content === undefined) {
			this.renderWidgets();
			return;
		}

		let component: Component & { dispose?(): void };

		if (Array.isArray(content)) {
			// Wrap string array in a Container with Text components
			const container = new Container();
			for (const line of content.slice(0, InteractiveMode.MAX_WIDGET_LINES)) {
				container.addChild(new Text(line, 1, 0));
			}
			if (content.length > InteractiveMode.MAX_WIDGET_LINES) {
				container.addChild(new Text(theme.fg("muted", "... (widget truncated)"), 1, 0));
			}
			component = container;
		} else {
			// Factory function - create component
			component = content(this.ui, theme);
		}

		const targetMap = placement === "belowEditor" ? this.extensionWidgetsBelow : this.extensionWidgetsAbove;
		targetMap.set(key, component);
		this.renderWidgets();
	}

	private clearExtensionWidgets(): void {
		for (const widget of this.extensionWidgetsAbove.values()) {
			widget.dispose?.();
		}
		for (const widget of this.extensionWidgetsBelow.values()) {
			widget.dispose?.();
		}
		this.extensionWidgetsAbove.clear();
		this.extensionWidgetsBelow.clear();
		this.renderWidgets();
	}

	private resetExtensionUI(): void {
		if (this.extensionSelector) {
			this.hideExtensionSelector();
		}
		if (this.extensionInput) {
			this.hideExtensionInput();
		}
		if (this.extensionEditor) {
			this.hideExtensionEditor();
		}
		this.ui.hideOverlay();
		this.clearExtensionTerminalInputListeners();
		this.setExtensionFooter(undefined);
		this.setExtensionHeader(undefined);
		this.clearExtensionWidgets();
		this.footerDataProvider.clearExtensionStatuses();
		this.footer.invalidate();
		this.autocompleteProviderWrappers = [];
		this.setCustomEditorComponent(undefined);
		this.setupAutocompleteProvider();
		this.defaultEditor.onExtensionShortcut = undefined;
		this.updateTerminalTitle();
		this.workingMessage = undefined;
		this.workingDetailsLines = undefined;
		if (this.workingDetailsComponent?.dispose) {
			this.workingDetailsComponent.dispose();
		}
		this.workingDetailsComponent = undefined;
		this.workingVisible = true;
		this.taskbarOverlayComponent = undefined;
		this.clearTaskbarNoticeTimeout();
		this.resetSpinnerRuntimeState();
		this.setWorkingIndicator();
		if (this.loadingAnimation) {
			this.loadingAnimation.setMessage(`${this.defaultWorkingMessage} (${keyText("app.interrupt")} to interrupt)`);
		}
		this.setHiddenThinkingLabel();
	}

	// Maximum total widget lines to prevent viewport overflow
	private static readonly MAX_WIDGET_LINES = 10;

	/**
	 * Render all widgets into the lower extension area slots beneath the editor.
	 */
	private renderWidgets(): void {
		if (!this.widgetContainerAbove || !this.widgetContainerBelow) return;
		this.renderWidgetContainer(this.widgetContainerAbove, this.extensionWidgetsAbove, false, true);
		this.renderWidgetContainer(this.widgetContainerBelow, this.extensionWidgetsBelow, false, false);
		this.requestRenderRespectingInput();
	}

	private renderWidgetContainer(
		container: Container,
		widgets: Map<string, Component & { dispose?(): void }>,
		spacerWhenEmpty: boolean,
		leadingSpacer: boolean,
	): void {
		container.clear();

		if (widgets.size === 0) {
			if (spacerWhenEmpty) {
				container.addChild(new Spacer(1));
			}
			return;
		}

		if (leadingSpacer) {
			container.addChild(new Spacer(1));
		}
		for (const component of widgets.values()) {
			container.addChild(component);
		}
	}

	/**
	 * Set a custom footer component, or restore the built-in footer.
	 */
	private setExtensionFooter(
		factory:
			| ((tui: TUI, thm: Theme, footerData: ReadonlyFooterDataProvider) => Component & { dispose?(): void })
			| undefined,
	): void {
		const bottomPane = this.bottomPane;
		if (!bottomPane.passiveFooterRow) {
			return;
		}

		// Dispose existing custom footer
		if (this.customFooter?.dispose) {
			this.customFooter.dispose();
		}

		if (factory) {
			// Create and replace the passive footer row content in-place.
			this.customFooter = factory(this.ui, theme, this.footerDataProvider);
		} else {
			this.customFooter = undefined;
		}
		this.updatePassiveFooterContent(this.customFooter ?? this.footer);

		this.ui.requestRender();
	}

	/**
	 * Set a custom header component, or restore the built-in header.
	 */
	private setExtensionHeader(factory: ((tui: TUI, thm: Theme) => Component & { dispose?(): void }) | undefined): void {
		// Header may not be initialized yet if called during early initialization
		if (!this.builtInHeader) {
			return;
		}

		// Dispose existing custom header
		if (this.customHeader?.dispose) {
			this.customHeader.dispose();
		}

		// Find the index of the current header in the header container
		const currentHeader = this.customHeader || this.builtInHeader;
		const index = this.headerContainer.children.indexOf(currentHeader);

		if (factory) {
			// Create and add custom header
			this.customHeader = factory(this.ui, theme);
			if (isExpandable(this.customHeader)) {
				this.customHeader.setExpanded(this.toolOutputExpanded);
			}
			if (index !== -1) {
				this.headerContainer.children[index] = this.customHeader;
			} else {
				// If not found (e.g. builtInHeader was never added), add at the top
				this.headerContainer.children.unshift(this.customHeader);
			}
		} else {
			// Restore built-in header
			this.customHeader = undefined;
			if (isExpandable(this.builtInHeader)) {
				this.builtInHeader.setExpanded(this.toolOutputExpanded);
			}
			if (index !== -1) {
				this.headerContainer.children[index] = this.builtInHeader;
			}
		}

		this.ui.requestRender();
	}

	private addExtensionTerminalInputListener(
		handler: (data: string) => { consume?: boolean; data?: string } | undefined,
	): () => void {
		const unsubscribe = this.ui.addInputListener(handler);
		this.extensionTerminalInputUnsubscribers.add(unsubscribe);
		return () => {
			unsubscribe();
			this.extensionTerminalInputUnsubscribers.delete(unsubscribe);
		};
	}

	private clearExtensionTerminalInputListeners(): void {
		for (const unsubscribe of this.extensionTerminalInputUnsubscribers) {
			unsubscribe();
		}
		this.extensionTerminalInputUnsubscribers.clear();
	}

	/**
	 * Create the ExtensionUIContext for extensions.
	 */
	private createExtensionUIContext(): ExtensionUIContext {
		return {
			select: (title, options, opts) => this.showExtensionSelector(title, options, opts),
			confirm: (title, message, opts) => this.showExtensionConfirm(title, message, opts),
			input: (title, placeholder, opts) => this.showExtensionInput(title, placeholder, opts),
			notify: (message, type) => this.showExtensionNotify(message, type),
			onTerminalInput: (handler) => this.addExtensionTerminalInputListener(handler),
			setStatus: (key, text) => this.setExtensionStatus(key, text),
			setWorkingMessage: (message) => {
				this.workingMessage = message;
				if (this.loadingAnimation) {
					this.loadingAnimation.setMessage(message ?? this.defaultWorkingMessage);
				}
				this.renderWorkingArea();
			},
			setWorkingDetails: (lines) => {
				this.setWorkingDetails(lines);
			},
			setWorkingVisible: (visible) => this.setWorkingVisible(visible),
			setWorkingIndicator: (options) => this.setWorkingIndicator(options),
			setHiddenThinkingLabel: (label) => this.setHiddenThinkingLabel(label),
			setWidget: (key, content, options) => this.setExtensionWidget(key, content, options),
			setFooter: (factory) => this.setExtensionFooter(factory),
			setHeader: (factory) => this.setExtensionHeader(factory),
			setTitle: (title) => this.ui.terminal.setTitle(title),
			custom: (factory, options) => this.showExtensionCustom(factory, options),
			pasteToEditor: (text) => this.editor.handleInput(`\x1b[200~${text}\x1b[201~`),
			setEditorText: (text) => this.editor.setText(text),
			getEditorText: () => this.editor.getExpandedText?.() ?? this.editor.getText(),
			editor: (title, prefill) => this.showExtensionEditor(title, prefill),
			addAutocompleteProvider: (factory) => {
				this.autocompleteProviderWrappers.push(factory);
				this.setupAutocompleteProvider();
			},
			setEditorComponent: (factory) => this.setCustomEditorComponent(factory),
			getEditorComponent: () => this.editorComponentFactory,
			get theme() {
				return theme;
			},
			getAllThemes: () => getAvailableThemesWithPaths(),
			getTheme: (name) => getThemeByName(name),
			setTheme: (themeOrName) => {
				if (themeOrName instanceof Theme) {
					setThemeInstance(themeOrName);
					this.requestRenderRespectingInput();
					return { success: true };
				}
				const result = setTheme(themeOrName, true);
				if (result.success) {
					if (this.settingsManager.getTheme() !== themeOrName) {
						this.settingsManager.setTheme(themeOrName);
					}
					this.requestRenderRespectingInput();
				}
				return result;
			},
			getToolsExpanded: () => this.toolOutputExpanded,
			setToolsExpanded: (expanded) => this.setToolsExpanded(expanded),
		};
	}

	/**
	 * Show a selector for extensions.
	 */
	private showExtensionSelector(
		title: string,
		options: string[],
		opts?: ExtensionUIDialogOptions,
		bannerKind: NonNullable<SpinnerUiState["banner"]>["kind"] = "input",
	): Promise<string | undefined> {
		return new Promise((resolve) => {
			if (opts?.signal?.aborted) {
				resolve(undefined);
				return;
			}

			this.setExtensionStatus("ui", `waiting · ${title.split("\n")[0]}`);
			this.setSpinnerBanner({
				kind: bannerKind,
				title:
					bannerKind === "approval"
						? TUI_COPY.interactiveNotices.approvalWaiting
						: TUI_COPY.interactiveNotices.choiceWaiting,
				detail: title.split("\n")[0],
			});

			const onAbort = () => {
				this.hideExtensionSelector();
				resolve(undefined);
			};
			opts?.signal?.addEventListener("abort", onAbort, { once: true });

			this.extensionSelector = new ExtensionSelectorComponent(
				title,
				options,
				(option) => {
					opts?.signal?.removeEventListener("abort", onAbort);
					this.hideExtensionSelector();
					resolve(option);
				},
				() => {
					opts?.signal?.removeEventListener("abort", onAbort);
					this.hideExtensionSelector();
					resolve(undefined);
				},
				{ tui: this.ui, timeout: opts?.timeout, onToggleToolsExpanded: () => this.toggleToolOutputExpansion() },
			);

			this.setComposerContent(this.extensionSelector, { respectInput: true });
		});
	}

	/**
	 * Hide the extension selector.
	 */
	private hideExtensionSelector(): void {
		this.extensionSelector?.dispose();
		this.extensionSelector = undefined;
		this.setExtensionStatus("ui", undefined);
		this.setSpinnerBanner(undefined);
		this.restoreComposerEditor({
			respectInput: true,
		});
	}

	/**
	 * Show a confirmation dialog for extensions.
	 */
	private async showExtensionConfirm(
		title: string,
		message: string,
		opts?: ExtensionUIDialogOptions,
	): Promise<boolean> {
		const result = await this.showExtensionSelector(
			`${title}\n${message}`,
			[TUI_COPY.sessionSelector.deleteConfirmAction, TUI_COPY.sessionSelector.deleteCancelAction],
			opts,
			"approval",
		);
		return result === TUI_COPY.sessionSelector.deleteConfirmAction;
	}

	private async promptForMissingSessionCwd(error: MissingSessionCwdError): Promise<string | undefined> {
		const confirmed = await this.showExtensionConfirm(
			TUI_COPY.missingSessionCwd.title,
			formatMissingSessionCwdPrompt(error.issue),
		);
		return confirmed ? error.issue.fallbackCwd : undefined;
	}

	/**
	 * Show a text input for extensions.
	 */
	private showExtensionInput(
		title: string,
		placeholder?: string,
		opts?: ExtensionUIDialogOptions,
	): Promise<string | undefined> {
		return new Promise((resolve) => {
			if (opts?.signal?.aborted) {
				resolve(undefined);
				return;
			}

			this.setExtensionStatus("ui", `waiting · ${title}`);
			this.setSpinnerBanner({
				kind: "input",
				title: TUI_COPY.interactiveNotices.inputWaiting,
				detail: title,
			});

			const onAbort = () => {
				this.hideExtensionInput();
				resolve(undefined);
			};
			opts?.signal?.addEventListener("abort", onAbort, { once: true });

			this.extensionInput = new ExtensionInputComponent(
				title,
				placeholder,
				(value) => {
					opts?.signal?.removeEventListener("abort", onAbort);
					this.hideExtensionInput();
					resolve(value);
				},
				() => {
					opts?.signal?.removeEventListener("abort", onAbort);
					this.hideExtensionInput();
					resolve(undefined);
				},
				{ tui: this.ui, timeout: opts?.timeout },
			);

			this.setComposerContent(this.extensionInput, { respectInput: true });
		});
	}

	/**
	 * Hide the extension input.
	 */
	private hideExtensionInput(): void {
		this.extensionInput?.dispose();
		this.extensionInput = undefined;
		this.setExtensionStatus("ui", undefined);
		this.setSpinnerBanner(undefined);
		this.restoreComposerEditor({
			respectInput: true,
		});
	}

	/**
	 * Show a multi-line editor for extensions (with Ctrl+G support).
	 */
	private showExtensionEditor(title: string, prefill?: string): Promise<string | undefined> {
		return new Promise((resolve) => {
			this.setExtensionStatus("ui", `waiting · ${title}`);
			this.setSpinnerBanner({
				kind: "input",
				title: TUI_COPY.interactiveNotices.inputWaiting,
				detail: title,
			});
			this.extensionEditor = new ExtensionEditorComponent(
				this.ui,
				this.keybindings,
				title,
				prefill,
				(value) => {
					this.hideExtensionEditor();
					resolve(value);
				},
				() => {
					this.hideExtensionEditor();
					resolve(undefined);
				},
			);

			this.setComposerContent(this.extensionEditor, { respectInput: true });
		});
	}

	/**
	 * Hide the extension editor.
	 */
	private hideExtensionEditor(): void {
		this.extensionEditor = undefined;
		this.setExtensionStatus("ui", undefined);
		this.setSpinnerBanner(undefined);
		this.restoreComposerEditor({
			respectInput: true,
		});
	}

	/**
	 * Set a custom editor component from an extension.
	 * Pass undefined to restore the default editor.
	 */
	private setCustomEditorComponent(factory: EditorFactory | undefined): void {
		this.editorComponentFactory = factory;

		// Save text from current editor before switching
		const currentText = this.editor.getText();

		if (factory) {
			// Create the custom editor with tui, theme, and keybindings
			const newEditor = factory(this.ui, getEditorTheme(), this.keybindings);

			// Wire up callbacks from the default editor
			newEditor.onSubmit = this.defaultEditor.onSubmit;
			newEditor.onChange = this.defaultEditor.onChange;

			// Copy text from previous editor
			newEditor.setText(currentText);

			// Copy appearance settings if supported
			if (newEditor.borderColor !== undefined) {
				newEditor.borderColor = this.defaultEditor.borderColor;
			}
			if (newEditor.setPaddingX !== undefined) {
				newEditor.setPaddingX(this.defaultEditor.getPaddingX());
			}

			// Set autocomplete if supported
			if (newEditor.setAutocompleteProvider && this.autocompleteProvider) {
				newEditor.setAutocompleteProvider(this.autocompleteProvider);
			}

			// If extending CustomEditor, copy app-level handlers
			// Use duck typing since instanceof fails across jiti module boundaries
			const customEditor = newEditor as unknown as Record<string, unknown>;
			if ("actionHandlers" in customEditor && customEditor.actionHandlers instanceof Map) {
				if (!customEditor.onEscape) {
					customEditor.onEscape = () => this.defaultEditor.onEscape?.();
				}
				if (!customEditor.onCtrlD) {
					customEditor.onCtrlD = () => this.defaultEditor.onCtrlD?.();
				}
				if (!customEditor.onPasteImage) {
					customEditor.onPasteImage = () => this.defaultEditor.onPasteImage?.();
				}
				if (!customEditor.onExtensionShortcut) {
					customEditor.onExtensionShortcut = (data: string) => this.defaultEditor.onExtensionShortcut?.(data);
				}
				// Copy action handlers (clear, suspend, model switching, etc.)
				for (const [action, handler] of this.defaultEditor.actionHandlers) {
					(customEditor.actionHandlers as Map<string, () => void>).set(action, handler);
				}
			}

			this.editor = newEditor;
		} else {
			// Restore default editor with text from custom editor
			this.defaultEditor.setText(currentText);
			this.editor = this.defaultEditor;
		}

		this.restoreComposerEditor();
	}

	/**
	 * Show a notification for extensions.
	 */
	private showExtensionNotify(message: string, type?: "info" | "warning" | "error"): void {
		if (type === "error") {
			this.showError(message);
		} else if (type === "warning") {
			this.showWarning(message);
		} else {
			this.showStatus(message);
		}
	}

	private showStatus(message: string): void {
		const children = this.chatContainer.children;
		const last = children.length > 0 ? children[children.length - 1] : undefined;
		const secondLast = children.length > 1 ? children[children.length - 2] : undefined;

		if (last && secondLast && last === this.lastStatusText && secondLast === this.lastStatusSpacer) {
			this.lastStatusText.setText(theme.fg("dim", message));
			this.requestRenderRespectingInput();
			return;
		}

		const spacer = new Spacer(1);
		const text = new Text(theme.fg("dim", message), 1, 0);
		this.chatContainer.addChild(spacer);
		this.chatContainer.addChild(text);
		this.lastStatusSpacer = spacer;
		this.lastStatusText = text;
		this.requestRenderRespectingInput();
	}

	/** Show a custom component with keyboard focus. Overlay mode renders on top of existing content. */
	private async showExtensionCustom<T>(
		factory: (
			tui: TUI,
			theme: Theme,
			keybindings: KeybindingsManager,
			done: (result: T) => void,
		) => (Component & { dispose?(): void }) | Promise<Component & { dispose?(): void }>,
		options?: {
			overlay?: boolean;
			overlayOptions?: OverlayOptions | (() => OverlayOptions);
			onHandle?: (handle: OverlayHandle) => void;
		},
	): Promise<T> {
		const savedText = this.editor.getText();
		const isOverlay = options?.overlay ?? false;

		const restoreEditor = () => {
			this.editor.setText(savedText);
			this.restoreComposerEditor();
		};

		return new Promise((resolve, reject) => {
			let component: Component & { dispose?(): void };
			let closed = false;

			const close = (result: T) => {
				if (closed) return;
				closed = true;
				if (isOverlay) this.ui.hideOverlay();
				else restoreEditor();
				// Note: both branches above already call requestRender
				resolve(result);
				try {
					component?.dispose?.();
				} catch {
					/* ignore dispose errors */
				}
			};

			Promise.resolve(factory(this.ui, theme, this.keybindings, close))
				.then((c) => {
					if (closed) return;
					component = c;
					if (isOverlay) {
						// Resolve overlay options - can be static or dynamic function
						const resolveOptions = (): OverlayOptions | undefined => {
							if (options?.overlayOptions) {
								const opts =
									typeof options.overlayOptions === "function"
										? options.overlayOptions()
										: options.overlayOptions;
								return opts;
							}
							// Fallback: use component's width property if available
							const w = (component as { width?: number }).width;
							return w ? { width: w } : undefined;
						};
						const handle = this.ui.showOverlay(component, resolveOptions());
						// Expose handle to caller for visibility control
						options?.onHandle?.(handle);
					} else {
						this.setComposerContent(component);
					}
				})
				.catch((err) => {
					if (closed) return;
					if (!isOverlay) restoreEditor();
					reject(err);
				});
		});
	}

	/**
	 * Show an extension error in the UI.
	 */
	private showExtensionError(extensionPath: string, error: string, stack?: string): void {
		const errorMsg = `Extension "${extensionPath}" error: ${error}`;
		const errorText = new Text(theme.fg("error", errorMsg), 1, 0);
		this.chatContainer.addChild(errorText);
		if (stack) {
			// Show stack trace in dim color, indented
			const stackLines = stack
				.split("\n")
				.slice(1) // Skip first line (duplicates error message)
				.map((line) => theme.fg("dim", `  ${line.trim()}`))
				.join("\n");
			if (stackLines) {
				this.chatContainer.addChild(new Text(stackLines, 1, 0));
			}
		}
		this.ui.requestRender();
	}

	// =========================================================================
	// Key Handlers
	// =========================================================================

	private setupKeyHandlers(): void {
		// Set up handlers on defaultEditor - they use this.editor for text access
		// so they work correctly regardless of which editor is active
		this.defaultEditor.onEscape = () => {
			if (this.session.isStreaming) {
				this.restoreQueuedMessagesToEditor({ abort: true });
			} else if (this.session.isBashRunning) {
				this.session.abortBash();
			} else if (this.isBashMode) {
				this.editor.setText("");
				this.isBashMode = false;
				this.updateEditorBorderColor();
			} else if (!this.editor.getText().trim()) {
				// Double-escape with empty editor triggers /tree, /fork, or nothing based on setting
				const action = this.settingsManager.getDoubleEscapeAction();
				if (action !== "none") {
					const now = Date.now();
					if (now - this.lastEscapeTime < 500) {
						if (action === "tree") {
							this.showTreeSelector();
						} else {
							this.showUserMessageSelector();
						}
						this.lastEscapeTime = 0;
					} else {
						this.lastEscapeTime = now;
					}
				}
			}
		};

		// Register app action handlers
		this.defaultEditor.onAction("app.clear", () => this.handleCtrlC());
		this.defaultEditor.onCtrlD = () => this.handleCtrlD();
		this.defaultEditor.onAction("app.suspend", () => this.handleCtrlZ());
		this.defaultEditor.onAction("app.thinking.cycle", () => this.cycleThinkingLevel());
		this.defaultEditor.onAction("app.model.cycleForward", () => this.cycleModel("forward"));
		this.defaultEditor.onAction("app.model.cycleBackward", () => this.cycleModel("backward"));

		// Global debug handler on TUI (works regardless of focus)
		this.ui.onDebug = () => this.handleDebugCommand();
		this.defaultEditor.onAction("app.model.select", () => this.showModelSelector());
		this.defaultEditor.onAction("app.tools.expand", () => this.toggleToolOutputExpansion());
		this.defaultEditor.onAction("app.thinking.toggle", () => this.toggleThinkingBlockVisibility());
		this.defaultEditor.onAction("app.editor.external", () => this.openExternalEditor());
		this.defaultEditor.onAction("app.message.followUp", () => this.handleFollowUp());
		this.defaultEditor.onAction("app.message.dequeue", () => this.handleDequeue());
		this.defaultEditor.onAction("app.session.new", () => this.handleClearCommand());
		this.defaultEditor.onAction("app.session.tree", () => this.showTreeSelector());
		this.defaultEditor.onAction("app.session.fork", () => this.showUserMessageSelector());
		this.defaultEditor.onAction("app.session.resume", () => this.showSessionSelector());

		this.defaultEditor.onChange = (text: string) => {
			const wasBashMode = this.isBashMode;
			this.isBashMode = text.trimStart().startsWith("!");
			if (wasBashMode !== this.isBashMode) {
				this.updateEditorBorderColor();
			}
		};

		// Handle clipboard image paste (triggered on Ctrl+V)
		this.defaultEditor.onPasteImage = () => {
			this.handleClipboardImagePaste();
		};
	}

	private async handleClipboardImagePaste(): Promise<void> {
		try {
			const image = await readClipboardImage();
			if (!image) {
				return;
			}

			// Write to temp file
			const tmpDir = os.tmpdir();
			const ext = extensionForImageMimeType(image.mimeType) ?? "png";
			const fileName = `pi-clipboard-${crypto.randomUUID()}.${ext}`;
			const filePath = path.join(tmpDir, fileName);
			fs.writeFileSync(filePath, Buffer.from(image.bytes));

			// Insert file path directly
			this.editor.insertTextAtCursor?.(filePath);
			this.ui.requestRender();
		} catch {
			// Silently ignore clipboard errors (may not have permission, etc.)
		}
	}

	private setupEditorSubmitHandler(): void {
		this.defaultEditor.onSubmit = async (text: string) => {
			text = text.trim();
			if (!text) return;

			// Handle commands
			if (text === "/settings") {
				this.showSettingsSelector();
				this.editor.setText("");
				return;
			}
			if (text === "/scoped-models") {
				this.editor.setText("");
				await this.showModelsSelector();
				return;
			}
			if (text === "/model" || text.startsWith("/model ")) {
				const searchTerm = text.startsWith("/model ") ? text.slice(7).trim() : undefined;
				this.editor.setText("");
				await this.handleModelCommand(searchTerm);
				return;
			}
			if (text === "/export" || text.startsWith("/export ")) {
				await this.handleExportCommand(text);
				this.editor.setText("");
				return;
			}
			if (text === "/import" || text.startsWith("/import ")) {
				await this.handleImportCommand(text);
				this.editor.setText("");
				return;
			}
			if (text === "/share") {
				await this.handleShareCommand();
				this.editor.setText("");
				return;
			}
			if (text === "/copy") {
				await this.handleCopyCommand();
				this.editor.setText("");
				return;
			}
			if (text === "/name" || text.startsWith("/name ")) {
				this.handleNameCommand(text);
				this.editor.setText("");
				return;
			}
			if (text === "/session") {
				this.handleSessionCommand();
				this.editor.setText("");
				return;
			}
			if (text === "/changelog") {
				this.handleChangelogCommand();
				this.editor.setText("");
				return;
			}
			if (text === "/hotkeys") {
				this.handleHotkeysCommand();
				this.editor.setText("");
				return;
			}
			if (text === "/fork") {
				this.showUserMessageSelector();
				this.editor.setText("");
				return;
			}
			if (text === "/clone") {
				this.editor.setText("");
				await this.handleCloneCommand();
				return;
			}
			if (text === "/tree") {
				this.showTreeSelector();
				this.editor.setText("");
				return;
			}
			if (text === "/login") {
				this.showOAuthSelector("login");
				this.editor.setText("");
				return;
			}
			if (text === "/logout") {
				this.showOAuthSelector("logout");
				this.editor.setText("");
				return;
			}
			if (text === "/new") {
				this.editor.setText("");
				await this.handleClearCommand();
				return;
			}
			if (text === "/compact" || text.startsWith("/compact ")) {
				const customInstructions = text.startsWith("/compact ") ? text.slice(9).trim() : undefined;
				this.editor.setText("");
				await this.handleCompactCommand(customInstructions);
				return;
			}
			if (text === "/compat") {
				this.editor.setText("");
				await this.handleCompatibilityCommand();
				return;
			}
			if (text === "/reload") {
				this.editor.setText("");
				await this.handleReloadCommand();
				return;
			}
			if (text === "/debug") {
				this.handleDebugCommand();
				this.editor.setText("");
				return;
			}
			if (text === "/arminsayshi") {
				this.handleArminSaysHi();
				this.editor.setText("");
				return;
			}
			if (text === "/dementedelves") {
				this.handleDementedDelves();
				this.editor.setText("");
				return;
			}
			if (text === "/resume") {
				this.showSessionSelector();
				this.editor.setText("");
				return;
			}
			if (text === "/quit") {
				this.editor.setText("");
				await this.shutdown();
				return;
			}

			// Handle bash command (! for normal, !! for excluded from context)
			if (text.startsWith("!")) {
				const isExcluded = text.startsWith("!!");
				const command = isExcluded ? text.slice(2).trim() : text.slice(1).trim();
				if (command) {
					if (this.session.isBashRunning) {
						this.showWarning(TUI_COPY.interactiveNotices.bashAlreadyRunning);
						this.editor.setText(text);
						return;
					}
					this.editor.addToHistory?.(text);
					await this.handleBashCommand(command, isExcluded);
					this.isBashMode = false;
					this.updateEditorBorderColor();
					return;
				}
			}

			// Queue input during compaction (extension commands execute immediately)
			if (this.session.isCompacting) {
				if (this.isExtensionCommand(text)) {
					this.editor.addToHistory?.(text);
					this.editor.setText("");
					await this.session.prompt(text);
				} else {
					this.queueCompactionMessage(text, "steer");
				}
				return;
			}

			// If streaming, use prompt() with steer behavior
			// This handles extension commands (execute immediately), prompt template expansion, and queueing
			if (this.session.isStreaming) {
				this.editor.addToHistory?.(text);
				this.editor.setText("");
				await this.session.prompt(text, { streamingBehavior: "steer" });
				this.updatePendingMessagesDisplay();
				this.ui.requestRender();
				return;
			}

			// Normal message submission
			// First, move any pending bash components to chat
			this.flushPendingBashComponents();

			if (this.onInputCallback) {
				this.onInputCallback(text);
			}
			this.editor.addToHistory?.(text);
		};
	}

	private subscribeToAgent(): void {
		this.unsubscribe = this.session.subscribe(async (event) => {
			await this.handleEvent(event);
		});
	}

	private updateSpinnerRuntimeFromAssistantMessage(message: AssistantMessage): void {
		let responseChars = 0;
		for (const block of message.content) {
			if (block.type === "text") {
				responseChars += block.text.length;
			} else if (block.type === "thinking") {
				responseChars += block.thinking.length;
			}
		}
		this.spinnerResponseChars = Math.max(this.spinnerResponseChars, responseChars);
		if (message.usage.output > this.spinnerReportedOutputTokens) {
			this.spinnerReportedOutputTokens = message.usage.output;
		}
	}

	private async handleEvent(event: AgentSessionEvent): Promise<void> {
		if (!this.isInitialized) {
			await this.init();
		}

		this.footer.invalidate();

		try {
			switch (event.type) {
				case "agent_start":
					this.agentRunActive = true;
					this.spinnerStartedAt = Date.now();
					this.spinnerResponseChars = 0;
					this.spinnerReportedOutputTokens = 0;
					this.spinnerThinkingStartedAt = null;
					this.spinnerThinkingMinimumVisibleUntil = null;
					this.spinnerThinkingDurationMs = null;
					this.spinnerThoughtForVisibleUntil = null;
					this.spinnerCurrentToolLabel = undefined;
					this.spinnerActiveToolCount = 0;
					this.pendingTools.clear();
					this.setTerminalProgressActive(true);
					// Restore main escape handler if retry handler is still active
					// (retry success event fires later, but we need main handler now)
					if (this.retryEscapeHandler) {
						this.defaultEditor.onEscape = this.retryEscapeHandler;
						this.retryEscapeHandler = undefined;
					}
					if (this.retryCountdown) {
						this.retryCountdown.dispose();
						this.retryCountdown = undefined;
					}
					if (this.retryLoader) {
						this.retryLoader.stop();
						this.retryLoader = undefined;
					}
					this.stopWorkingLoader();
					if (this.workingVisible) {
						this.loadingAnimation = this.createWorkingLoader();
					}
					this.renderWorkingArea();
					this.requestRenderUnlessInputSuppressed();
					break;

				case "queue_update":
					this.updatePendingMessagesDisplay();
					this.requestRenderRespectingInput();
					break;

				case "session_info_changed":
					this.updateTerminalTitle();
					this.footer.invalidate();
					this.requestRenderRespectingInput();
					break;

				case "thinking_level_changed":
					this.footer.invalidate();
					this.updateEditorBorderColor();
					break;

				case "message_start":
					if (event.message.role === "custom") {
						this.addMessageToChat(event.message);
						this.requestRenderRespectingInput();
					} else if (event.message.role === "user") {
						this.addMessageToChat(event.message);
						this.updatePendingMessagesDisplay();
						this.requestRenderRespectingInput();
					} else if (event.message.role === "assistant") {
						this.activeCollapsedToolGroup = undefined;
						this.activeToolSummary = undefined;
						this.streamingComponent = new AssistantMessageComponent(
							undefined,
							this.hideThinkingBlock,
							this.getMarkdownThemeWithSettings(),
							this.hiddenThinkingLabel,
						);
						this.streamingMessage = event.message;
						this.chatContainer.addChild(this.streamingComponent);
						this.streamingComponent.updateContent(this.streamingMessage);
						this.requestRenderRespectingInput();
					}
					break;

				case "message_update":
					if (this.streamingComponent && event.message.role === "assistant") {
						this.streamingMessage = event.message;
						this.updateSpinnerRuntimeFromAssistantMessage(event.message);
						const assistantMessageEvent = event.assistantMessageEvent;
						if (assistantMessageEvent.type === "thinking_start") {
							if (this.spinnerThinkingStartedAt === null) {
								this.spinnerThinkingStartedAt = Date.now();
								this.spinnerThinkingMinimumVisibleUntil = null;
								this.spinnerThinkingDurationMs = null;
								this.spinnerThoughtForVisibleUntil = null;
							}
						} else if (assistantMessageEvent.type === "thinking_end") {
							if (this.spinnerThinkingStartedAt !== null) {
								const endedAt = Date.now();
								this.spinnerThinkingDurationMs = endedAt - this.spinnerThinkingStartedAt;
								const minimumVisibleUntil = this.spinnerThinkingStartedAt + 2000;
								this.spinnerThinkingMinimumVisibleUntil =
									endedAt < minimumVisibleUntil ? minimumVisibleUntil : null;
								this.spinnerThoughtForVisibleUntil =
									(endedAt < minimumVisibleUntil ? minimumVisibleUntil : endedAt) + 2000;
								this.spinnerThinkingStartedAt = null;
							}
						}
						const projectedTurn = projectAssistantTurn(this.streamingMessage);
						this.streamingComponent.updateContent(this.streamingMessage);

						const shouldCollapseStreamingTools =
							projectedTurn.toolCalls.length > 1 &&
							!projectedTurn.hasRenderableAssistantContent &&
							projectedTurn.toolCalls.every((toolCall) => isCollapsibleToolName(toolCall.name));

						if (shouldCollapseStreamingTools) {
							if (!this.activeCollapsedToolGroup) {
								this.activeCollapsedToolGroup = new CollapsedToolGroupComponent(
									this.sessionManager.getCwd(),
									undefined,
									// Same turn as streaming component — no extra top margin needed.
									{ addLeadingMargin: false },
								);
								this.activeCollapsedToolGroup.setExpanded(this.toolOutputExpanded);
								this.chatContainer.addChild(this.activeCollapsedToolGroup);
							}
							for (const toolCall of projectedTurn.toolCalls) {
								this.activeCollapsedToolGroup.addOrUpdateToolCall(
									toolCall.id,
									toolCall.name,
									toolCall.arguments,
								);
								this.collapsedGroupByToolCallId.set(toolCall.id, this.activeCollapsedToolGroup);
							}
							this.requestRenderRespectingInput();
							break;
						}

						const shouldUseStreamingToolSummary =
							projectedTurn.toolCalls.length === 1 &&
							!this.shouldRenderToolAsExecutionComponent(projectedTurn.toolCalls[0]?.name ?? "");

						if (shouldUseStreamingToolSummary) {
							const toolCall = projectedTurn.toolCalls[0];
							if (!this.activeToolSummary) {
								this.activeToolSummary = new AssistantToolSummaryComponent(
									toolCall.name,
									toolCall.arguments,
									undefined,
									this.sessionManager.getCwd(),
									// Same turn as streaming component — no extra top margin.
									{ addLeadingMargin: false },
								);
								this.activeToolSummary.setExpanded(this.toolOutputExpanded);
								this.chatContainer.addChild(this.activeToolSummary);
							} else {
								this.activeToolSummary.updateArgs(toolCall.arguments);
							}
							this.toolSummaryByToolCallId.set(toolCall.id, this.activeToolSummary);
							this.requestRenderRespectingInput();
							break;
						}

						const shouldUseStreamingToolBatchSummary =
							projectedTurn.toolCalls.length > 1 &&
							!projectedTurn.hasRenderableAssistantContent &&
							projectedTurn.toolCalls.every(
								(toolCall) => !this.shouldRenderToolAsExecutionComponent(toolCall.name),
							);

						if (shouldUseStreamingToolBatchSummary) {
							if (!this.activeToolBatchSummary) {
								this.activeToolBatchSummary = new AssistantToolBatchSummaryComponent(
									[],
									this.sessionManager.getCwd(),
									// Same turn as streaming component — no extra top margin.
									{ addLeadingMargin: false },
								);
								this.activeToolBatchSummary.setExpanded(this.toolOutputExpanded);
								this.chatContainer.addChild(this.activeToolBatchSummary);
							}
							for (const toolCall of projectedTurn.toolCalls) {
								this.activeToolBatchSummary.addOrUpdateToolCall(toolCall.name, toolCall.arguments, toolCall.id);
								this.toolBatchSummaryByToolCallId.set(toolCall.id, this.activeToolBatchSummary);
							}
							this.requestRenderRespectingInput();
							break;
						}

						for (const toolCall of projectedTurn.toolCalls) {
							if (this.shouldRenderToolAsExecutionComponent(toolCall.name)) {
								let component = this.pendingTools.get(toolCall.id);
								if (!component) {
									component = new ToolExecutionComponent(
										toolCall.name,
										toolCall.id,
										toolCall.arguments,
										{
											showImages: this.settingsManager.getShowImages(),
											imageWidthCells: this.settingsManager.getImageWidthCells(),
										},
										this.getRegisteredToolDefinition(toolCall.name),
										this.ui,
										this.sessionManager.getCwd(),
									);
									component.setExpanded(this.toolOutputExpanded);
									this.chatContainer.addChild(component);
									this.pendingTools.set(toolCall.id, component);
								}
								component.updateArgs(toolCall.arguments);
								continue;
							}

							if (
								!this.pendingTools.has(toolCall.id) &&
								!this.collapsedGroupByToolCallId.has(toolCall.id) &&
								!this.toolSummaryByToolCallId.has(toolCall.id) &&
								!this.toolBatchSummaryByToolCallId.has(toolCall.id)
							) {
								const summaryComponent = new AssistantToolSummaryComponent(
									toolCall.name,
									toolCall.arguments,
									undefined,
									this.sessionManager.getCwd(),
									// Same turn as streaming component — no extra top margin.
									{ addLeadingMargin: false },
								);
								summaryComponent.setExpanded(this.toolOutputExpanded);
								this.chatContainer.addChild(summaryComponent);
								this.toolSummaryByToolCallId.set(toolCall.id, summaryComponent);
								this.activeToolSummary = summaryComponent;
								continue;
							}

							const summaryComponent = this.toolSummaryByToolCallId.get(toolCall.id);
							if (summaryComponent) {
								summaryComponent.updateArgs(toolCall.arguments);
								continue;
							}

							const component = this.pendingTools.get(toolCall.id);
							if (component) {
								component.updateArgs(toolCall.arguments);
							}
						}
						this.requestRenderRespectingInput();
					}
					break;

				case "message_end":
					if (event.message.role === "user") break;
					if (this.streamingComponent && event.message.role === "assistant") {
						this.streamingMessage = event.message;
						this.updateSpinnerRuntimeFromAssistantMessage(event.message);
						const projectedTurn = projectAssistantTurn(this.streamingMessage);
						let errorMessage: string | undefined;
						if (this.streamingMessage.stopReason === "aborted") {
							const retryAttempt = this.session.retryAttempt;
							errorMessage =
								retryAttempt > 0
									? `Aborted after ${retryAttempt} retry attempt${retryAttempt > 1 ? "s" : ""}`
									: "Operation aborted";
							this.streamingMessage.errorMessage = errorMessage;
						}
						this.streamingComponent.updateContent(this.streamingMessage);

						if (this.streamingMessage.stopReason === "aborted" || this.streamingMessage.stopReason === "error") {
							if (!errorMessage) {
								errorMessage = this.streamingMessage.errorMessage || "Error";
							}
							for (const [, component] of this.pendingTools.entries()) {
								component.updateResult({
									content: [{ type: "text", text: errorMessage }],
									isError: true,
								});
							}
							this.pendingTools.clear();
							if (this.activeCollapsedToolGroup) {
								this.activeCollapsedToolGroup.markAllCompleted();
								this.activeCollapsedToolGroup = undefined;
							}
							this.collapsedGroupByToolCallId.clear();
							this.activeToolSummary = undefined;
							this.toolSummaryByToolCallId.clear();
							this.activeToolBatchSummary = undefined;
							this.toolBatchSummaryByToolCallId.clear();
						} else {
							// Args are now complete - trigger diff computation for edit tools
							for (const [, component] of this.pendingTools.entries()) {
								component.setArgsComplete();
							}
						}
						if (!projectedTurn.hasRenderableAssistantContent) {
							this.chatContainer.removeChild(this.streamingComponent);
						}
						this.streamingComponent = undefined;
						this.streamingMessage = undefined;
						this.footer.invalidate();
					}
					this.requestRenderRespectingInput();
					break;

				case "tool_execution_start": {
					this.spinnerActiveToolCount++;
					this.spinnerCurrentToolLabel = this.describeSpinnerToolLabel(
						event.toolName,
						event.args as Record<string, unknown>,
					);
					if (this.collapsedGroupByToolCallId.has(event.toolCallId)) {
						this.requestRenderRespectingInput();
						break;
					}
					if (this.toolSummaryByToolCallId.has(event.toolCallId)) {
						this.requestRenderRespectingInput();
						break;
					}
					if (this.toolBatchSummaryByToolCallId.has(event.toolCallId)) {
						this.requestRenderRespectingInput();
						break;
					}
					let component = this.pendingTools.get(event.toolCallId);
					if (!component) {
						component = new ToolExecutionComponent(
							event.toolName,
							event.toolCallId,
							event.args,
							{
								showImages: this.settingsManager.getShowImages(),
								imageWidthCells: this.settingsManager.getImageWidthCells(),
							},
							this.getRegisteredToolDefinition(event.toolName),
							this.ui,
							this.sessionManager.getCwd(),
						);
						component.setExpanded(this.toolOutputExpanded);
						this.chatContainer.addChild(component);
						this.pendingTools.set(event.toolCallId, component);
					}
					component.markExecutionStarted();
					this.requestRenderRespectingInput();
					break;
				}

				case "tool_execution_update": {
					if (this.collapsedGroupByToolCallId.has(event.toolCallId)) {
						this.requestRenderRespectingInput();
						break;
					}
					if (this.toolSummaryByToolCallId.has(event.toolCallId)) {
						this.requestRenderRespectingInput();
						break;
					}
					if (this.toolBatchSummaryByToolCallId.has(event.toolCallId)) {
						this.requestRenderRespectingInput();
						break;
					}
					const component = this.pendingTools.get(event.toolCallId);
					if (component) {
						component.updateResult({ ...event.partialResult, isError: false }, true);
						this.requestRenderRespectingInput();
					}
					break;
				}

				case "tool_execution_end": {
					this.spinnerActiveToolCount = Math.max(0, this.spinnerActiveToolCount - 1);
					if (this.spinnerActiveToolCount === 0) {
						this.spinnerCurrentToolLabel = undefined;
					}
					const collapsedGroup = this.collapsedGroupByToolCallId.get(event.toolCallId);
					if (collapsedGroup) {
						collapsedGroup.markCompleted(event.toolCallId);
						this.collapsedGroupByToolCallId.delete(event.toolCallId);
						if (this.activeCollapsedToolGroup === collapsedGroup && collapsedGroup.isComplete()) {
							this.activeCollapsedToolGroup = undefined;
						}
						this.requestRenderRespectingInput();
						break;
					}
					const summary = this.toolSummaryByToolCallId.get(event.toolCallId);
					if (summary) {
						summary.updateResult(event.result as any);
						this.toolSummaryByToolCallId.delete(event.toolCallId);
						if (this.activeToolSummary === summary) {
							this.activeToolSummary = undefined;
						}
						this.requestRenderRespectingInput();
						break;
					}
					const batchSummary = this.toolBatchSummaryByToolCallId.get(event.toolCallId);
					if (batchSummary) {
						batchSummary.updateResult(event.toolCallId, event.result as any, event.toolName);
						this.toolBatchSummaryByToolCallId.delete(event.toolCallId);
						if (this.activeToolBatchSummary === batchSummary) {
							const stillActive = [...this.toolBatchSummaryByToolCallId.values()].some(
								(value) => value === batchSummary,
							);
							if (!stillActive) {
								this.activeToolBatchSummary = undefined;
							}
						}
						this.requestRenderRespectingInput();
						break;
					}
					const component = this.pendingTools.get(event.toolCallId);
					if (component) {
						component.updateResult({ ...event.result, isError: event.isError });
						this.pendingTools.delete(event.toolCallId);
						this.requestRenderRespectingInput();
					}
					break;
				}

				case "agent_end": {
					this.agentRunActive = false;
					this.setTerminalProgressActive(false);
					if (this.spinnerThinkingStartedAt === null) {
						this.spinnerThinkingMinimumVisibleUntil = null;
					}
					if (this.loadingAnimation) {
						this.loadingAnimation.stop();
						this.loadingAnimation = undefined;
					}
					if (this.streamingComponent) {
						this.chatContainer.removeChild(this.streamingComponent);
						this.streamingComponent = undefined;
						this.streamingMessage = undefined;
					}
					this.pendingTools.clear();
					this.activeCollapsedToolGroup = undefined;
					this.collapsedGroupByToolCallId.clear();
					this.activeToolSummary = undefined;
					this.toolSummaryByToolCallId.clear();
					this.activeToolBatchSummary = undefined;
					this.toolBatchSummaryByToolCallId.clear();
					this.resetSpinnerRuntimeState();
					this.renderWorkingArea();

					await this.checkShutdownRequested();

					this.requestRenderRespectingInput();
					break;
				}

				case "compaction_hooks_start": {
					this.spinnerSystemOverrideMessage =
						event.phase === "pre" ? "Running PreCompact hooks…" : "Running PostCompact hooks…";
					this.requestRenderRespectingInput();
					break;
				}

				case "compaction_hooks_end": {
					this.spinnerSystemOverrideMessage = undefined;
					this.requestRenderRespectingInput();
					break;
				}

				case "compaction_start": {
					this.spinnerSystemOverrideMessage =
						event.reason === "manual"
							? "Compacting conversation"
							: event.reason === "overflow"
								? "Auto-compacting after overflow"
								: "Auto-compacting conversation";
					this.setSpinnerBanner({
						kind: "info",
						title:
							event.reason === "manual"
								? TUI_COPY.interactiveNotices.compactingConversation
								: event.reason === "overflow"
									? TUI_COPY.interactiveNotices.autoCompactingAfterOverflow
									: TUI_COPY.interactiveNotices.autoCompactingConversation,
						detail: TUI_COPY.interactiveNotices.cancelHint(keyText("app.interrupt")),
					});
					this.setTerminalProgressActive(true);
					// Keep editor active; submissions are queued during compaction.
					this.autoCompactionEscapeHandler = this.defaultEditor.onEscape;
					this.defaultEditor.onEscape = () => {
						this.session.abortCompaction();
					};
					this.requestRenderRespectingInput();
					break;
				}

				case "compaction_end": {
					this.spinnerSystemOverrideMessage = undefined;
					this.setSpinnerBanner(undefined);
					this.setTerminalProgressActive(false);
					if (this.autoCompactionEscapeHandler) {
						this.defaultEditor.onEscape = this.autoCompactionEscapeHandler;
						this.autoCompactionEscapeHandler = undefined;
					}
					if (this.autoCompactionLoader) {
						this.autoCompactionLoader.stop();
						this.autoCompactionLoader = undefined;
						this.renderWorkingArea();
					}
					if (event.aborted) {
						if (event.reason === "manual") {
							this.showError(TUI_COPY.interactiveNotices.manualCompactionCancelled);
						} else {
							this.showTaskbarNotice(TUI_COPY.interactiveNotices.autoCompactionCancelled);
						}
					} else if (event.result) {
						this.chatContainer.clear();
						this.rebuildChatFromMessages();
						this.addMessageToChat(
							createCompactionSummaryMessage(
								event.result.summary,
								event.result.tokensBefore,
								new Date().toISOString(),
							),
						);
						this.footer.invalidate();
					} else if (event.errorMessage) {
						if (event.reason === "manual") {
							this.showError(event.errorMessage);
						} else {
							this.chatContainer.addChild(new Spacer(1));
							this.chatContainer.addChild(new Text(theme.fg("error", event.errorMessage), 1, 0));
						}
					}
					if (event.notices) {
						for (const notice of event.notices) {
							if (notice.level === "warning") {
								this.showWarning(notice.message);
							} else {
								this.showTaskbarNotice(notice.message);
							}
						}
					}
					void this.flushCompactionQueue({ willRetry: event.willRetry });
					this.requestRenderRespectingInput();
					break;
				}

				case "auto_retry_start": {
					this.spinnerSystemOverrideMessage = `Retrying request (${event.attempt}/${event.maxAttempts})`;
					this.setSpinnerBanner({
						kind: "warning",
						title: TUI_COPY.interactiveNotices.autoRetryingRequest,
						detail: TUI_COPY.interactiveNotices.retryAttemptDetail(
							event.attempt,
							event.maxAttempts,
							event.errorMessage || "request failed",
						),
					});
					// Set up escape to abort retry
					this.retryEscapeHandler = this.defaultEditor.onEscape;
					this.defaultEditor.onEscape = () => {
						this.session.abortRetry();
					};
					this.retryCountdown?.dispose();
					this.retryCountdown = new CountdownTimer(
						event.delayMs,
						this.ui,
						(seconds) => {
							this.setSpinnerBanner({
								kind: "warning",
								title: TUI_COPY.interactiveNotices.autoRetryingRequest,
								detail: TUI_COPY.interactiveNotices.retryResumeDetail(
									event.attempt,
									event.maxAttempts,
									seconds,
								),
							});
						},
						() => {
							this.retryCountdown = undefined;
						},
					);
					this.requestRenderUnlessInputSuppressed();
					break;
				}

				case "auto_retry_end": {
					this.spinnerSystemOverrideMessage = undefined;
					// Restore escape handler
					if (this.retryEscapeHandler) {
						this.defaultEditor.onEscape = this.retryEscapeHandler;
						this.retryEscapeHandler = undefined;
					}
					if (this.retryCountdown) {
						this.retryCountdown.dispose();
						this.retryCountdown = undefined;
					}
					this.setSpinnerBanner(
						event.success
							? {
									kind: "success",
									title: TUI_COPY.interactiveNotices.connectionRecovered,
								}
							: {
									kind: "error",
									title: TUI_COPY.interactiveNotices.requestFailed,
									detail: TUI_COPY.interactiveNotices.retryFailureDetail(event.attempt),
								},
						event.success ? { expiresMs: 1500 } : undefined,
					);
					if (!event.success) {
						this.showError(
							TUI_COPY.interactiveNotices.retryFailedAfterAttempts(
								event.attempt,
								event.finalError || "Unknown error",
							),
						);
					}
					this.requestRenderUnlessInputSuppressed();
					break;
				}
			}
		} finally {
			this.syncProgressSurfaceRefreshLoop();
		}
	}

	/** Extract text content from a user message */
	private getUserMessageText(message: Message): string {
		if (message.role !== "user") return "";
		const textBlocks =
			typeof message.content === "string"
				? [{ type: "text", text: message.content }]
				: message.content.filter((c: { type: string }) => c.type === "text");
		return textBlocks.map((c) => (c as { text: string }).text).join("");
	}

	private addMessageToChat(message: AgentMessage, options?: { populateHistory?: boolean }): void {
		switch (message.role) {
			case "bashExecution": {
				const component = new BashExecutionComponent(message.command, this.ui, message.excludeFromContext);
				if (message.output) {
					component.appendOutput(message.output);
				}
				component.setComplete(
					message.exitCode,
					message.cancelled,
					message.truncated ? ({ truncated: true } as TruncationResult) : undefined,
					message.fullOutputPath,
				);
				this.chatContainer.addChild(component);
				break;
			}
			case "custom": {
				if (message.display) {
					const renderer = this.session.extensionRunner.getMessageRenderer(message.customType);
					const component = new CustomMessageComponent(message, renderer, this.getMarkdownThemeWithSettings());
					component.setExpanded(this.toolOutputExpanded);
					this.chatContainer.addChild(component);
				}
				break;
			}
			case "compactionSummary": {
				this.chatContainer.addChild(new Spacer(1));
				const component = new CompactionSummaryMessageComponent(message, this.getMarkdownThemeWithSettings());
				component.setExpanded(this.toolOutputExpanded);
				this.chatContainer.addChild(component);
				break;
			}
			case "branchSummary": {
				this.chatContainer.addChild(new Spacer(1));
				const component = new BranchSummaryMessageComponent(message, this.getMarkdownThemeWithSettings());
				component.setExpanded(this.toolOutputExpanded);
				this.chatContainer.addChild(component);
				break;
			}
			case "user": {
				const textContent = this.getUserMessageText(message);
				if (textContent) {
					const skillBlock = parseSkillBlock(textContent);
					if (skillBlock) {
						// Render skill block (collapsible)
						const component = new SkillInvocationMessageComponent(
							skillBlock,
							this.getMarkdownThemeWithSettings(),
						);
						component.setExpanded(this.toolOutputExpanded);
						this.chatContainer.addChild(component);
						// Render user message separately if present
						if (skillBlock.userMessage) {
							const userComponent = new UserMessageComponent(
								skillBlock.userMessage,
								this.getMarkdownThemeWithSettings(),
							);
							this.chatContainer.addChild(userComponent);
						}
					} else {
						const userComponent = new UserMessageComponent(textContent, this.getMarkdownThemeWithSettings());
						this.chatContainer.addChild(userComponent);
					}
					if (options?.populateHistory) {
						this.editor.addToHistory?.(textContent);
					}
				}
				break;
			}
			case "assistant": {
				const assistantComponent = new AssistantMessageComponent(
					message,
					this.hideThinkingBlock,
					this.getMarkdownThemeWithSettings(),
					this.hiddenThinkingLabel,
				);
				this.chatContainer.addChild(assistantComponent);
				break;
			}
			case "toolResult": {
				// Tool results are rendered inline with tool calls, handled separately
				break;
			}
			default: {
				const _exhaustive: never = message;
			}
		}
	}

	/**
	 * Render session context to chat. Used for initial load and rebuild after compaction.
	 * @param sessionContext Session context to render
	 * @param options.updateFooter Update footer state
	 * @param options.populateHistory Add user messages to editor history
	 */
	private renderSessionContext(
		sessionContext: SessionContext,
		options: { updateFooter?: boolean; populateHistory?: boolean } = {},
	): void {
		this.pendingTools.clear();
		this.activeCollapsedToolGroup = undefined;
		this.collapsedGroupByToolCallId.clear();
		this.activeToolSummary = undefined;
		this.toolSummaryByToolCallId.clear();
		this.activeToolBatchSummary = undefined;
		this.toolBatchSummaryByToolCallId.clear();
		const renderedPendingTools = new Map<string, ToolExecutionComponent>();

		if (options.updateFooter) {
			this.footer.invalidate();
			this.updateEditorBorderColor();
		}

		const projectedEntries = collapseReadSearchGroups(projectTranscript(sessionContext.messages));

		for (let index = 0; index < projectedEntries.length; index++) {
			const entry = projectedEntries[index];
			if (entry.kind === "assistant_turn") {
				const nextEntry = projectedEntries[index + 1];
				if (canUseSingleToolSummary(entry, nextEntry)) {
					if (entry.hasRenderableAssistantContent) {
						this.addMessageToChat(entry.message);
					}
					const summaryComponent = new AssistantToolSummaryComponent(
						entry.toolCalls[0].name,
						entry.toolCalls[0].arguments,
						nextEntry.message,
						this.sessionManager.getCwd(),
						// Same turn with visible text/thinking → no extra margin.
						// No visible content → tool summary is the first element → needs margin.
						{ addLeadingMargin: !entry.hasRenderableAssistantContent },
					);
					summaryComponent.setExpanded(this.toolOutputExpanded);
					this.chatContainer.addChild(summaryComponent);
					index += 1;
					continue;
				}

				const toolResultBatch = collectSequentialToolResults(entry, projectedEntries, index + 1);
				if (toolResultBatch) {
					if (entry.hasRenderableAssistantContent) {
						this.addMessageToChat(entry.message);
					}
					const batchSummary = new AssistantToolBatchSummaryComponent(
						toolResultBatch.map((resultEntry, resultIndex) => ({
							toolName: entry.toolCalls[resultIndex]?.name ?? resultEntry.message.toolName,
							args: entry.toolCalls[resultIndex]?.arguments ?? {},
							result: resultEntry.message,
						})),
						this.sessionManager.getCwd(),
						// Same turn with visible text/thinking → no extra margin.
						{ addLeadingMargin: !entry.hasRenderableAssistantContent },
					);
					batchSummary.setExpanded(this.toolOutputExpanded);
					this.chatContainer.addChild(batchSummary);
					index += toolResultBatch.length;
					continue;
				}

				this.addMessageToChat(entry.message);
				for (const toolCall of entry.toolCalls) {
					const component = this.shouldRenderToolAsExecutionComponent(toolCall.name)
						? new ToolExecutionComponent(
								toolCall.name,
								toolCall.id,
								toolCall.arguments,
								{
									showImages: this.settingsManager.getShowImages(),
									imageWidthCells: this.settingsManager.getImageWidthCells(),
								},
								this.getRegisteredToolDefinition(toolCall.name),
								this.ui,
								this.sessionManager.getCwd(),
							)
						: new AssistantToolSummaryComponent(
								toolCall.name,
								toolCall.arguments,
								undefined,
								this.sessionManager.getCwd(),
								// Assistant message always rendered above → no extra margin.
								{ addLeadingMargin: false },
							);
					component.setExpanded(this.toolOutputExpanded);
					this.chatContainer.addChild(component);

					if (entry.message.stopReason === "aborted" || entry.message.stopReason === "error") {
						let errorMessage: string;
						if (entry.message.stopReason === "aborted") {
							const retryAttempt = this.session.retryAttempt;
							errorMessage =
								retryAttempt > 0
									? `Aborted after ${retryAttempt} retry attempt${retryAttempt > 1 ? "s" : ""}`
									: "Operation aborted";
						} else {
							errorMessage = entry.message.errorMessage || "Error";
						}
						component.updateResult({
							role: "toolResult",
							toolCallId: toolCall.id,
							toolName: toolCall.name,
							content: [{ type: "text", text: errorMessage }],
							timestamp: entry.message.timestamp,
						} as any);
					} else {
						renderedPendingTools.set(toolCall.id, component as unknown as ToolExecutionComponent);
					}
				}
			} else if (entry.kind === "collapsed_tool_group") {
				// Check if the previous entry was an assistant turn with visible content.
				// If so, the assistant message already provides the leading margin.
				const prevEntry = index > 0 ? projectedEntries[index - 1] : undefined;
				const prevHadContent = prevEntry?.kind === "assistant_turn" && prevEntry.hasRenderableAssistantContent;
				const component = new CollapsedToolGroupComponent(this.sessionManager.getCwd(), entry, {
					addLeadingMargin: !prevHadContent,
				});
				component.setExpanded(this.toolOutputExpanded);
				this.chatContainer.addChild(component);
			} else if (entry.message.role === "toolResult") {
				const component = renderedPendingTools.get(entry.message.toolCallId);
				if (component) {
					component.updateResult(entry.message);
					renderedPendingTools.delete(entry.message.toolCallId);
				}
			} else {
				this.addMessageToChat(entry.message, options);
			}
		}

		for (const [toolCallId, component] of renderedPendingTools) {
			this.pendingTools.set(toolCallId, component);
		}
		this.ui.requestRender();
	}
	renderInitialMessages(): void {
		// Get aligned messages and entries from session context
		const context = this.sessionManager.buildSessionContext();
		this.renderSessionContext(context, {
			updateFooter: true,
			populateHistory: true,
		});

		// Show compaction info if session was compacted
		const allEntries = this.sessionManager.getEntries();
		const compactionCount = allEntries.filter((e) => e.type === "compaction").length;
		if (compactionCount > 0) {
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.compactionSessionCount(compactionCount));
		}
	}

	async getUserInput(): Promise<string> {
		return new Promise((resolve) => {
			this.onInputCallback = (text: string) => {
				this.onInputCallback = undefined;
				resolve(text);
			};
		});
	}

	private rebuildChatFromMessages(): void {
		this.chatContainer.clear();
		const context = this.sessionManager.buildSessionContext();
		this.renderSessionContext(context);
	}

	// =========================================================================
	// Key handlers
	// =========================================================================

	private handleCtrlC(): void {
		const now = Date.now();
		if (now - this.lastSigintTime < 500) {
			void this.shutdown();
		} else {
			this.clearEditor();
			this.lastSigintTime = now;
		}
	}

	private handleCtrlD(): void {
		// Only called when editor is empty (enforced by CustomEditor)
		void this.shutdown();
	}

	/**
	 * Gracefully shutdown the agent.
	 * Stops the TUI before emitting shutdown events so extension UI cleanup cannot
	 * repaint the final frame while the process is exiting.
	 */
	private isShuttingDown = false;

	private async shutdown(): Promise<void> {
		if (this.isShuttingDown) return;
		this.isShuttingDown = true;
		this.unregisterSignalHandlers();

		// Drain any in-flight Kitty key release events before stopping.
		// This prevents escape sequences from leaking to the parent shell over slow SSH.
		await this.ui.terminal.drainInput(1000);

		this.stop();
		await this.runtimeHost.dispose();
		process.exit(0);
	}

	private emergencyTerminalExit(): never {
		this.isShuttingDown = true;
		this.unregisterSignalHandlers();
		killTrackedDetachedChildren();
		// The terminal is gone. Do not run normal shutdown because TUI and
		// extension cleanup can write restore sequences and re-trigger EIO.
		process.exit(129);
	}

	/**
	 * Last-resort handler for uncaught exceptions. The TUI puts stdin into raw
	 * mode and hides the cursor; without this handler, an uncaught throw from
	 * anywhere (e.g. an extension's async `ChildProcess.on("exit")` callback)
	 * tears down the process while leaving the terminal in raw mode with no
	 * cursor, requiring `stty sane && reset` to recover.
	 *
	 * Unlike emergencyTerminalExit, the terminal is still alive here, so we
	 * call ui.stop() to restore cooked mode, the cursor, and disable bracketed
	 * paste / Kitty / modifyOtherKeys sequences.
	 */
	private uncaughtCrash(error: Error): never {
		if (this.isShuttingDown) {
			process.exit(1);
		}
		this.isShuttingDown = true;
		try {
			this.unregisterSignalHandlers();
		} catch {}
		try {
			killTrackedDetachedChildren();
		} catch {}
		try {
			this.ui.stop();
		} catch {}
		console.error("pi exiting due to uncaughtException:");
		console.error(error);
		process.exit(1);
	}

	/**
	 * Check if shutdown was requested and perform shutdown if so.
	 */
	private async checkShutdownRequested(): Promise<void> {
		if (!this.shutdownRequested) return;
		await this.shutdown();
	}

	private registerSignalHandlers(): void {
		this.unregisterSignalHandlers();

		const signals: NodeJS.Signals[] = ["SIGTERM"];
		if (process.platform !== "win32") {
			signals.push("SIGHUP");
		}

		for (const signal of signals) {
			const handler = () => {
				if (signal === "SIGHUP") {
					this.emergencyTerminalExit();
				}
				killTrackedDetachedChildren();
				void this.shutdown();
			};
			process.prependListener(signal, handler);
			this.signalCleanupHandlers.push(() => process.off(signal, handler));
		}

		const terminalErrorHandler = (error: Error) => {
			if (isDeadTerminalError(error)) {
				this.emergencyTerminalExit();
			}
			throw error;
		};
		process.stdout.on("error", terminalErrorHandler);
		process.stderr.on("error", terminalErrorHandler);
		this.signalCleanupHandlers.push(() => process.stdout.off("error", terminalErrorHandler));
		this.signalCleanupHandlers.push(() => process.stderr.off("error", terminalErrorHandler));

		// Restore the terminal before the process dies on any uncaught throw.
		// Without this, an unhandled exception from extension code (or anywhere
		// in pi) leaves the terminal in raw mode with no cursor.
		const uncaughtExceptionHandler = (error: Error) => this.uncaughtCrash(error);
		process.prependListener("uncaughtException", uncaughtExceptionHandler);
		this.signalCleanupHandlers.push(() => process.off("uncaughtException", uncaughtExceptionHandler));
	}

	private unregisterSignalHandlers(): void {
		for (const cleanup of this.signalCleanupHandlers) {
			cleanup();
		}
		this.signalCleanupHandlers = [];
	}

	private handleCtrlZ(): void {
		if (process.platform === "win32") {
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.windowsSuspendUnsupported, "warning");
			return;
		}

		// Keep the event loop alive while suspended. Without this, stopping the TUI
		// can leave Node with no ref'ed handles, causing the process to exit on fg
		// before the SIGCONT handler gets a chance to restore the terminal.
		const suspendKeepAlive = setInterval(() => {}, 2 ** 30);

		// Ignore SIGINT while suspended so Ctrl+C in the terminal does not
		// kill the backgrounded process. The handler is removed on resume.
		const ignoreSigint = () => {};
		process.on("SIGINT", ignoreSigint);

		// Set up handler to restore TUI when resumed
		process.once("SIGCONT", () => {
			clearInterval(suspendKeepAlive);
			process.removeListener("SIGINT", ignoreSigint);
			this.ui.start();
			this.ui.requestRender(true);
		});

		try {
			// Stop the TUI (restore terminal to normal mode)
			this.ui.stop();

			// Send SIGTSTP to process group (pid=0 means all processes in group)
			process.kill(0, "SIGTSTP");
		} catch (error) {
			clearInterval(suspendKeepAlive);
			process.removeListener("SIGINT", ignoreSigint);
			throw error;
		}
	}

	private async handleFollowUp(): Promise<void> {
		const text = (this.editor.getExpandedText?.() ?? this.editor.getText()).trim();
		if (!text) return;

		// Queue input during compaction (extension commands execute immediately)
		if (this.session.isCompacting) {
			if (this.isExtensionCommand(text)) {
				this.editor.addToHistory?.(text);
				this.editor.setText("");
				await this.session.prompt(text);
			} else {
				this.queueCompactionMessage(text, "followUp");
			}
			return;
		}

		// Alt+Enter queues a follow-up message (waits until agent finishes)
		// This handles extension commands (execute immediately), prompt template expansion, and queueing
		if (this.session.isStreaming) {
			this.editor.addToHistory?.(text);
			this.editor.setText("");
			await this.session.prompt(text, { streamingBehavior: "followUp" });
			this.updatePendingMessagesDisplay();
			this.ui.requestRender();
		}
		// If not streaming, Alt+Enter acts like regular Enter (trigger onSubmit)
		else if (this.editor.onSubmit) {
			this.editor.setText("");
			this.editor.onSubmit(text);
		}
	}

	private handleDequeue(): void {
		const restored = this.restoreQueuedMessagesToEditor();
		if (restored === 0) {
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.queueRestoreNone);
		} else {
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.queueRestored(restored));
		}
	}

	private updateEditorBorderColor(): void {
		if (this.isBashMode) {
			this.editor.borderColor = theme.getBashModeBorderColor();
		} else {
			const level = this.session.thinkingLevel || "off";
			this.editor.borderColor = theme.getThinkingBorderColor(level);
		}
		this.ui.requestRender();
	}

	private cycleThinkingLevel(): void {
		const newLevel = this.session.cycleThinkingLevel();
		if (newLevel === undefined) {
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.thinkingUnsupported, "warning");
		} else {
			this.footer.invalidate();
			this.updateEditorBorderColor();
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.thinkingLevelChanged(newLevel));
		}
	}

	private async cycleModel(direction: "forward" | "backward"): Promise<void> {
		try {
			const result = await this.session.cycleModel(direction);
			if (result === undefined) {
				const msg =
					this.session.scopedModels.length > 0
						? TUI_COPY.interactiveNotices.modelScopeSingle
						: TUI_COPY.interactiveNotices.modelSingleAvailable;
				this.showTaskbarNotice(msg);
			} else {
				this.footer.invalidate();
				this.updateEditorBorderColor();
				const thinkingLabel =
					result.model.reasoning && result.thinkingLevel !== "off"
						? `thinking: ${result.thinkingLevel}`
						: undefined;
				this.showTaskbarNotice(
					TUI_COPY.interactiveNotices.modelSwitched(result.model.name || result.model.id, thinkingLabel),
				);
				void this.maybeWarnAboutAnthropicSubscriptionAuth(result.model);
			}
		} catch (error) {
			this.showError(error instanceof Error ? error.message : String(error));
		}
	}

	private toggleToolOutputExpansion(): void {
		this.setToolsExpanded(!this.toolOutputExpanded);
	}

	private setToolsExpanded(expanded: boolean): void {
		this.toolOutputExpanded = expanded;
		const activeHeader = this.customHeader ?? this.builtInHeader;
		if (isExpandable(activeHeader)) {
			activeHeader.setExpanded(expanded);
		}
		for (const child of this.chatContainer.children) {
			if (child instanceof AssistantMessageComponent) {
				continue;
			}
			if (isExpandable(child)) {
				child.setExpanded(expanded);
			}
		}
		this.requestRenderRespectingInput();
	}

	private toggleThinkingBlockVisibility(): void {
		this.hideThinkingBlock = !this.hideThinkingBlock;
		this.settingsManager.setHideThinkingBlock(this.hideThinkingBlock);

		// Rebuild chat from session messages
		this.chatContainer.clear();
		this.rebuildChatFromMessages();

		// If streaming, re-add the streaming component with updated visibility and re-render
		if (this.streamingComponent && this.streamingMessage) {
			this.streamingComponent.setHideThinkingBlock(this.hideThinkingBlock);
			this.streamingComponent.updateContent(this.streamingMessage);
			this.chatContainer.addChild(this.streamingComponent);
		}

		this.showTaskbarNotice(TUI_COPY.interactiveNotices.thinkingBlockVisibility(this.hideThinkingBlock));
	}

	private openExternalEditor(): void {
		// Determine editor (respect $VISUAL, then $EDITOR)
		const editorCmd = process.env.VISUAL || process.env.EDITOR;
		if (!editorCmd) {
			this.showWarning(TUI_COPY.interactiveNotices.externalEditorMissing);
			return;
		}

		const currentText = this.editor.getExpandedText?.() ?? this.editor.getText();
		const tmpFile = path.join(os.tmpdir(), `pi-editor-${Date.now()}.pi.md`);

		try {
			// Write current content to temp file
			fs.writeFileSync(tmpFile, currentText, "utf-8");

			// Stop TUI to release terminal
			this.ui.stop();

			// Split by space to support editor arguments (e.g., "code --wait")
			const [editor, ...editorArgs] = editorCmd.split(" ");

			// Spawn editor synchronously with inherited stdio for interactive editing
			const result = spawnSync(editor, [...editorArgs, tmpFile], {
				stdio: "inherit",
				shell: process.platform === "win32",
			});

			// On successful exit (status 0), replace editor content
			if (result.status === 0) {
				const newContent = fs.readFileSync(tmpFile, "utf-8").replace(/\n$/, "");
				this.editor.setText(newContent);
			}
			// On non-zero exit, keep original text (no action needed)
		} finally {
			// Clean up temp file
			try {
				fs.unlinkSync(tmpFile);
			} catch {
				// Ignore cleanup errors
			}

			// Restart TUI
			this.ui.start();
			// Force full re-render since external editor uses alternate screen
			this.ui.requestRender(true);
		}
	}

	// =========================================================================
	// UI helpers
	// =========================================================================

	clearEditor(): void {
		this.editor.setText("");
		this.ui.requestRender();
	}

	showError(errorMessage: string): void {
		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(
			new Text(theme.fg("error", `${TUI_COPY.interactiveNotices.errorPrefix}${errorMessage}`), 1, 0),
		);
		this.requestRenderRespectingInput();
	}

	showWarning(warningMessage: string): void {
		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(
			new Text(theme.fg("warning", `${TUI_COPY.interactiveNotices.warningPrefix}${warningMessage}`), 1, 0),
		);
		this.requestRenderRespectingInput();
	}

	showNewVersionNotification(newVersion: string): void {
		const action = theme.fg("accent", `${APP_NAME} update`);
		const updateInstruction =
			theme.fg("muted", TUI_COPY.updateNotification.newVersionInstruction(newVersion)) + action;
		const changelogPath = getLumenChangelogPath();
		const changelogLink = getCapabilities().hyperlinks
			? hyperlink(
					theme.fg("accent", TUI_COPY.updateNotification.openChangelog),
					`file://${changelogPath.replace(/\\/g, "/")}`,
				)
			: theme.fg("accent", changelogPath);
		const changelogLine = theme.fg("muted", TUI_COPY.updateNotification.changelogLabel) + changelogLink;

		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new DynamicBorder((text) => theme.fg("warning", text)));
		this.chatContainer.addChild(
			new Text(
				`${theme.bold(theme.fg("warning", TUI_COPY.updateNotification.newVersionTitle))}\n${updateInstruction}\n${changelogLine}`,
				1,
				0,
			),
		);
		this.chatContainer.addChild(new DynamicBorder((text) => theme.fg("warning", text)));
		this.ui.requestRender();
	}

	showPackageUpdateNotification(packages: string[]): void {
		const action = theme.fg("accent", `${APP_NAME} update`);
		const updateInstruction = theme.fg("muted", TUI_COPY.updateNotification.packageUpdateInstruction) + action;
		const packageLines = packages.map((pkg) => `- ${pkg}`).join("\n");

		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new DynamicBorder((text) => theme.fg("warning", text)));
		this.chatContainer.addChild(
			new Text(
				`${theme.bold(theme.fg("warning", TUI_COPY.updateNotification.packageUpdateTitle))}\n${updateInstruction}\n${theme.fg("muted", TUI_COPY.updateNotification.packagesLabel)}\n${packageLines}`,
				1,
				0,
			),
		);
		this.chatContainer.addChild(new DynamicBorder((text) => theme.fg("warning", text)));
		this.ui.requestRender();
	}

	/**
	 * Get all queued messages (read-only).
	 * Combines session queue and compaction queue.
	 */
	private clearAllQueues(): { steering: string[]; followUp: string[] } {
		const { steering, followUp } = this.session.clearQueue();
		const compactionSteering = this.compactionQueuedMessages
			.filter((msg) => msg.mode === "steer")
			.map((msg) => msg.text);
		const compactionFollowUp = this.compactionQueuedMessages
			.filter((msg) => msg.mode === "followUp")
			.map((msg) => msg.text);
		this.compactionQueuedMessages = [];
		return {
			steering: [...steering, ...compactionSteering],
			followUp: [...followUp, ...compactionFollowUp],
		};
	}

	private updatePendingMessagesDisplay(): void {
		const { steering: steeringMessages, followUp: followUpMessages } = this.getAllQueuedMessages();
		this.updatePendingContent((target) => {
			if (steeringMessages.length > 0 || followUpMessages.length > 0 || this.pendingBashComponents.length > 0) {
				target.addChild(new Spacer(1));
			}

			if (steeringMessages.length > 0 || followUpMessages.length > 0) {
				const total = steeringMessages.length + followUpMessages.length;
				const summaryText = theme.fg("dim", `${total} queued command${total === 1 ? "" : "s"}`);
				target.addChild(new TruncatedText(summaryText, 1, 0));

				const latest = this.latestQueuedMessage(steeringMessages, followUpMessages);
				if (latest) {
					const latestText = theme.fg("dim", `  ⎿ ${latest.label}: ${latest.text}`);
					target.addChild(new TruncatedText(latestText, 1, 0));
				}

				const dequeueHint = this.getAppKeyDisplay("app.message.dequeue");
				const hintText = theme.fg("dim", `  ⎿ ${dequeueHint} to edit all queued messages`);
				target.addChild(new TruncatedText(hintText, 1, 0));
			}

			if (this.pendingBashComponents.length > 0) {
				for (const component of this.pendingBashComponents) {
					target.addChild(component);
				}
			}
		});
	}

	/**
	 * Get all queued messages (read-only).
	 * Combines session queue and compaction queue.
	 */
	private getAllQueuedMessages(): { steering: string[]; followUp: string[] } {
		return {
			steering: [
				...this.session.getSteeringMessages(),
				...this.compactionQueuedMessages.filter((msg) => msg.mode === "steer").map((msg) => msg.text),
			],
			followUp: [
				...this.session.getFollowUpMessages(),
				...this.compactionQueuedMessages.filter((msg) => msg.mode === "followUp").map((msg) => msg.text),
			],
		};
	}

	private latestQueuedMessage(
		steeringMessages: string[],
		followUpMessages: string[],
	): { label: string; text: string } | undefined {
		if (followUpMessages.length > 0) {
			return { label: TUI_COPY.queueLabels.followUp, text: followUpMessages[followUpMessages.length - 1] };
		}
		if (steeringMessages.length > 0) {
			return { label: TUI_COPY.queueLabels.steering, text: steeringMessages[steeringMessages.length - 1] };
		}
		return undefined;
	}

	private restoreQueuedMessagesToEditor(options?: { abort?: boolean; currentText?: string }): number {
		const { steering, followUp } = this.clearAllQueues();
		const allQueued = [...steering, ...followUp];
		if (allQueued.length === 0) {
			this.updatePendingMessagesDisplay();
			if (options?.abort) {
				this.agent.abort();
			}
			return 0;
		}
		const queuedText = allQueued.join("\n\n");
		const currentText = options?.currentText ?? this.editor.getText();
		const combinedText = [queuedText, currentText].filter((t) => t.trim()).join("\n\n");
		this.editor.setText(combinedText);
		this.updatePendingMessagesDisplay();
		if (options?.abort) {
			this.agent.abort();
		}
		return allQueued.length;
	}

	private queueCompactionMessage(text: string, mode: "steer" | "followUp"): void {
		this.compactionQueuedMessages.push({ text, mode });
		this.editor.addToHistory?.(text);
		this.editor.setText("");
		this.updatePendingMessagesDisplay();
		this.showTaskbarNotice(TUI_COPY.interactiveNotices.compactionQueuedMessage);
	}

	private isExtensionCommand(text: string): boolean {
		if (!text.startsWith("/")) return false;

		const extensionRunner = this.session.extensionRunner;

		const spaceIndex = text.indexOf(" ");
		const commandName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
		return !!extensionRunner.getCommand(commandName);
	}

	private async flushCompactionQueue(options?: { willRetry?: boolean }): Promise<void> {
		if (this.compactionQueuedMessages.length === 0) {
			return;
		}

		const queuedMessages = [...this.compactionQueuedMessages];
		this.compactionQueuedMessages = [];
		this.updatePendingMessagesDisplay();

		const restoreQueue = (error: unknown) => {
			this.session.clearQueue();
			this.compactionQueuedMessages = queuedMessages;
			this.updatePendingMessagesDisplay();
			this.showError(
				TUI_COPY.queueLabels.sendFailed(
					queuedMessages.length > 1,
					error instanceof Error ? error.message : String(error),
				),
			);
		};

		try {
			if (options?.willRetry) {
				// When retry is pending, queue messages for the retry turn
				for (const message of queuedMessages) {
					if (this.isExtensionCommand(message.text)) {
						await this.session.prompt(message.text);
					} else if (message.mode === "followUp") {
						await this.session.followUp(message.text);
					} else {
						await this.session.steer(message.text);
					}
				}
				this.updatePendingMessagesDisplay();
				return;
			}

			// Find first non-extension-command message to use as prompt
			const firstPromptIndex = queuedMessages.findIndex((message) => !this.isExtensionCommand(message.text));
			if (firstPromptIndex === -1) {
				// All extension commands - execute them all
				for (const message of queuedMessages) {
					await this.session.prompt(message.text);
				}
				return;
			}

			// Execute any extension commands before the first prompt
			const preCommands = queuedMessages.slice(0, firstPromptIndex);
			const firstPrompt = queuedMessages[firstPromptIndex];
			const rest = queuedMessages.slice(firstPromptIndex + 1);

			for (const message of preCommands) {
				await this.session.prompt(message.text);
			}

			// Send first prompt (starts streaming)
			const promptPromise = this.session.prompt(firstPrompt.text).catch((error) => {
				restoreQueue(error);
			});

			// Queue remaining messages
			for (const message of rest) {
				if (this.isExtensionCommand(message.text)) {
					await this.session.prompt(message.text);
				} else if (message.mode === "followUp") {
					await this.session.followUp(message.text);
				} else {
					await this.session.steer(message.text);
				}
			}
			this.updatePendingMessagesDisplay();
			void promptPromise;
		} catch (error) {
			restoreQueue(error);
		}
	}

	/** Move pending bash components from pending area to chat */
	private flushPendingBashComponents(): void {
		for (const component of this.pendingBashComponents) {
			this.chatContainer.addChild(component);
		}
		this.pendingBashComponents = [];
		this.updatePendingMessagesDisplay();
	}

	// =========================================================================
	// Selectors
	// =========================================================================

	/**
	 * Shows a selector component in place of the editor.
	 * @param create Factory that receives a `done` callback and returns the component and focus target
	 */
	private showSelector(create: (done: () => void) => { component: Component; focus: Component }): void {
		const done = () => {
			this.restoreComposerEditor({ forceRender: false });
		};
		const { component, focus } = create(done);
		this.setComposerContent(component, { focus });
	}

	private showSettingsSelector(): void {
		this.showSelector((done) => {
			const selector = new SettingsSelectorComponent(
				{
					autoCompact: this.session.autoCompactionEnabled,
					autoCompactThresholdPercent: this.settingsManager.getCompactionThresholdPercent(),
					showImages: this.settingsManager.getShowImages(),
					imageWidthCells: this.settingsManager.getImageWidthCells(),
					autoResizeImages: this.settingsManager.getImageAutoResize(),
					blockImages: this.settingsManager.getBlockImages(),
					enableSkillCommands: this.settingsManager.getEnableSkillCommands(),
					steeringMode: this.session.steeringMode,
					followUpMode: this.session.followUpMode,
					transport: this.settingsManager.getTransport(),
					thinkingLevel: this.session.thinkingLevel,
					availableThinkingLevels: this.session.getAvailableThinkingLevels(),
					currentTheme: this.settingsManager.getTheme() || "dark",
					availableThemes: getAvailableThemes(),
					hideThinkingBlock: this.hideThinkingBlock,
					toolDisplayMode: this.toolDisplayMode,
					collapseChangelog: this.settingsManager.getCollapseChangelog(),
					enableInstallTelemetry: this.settingsManager.getEnableInstallTelemetry(),
					doubleEscapeAction: this.settingsManager.getDoubleEscapeAction(),
					treeFilterMode: this.settingsManager.getTreeFilterMode(),
					showHardwareCursor: this.settingsManager.getShowHardwareCursor(),
					editorPaddingX: this.settingsManager.getEditorPaddingX(),
					autocompleteMaxVisible: this.settingsManager.getAutocompleteMaxVisible(),
					quietStartup: this.settingsManager.getQuietStartup(),
					clearOnShrink: this.settingsManager.getClearOnShrink(),
					showTerminalProgress: this.settingsManager.getShowTerminalProgress(),
					warnings: this.settingsManager.getWarnings(),
				},
				{
					onAutoCompactChange: (enabled) => {
						this.session.setAutoCompactionEnabled(enabled);
						this.footer.setAutoCompactEnabled(enabled);
					},
					onAutoCompactThresholdPercentChange: (percent) => {
						this.settingsManager.setCompactionThresholdPercent(percent);
						this.footer.setAutoCompactEnabled(this.session.autoCompactionEnabled);
					},
					onShowImagesChange: (enabled) => {
						this.settingsManager.setShowImages(enabled);
						for (const child of this.chatContainer.children) {
							if (child instanceof ToolExecutionComponent) {
								child.setShowImages(enabled);
							}
						}
					},
					onImageWidthCellsChange: (width) => {
						this.settingsManager.setImageWidthCells(width);
						for (const child of this.chatContainer.children) {
							if (child instanceof ToolExecutionComponent) {
								child.setImageWidthCells(width);
							}
						}
					},
					onAutoResizeImagesChange: (enabled) => {
						this.settingsManager.setImageAutoResize(enabled);
					},
					onBlockImagesChange: (blocked) => {
						this.settingsManager.setBlockImages(blocked);
					},
					onEnableSkillCommandsChange: (enabled) => {
						this.settingsManager.setEnableSkillCommands(enabled);
						this.setupAutocompleteProvider();
					},
					onSteeringModeChange: (mode) => {
						this.session.setSteeringMode(mode);
					},
					onFollowUpModeChange: (mode) => {
						this.session.setFollowUpMode(mode);
					},
					onTransportChange: (transport) => {
						this.settingsManager.setTransport(transport);
						this.session.agent.transport = transport;
					},
					onThinkingLevelChange: (level) => {
						this.session.setThinkingLevel(level);
						this.footer.invalidate();
						this.updateEditorBorderColor();
					},
					onThemeChange: (themeName) => {
						const result = setTheme(themeName, true);
						this.settingsManager.setTheme(themeName);
						this.ui.invalidate();
						if (!result.success) {
							this.showError(
								TUI_COPY.interactiveNotices.themeLoadFailed(
									themeName,
									result.error ?? TUI_COPY.interactiveNotices.unknownError,
								),
							);
						}
					},
					onThemePreview: (themeName) => {
						const result = setTheme(themeName, true);
						if (result.success) {
							this.ui.invalidate();
							this.ui.requestRender();
						}
					},
					onHideThinkingBlockChange: (hidden) => {
						this.hideThinkingBlock = hidden;
						this.settingsManager.setHideThinkingBlock(hidden);
						for (const child of this.chatContainer.children) {
							if (child instanceof AssistantMessageComponent) {
								child.setHideThinkingBlock(this.hideThinkingBlock);
							}
						}
						if (this.streamingComponent) {
							this.streamingComponent.setHideThinkingBlock(this.hideThinkingBlock);
						}
						this.chatContainer.clear();
						this.rebuildChatFromMessages();
					},
					onToolDisplayModeChange: (mode) => {
						this.toolDisplayMode = mode;
						this.settingsManager.setToolDisplayMode(mode);
						this.setToolsExpanded(mode === "expanded");
						this.chatContainer.clear();
						this.rebuildChatFromMessages();
					},
					onCollapseChangelogChange: (collapsed) => {
						this.settingsManager.setCollapseChangelog(collapsed);
					},
					onEnableInstallTelemetryChange: (enabled) => {
						this.settingsManager.setEnableInstallTelemetry(enabled);
					},
					onQuietStartupChange: (enabled) => {
						this.settingsManager.setQuietStartup(enabled);
					},
					onDoubleEscapeActionChange: (action) => {
						this.settingsManager.setDoubleEscapeAction(action);
					},
					onTreeFilterModeChange: (mode) => {
						this.settingsManager.setTreeFilterMode(mode);
					},
					onShowHardwareCursorChange: (enabled) => {
						this.settingsManager.setShowHardwareCursor(enabled);
						this.ui.setShowHardwareCursor(enabled);
					},
					onEditorPaddingXChange: (padding) => {
						this.settingsManager.setEditorPaddingX(padding);
						this.defaultEditor.setPaddingX(padding);
						if (this.editor !== this.defaultEditor && this.editor.setPaddingX !== undefined) {
							this.editor.setPaddingX(padding);
						}
					},
					onAutocompleteMaxVisibleChange: (maxVisible) => {
						this.settingsManager.setAutocompleteMaxVisible(maxVisible);
						this.defaultEditor.setAutocompleteMaxVisible(maxVisible);
						if (this.editor !== this.defaultEditor && this.editor.setAutocompleteMaxVisible !== undefined) {
							this.editor.setAutocompleteMaxVisible(maxVisible);
						}
					},
					onClearOnShrinkChange: (enabled) => {
						this.settingsManager.setClearOnShrink(enabled);
						this.ui.setClearOnShrink(enabled);
					},
					onShowTerminalProgressChange: (enabled) => {
						this.settingsManager.setShowTerminalProgress(enabled);
					},
					onWarningsChange: (warnings) => {
						this.settingsManager.setWarnings(warnings);
					},
					onCancel: () => {
						done();
						this.ui.requestRender();
					},
				},
			);
			return { component: selector, focus: selector.getSettingsList() };
		});
	}

	private async handleModelCommand(searchTerm?: string): Promise<void> {
		if (!searchTerm) {
			this.showModelSelector();
			return;
		}

		const model = await this.findExactModelMatch(searchTerm);
		if (model) {
			try {
				await this.session.setModel(model);
				this.footer.invalidate();
				this.updateEditorBorderColor();
				this.showTaskbarNotice(TUI_COPY.interactiveNotices.modelSelected(model.id));
				void this.maybeWarnAboutAnthropicSubscriptionAuth(model);
				this.checkDaxnutsEasterEgg(model);
			} catch (error) {
				this.showError(error instanceof Error ? error.message : String(error));
			}
			return;
		}

		this.showModelSelector(searchTerm);
	}

	private async findExactModelMatch(searchTerm: string): Promise<Model<any> | undefined> {
		const models = await this.getModelCandidates();
		return findExactModelReferenceMatch(searchTerm, models);
	}

	private async getModelCandidates(): Promise<Model<any>[]> {
		if (this.session.scopedModels.length > 0) {
			return this.session.scopedModels.map((scoped) => scoped.model);
		}

		this.session.modelRegistry.refresh();
		try {
			return await this.session.modelRegistry.getAvailable();
		} catch {
			return [];
		}
	}

	/** Update the footer's available provider count from current model candidates */
	private async updateAvailableProviderCount(): Promise<void> {
		const models = await this.getModelCandidates();
		const uniqueProviders = new Set(models.map((m) => m.provider));
		this.footerDataProvider.setAvailableProviderCount(uniqueProviders.size);
	}

	private async maybeWarnAboutAnthropicSubscriptionAuth(
		model: Model<any> | undefined = this.session.model,
	): Promise<void> {
		if (this.settingsManager.getWarnings().anthropicExtraUsage === false) {
			return;
		}
		if (this.anthropicSubscriptionWarningShown) {
			return;
		}
		if (!model || model.provider !== "anthropic") {
			return;
		}

		const storedCredential = this.session.modelRegistry.authStorage.get("anthropic");
		if (storedCredential?.type === "oauth") {
			this.anthropicSubscriptionWarningShown = true;
			this.showWarning(ANTHROPIC_SUBSCRIPTION_AUTH_WARNING);
			return;
		}

		try {
			const apiKey = await this.session.modelRegistry.getApiKeyForProvider(model.provider);
			if (!isAnthropicSubscriptionAuthKey(apiKey)) {
				return;
			}
			this.anthropicSubscriptionWarningShown = true;
			this.showWarning(ANTHROPIC_SUBSCRIPTION_AUTH_WARNING);
		} catch {
			// Ignore auth lookup failures for warning-only checks.
		}
	}

	private showModelSelector(initialSearchInput?: string): void {
		this.showSelector((done) => {
			const selector = new ModelSelectorComponent(
				this.ui,
				this.session.model,
				this.settingsManager,
				this.session.modelRegistry,
				this.session.scopedModels,
				async (model) => {
					try {
						await this.session.setModel(model);
						this.footer.invalidate();
						this.updateEditorBorderColor();
						done();
						this.showTaskbarNotice(TUI_COPY.interactiveNotices.modelSelected(model.id));
						void this.maybeWarnAboutAnthropicSubscriptionAuth(model);
						this.checkDaxnutsEasterEgg(model);
					} catch (error) {
						done();
						this.showError(error instanceof Error ? error.message : String(error));
					}
				},
				() => {
					done();
					this.ui.requestRender();
				},
				initialSearchInput,
			);
			return { component: selector, focus: selector };
		});
	}

	private async showModelsSelector(): Promise<void> {
		// Get all available models
		this.session.modelRegistry.refresh();
		const allModels = this.session.modelRegistry.getAvailable();

		if (allModels.length === 0) {
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.noAvailableModels, "warning");
			return;
		}

		// Check if session has scoped models (from previous session-only changes or CLI --models)
		const sessionScopedModels = this.session.scopedModels;
		const hasSessionScope = sessionScopedModels.length > 0;

		// Build enabled model IDs from session state or settings
		let currentEnabledIds: string[] | null = null;

		if (hasSessionScope) {
			// Use current session's scoped models
			currentEnabledIds = sessionScopedModels.map((scoped) => `${scoped.model.provider}/${scoped.model.id}`);
		} else {
			// Fall back to settings
			const patterns = this.settingsManager.getEnabledModels();
			if (patterns !== undefined && patterns.length > 0) {
				const scopedModels = await resolveModelScope(patterns, this.session.modelRegistry);
				currentEnabledIds = scopedModels.map((scoped) => `${scoped.model.provider}/${scoped.model.id}`);
			}
		}

		// Helper to update session's scoped models (session-only, no persist)
		const updateSessionModels = async (enabledIds: string[] | null) => {
			currentEnabledIds = enabledIds === null ? null : [...enabledIds];
			if (enabledIds && enabledIds.length > 0 && enabledIds.length < allModels.length) {
				const newScopedModels = await resolveModelScope(enabledIds, this.session.modelRegistry);
				this.session.setScopedModels(
					newScopedModels.map((sm) => ({
						model: sm.model,
						thinkingLevel: sm.thinkingLevel,
					})),
				);
			} else {
				// All enabled or none enabled = no filter
				this.session.setScopedModels([]);
			}
			await this.updateAvailableProviderCount();
			this.ui.requestRender();
		};

		this.showSelector((done) => {
			const selector = new ScopedModelsSelectorComponent(
				{
					allModels,
					enabledModelIds: currentEnabledIds,
				},
				{
					onChange: async (enabledIds) => {
						await updateSessionModels(enabledIds);
					},
					onPersist: (enabledIds) => {
						// Persist to settings
						const newPatterns =
							enabledIds === null || enabledIds.length === allModels.length
								? undefined // All enabled = clear filter
								: enabledIds;
						this.settingsManager.setEnabledModels(newPatterns ? [...newPatterns] : undefined);
						this.showTaskbarNotice(TUI_COPY.interactiveNotices.scopedModelsSaved);
					},
					onCancel: () => {
						done();
						this.ui.requestRender();
					},
				},
			);
			return { component: selector, focus: selector };
		});
	}

	private showUserMessageSelector(): void {
		const userMessages = this.session.getUserMessagesForForking();

		if (userMessages.length === 0) {
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.noForkableMessages);
			return;
		}

		const initialSelectedId = userMessages[userMessages.length - 1]?.entryId;

		this.showSelector((done) => {
			const selector = new UserMessageSelectorComponent(
				userMessages.map((m) => ({ id: m.entryId, text: m.text })),
				async (entryId) => {
					try {
						const result = await this.runtimeHost.fork(entryId);
						if (result.cancelled) {
							done();
							this.ui.requestRender();
							return;
						}

						this.renderCurrentSessionState();
						this.editor.setText(result.selectedText ?? "");
						done();
						this.showTaskbarNotice(TUI_COPY.interactiveNotices.forkedToNewSession);
					} catch (error: unknown) {
						done();
						this.showError(error instanceof Error ? error.message : String(error));
					}
				},
				() => {
					done();
					this.ui.requestRender();
				},
				initialSelectedId,
			);
			return { component: selector, focus: selector.getMessageList() };
		});
	}

	private async handleCloneCommand(): Promise<void> {
		const leafId = this.sessionManager.getLeafId();
		if (!leafId) {
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.noClonableContent);
			return;
		}

		try {
			const result = await this.runtimeHost.fork(leafId, { position: "at" });
			if (result.cancelled) {
				this.ui.requestRender();
				return;
			}

			this.renderCurrentSessionState();
			this.editor.setText("");
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.clonedToNewSession);
		} catch (error: unknown) {
			this.showError(error instanceof Error ? error.message : String(error));
		}
	}

	private showTreeSelector(initialSelectedId?: string): void {
		const tree = this.sessionManager.getTree();
		const realLeafId = this.sessionManager.getLeafId();
		const initialFilterMode = this.settingsManager.getTreeFilterMode();

		if (tree.length === 0) {
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.treeEmpty);
			return;
		}

		this.showSelector((done) => {
			const selector = new TreeSelectorComponent(
				tree,
				realLeafId,
				this.ui.terminal.rows,
				async (entryId) => {
					// Selecting the current leaf is a no-op (already there)
					if (entryId === realLeafId) {
						done();
						this.showTaskbarNotice(TUI_COPY.interactiveNotices.alreadyAtTreeNode);
						return;
					}

					// Ask about summarization
					done(); // Close selector first

					// Loop until user makes a complete choice or cancels to tree
					let wantsSummary = false;
					let customInstructions: string | undefined;

					// Check if we should skip the prompt (user preference to always default to no summary)
					if (!this.settingsManager.getBranchSummarySkipPrompt()) {
						while (true) {
							const summaryChoice = await this.showExtensionSelector(TUI_COPY.branchSummaryDialog.title, [
								TUI_COPY.branchSummaryDialog.noSummary,
								TUI_COPY.branchSummaryDialog.directSummary,
								TUI_COPY.branchSummaryDialog.customSummary,
							]);

							if (summaryChoice === undefined) {
								// User pressed escape - re-show tree selector with same selection
								this.showTreeSelector(entryId);
								return;
							}

							wantsSummary = summaryChoice !== TUI_COPY.branchSummaryDialog.noSummary;

							if (summaryChoice === TUI_COPY.branchSummaryDialog.customSummary) {
								customInstructions = await this.showExtensionEditor(
									TUI_COPY.branchSummaryDialog.customPromptTitle,
								);
								if (customInstructions === undefined) {
									// User cancelled - loop back to summary selector
									continue;
								}
							}

							// User made a complete choice
							break;
						}
					}

					// Set up escape handler and loader if summarizing
					let summaryLoader: Loader | undefined;
					const originalOnEscape = this.defaultEditor.onEscape;

					if (wantsSummary) {
						this.defaultEditor.onEscape = () => {
							this.session.abortBranchSummary();
						};
						this.chatContainer.addChild(new Spacer(1));
						summaryLoader = new Loader(
							this.ui,
							(spinner) => theme.fg("accent", spinner),
							(text) => theme.fg("muted", text),
							TUI_COPY.interactiveNotices.branchSummaryRunning(keyText("app.interrupt")),
							undefined,
							{ skipInitialRender: true },
						);
						this.setTaskbarOverlay(summaryLoader);
						this.requestRenderUnlessInputSuppressed();
					}

					try {
						const result = await this.session.navigateTree(entryId, {
							summarize: wantsSummary,
							customInstructions,
						});

						if (result.aborted) {
							// Summarization aborted - re-show tree selector with same selection
							this.showTaskbarNotice(TUI_COPY.interactiveNotices.branchSummaryCancelled);
							this.showTreeSelector(entryId);
							return;
						}
						if (result.cancelled) {
							this.showTaskbarNotice(TUI_COPY.interactiveNotices.treeJumpCancelled);
							return;
						}

						// Update UI
						this.chatContainer.clear();
						this.renderInitialMessages();
						if (result.editorText && !this.editor.getText().trim()) {
							this.editor.setText(result.editorText);
						}
						this.showTaskbarNotice(TUI_COPY.interactiveNotices.treeJumped);
						void this.flushCompactionQueue({ willRetry: false });
					} catch (error) {
						this.showError(error instanceof Error ? error.message : String(error));
					} finally {
						if (summaryLoader) {
							summaryLoader.stop();
							this.setTaskbarOverlay(undefined);
							this.renderWorkingArea();
						}
						this.defaultEditor.onEscape = originalOnEscape;
					}
				},
				() => {
					done();
					this.ui.requestRender();
				},
				(entryId, label) => {
					this.sessionManager.appendLabelChange(entryId, label);
					this.ui.requestRender();
				},
				initialSelectedId,
				initialFilterMode,
			);
			return { component: selector, focus: selector };
		});
	}

	private showSessionSelector(): void {
		this.showSelector((done) => {
			const selector = new SessionSelectorComponent(
				(onProgress) =>
					SessionManager.list(this.sessionManager.getCwd(), this.sessionManager.getSessionDir(), onProgress),
				SessionManager.listAll,
				async (sessionPath) => {
					done();
					await this.handleResumeSession(sessionPath);
				},
				() => {
					done();
					this.ui.requestRender();
				},
				() => {
					void this.shutdown();
				},
				() => this.ui.requestRender(),
				{
					renameSession: async (sessionFilePath: string, nextName: string | undefined) => {
						const next = (nextName ?? "").trim();
						if (!next) return;
						const mgr = SessionManager.open(sessionFilePath);
						mgr.appendSessionInfo(next);
					},
					showRenameHint: true,
					keybindings: this.keybindings,
				},

				this.sessionManager.getSessionFile(),
			);
			return { component: selector, focus: selector };
		});
	}

	private async handleResumeSession(
		sessionPath: string,
		options?: Parameters<ExtensionCommandContext["switchSession"]>[1],
	): Promise<{ cancelled: boolean }> {
		if (this.loadingAnimation) {
			this.loadingAnimation.stop();
			this.loadingAnimation = undefined;
		}
		this.renderWorkingArea();
		try {
			const result = await this.runtimeHost.switchSession(sessionPath, {
				withSession: options?.withSession,
			});
			if (result.cancelled) {
				return result;
			}
			this.renderCurrentSessionState();
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.sessionResumed);
			return result;
		} catch (error: unknown) {
			if (error instanceof MissingSessionCwdError) {
				const selectedCwd = await this.promptForMissingSessionCwd(error);
				if (!selectedCwd) {
					this.showTaskbarNotice(TUI_COPY.interactiveNotices.sessionResumeCancelled);
					return { cancelled: true };
				}
				const result = await this.runtimeHost.switchSession(sessionPath, {
					cwdOverride: selectedCwd,
					withSession: options?.withSession,
				});
				if (result.cancelled) {
					return result;
				}
				this.renderCurrentSessionState();
				this.showTaskbarNotice(TUI_COPY.interactiveNotices.sessionResumedWithOverride);
				return result;
			}
			return this.handleFatalRuntimeError(TUI_COPY.interactiveNotices.fatalResumeSession, error);
		}
	}

	private getLoginProviderOptions(authType?: "oauth" | "api_key"): AuthSelectorProvider[] {
		const authStorage = this.session.modelRegistry.authStorage;
		const oauthProviders = authStorage.getOAuthProviders();
		const oauthProviderIds = new Set(oauthProviders.map((provider) => provider.id));
		const options: AuthSelectorProvider[] = oauthProviders.map((provider) => ({
			id: provider.id,
			name: provider.name,
			authType: "oauth",
		}));

		const modelProviders = new Set(this.session.modelRegistry.getAll().map((model) => model.provider));
		for (const providerId of modelProviders) {
			if (!isApiKeyLoginProvider(providerId, oauthProviderIds)) {
				continue;
			}
			options.push({
				id: providerId,
				name: this.session.modelRegistry.getProviderDisplayName(providerId),
				authType: "api_key",
			});
		}

		const filteredOptions = authType ? options.filter((option) => option.authType === authType) : options;
		return filteredOptions.sort((a, b) => a.name.localeCompare(b.name));
	}

	private getLogoutProviderOptions(): AuthSelectorProvider[] {
		const authStorage = this.session.modelRegistry.authStorage;
		const options: AuthSelectorProvider[] = [];

		for (const providerId of authStorage.list()) {
			const credential = authStorage.get(providerId);
			if (!credential) {
				continue;
			}
			options.push({
				id: providerId,
				name: this.session.modelRegistry.getProviderDisplayName(providerId),
				authType: credential.type,
			});
		}

		return options.sort((a, b) => a.name.localeCompare(b.name));
	}

	private showLoginAuthTypeSelector(): void {
		const subscriptionLabel = TUI_COPY.loginSelector.subscription;
		const apiKeyLabel = TUI_COPY.loginSelector.apiKey;
		this.showSelector((done) => {
			const selector = new ExtensionSelectorComponent(
				TUI_COPY.loginSelector.authTypeTitle,
				[subscriptionLabel, apiKeyLabel],
				(option) => {
					done();
					const authType = option === subscriptionLabel ? "oauth" : "api_key";
					this.showLoginProviderSelector(authType);
				},
				() => {
					done();
					this.ui.requestRender();
				},
			);
			return { component: selector, focus: selector };
		});
	}

	private showLoginProviderSelector(authType: "oauth" | "api_key"): void {
		const providerOptions = this.getLoginProviderOptions(authType);
		if (providerOptions.length === 0) {
			this.showTaskbarNotice(
				authType === "oauth"
					? TUI_COPY.interactiveNotices.noOAuthProviders
					: TUI_COPY.interactiveNotices.noApiKeyProviders,
				"warning",
			);
			return;
		}

		this.showSelector((done) => {
			const selector = new OAuthSelectorComponent(
				"login",
				this.session.modelRegistry.authStorage,
				providerOptions,
				async (providerId: string) => {
					done();

					const providerOption = providerOptions.find((provider) => provider.id === providerId);
					if (!providerOption) {
						return;
					}

					if (providerOption.authType === "oauth") {
						await this.showLoginDialog(providerOption.id, providerOption.name);
					} else if (providerOption.id === BEDROCK_PROVIDER_ID) {
						this.showBedrockSetupDialog(providerOption.id, providerOption.name);
					} else {
						await this.showApiKeyLoginDialog(providerOption.id, providerOption.name);
					}
				},
				() => {
					done();
					this.showLoginAuthTypeSelector();
				},
				(providerId) => this.session.modelRegistry.getProviderAuthStatus(providerId),
			);
			return { component: selector, focus: selector };
		});
	}

	private async showOAuthSelector(mode: "login" | "logout"): Promise<void> {
		if (mode === "login") {
			this.showLoginAuthTypeSelector();
			return;
		}

		const providerOptions = this.getLogoutProviderOptions();
		if (providerOptions.length === 0) {
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.noStoredCredentials, "warning");
			return;
		}

		this.showSelector((done) => {
			const selector = new OAuthSelectorComponent(
				mode,
				this.session.modelRegistry.authStorage,
				providerOptions,
				async (providerId: string) => {
					done();

					const providerOption = providerOptions.find((provider) => provider.id === providerId);
					if (!providerOption) {
						return;
					}

					try {
						this.session.modelRegistry.authStorage.logout(providerOption.id);
						this.session.modelRegistry.refresh();
						await this.updateAvailableProviderCount();
						const message =
							providerOption.authType === "oauth"
								? TUI_COPY.interactiveNotices.loggedOutProvider(providerOption.name)
								: TUI_COPY.interactiveNotices.removedSavedApiKey(providerOption.name);
						this.showTaskbarNotice(message);
					} catch (error: unknown) {
						this.showError(
							TUI_COPY.interactiveNotices.logoutFailed(error instanceof Error ? error.message : String(error)),
						);
					}
				},
				() => {
					done();
					this.ui.requestRender();
				},
			);
			return { component: selector, focus: selector };
		});
	}

	private async completeProviderAuthentication(
		providerId: string,
		providerName: string,
		authType: "oauth" | "api_key",
		previousModel: Model<any> | undefined,
	): Promise<void> {
		this.session.modelRegistry.refresh();

		const actionLabel = authType === "oauth" ? `Logged in to ${providerName}` : `Saved API key for ${providerName}`;

		let selectedModel: Model<any> | undefined;
		let selectionError: string | undefined;
		if (isUnknownModel(previousModel)) {
			const availableModels = this.session.modelRegistry.getAvailable();
			const providerModels = availableModels.filter((model) => model.provider === providerId);
			if (!hasDefaultModelProvider(providerId)) {
				selectionError = `${actionLabel}, but provider "${providerId}" does not have a default model yet. Use /model to choose one.`;
			} else if (providerModels.length === 0) {
				selectionError = `${actionLabel}, but this provider does not currently have any available models. Use /model to choose one.`;
			} else {
				const defaultModelId = defaultModelPerProvider[providerId];
				selectedModel = providerModels.find((model) => model.id === defaultModelId);
				if (!selectedModel) {
					selectionError = `${actionLabel}, but the default model "${defaultModelId}" is not currently available. Use /model to choose one.`;
				} else {
					try {
						await this.session.setModel(selectedModel);
					} catch (error: unknown) {
						selectedModel = undefined;
						const errorMessage = error instanceof Error ? error.message : String(error);
						selectionError = `${actionLabel}, but selecting the default model failed: ${errorMessage}. Use /model to choose one.`;
					}
				}
			}
		}

		await this.updateAvailableProviderCount();
		this.footer.invalidate();
		this.updateEditorBorderColor();
		if (selectedModel) {
			this.showTaskbarNotice(
				TUI_COPY.interactiveNotices.loginSelectedModel(actionLabel, selectedModel.id, getAuthPath()),
			);
			void this.maybeWarnAboutAnthropicSubscriptionAuth(selectedModel);
			this.checkDaxnutsEasterEgg(selectedModel);
		} else {
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.loginSavedOnly(actionLabel, getAuthPath()));
			if (selectionError) {
				this.showError(selectionError);
			} else {
				void this.maybeWarnAboutAnthropicSubscriptionAuth();
			}
		}
	}

	private showBedrockSetupDialog(providerId: string, providerName: string): void {
		const restoreEditor = () => {
			this.restoreComposerEditor();
		};

		const dialog = new LoginDialogComponent(
			this.ui,
			providerId,
			() => restoreEditor(),
			providerName,
			TUI_COPY.bedrockDialog.title,
		);
		dialog.showInfo([
			theme.fg("text", TUI_COPY.bedrockDialog.line1),
			theme.fg("text", TUI_COPY.bedrockDialog.line2),
			theme.fg("muted", TUI_COPY.bedrockDialog.reference),
			theme.fg("accent", `  ${path.join(getDocsPath(), "providers.md")}`),
		]);

		this.setComposerContent(dialog);
	}

	private async showApiKeyLoginDialog(providerId: string, providerName: string): Promise<void> {
		const previousModel = this.session.model;

		const dialog = new LoginDialogComponent(
			this.ui,
			providerId,
			(_success, _message) => {
				// Completion handled below
			},
			providerName,
		);

		this.setComposerContent(dialog);

		const restoreEditor = () => {
			this.restoreComposerEditor();
		};

		try {
			const apiKey = (await dialog.showPrompt(TUI_COPY.loginDialog.apiKeyPrompt)).trim();
			if (!apiKey) {
				throw new Error(TUI_COPY.loginDialog.apiKeyEmpty);
			}

			this.session.modelRegistry.authStorage.set(providerId, { type: "api_key", key: apiKey });

			restoreEditor();
			await this.completeProviderAuthentication(providerId, providerName, "api_key", previousModel);
		} catch (error: unknown) {
			restoreEditor();
			const errorMsg = error instanceof Error ? error.message : String(error);
			if (errorMsg !== TUI_COPY.interactiveNotices.loginCancelled) {
				this.showError(TUI_COPY.interactiveNotices.saveApiKeyFailed(providerName, errorMsg));
			}
		}
	}

	private showOAuthLoginSelect(dialog: LoginDialogComponent, prompt: OAuthSelectPrompt): Promise<string | undefined> {
		return new Promise((resolve) => {
			const restoreDialog = () => {
				this.setComposerContent(dialog);
			};
			const labels = prompt.options.map((option) => option.label);
			const selector = new ExtensionSelectorComponent(
				prompt.message,
				labels,
				(optionLabel) => {
					restoreDialog();
					resolve(prompt.options.find((option) => option.label === optionLabel)?.id);
				},
				() => {
					restoreDialog();
					resolve(undefined);
				},
			);
			this.setComposerContent(selector);
		});
	}

	private async showLoginDialog(providerId: string, providerName: string): Promise<void> {
		const providerInfo = this.session.modelRegistry.authStorage
			.getOAuthProviders()
			.find((provider) => provider.id === providerId);
		const previousModel = this.session.model;

		// Providers that use callback servers (can paste redirect URL)
		const usesCallbackServer = providerInfo?.usesCallbackServer ?? false;

		// Create login dialog component
		const dialog = new LoginDialogComponent(
			this.ui,
			providerId,
			(_success, _message) => {
				// Completion handled below
			},
			providerName,
		);

		// Show dialog in editor container
		this.setComposerContent(dialog);

		// Promise for manual code input (racing with callback server)
		let manualCodeResolve: ((code: string) => void) | undefined;
		let manualCodeReject: ((err: Error) => void) | undefined;
		const manualCodePromise = new Promise<string>((resolve, reject) => {
			manualCodeResolve = resolve;
			manualCodeReject = reject;
		});

		// Restore editor helper
		const restoreEditor = () => {
			this.setExtensionStatus("ui", undefined);
			this.restoreComposerEditor();
		};

		try {
			this.setExtensionStatus("ui", TUI_COPY.loginDialog.waitingProviderLogin(providerName));
			await this.session.modelRegistry.authStorage.login(providerId as OAuthProviderId, {
				onAuth: (info: { url: string; instructions?: string }) => {
					dialog.showAuth(info.url, info.instructions);

					if (usesCallbackServer) {
						this.setExtensionStatus("ui", TUI_COPY.loginDialog.waitingProviderBrowserLogin(providerName));
						// Show input for manual paste, racing with callback
						dialog
							.showManualInput(TUI_COPY.loginDialog.pasteRedirectUrl)
							.then((value) => {
								if (value && manualCodeResolve) {
									manualCodeResolve(value);
									manualCodeResolve = undefined;
								}
							})
							.catch(() => {
								if (manualCodeReject) {
									manualCodeReject(new Error(TUI_COPY.loginDialog.cancelled));
									manualCodeReject = undefined;
								}
							});
					} else if (providerId === "github-copilot") {
						// GitHub Copilot polls after onAuth
						this.setExtensionStatus("ui", TUI_COPY.loginDialog.browserAuthStatus);
						dialog.showWaiting(TUI_COPY.loginDialog.waitingBrowserAuth);
					}
					// For Anthropic: onPrompt is called immediately after
				},

				onDeviceCode: (info) => {
					this.setExtensionStatus("ui", TUI_COPY.loginDialog.waitingProviderLogin(providerName));
					dialog.showDeviceCode(info);
					dialog.showWaiting(TUI_COPY.loginDialog.waitingDeviceAuth);
				},

				onPrompt: async (prompt: { message: string; placeholder?: string }) => {
					this.setExtensionStatus("ui", TUI_COPY.loginDialog.waitingPrompt(prompt.message));
					return dialog.showPrompt(prompt.message, prompt.placeholder);
				},

				onProgress: (message: string) => {
					this.setExtensionStatus("ui", TUI_COPY.loginDialog.waitingPrompt(message));
					dialog.showProgress(message);
				},

				onSelect: (prompt: OAuthSelectPrompt) => this.showOAuthLoginSelect(dialog, prompt),

				onManualCodeInput: () => manualCodePromise,

				signal: dialog.signal,
			});

			// Success
			restoreEditor();
			await this.completeProviderAuthentication(providerId, providerName, "oauth", previousModel);
		} catch (error: unknown) {
			restoreEditor();
			const errorMsg = error instanceof Error ? error.message : String(error);
			if (errorMsg !== TUI_COPY.interactiveNotices.loginCancelled) {
				this.showError(TUI_COPY.interactiveNotices.loginFailed(providerName, errorMsg));
			}
		}
	}

	// =========================================================================
	// Command handlers
	// =========================================================================

	private async handleReloadCommand(): Promise<void> {
		if (this.session.isStreaming) {
			this.showWarning(TUI_COPY.interactiveNotices.reloadWhileStreaming);
			return;
		}
		if (this.session.isCompacting) {
			this.showWarning(TUI_COPY.interactiveNotices.reloadWhileCompacting);
			return;
		}

		this.resetExtensionUI();

		const reloadBox = new Container();
		const borderColor = (s: string) => theme.fg("border", s);
		reloadBox.addChild(new DynamicBorder(borderColor));
		reloadBox.addChild(new Spacer(1));
		reloadBox.addChild(new Text(theme.fg("muted", TUI_COPY.interactiveNotices.reloadingResources), 1, 0));
		reloadBox.addChild(new Spacer(1));
		reloadBox.addChild(new DynamicBorder(borderColor));

		const previousEditor = this.editor;
		this.setComposerContent(reloadBox, { forceRender: true });
		await new Promise((resolve) => process.nextTick(resolve));

		const dismissReloadBox = (editor: Component) => {
			this.setComposerContent(editor, { focus: editor });
		};

		try {
			await this.session.reload();
			this.keybindings.reload();
			const activeHeader = this.customHeader ?? this.builtInHeader;
			if (isExpandable(activeHeader)) {
				activeHeader.setExpanded(this.toolOutputExpanded);
			}
			setRegisteredThemes(this.session.resourceLoader.getThemes().themes);
			this.hideThinkingBlock = this.settingsManager.getHideThinkingBlock();
			const themeName = this.settingsManager.getTheme();
			const themeResult = themeName ? setTheme(themeName, true) : { success: true };
			if (!themeResult.success) {
				this.showError(
					TUI_COPY.interactiveNotices.themeLoadFailed(
						themeName ?? "unknown",
						themeResult.error ?? TUI_COPY.interactiveNotices.unknownError,
					),
				);
			}
			const editorPaddingX = this.settingsManager.getEditorPaddingX();
			const autocompleteMaxVisible = this.settingsManager.getAutocompleteMaxVisible();
			this.defaultEditor.setPaddingX(editorPaddingX);
			this.defaultEditor.setAutocompleteMaxVisible(autocompleteMaxVisible);
			if (this.editor !== this.defaultEditor) {
				this.editor.setPaddingX?.(editorPaddingX);
				this.editor.setAutocompleteMaxVisible?.(autocompleteMaxVisible);
			}
			this.ui.setShowHardwareCursor(this.settingsManager.getShowHardwareCursor());
			this.ui.setClearOnShrink(this.settingsManager.getClearOnShrink());
			this.setupAutocompleteProvider();
			const runner = this.session.extensionRunner;
			this.setupExtensionShortcuts(runner);
			this.rebuildChatFromMessages();
			dismissReloadBox(this.editor as Component);
			this.showLoadedResources({
				force: false,
				showDiagnosticsWhenQuiet: true,
			});
			const modelsJsonError = this.session.modelRegistry.getError();
			if (modelsJsonError) {
				this.showError(TUI_COPY.interactiveNotices.modelsJsonError(modelsJsonError));
			}
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.reloadComplete);
		} catch (error) {
			dismissReloadBox(previousEditor as Component);
			this.showError(
				TUI_COPY.interactiveNotices.reloadFailed(error instanceof Error ? error.message : String(error)),
			);
		}
	}

	private async handleExportCommand(text: string): Promise<void> {
		const outputPath = this.getPathCommandArgument(text, "/export");

		try {
			if (outputPath?.endsWith(".jsonl")) {
				const filePath = this.session.exportToJsonl(outputPath);
				this.showTaskbarNotice(TUI_COPY.interactiveNotices.exportedSession(filePath), "dim", 3200);
			} else {
				const filePath = await this.session.exportToHtml(outputPath);
				this.showTaskbarNotice(TUI_COPY.interactiveNotices.exportedSession(filePath), "dim", 3200);
			}
		} catch (error: unknown) {
			this.showError(
				TUI_COPY.interactiveNotices.exportFailed(
					error instanceof Error ? error.message : TUI_COPY.interactiveNotices.unknownError,
				),
			);
		}
	}

	private getPathCommandArgument(text: string, command: "/export" | "/import"): string | undefined {
		if (text === command) {
			return undefined;
		}
		if (!text.startsWith(`${command} `)) {
			return undefined;
		}

		const argsString = text.slice(command.length + 1).trimStart();
		if (!argsString) {
			return undefined;
		}

		const firstChar = argsString[0];
		if (firstChar === '"' || firstChar === "'") {
			const closingQuoteIndex = argsString.indexOf(firstChar, 1);
			if (closingQuoteIndex < 0) {
				return undefined;
			}
			return argsString.slice(1, closingQuoteIndex);
		}

		const firstWhitespaceIndex = argsString.search(/\s/);
		if (firstWhitespaceIndex < 0) {
			return argsString;
		}
		return argsString.slice(0, firstWhitespaceIndex);
	}

	private async handleImportCommand(text: string): Promise<void> {
		const inputPath = this.getPathCommandArgument(text, "/import");
		if (!inputPath) {
			this.showError(TUI_COPY.interactiveNotices.importUsage);
			return;
		}

		const confirmed = await this.showExtensionConfirm(
			TUI_COPY.importDialog.title,
			TUI_COPY.importDialog.replacePrompt(inputPath),
		);
		if (!confirmed) {
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.importCancelled);
			return;
		}

		try {
			if (this.loadingAnimation) {
				this.loadingAnimation.stop();
				this.loadingAnimation = undefined;
			}
			this.renderWorkingArea();
			const result = await this.runtimeHost.importFromJsonl(inputPath);
			if (result.cancelled) {
				this.showTaskbarNotice(TUI_COPY.interactiveNotices.importCancelled);
				return;
			}
			this.renderCurrentSessionState();
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.importComplete(inputPath), "dim", 3200);
		} catch (error: unknown) {
			if (error instanceof MissingSessionCwdError) {
				const selectedCwd = await this.promptForMissingSessionCwd(error);
				if (!selectedCwd) {
					this.showTaskbarNotice(TUI_COPY.interactiveNotices.importCancelled);
					return;
				}
				const result = await this.runtimeHost.importFromJsonl(inputPath, selectedCwd);
				if (result.cancelled) {
					this.showTaskbarNotice(TUI_COPY.interactiveNotices.importCancelled);
					return;
				}
				this.renderCurrentSessionState();
				this.showTaskbarNotice(TUI_COPY.interactiveNotices.importComplete(inputPath), "dim", 3200);
				return;
			}
			if (error instanceof SessionImportFileNotFoundError) {
				this.showError(TUI_COPY.interactiveNotices.importFailed(error.message));
				return;
			}
			await this.handleFatalRuntimeError(TUI_COPY.interactiveNotices.fatalImportSession, error);
		}
	}

	private async handleShareCommand(): Promise<void> {
		// Check if gh is available and logged in
		try {
			const authResult = spawnSync("gh", ["auth", "status"], { encoding: "utf-8" });
			if (authResult.status !== 0) {
				this.showError(TUI_COPY.interactiveNotices.shareAuthRequired);
				return;
			}
		} catch {
			this.showError(TUI_COPY.interactiveNotices.shareCliMissing);
			return;
		}

		// Export to a temp file
		const tmpFile = path.join(os.tmpdir(), "session.html");
		try {
			await this.session.exportToHtml(tmpFile);
		} catch (error: unknown) {
			this.showError(
				TUI_COPY.interactiveNotices.exportFailed(
					error instanceof Error ? error.message : TUI_COPY.interactiveNotices.unknownError,
				),
			);
			return;
		}

		// Show cancellable loader, replacing the editor
		const loader = new BorderedLoader(this.ui, theme, TUI_COPY.interactiveNotices.creatingGist);
		this.setComposerContent(loader);

		const restoreEditor = () => {
			loader.dispose();
			this.restoreComposerEditor({ forceRender: false });
			try {
				fs.unlinkSync(tmpFile);
			} catch {
				// Ignore cleanup errors
			}
		};

		// Create a secret gist asynchronously
		let proc: ReturnType<typeof spawn> | null = null;

		loader.onAbort = () => {
			proc?.kill();
			restoreEditor();
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.shareCancelled);
		};

		try {
			const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve) => {
				proc = spawn("gh", ["gist", "create", "--public=false", tmpFile]);
				let stdout = "";
				let stderr = "";
				proc.stdout?.on("data", (data) => {
					stdout += data.toString();
				});
				proc.stderr?.on("data", (data) => {
					stderr += data.toString();
				});
				proc.on("close", (code) => resolve({ stdout, stderr, code }));
			});

			if (loader.signal.aborted) return;

			restoreEditor();

			if (result.code !== 0) {
				const errorMsg = result.stderr?.trim() || TUI_COPY.interactiveNotices.unknownError;
				this.showError(TUI_COPY.interactiveNotices.shareGistCreateFailed(errorMsg));
				return;
			}

			// Extract gist ID from the URL returned by gh
			// gh returns something like: https://gist.github.com/username/GIST_ID
			const gistUrl = result.stdout?.trim();
			const gistId = gistUrl?.split("/").pop();
			if (!gistId) {
				this.showError(TUI_COPY.interactiveNotices.shareGistIdMissing);
				return;
			}

			// Create the preview URL
			const previewUrl = getShareViewerUrl(gistId);
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.sharePreviewUrl(previewUrl), "dim", 4200);
			this.chatContainer.addChild(new Spacer(1));
			this.chatContainer.addChild(
				new Text(theme.fg("muted", TUI_COPY.interactiveNotices.shareGistUrl(gistUrl)), 1, 0),
			);
			this.requestRenderRespectingInput();
		} catch (error: unknown) {
			if (!loader.signal.aborted) {
				restoreEditor();
				this.showError(
					TUI_COPY.interactiveNotices.shareGistCreateFailed(
						error instanceof Error ? error.message : TUI_COPY.interactiveNotices.unknownError,
					),
				);
			}
		}
	}

	private async handleCopyCommand(): Promise<void> {
		const text = this.session.getLastAssistantText();
		if (!text) {
			this.showError(TUI_COPY.interactiveNotices.copyNoAssistantMessage);
			return;
		}

		try {
			await copyToClipboard(text);
			this.showTaskbarNotice(TUI_COPY.interactiveNotices.copyLastAssistantMessage);
		} catch (error) {
			this.showError(error instanceof Error ? error.message : String(error));
		}
	}

	private handleNameCommand(text: string): void {
		const name = text.replace(/^\/name\s*/, "").trim();
		if (!name) {
			const currentName = this.sessionManager.getSessionName();
			if (currentName) {
				this.showTaskbarNotice(TUI_COPY.interactiveNotices.sessionNameCurrent(currentName), "dim", 3200);
			} else {
				this.showWarning(TUI_COPY.interactiveNotices.nameUsage);
			}
			return;
		}

		this.session.setSessionName(name);
		this.showTaskbarNotice(TUI_COPY.interactiveNotices.sessionNameUpdated(name), "dim", 3200);
	}

	private handleSessionCommand(): void {
		const stats = this.session.getSessionStats();
		const sessionName = this.sessionManager.getSessionName();

		let info = `${theme.bold(TUI_COPY.sessionInfo.title)}\n\n`;
		if (sessionName) {
			info += `${theme.fg("dim", TUI_COPY.sessionInfo.name)} ${sessionName}\n`;
		}
		info += `${theme.fg("dim", TUI_COPY.sessionInfo.file)} ${stats.sessionFile ?? TUI_COPY.sessionInfo.memoryOnly}\n`;
		info += `${theme.fg("dim", TUI_COPY.sessionInfo.id)} ${stats.sessionId}\n\n`;
		info += `${theme.bold(TUI_COPY.sessionInfo.messageStats)}\n`;
		info += `${theme.fg("dim", TUI_COPY.sessionInfo.user)} ${stats.userMessages}\n`;
		info += `${theme.fg("dim", TUI_COPY.sessionInfo.assistant)} ${stats.assistantMessages}\n`;
		info += `${theme.fg("dim", TUI_COPY.sessionInfo.toolCalls)} ${stats.toolCalls}\n`;
		info += `${theme.fg("dim", TUI_COPY.sessionInfo.toolResults)} ${stats.toolResults}\n`;
		info += `${theme.fg("dim", TUI_COPY.sessionInfo.total)} ${stats.totalMessages}\n\n`;
		info += `${theme.bold(TUI_COPY.sessionInfo.tokens)}\n`;
		info += `${theme.fg("dim", TUI_COPY.sessionInfo.input)} ${stats.tokens.input.toLocaleString()}\n`;
		info += `${theme.fg("dim", TUI_COPY.sessionInfo.output)} ${stats.tokens.output.toLocaleString()}\n`;
		if (stats.tokens.cacheRead > 0) {
			info += `${theme.fg("dim", TUI_COPY.sessionInfo.cacheRead)} ${stats.tokens.cacheRead.toLocaleString()}\n`;
		}
		if (stats.tokens.cacheWrite > 0) {
			info += `${theme.fg("dim", TUI_COPY.sessionInfo.cacheWrite)} ${stats.tokens.cacheWrite.toLocaleString()}\n`;
		}
		info += `${theme.fg("dim", TUI_COPY.sessionInfo.total)} ${stats.tokens.total.toLocaleString()}\n`;

		if (stats.cost > 0) {
			info += `\n${theme.bold(TUI_COPY.sessionInfo.cost)}\n`;
			info += `${theme.fg("dim", TUI_COPY.sessionInfo.total)} ${stats.cost.toFixed(4)}`;
		}

		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new Text(info, 1, 0));
		this.requestRenderRespectingInput();
	}

	private handleChangelogCommand(): void {
		const changelogPath = getLumenChangelogPath();
		const allEntries = parseChangelog(changelogPath);

		const changelogMarkdown =
			allEntries.length > 0
				? allEntries
						.reverse()
						.map((e) => e.content)
						.join("\n\n")
				: TUI_COPY.changelog.empty;

		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new DynamicBorder());
		this.chatContainer.addChild(new Text(theme.bold(theme.fg("accent", TUI_COPY.changelog.title)), 1, 0));
		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new Markdown(changelogMarkdown, 1, 1, this.getMarkdownThemeWithSettings()));
		this.chatContainer.addChild(new DynamicBorder());
		this.requestRenderRespectingInput();
	}

	/**
	 * Get capitalized display string for an app keybinding action.
	 */
	private getAppKeyDisplay(action: AppKeybinding): string {
		return keyDisplayText(action);
	}

	/**
	 * Get capitalized display string for an editor keybinding action.
	 */
	private getEditorKeyDisplay(action: Keybinding): string {
		return keyDisplayText(action);
	}

	private handleHotkeysCommand(): void {
		// Navigation keybindings
		const cursorUp = this.getEditorKeyDisplay("tui.editor.cursorUp");
		const cursorDown = this.getEditorKeyDisplay("tui.editor.cursorDown");
		const cursorLeft = this.getEditorKeyDisplay("tui.editor.cursorLeft");
		const cursorRight = this.getEditorKeyDisplay("tui.editor.cursorRight");
		const cursorWordLeft = this.getEditorKeyDisplay("tui.editor.cursorWordLeft");
		const cursorWordRight = this.getEditorKeyDisplay("tui.editor.cursorWordRight");
		const cursorLineStart = this.getEditorKeyDisplay("tui.editor.cursorLineStart");
		const cursorLineEnd = this.getEditorKeyDisplay("tui.editor.cursorLineEnd");
		const jumpForward = this.getEditorKeyDisplay("tui.editor.jumpForward");
		const jumpBackward = this.getEditorKeyDisplay("tui.editor.jumpBackward");
		const pageUp = this.getEditorKeyDisplay("tui.editor.pageUp");
		const pageDown = this.getEditorKeyDisplay("tui.editor.pageDown");

		// Editing keybindings
		const submit = this.getEditorKeyDisplay("tui.input.submit");
		const newLine = this.getEditorKeyDisplay("tui.input.newLine");
		const deleteWordBackward = this.getEditorKeyDisplay("tui.editor.deleteWordBackward");
		const deleteWordForward = this.getEditorKeyDisplay("tui.editor.deleteWordForward");
		const deleteToLineStart = this.getEditorKeyDisplay("tui.editor.deleteToLineStart");
		const deleteToLineEnd = this.getEditorKeyDisplay("tui.editor.deleteToLineEnd");
		const yank = this.getEditorKeyDisplay("tui.editor.yank");
		const yankPop = this.getEditorKeyDisplay("tui.editor.yankPop");
		const undo = this.getEditorKeyDisplay("tui.editor.undo");
		const tab = this.getEditorKeyDisplay("tui.input.tab");

		// App keybindings
		const interrupt = this.getAppKeyDisplay("app.interrupt");
		const clear = this.getAppKeyDisplay("app.clear");
		const exit = this.getAppKeyDisplay("app.exit");
		const suspend = this.getAppKeyDisplay("app.suspend");
		const cycleThinkingLevel = this.getAppKeyDisplay("app.thinking.cycle");
		const cycleModelForward = this.getAppKeyDisplay("app.model.cycleForward");
		const selectModel = this.getAppKeyDisplay("app.model.select");
		const expandTools = this.getAppKeyDisplay("app.tools.expand");
		const toggleThinking = this.getAppKeyDisplay("app.thinking.toggle");
		const externalEditor = this.getAppKeyDisplay("app.editor.external");
		const cycleModelBackward = this.getAppKeyDisplay("app.model.cycleBackward");
		const followUp = this.getAppKeyDisplay("app.message.followUp");
		const dequeue = this.getAppKeyDisplay("app.message.dequeue");
		const pasteImage = this.getAppKeyDisplay("app.clipboard.pasteImage");

		let hotkeys = `
**${TUI_COPY.hotkeys.navigation}**
| ${TUI_COPY.hotkeys.key} | ${TUI_COPY.hotkeys.action} |
|-----|--------|
| \`${cursorUp}\` / \`${cursorDown}\` / \`${cursorLeft}\` / \`${cursorRight}\` | ${TUI_COPY.hotkeys.moveCursor} |
| \`${cursorWordLeft}\` / \`${cursorWordRight}\` | ${TUI_COPY.hotkeys.moveByWord} |
| \`${cursorLineStart}\` | ${TUI_COPY.hotkeys.lineStart} |
| \`${cursorLineEnd}\` | ${TUI_COPY.hotkeys.lineEnd} |
| \`${jumpForward}\` | ${TUI_COPY.hotkeys.jumpForward} |
| \`${jumpBackward}\` | ${TUI_COPY.hotkeys.jumpBackward} |
| \`${pageUp}\` / \`${pageDown}\` | ${TUI_COPY.hotkeys.scrollPage} |

**${TUI_COPY.hotkeys.editing}**
| ${TUI_COPY.hotkeys.key} | ${TUI_COPY.hotkeys.action} |
|-----|--------|
| \`${submit}\` | ${TUI_COPY.hotkeys.sendMessage} |
| \`${newLine}\` | ${process.platform === "win32" ? TUI_COPY.hotkeys.newLineWindowsTerminal : TUI_COPY.hotkeys.newLine} |
| \`${deleteWordBackward}\` | ${TUI_COPY.hotkeys.deleteWordBackward} |
| \`${deleteWordForward}\` | ${TUI_COPY.hotkeys.deleteWordForward} |
| \`${deleteToLineStart}\` | ${TUI_COPY.hotkeys.deleteToLineStart} |
| \`${deleteToLineEnd}\` | ${TUI_COPY.hotkeys.deleteToLineEnd} |
| \`${yank}\` | ${TUI_COPY.hotkeys.yank} |
| \`${yankPop}\` | ${TUI_COPY.hotkeys.yankPop} |
| \`${undo}\` | ${TUI_COPY.hotkeys.undo} |

**${TUI_COPY.hotkeys.other}**
| ${TUI_COPY.hotkeys.key} | ${TUI_COPY.hotkeys.action} |
|-----|--------|
| \`${tab}\` | ${TUI_COPY.hotkeys.pathCompletion} |
| \`${interrupt}\` | ${TUI_COPY.hotkeys.cancelAutocomplete} |
| \`${clear}\` | ${TUI_COPY.hotkeys.clearOrExit} |
| \`${exit}\` | ${TUI_COPY.hotkeys.exitWhenEmpty} |
| \`${suspend}\` | ${TUI_COPY.hotkeys.suspend} |
| \`${cycleThinkingLevel}\` | ${TUI_COPY.hotkeys.cycleThinking} |
| \`${cycleModelForward}\` / \`${cycleModelBackward}\` | ${TUI_COPY.hotkeys.cycleModels} |
| \`${selectModel}\` | ${TUI_COPY.hotkeys.openModelSelector} |
| \`${expandTools}\` | ${TUI_COPY.hotkeys.toggleToolExpansion} |
| \`${toggleThinking}\` | ${TUI_COPY.hotkeys.toggleThinking} |
| \`${externalEditor}\` | ${TUI_COPY.hotkeys.openExternalEditor} |
| \`${followUp}\` | ${TUI_COPY.hotkeys.queueFollowUp} |
| \`${dequeue}\` | ${TUI_COPY.hotkeys.restoreQueued} |
| \`${pasteImage}\` | ${TUI_COPY.hotkeys.pasteImage} |
| \`/\` | ${TUI_COPY.hotkeys.slashCommands} |
| \`!\` | ${TUI_COPY.hotkeys.runBash} |
| \`!!\` | ${TUI_COPY.hotkeys.runBashExcluded} |
`;

		// Add extension-registered shortcuts
		const extensionRunner = this.session.extensionRunner;
		const shortcuts = extensionRunner.getShortcuts(this.keybindings.getEffectiveConfig());
		if (shortcuts.size > 0) {
			hotkeys += `
**${TUI_COPY.hotkeys.extensions}**
| ${TUI_COPY.hotkeys.key} | ${TUI_COPY.hotkeys.action} |
|-----|--------|
`;
			for (const [key, shortcut] of shortcuts) {
				const description = shortcut.description ?? shortcut.extensionPath;
				const keyDisplay = formatKeyText(key, { capitalize: true });
				hotkeys += `| \`${keyDisplay}\` | ${description} |\n`;
			}
		}

		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new DynamicBorder());
		this.chatContainer.addChild(new Text(theme.bold(theme.fg("accent", TUI_COPY.hotkeys.title)), 1, 0));
		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new Markdown(hotkeys.trim(), 1, 1, this.getMarkdownThemeWithSettings()));
		this.chatContainer.addChild(new DynamicBorder());
		this.requestRenderRespectingInput();
	}

	private async handleClearCommand(): Promise<void> {
		if (this.loadingAnimation) {
			this.loadingAnimation.stop();
			this.loadingAnimation = undefined;
		}
		this.renderWorkingArea();
		try {
			const result = await this.runtimeHost.newSession();
			if (result.cancelled) {
				return;
			}
			this.renderCurrentSessionState();
			this.chatContainer.addChild(new Spacer(1));
			this.chatContainer.addChild(new Text(`${theme.fg("accent", TUI_COPY.newSession.started)}`, 1, 1));
			this.ui.requestRender();
		} catch (error: unknown) {
			await this.handleFatalRuntimeError(TUI_COPY.interactiveNotices.fatalCreateSession, error);
		}
	}

	private async collectCompatibilityDiagnostics(): Promise<{
		packageAudits: Awaited<ReturnType<DefaultPackageManager["auditConfiguredCompatibility"]>>;
		extensionErrors: Array<{ path: string; error: string }>;
		skillDiagnostics: ResourceDiagnostic[];
	}> {
		const packageManager = new DefaultPackageManager({
			cwd: this.sessionManager.getCwd(),
			agentDir: getAgentDir(),
			settingsManager: this.settingsManager,
		});

		return {
			packageAudits: await packageManager.auditConfiguredCompatibility(),
			extensionErrors: this.session.resourceLoader.getExtensions().errors,
			skillDiagnostics: this.session.resourceLoader.getSkills().diagnostics,
		};
	}

	private getCompatibilityIssueCounts(diagnostics: {
		packageAudits: Array<{
			status: "direct" | "light-adapt" | "needs-ai-review";
		}>;
		extensionErrors: Array<{ path: string; error: string }>;
		skillDiagnostics: ResourceDiagnostic[];
	}): {
		riskyPackageCount: number;
		extensionIssueCount: number;
		skillIssueCount: number;
	} {
		return {
			riskyPackageCount: diagnostics.packageAudits.filter((audit) => audit.status !== "direct").length,
			extensionIssueCount: diagnostics.extensionErrors.length,
			skillIssueCount: diagnostics.skillDiagnostics.length,
		};
	}

	private formatCompatibilityDiagnostics(diagnostics: {
		packageAudits: Array<{
			source: string;
			status: "direct" | "light-adapt" | "needs-ai-review";
			reasons: string[];
		}>;
		extensionErrors: Array<{ path: string; error: string }>;
		skillDiagnostics: ResourceDiagnostic[];
	}): string[] {
		const lines: string[] = [];

		if (diagnostics.packageAudits.length > 0) {
			lines.push(theme.fg("accent", TUI_COPY.compatibilityView.packages));
			for (const audit of diagnostics.packageAudits) {
				lines.push(`  ${audit.source} (${audit.status})`);
				for (const reason of audit.reasons) {
					lines.push(`    - ${reason}`);
				}
				if (audit.status !== "direct") {
					lines.push(TUI_COPY.compatibilityView.removeHint(APP_NAME, audit.source));
				}
			}
			lines.push("");
		}

		if (diagnostics.extensionErrors.length > 0) {
			lines.push(theme.fg("warning", TUI_COPY.compatibilityView.extensions));
			for (const error of diagnostics.extensionErrors) {
				lines.push(`  ${this.formatDisplayPath(error.path)}`);
				lines.push(`    - ${error.error}`);
			}
			lines.push("");
		}

		if (diagnostics.skillDiagnostics.length > 0) {
			lines.push(theme.fg("warning", TUI_COPY.compatibilityView.skills));
			for (const diagnostic of diagnostics.skillDiagnostics) {
				if (diagnostic.path) {
					lines.push(`  ${this.formatDisplayPath(diagnostic.path)}`);
				}
				lines.push(`    - ${diagnostic.message}`);
			}
			lines.push("");
		}

		if (lines.length === 0) {
			lines.push(theme.fg("accent", TUI_COPY.compatibilityView.ok));
			lines.push(TUI_COPY.compatibilityView.okBody);
			return lines;
		}

		lines.push(theme.fg("dim", TUI_COPY.compatibilityView.next));
		lines.push(TUI_COPY.compatibilityView.nextFix);
		lines.push(TUI_COPY.compatibilityView.nextReload);
		lines.push(TUI_COPY.compatibilityView.nextRemove);
		return lines;
	}

	private async showCompatibilityReminderIfNeeded(
		compatibilityReevaluation?: PackageCompatibilityReevaluationResult,
	): Promise<void> {
		const diagnostics = await this.collectCompatibilityDiagnostics();
		const counts = this.getCompatibilityIssueCounts(diagnostics);
		const notice = formatStartupCompatibilityNotice({
			reevaluation: compatibilityReevaluation,
			riskyPackageCount: counts.riskyPackageCount,
			extensionIssueCount: counts.extensionIssueCount,
			skillIssueCount: counts.skillIssueCount,
		});

		if (!notice) {
			return;
		}

		if (notice.level === "warning") {
			this.showWarning(notice.message);
			return;
		}

		this.showTaskbarNotice(notice.message);
	}

	private async handleCompatibilityCommand(): Promise<void> {
		const diagnostics = await this.collectCompatibilityDiagnostics();
		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new Text(this.formatCompatibilityDiagnostics(diagnostics).join("\n"), 0, 0));
		this.requestRenderRespectingInput();
	}

	private handleDebugCommand(): void {
		const width = this.ui.terminal.columns;
		const height = this.ui.terminal.rows;
		const allLines = this.ui.render(width);

		const debugLogPath = getDebugLogPath();
		const debugData = [
			`Debug output at ${new Date().toISOString()}`,
			`Terminal: ${width}x${height}`,
			`Total lines: ${allLines.length}`,
			"",
			"=== All rendered lines with visible widths ===",
			...allLines.map((line, idx) => {
				const vw = visibleWidth(line);
				const escaped = JSON.stringify(line);
				return `[${idx}] (w=${vw}) ${escaped}`;
			}),
			"",
			"=== Agent messages (JSONL) ===",
			...this.session.messages.map((msg) => JSON.stringify(msg)),
			"",
		].join("\n");

		fs.mkdirSync(path.dirname(debugLogPath), { recursive: true });
		fs.writeFileSync(debugLogPath, debugData);

		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(
			new Text(`${theme.fg("accent", "✓ Debug log written")}\n${theme.fg("muted", debugLogPath)}`, 1, 1),
		);
		this.ui.requestRender();
	}

	private handleArminSaysHi(): void {
		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new ArminComponent(this.ui));
		this.ui.requestRender();
	}

	private handleDementedDelves(): void {
		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new EarendilAnnouncementComponent());
		this.ui.requestRender();
	}

	private handleDaxnuts(): void {
		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new DaxnutsComponent(this.ui));
		this.ui.requestRender();
	}

	private checkDaxnutsEasterEgg(model: { provider: string; id: string }): void {
		if (model.provider === "opencode" && model.id.toLowerCase().includes("kimi-k2.5")) {
			this.handleDaxnuts();
		}
	}

	private async handleBashCommand(command: string, excludeFromContext = false): Promise<void> {
		const extensionRunner = this.session.extensionRunner;

		// Emit user_bash event to let extensions intercept
		const eventResult = await extensionRunner.emitUserBash({
			type: "user_bash",
			command,
			excludeFromContext,
			cwd: this.sessionManager.getCwd(),
		});

		// If extension returned a full result, use it directly
		if (eventResult?.result) {
			const result = eventResult.result;

			// Create UI component for display
			this.bashComponent = new BashExecutionComponent(command, this.ui, excludeFromContext);
			if (this.session.isStreaming) {
				this.pendingBashComponents.push(this.bashComponent);
				this.updatePendingMessagesDisplay();
			} else {
				this.chatContainer.addChild(this.bashComponent);
			}

			// Show output and complete
			if (result.output) {
				this.bashComponent.appendOutput(result.output);
			}
			this.bashComponent.setComplete(
				result.exitCode,
				result.cancelled,
				result.truncated ? ({ truncated: true, content: result.output } as TruncationResult) : undefined,
				result.fullOutputPath,
			);

			// Record the result in session
			this.session.recordBashResult(command, result, { excludeFromContext });
			this.bashComponent = undefined;
			this.requestRenderUnlessInputSuppressed();
			return;
		}

		// Normal execution path (possibly with custom operations)
		const isDeferred = this.session.isStreaming;
		this.bashComponent = new BashExecutionComponent(command, this.ui, excludeFromContext);

		if (isDeferred) {
			// Show in pending area when agent is streaming
			this.pendingBashComponents.push(this.bashComponent);
			this.updatePendingMessagesDisplay();
		} else {
			// Show in chat immediately when agent is idle
			this.chatContainer.addChild(this.bashComponent);
		}
		this.requestRenderUnlessInputSuppressed();

		try {
			const result = await this.session.executeBash(
				command,
				(chunk) => {
					if (this.bashComponent) {
						this.bashComponent.appendOutput(chunk);
						this.requestRenderUnlessInputSuppressed();
					}
				},
				{ excludeFromContext, operations: eventResult?.operations },
			);

			if (this.bashComponent) {
				this.bashComponent.setComplete(
					result.exitCode,
					result.cancelled,
					result.truncated ? ({ truncated: true, content: result.output } as TruncationResult) : undefined,
					result.fullOutputPath,
				);
			}
		} catch (error) {
			if (this.bashComponent) {
				this.bashComponent.setComplete(undefined, false);
			}
			this.showError(
				TUI_COPY.interactiveNotices.bashExecutionFailed(error instanceof Error ? error.message : "Unknown error"),
			);
		}

		this.bashComponent = undefined;
		this.requestRenderUnlessInputSuppressed();
	}

	private async handleCompactCommand(customInstructions?: string): Promise<void> {
		const entries = this.sessionManager.getEntries();
		const messageCount = entries.filter((e) => e.type === "message").length;

		if (messageCount < 2) {
			this.showWarning(TUI_COPY.interactiveNotices.noCompactionContent);
			return;
		}

		if (this.loadingAnimation) {
			this.loadingAnimation.stop();
			this.loadingAnimation = undefined;
		}
		this.renderWorkingArea();

		try {
			await this.session.compact(customInstructions);
		} catch {
			// Ignore, will be emitted as an event
		}
	}

	stop(): void {
		this.unregisterSignalHandlers();
		if (this.inputActivityResumeTimer) {
			clearTimeout(this.inputActivityResumeTimer);
			this.inputActivityResumeTimer = undefined;
		}
		this.inputActivitySuppressedUntil = 0;
		this.ui.shouldSuppressBackgroundRenderUpdates = undefined;
		if (this.inputActivityListenerCleanup) {
			this.inputActivityListenerCleanup();
			this.inputActivityListenerCleanup = undefined;
		}
		if (this.progressSurfaceRefreshTimer) {
			clearInterval(this.progressSurfaceRefreshTimer);
			this.progressSurfaceRefreshTimer = undefined;
		}
		this.terminalProgressActive = false;
		this.syncTerminalProgressIndicator();
		if (this.loadingAnimation) {
			this.loadingAnimation.stop();
			this.loadingAnimation = undefined;
		}
		this.clearExtensionTerminalInputListeners();
		this.footer.dispose();
		this.footerDataProvider.dispose();
		if (this.unsubscribe) {
			this.unsubscribe();
		}
		if (this.isInitialized) {
			this.ui.stop();
			this.isInitialized = false;
		}
	}
}
