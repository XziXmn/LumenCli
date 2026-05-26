import { beforeAll, describe, expect, it } from "vitest";
import { SettingsSelectorComponent } from "../src/modes/interactive/components/settings-selector.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

describe("TUI settings selector localization", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("shows submenu helper copy and warning entry in Chinese", () => {
		const selector = new SettingsSelectorComponent(
			{
				autoCompact: true,
				showImages: true,
				imageWidthCells: 60,
				autoResizeImages: true,
				blockImages: false,
				enableSkillCommands: true,
				steeringMode: "one-at-a-time",
				followUpMode: "one-at-a-time",
				transport: "auto",
				thinkingLevel: "medium",
				availableThinkingLevels: ["off", "medium"],
				currentTheme: "dark",
				availableThemes: ["dark", "light"],
				hideThinkingBlock: false,
				collapseChangelog: false,
				enableInstallTelemetry: true,
				doubleEscapeAction: "tree",
				treeFilterMode: "default",
				showHardwareCursor: true,
				editorPaddingX: 0,
				autocompleteMaxVisible: 5,
				quietStartup: false,
				clearOnShrink: false,
				showTerminalProgress: false,
				warnings: {},
			},
			{
				onAutoCompactChange: () => {},
				onShowImagesChange: () => {},
				onImageWidthCellsChange: () => {},
				onAutoResizeImagesChange: () => {},
				onBlockImagesChange: () => {},
				onEnableSkillCommandsChange: () => {},
				onSteeringModeChange: () => {},
				onFollowUpModeChange: () => {},
				onTransportChange: () => {},
				onThinkingLevelChange: () => {},
				onThemeChange: () => {},
				onHideThinkingBlockChange: () => {},
				onCollapseChangelogChange: () => {},
				onEnableInstallTelemetryChange: () => {},
				onDoubleEscapeActionChange: () => {},
				onTreeFilterModeChange: () => {},
				onShowHardwareCursorChange: () => {},
				onEditorPaddingXChange: () => {},
				onAutocompleteMaxVisibleChange: () => {},
				onQuietStartupChange: () => {},
				onClearOnShrinkChange: () => {},
				onShowTerminalProgressChange: () => {},
				onWarningsChange: () => {},
				onCancel: () => {},
			},
		);

		const output = stripAnsi(selector.render(120).join("\n"));
		expect(output).toContain("自动压缩");
		expect(output).toContain("上下文过大时自动压缩");
		expect(output).toContain("输入搜索 · Enter/Space 切换 · Esc 取消");
	});
});
