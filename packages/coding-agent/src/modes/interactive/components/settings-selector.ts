import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Transport } from "@earendil-works/pi-ai";
import {
	Container,
	getCapabilities,
	type SelectItem,
	SelectList,
	type SelectListLayoutOptions,
	type SettingItem,
	SettingsList,
	Spacer,
	Text,
} from "@earendil-works/pi-tui";
import type { WarningSettings } from "../../../core/settings-manager.ts";
import { getSelectListTheme, getSettingsListTheme, theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { TUI_COPY } from "./interactive-strings.ts";
import { keyDisplayText } from "./keybinding-hints.ts";

const SETTINGS_SUBMENU_SELECT_LIST_LAYOUT: SelectListLayoutOptions = {
	minPrimaryColumnWidth: 12,
	maxPrimaryColumnWidth: 32,
};

const THINKING_DESCRIPTIONS: Record<ThinkingLevel, string> = TUI_COPY.settingsSelector.thinkingLevelDescriptions;

export interface SettingsConfig {
	autoCompact: boolean;
	autoCompactThresholdPercent: number | undefined;
	showImages: boolean;
	imageWidthCells: number;
	autoResizeImages: boolean;
	blockImages: boolean;
	enableSkillCommands: boolean;
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	transport: Transport;
	thinkingLevel: ThinkingLevel;
	availableThinkingLevels: ThinkingLevel[];
	currentTheme: string;
	availableThemes: string[];
	hideThinkingBlock: boolean;
	toolDisplayMode: "collapsed" | "expanded";
	collapseChangelog: boolean;
	enableInstallTelemetry: boolean;
	doubleEscapeAction: "fork" | "tree" | "none";
	treeFilterMode: "default" | "no-tools" | "user-only" | "labeled-only" | "all";
	showHardwareCursor: boolean;
	editorPaddingX: number;
	autocompleteMaxVisible: number;
	quietStartup: boolean;
	clearOnShrink: boolean;
	showTerminalProgress: boolean;
	warnings: WarningSettings;
}

export interface SettingsCallbacks {
	onAutoCompactChange: (enabled: boolean) => void;
	onAutoCompactThresholdPercentChange: (percent: number | undefined) => void;
	onShowImagesChange: (enabled: boolean) => void;
	onImageWidthCellsChange: (width: number) => void;
	onAutoResizeImagesChange: (enabled: boolean) => void;
	onBlockImagesChange: (blocked: boolean) => void;
	onEnableSkillCommandsChange: (enabled: boolean) => void;
	onSteeringModeChange: (mode: "all" | "one-at-a-time") => void;
	onFollowUpModeChange: (mode: "all" | "one-at-a-time") => void;
	onTransportChange: (transport: Transport) => void;
	onThinkingLevelChange: (level: ThinkingLevel) => void;
	onThemeChange: (theme: string) => void;
	onThemePreview?: (theme: string) => void;
	onHideThinkingBlockChange: (hidden: boolean) => void;
	onToolDisplayModeChange: (mode: "collapsed" | "expanded") => void;
	onCollapseChangelogChange: (collapsed: boolean) => void;
	onEnableInstallTelemetryChange: (enabled: boolean) => void;
	onDoubleEscapeActionChange: (action: "fork" | "tree" | "none") => void;
	onTreeFilterModeChange: (mode: "default" | "no-tools" | "user-only" | "labeled-only" | "all") => void;
	onShowHardwareCursorChange: (enabled: boolean) => void;
	onEditorPaddingXChange: (padding: number) => void;
	onAutocompleteMaxVisibleChange: (maxVisible: number) => void;
	onQuietStartupChange: (enabled: boolean) => void;
	onClearOnShrinkChange: (enabled: boolean) => void;
	onShowTerminalProgressChange: (enabled: boolean) => void;
	onWarningsChange: (warnings: WarningSettings) => void;
	onCancel: () => void;
}

/**
 * A submenu component for selecting from a list of options.
 */
class WarningSettingsSubmenu extends Container {
	private settingsList: SettingsList;
	private state: WarningSettings;

	constructor(warnings: WarningSettings, onChange: (warnings: WarningSettings) => void, onCancel: () => void) {
		super();

		this.state = { ...warnings };

		const items: SettingItem[] = [
			{
				id: "anthropic-extra-usage",
				label: TUI_COPY.settingsSelector.anthropicExtraUsageLabel,
				description: TUI_COPY.settingsSelector.anthropicExtraUsageDescription,
				currentValue: (this.state.anthropicExtraUsage ?? true) ? "true" : "false",
				values: ["true", "false"],
			},
		];

		this.settingsList = new SettingsList(
			items,
			Math.min(items.length, 10),
			getSettingsListTheme(),
			(id, newValue) => {
				switch (id) {
					case "anthropic-extra-usage":
						this.state = { ...this.state, anthropicExtraUsage: newValue === "true" };
						onChange({ ...this.state });
						break;
				}
			},
			onCancel,
		);

		this.addChild(this.settingsList);
	}

	handleInput(data: string): void {
		this.settingsList.handleInput(data);
	}
}

class SelectSubmenu extends Container {
	private selectList: SelectList;

	constructor(
		title: string,
		description: string,
		options: SelectItem[],
		currentValue: string,
		onSelect: (value: string) => void,
		onCancel: () => void,
		onSelectionChange?: (value: string) => void,
	) {
		super();

		// Title
		this.addChild(new Text(theme.bold(theme.fg("accent", title)), 0, 0));

		// Description
		if (description) {
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.fg("muted", description), 0, 0));
		}

		// Spacer
		this.addChild(new Spacer(1));

		// Select list
		this.selectList = new SelectList(
			options,
			Math.min(options.length, 10),
			getSelectListTheme(),
			SETTINGS_SUBMENU_SELECT_LIST_LAYOUT,
		);

		// Pre-select current value
		const currentIndex = options.findIndex((o) => o.value === currentValue);
		if (currentIndex !== -1) {
			this.selectList.setSelectedIndex(currentIndex);
		}

		this.selectList.onSelect = (item) => {
			onSelect(item.value);
		};

		this.selectList.onCancel = onCancel;

		if (onSelectionChange) {
			this.selectList.onSelectionChange = (item) => {
				onSelectionChange(item.value);
			};
		}

		this.addChild(this.selectList);

		// Hint
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(
				theme.fg(
					"dim",
					`  Enter ${TUI_COPY.settingsSelector.submenuConfirm} · Esc ${TUI_COPY.settingsSelector.submenuCancel}`,
				),
				0,
				0,
			),
		);
	}

	handleInput(data: string): void {
		this.selectList.handleInput(data);
	}
}

