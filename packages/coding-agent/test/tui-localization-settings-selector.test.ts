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
				autoCompactThresholdPercent: 95,
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
				toolDisplayMode: "expanded",
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
				onAutoCompactThresholdPercentChange: () => {},
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
				onToolDisplayModeChange: () => {},
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
		const items = (selector.getSettingsList() as any).items as Array<{ id: string; label: string }>;
		expect(output).toContain("自动压缩");
		expect(output).toContain("上下文过大时自动压缩");
		expect(output).toContain("压缩阈值占比");
		expect(output.indexOf("自动压缩")).toBeLessThan(output.indexOf("压缩阈值占比"));
		expect(items.some((item) => item.id === "hide-thinking" && item.label === "隐藏思考")).toBe(true);
		expect(items.some((item) => item.id === "tool-display-mode" && item.label === "工具折叠")).toBe(true);
		expect(output).toContain("自动缩放图片");
		expect(output).toContain("95%");
		expect(output).toContain("true");
		expect(output).toContain("false");
		expect(output).toContain("输入搜索 · Enter/Space 切换 · Esc 取消");
	});
});
