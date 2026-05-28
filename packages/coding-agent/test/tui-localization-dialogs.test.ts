import { setKeybindings, TUI } from "@earendil-works/pi-tui";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import type { SessionTreeNode } from "../src/core/session-manager.ts";
import { LoginDialogComponent } from "../src/modes/interactive/components/login-dialog.ts";
import { SettingsSelectorComponent } from "../src/modes/interactive/components/settings-selector.ts";
import { TreeSelectorComponent } from "../src/modes/interactive/components/tree-selector.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

function makeTree(): SessionTreeNode[] {
	return [
		{
			entry: {
				type: "message",
				id: "user-1",
				parentId: null,
				timestamp: new Date().toISOString(),
				message: { role: "user", content: "hello", timestamp: Date.now() },
			},
			children: [],
		},
	];
}

describe("TUI dialog localization", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	beforeEach(() => {
		setKeybindings(new KeybindingsManager());
	});

	it("shows login dialog labels in Chinese", () => {
		const tui = new TUI(new VirtualTerminal(80, 20));
		const dialog = new LoginDialogComponent(tui, "anthropic", () => {}, "Anthropic");
		dialog.showPrompt("请输入 API 密钥：", "sk-ant-...");

		const output = stripAnsi(dialog.render(80).join("\n"));
		expect(output).toContain("登录 Anthropic");
		expect(output).toContain("例如：sk-ant-...");
		expect(output).toContain("取消");
		expect(output).toContain("提交");
		expect(output).not.toContain("Login to Anthropic");
		expect(output).not.toContain("to submit");
	});

	it("shows tree selector title and search hint in Chinese", () => {
		const selector = new TreeSelectorComponent(
			makeTree(),
			"user-1",
			24,
			() => {},
			() => {},
		);
		const output = stripAnsi(selector.render(120).join("\n"));

		expect(output).toContain("会话树");
		expect(output).toContain("输入即可搜索：");
		expect(output).toContain("用户：");
		expect(output).not.toContain("Session Tree");
		expect(output).not.toContain("Type to search:");
	});

	it("renders tree selector secondary labels with Chinese copy", () => {
		const selector = new TreeSelectorComponent(
			[
				{
					entry: {
						type: "custom_message",
						id: "custom-1",
						parentId: null,
						timestamp: new Date().toISOString(),
						customType: "note",
						content: "hello",
						display: true,
					},
					children: [],
				},
			],
			"custom-1",
			24,
			() => {},
			() => {},
		);
		const output = stripAnsi(selector.render(120).join("\n"));

		expect(output).toContain("[note]：");
		expect(output).not.toContain("[note]:");
	});

	it("keeps tree selector tool names in English", () => {
		const selector = new TreeSelectorComponent(
			[
				{
					entry: {
						type: "message",
						id: "assistant-1",
						parentId: null,
						timestamp: new Date().toISOString(),
						message: {
							role: "assistant",
							content: [{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "README.md" } }],
							api: "openai-responses",
							provider: "openai",
							model: "gpt-5",
							stopReason: "toolUse",
							timestamp: Date.now(),
							usage: {
								input: 0,
								output: 0,
								cacheRead: 0,
								cacheWrite: 0,
								totalTokens: 0,
								cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
							},
						},
					},
					children: [
						{
							entry: {
								type: "message",
								id: "tool-result-1",
								parentId: "assistant-1",
								timestamp: new Date().toISOString(),
								message: {
									role: "toolResult",
									toolCallId: "tool-1",
									toolName: "read",
									content: [{ type: "text", text: "hello" }],
									isError: false,
									timestamp: Date.now(),
								},
							},
							children: [],
						},
					],
				},
			],
			"tool-result-1",
			24,
			() => {},
			() => {},
		);
		const output = stripAnsi(selector.render(120).join("\n"));

		expect(output).toContain("[read: README.md]");
		expect(output).not.toContain("[读取：README.md]");
	});

	it("keeps settings submenu copy centralized in Chinese", () => {
		const selector = new SettingsSelectorComponent(
			{
				autoCompact: true,
				autoCompactThresholdPercent: 80,
				showImages: true,
				imageWidthCells: 60,
				autoResizeImages: true,
				blockImages: false,
				enableSkillCommands: true,
				steeringMode: "one-at-a-time",
				followUpMode: "one-at-a-time",
				transport: "auto",
				thinkingLevel: "medium",
				availableThinkingLevels: ["off", "minimal", "low", "medium", "high"],
				currentTheme: "dark",
				availableThemes: ["dark"],
				hideThinkingBlock: false,
				toolDisplayMode: "collapsed",
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
		expect(output).toContain("压缩阈值占比");
		expect(output).toContain("自动压缩");
		expect(output).toContain("自动缩放图片");
		expect(output).not.toContain("Theme");
		expect(output).not.toContain("Thinking level");
	});
});