/**
 * Main settings selector component.
 */
export class SettingsSelectorComponent extends Container {
	private settingsList: SettingsList;

	constructor(config: SettingsConfig, callbacks: SettingsCallbacks) {
		super();

		const supportsImages = getCapabilities().images;
		const followUpKey = keyDisplayText("app.message.followUp");
		let currentWarnings = { ...config.warnings };

		const items: SettingItem[] = [
			{
				id: "autocompact",
				label: TUI_COPY.settingsSelector.autoCompactLabel,
				description: TUI_COPY.settingsSelector.autoCompactDescription,
				currentValue: config.autoCompact ? "true" : "false",
				values: ["true", "false"],
			},
			{
				id: "autocompact-threshold-percent",
				label: TUI_COPY.settingsSelector.autoCompactThresholdLabel,
				description: TUI_COPY.settingsSelector.autoCompactThresholdDescription,
				currentValue: config.autoCompactThresholdPercent
					? `${config.autoCompactThresholdPercent}%`
					: TUI_COPY.settingsSelector.autoCompactThresholdOff,
				values: [...TUI_COPY.settingsSelector.autoCompactThresholdOptions],
			},
			{
				id: "steering-mode",
				label: TUI_COPY.settingsSelector.steeringModeLabel,
				description: TUI_COPY.settingsSelector.steeringModeDescription,
				currentValue: config.steeringMode,
				values: ["one-at-a-time", "all"],
			},
			{
				id: "follow-up-mode",
				label: TUI_COPY.settingsSelector.followUpModeLabel,
				description: TUI_COPY.settingsSelector.followUpModeDescription(followUpKey),
				currentValue: config.followUpMode,
				values: ["one-at-a-time", "all"],
			},
			{
				id: "transport",
				label: TUI_COPY.settingsSelector.transportLabel,
				description: TUI_COPY.settingsSelector.transportDescription,
				currentValue: config.transport,
				values: ["sse", "websocket", "websocket-cached", "auto"],
			},
			{
				id: "hide-thinking",
				label: TUI_COPY.settingsSelector.hideThinkingLabel,
				description: TUI_COPY.settingsSelector.hideThinkingDescription,
				currentValue: config.hideThinkingBlock ? "true" : "false",
				values: ["true", "false"],
			},
			{
				id: "tool-display-mode",
				label: TUI_COPY.settingsSelector.toolDisplayModeLabel,
				description: TUI_COPY.settingsSelector.toolDisplayModeDescription,
				currentValue: config.toolDisplayMode === "collapsed" ? "true" : "false",
				values: ["true", "false"],
			},
			{
				id: "collapse-changelog",
				label: TUI_COPY.settingsSelector.collapseChangelogLabel,
				description: TUI_COPY.settingsSelector.collapseChangelogDescription,
				currentValue: config.collapseChangelog ? "true" : "false",
				values: ["true", "false"],
			},
			{
				id: "quiet-startup",
				label: TUI_COPY.settingsSelector.quietStartupLabel,
				description: TUI_COPY.settingsSelector.quietStartupDescription,
				currentValue: config.quietStartup ? "true" : "false",
				values: ["true", "false"],
			},
			{
				id: "install-telemetry",
				label: TUI_COPY.settingsSelector.installTelemetryLabel,
				description: TUI_COPY.settingsSelector.installTelemetryDescription,
				currentValue: config.enableInstallTelemetry ? "true" : "false",
				values: ["true", "false"],
			},
			{
				id: "double-escape-action",
				label: TUI_COPY.settingsSelector.doubleEscapeActionLabel,
				description: TUI_COPY.settingsSelector.doubleEscapeActionDescription,
				currentValue: config.doubleEscapeAction,
				values: ["tree", "fork", "none"],
			},
			{
				id: "tree-filter-mode",
				label: TUI_COPY.settingsSelector.treeFilterModeLabel,
				description: TUI_COPY.settingsSelector.treeFilterModeDescription,
				currentValue: config.treeFilterMode,
				values: ["default", "no-tools", "user-only", "labeled-only", "all"],
			},
			{
				id: "warnings",
				label: TUI_COPY.settingsSelector.warningsLabel,
				description: TUI_COPY.settingsSelector.warningsDescription,
				currentValue: TUI_COPY.settingsSelector.warningsConfigure,
				submenu: (_currentValue, done) =>
					new WarningSettingsSubmenu(
						currentWarnings,
						(warnings) => {
							currentWarnings = warnings;
							callbacks.onWarningsChange(warnings);
						},
						() => done(),
					),
			},
			{
				id: "thinking",
				label: TUI_COPY.settingsSelector.thinkingLabel,
				description: TUI_COPY.settingsSelector.thinkingLabelDescription,
				currentValue: config.thinkingLevel,
				submenu: (_currentValue, done) =>
					new SelectSubmenu(
						TUI_COPY.settingsSelector.thinkingTitle,
						TUI_COPY.settingsSelector.thinkingDescription,
						config.availableThinkingLevels.map((level) => ({
							value: level,
							label: level,
							description: THINKING_DESCRIPTIONS[level],
						})),
						config.thinkingLevel,
						(value) => {
							callbacks.onThinkingLevelChange(value as ThinkingLevel);
							done(value);
						},
						() => done(),
					),
			},
			{
				id: "theme",
				label: TUI_COPY.settingsSelector.themeLabel,
				description: TUI_COPY.settingsSelector.themeLabelDescription,
				currentValue: config.currentTheme,
				submenu: (currentValue, done) =>
					new SelectSubmenu(
						TUI_COPY.settingsSelector.themeTitle,
						TUI_COPY.settingsSelector.themeDescription,
						config.availableThemes.map((t) => ({
							value: t,
							label: t,
						})),
						currentValue,
						(value) => {
							callbacks.onThemeChange(value);
							done(value);
						},
						() => {
							// Restore original theme on cancel
							callbacks.onThemePreview?.(currentValue);
							done();
						},
						(value) => {
							// Preview theme on selection change
							callbacks.onThemePreview?.(value);
						},
					),
			},
		];

		// Only show image toggle if terminal supports it
		if (supportsImages) {
			// Insert after autocompact
			items.splice(1, 0, {
				id: "show-images",
				label: TUI_COPY.settingsSelector.showImagesLabel,
				description: TUI_COPY.settingsSelector.showImagesDescription,
				currentValue: config.showImages ? "true" : "false",
				values: ["true", "false"],
			});
			items.splice(2, 0, {
				id: "image-width-cells",
				label: TUI_COPY.settingsSelector.imageWidthLabel,
				description: TUI_COPY.settingsSelector.imageWidthDescription,
				currentValue: String(config.imageWidthCells),
				values: ["60", "80", "120"],
			});
		}

		// Image auto-resize toggle (always available, affects both attached and read images)
		items.splice(supportsImages ? 3 : 1, 0, {
			id: "auto-resize-images",
			label: TUI_COPY.settingsSelector.autoResizeImagesLabel,
			description: TUI_COPY.settingsSelector.autoResizeImagesDescription,
			currentValue: config.autoResizeImages ? "true" : "false",
			values: ["true", "false"],
		});

		// Block images toggle (always available, insert after auto-resize-images)
		const autoResizeIndex = items.findIndex((item) => item.id === "auto-resize-images");
		items.splice(autoResizeIndex + 1, 0, {
			id: "block-images",
			label: TUI_COPY.settingsSelector.blockImagesLabel,
			description: TUI_COPY.settingsSelector.blockImagesDescription,
			currentValue: config.blockImages ? "true" : "false",
			values: ["true", "false"],
		});

		// Skill commands toggle (insert after block-images)
		const blockImagesIndex = items.findIndex((item) => item.id === "block-images");
		items.splice(blockImagesIndex + 1, 0, {
			id: "skill-commands",
			label: TUI_COPY.settingsSelector.skillCommandsLabel,
			description: TUI_COPY.settingsSelector.skillCommandsDescription,
			currentValue: config.enableSkillCommands ? "true" : "false",
			values: ["true", "false"],
		});

		// Keep the auto-compaction threshold directly below the auto-compaction toggle.
		const autoCompactIndex = items.findIndex((item) => item.id === "autocompact");
		const autoCompactThresholdIndex = items.findIndex((item) => item.id === "autocompact-threshold-percent");
		if (
			autoCompactIndex !== -1 &&
			autoCompactThresholdIndex !== -1 &&
			autoCompactThresholdIndex !== autoCompactIndex + 1
		) {
			const [thresholdItem] = items.splice(autoCompactThresholdIndex, 1);
			items.splice(autoCompactIndex + 1, 0, thresholdItem);
		}

		// Hardware cursor toggle (insert after skill-commands)
		const skillCommandsIndex = items.findIndex((item) => item.id === "skill-commands");
		items.splice(skillCommandsIndex + 1, 0, {
			id: "show-hardware-cursor",
			label: TUI_COPY.settingsSelector.hardwareCursorLabel,
			description: TUI_COPY.settingsSelector.hardwareCursorDescription,
			currentValue: config.showHardwareCursor ? "true" : "false",
			values: ["true", "false"],
		});

		// Editor padding toggle (insert after show-hardware-cursor)
		const hardwareCursorIndex = items.findIndex((item) => item.id === "show-hardware-cursor");
		items.splice(hardwareCursorIndex + 1, 0, {
			id: "editor-padding",
			label: TUI_COPY.settingsSelector.editorPaddingLabel,
			description: TUI_COPY.settingsSelector.editorPaddingDescription,
			currentValue: String(config.editorPaddingX),
			values: ["0", "1", "2", "3"],
		});

		// Autocomplete max visible toggle (insert after editor-padding)
		const editorPaddingIndex = items.findIndex((item) => item.id === "editor-padding");
		items.splice(editorPaddingIndex + 1, 0, {
			id: "autocomplete-max-visible",
			label: TUI_COPY.settingsSelector.autocompleteMaxVisibleLabel,
			description: TUI_COPY.settingsSelector.autocompleteMaxVisibleDescription,
			currentValue: String(config.autocompleteMaxVisible),
			values: ["3", "5", "7", "10", "15", "20"],
		});

		// Clear on shrink toggle (insert after autocomplete-max-visible)
		const autocompleteIndex = items.findIndex((item) => item.id === "autocomplete-max-visible");
		items.splice(autocompleteIndex + 1, 0, {
			id: "clear-on-shrink",
			label: TUI_COPY.settingsSelector.clearOnShrinkLabel,
			description: TUI_COPY.settingsSelector.clearOnShrinkDescription,
			currentValue: config.clearOnShrink ? "true" : "false",
			values: ["true", "false"],
		});

		// Terminal progress toggle (insert after clear-on-shrink)
		const clearOnShrinkIndex = items.findIndex((item) => item.id === "clear-on-shrink");
		items.splice(clearOnShrinkIndex + 1, 0, {
			id: "terminal-progress",
			label: TUI_COPY.settingsSelector.terminalProgressLabel,
			description: TUI_COPY.settingsSelector.terminalProgressDescription,
			currentValue: config.showTerminalProgress ? "true" : "false",
			values: ["true", "false"],
		});

		// Add borders
		this.addChild(new DynamicBorder());

		this.settingsList = new SettingsList(
			items,
			10,
			getSettingsListTheme(),
			(id, newValue) => {
				switch (id) {
					case "autocompact":
						callbacks.onAutoCompactChange(newValue === "true");
						break;
					case "autocompact-threshold-percent":
						callbacks.onAutoCompactThresholdPercentChange(
							newValue === TUI_COPY.settingsSelector.autoCompactThresholdOff
								? undefined
								: parseInt(newValue.replace("%", ""), 10),
						);
						break;
					case "show-images":
						callbacks.onShowImagesChange(newValue === "true");
						break;
					case "image-width-cells":
						callbacks.onImageWidthCellsChange(parseInt(newValue, 10));
						break;
					case "auto-resize-images":
						callbacks.onAutoResizeImagesChange(newValue === "true");
						break;
					case "block-images":
						callbacks.onBlockImagesChange(newValue === "true");
						break;
					case "skill-commands":
						callbacks.onEnableSkillCommandsChange(newValue === "true");
						break;
					case "steering-mode":
						callbacks.onSteeringModeChange(newValue as "all" | "one-at-a-time");
						break;
					case "follow-up-mode":
						callbacks.onFollowUpModeChange(newValue as "all" | "one-at-a-time");
						break;
					case "transport":
						callbacks.onTransportChange(newValue as Transport);
						break;
					case "hide-thinking":
						callbacks.onHideThinkingBlockChange(newValue === "true");
						break;
					case "tool-display-mode":
						callbacks.onToolDisplayModeChange(newValue === "true" ? "collapsed" : "expanded");
						break;
					case "collapse-changelog":
						callbacks.onCollapseChangelogChange(newValue === "true");
						break;
					case "quiet-startup":
						callbacks.onQuietStartupChange(newValue === "true");
						break;
					case "install-telemetry":
						callbacks.onEnableInstallTelemetryChange(newValue === "true");
						break;
					case "double-escape-action":
						callbacks.onDoubleEscapeActionChange(newValue as "fork" | "tree" | "none");
						break;
					case "tree-filter-mode":
						callbacks.onTreeFilterModeChange(
							newValue as "default" | "no-tools" | "user-only" | "labeled-only" | "all",
						);
						break;
					case "show-hardware-cursor":
						callbacks.onShowHardwareCursorChange(newValue === "true");
						break;
					case "editor-padding":
						callbacks.onEditorPaddingXChange(parseInt(newValue, 10));
						break;
					case "autocomplete-max-visible":
						callbacks.onAutocompleteMaxVisibleChange(parseInt(newValue, 10));
						break;
					case "clear-on-shrink":
						callbacks.onClearOnShrinkChange(newValue === "true");
						break;
					case "terminal-progress":
						callbacks.onShowTerminalProgressChange(newValue === "true");
						break;
				}
			},
			callbacks.onCancel,
			{ enableSearch: true },
		);

		this.addChild(this.settingsList);
		this.addChild(new DynamicBorder());
	}

	getSettingsList(): SettingsList {
		return this.settingsList;
	}
}
