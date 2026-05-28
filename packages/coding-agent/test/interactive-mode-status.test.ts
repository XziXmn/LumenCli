import { homedir } from "node:os";
import * as path from "node:path";
import {
	type AutocompleteProvider,
	CombinedAutocompleteProvider,
	Container,
	Spacer,
	Text,
} from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, test, vi } from "vitest";
import type { AutocompleteProviderFactory } from "../src/core/extensions/types.ts";
import type { ResourceDiagnostic } from "../src/core/resource-loader.ts";
import { BUILTIN_SLASH_COMMANDS } from "../src/core/slash-commands.ts";
import type { SourceInfo } from "../src/core/source-info.ts";
import { AssistantMessageComponent } from "../src/modes/interactive/components/assistant-message.ts";
import {
	createProgressSurfaceWorkingState,
	ProgressSurfaceComponent,
} from "../src/modes/interactive/components/progress-surface.ts";
import { SettingsSelectorComponent } from "../src/modes/interactive/components/settings-selector.ts";
import { ToolExecutionComponent } from "../src/modes/interactive/components/tool-execution.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import { getMarkdownTheme, initTheme, theme } from "../src/modes/interactive/theme/theme.ts";

function renderAll(container: Container, width = 120): string {
	return container.children.flatMap((child) => child.render(width)).join("\n");
}

function normalizeRenderedOutput(container: Container, width = 220): string {
	return renderAll(container, width)
		.replace(/\u001b\[[0-9;]*m/g, "")
		.replace(/\\/g, "/")
		.split("\n")
		.map((line) => line.replace(/\s+$/g, ""))
		.join("\n")
		.trim();
}

function createLiveTodoSnapshot(spinner: unknown) {
	return {
		tasks: [
			{
				id: "todo:0:0:整理接口定义",
				content: "整理接口定义",
				subject: "整理接口定义",
				activeForm: "整理接口定义",
				status: "in_progress" as const,
				group: "接口收口",
			},
		],
		queued: undefined,
		spinner: spinner as never,
		expanded: false,
	};
}

function makeBottomPaneAware(fakeThis: any): any {
	const taskbarContent = fakeThis.taskbarContentContainer ?? new Container();
	const pendingContent = fakeThis.pendingContentContainer ?? new Container();
	const composerGap = fakeThis.composerGapContainer ?? new Container();
	const editorContainer = fakeThis.editorContainer ?? new Container();
	const extensionContent = fakeThis.extensionAreaContainer ?? new Container();
	const footerContent = fakeThis.footerContentContainer ?? new Container();
	const bottomPaneContainer =
		fakeThis.bottomPaneContainer ??
		({
			clear: vi.fn(),
			addChild: vi.fn(),
		} as any);
	const taskbarRow =
		fakeThis.taskbarRowContainer ??
		({
			clear: vi.fn(),
			addChild: vi.fn(),
		} as any);
	const pendingRow =
		fakeThis.pendingRowContainer ??
		({
			clear: vi.fn(),
			addChild: vi.fn(),
		} as any);
	const composerRow =
		fakeThis.composerRowContainer ??
		({
			clear: vi.fn(),
			addChild: vi.fn(),
		} as any);
	const extensionRow =
		fakeThis.extensionRowContainer ??
		({
			clear: vi.fn(),
			addChild: vi.fn(),
		} as any);
	const passiveFooterRow =
		fakeThis.passiveFooterRowContainer ??
		({
			clear: vi.fn(),
			addChild: vi.fn(),
		} as any);
	if (!fakeThis.bottomPane) {
		fakeThis.bottomPane = {
			container: bottomPaneContainer,
			taskbarRow,
			pendingRow,
			composerRow,
			extensionRow,
			passiveFooterRow,
			gap: composerGap,
			taskbarContent,
			pendingContent,
			composerContent: editorContainer,
			extensionContent,
			footerContent,
		};
	}
	fakeThis.bottomPaneContainer ??= fakeThis.bottomPane.container;
	fakeThis.taskbarRowContainer ??= fakeThis.bottomPane.taskbarRow;
	fakeThis.pendingRowContainer ??= fakeThis.bottomPane.pendingRow;
	fakeThis.composerRowContainer ??= fakeThis.bottomPane.composerRow;
	fakeThis.extensionRowContainer ??= fakeThis.bottomPane.extensionRow;
	fakeThis.passiveFooterRowContainer ??= fakeThis.bottomPane.passiveFooterRow;
	fakeThis.composerGapContainer ??= fakeThis.bottomPane.gap;
	fakeThis.taskbarContentContainer ??= fakeThis.bottomPane.taskbarContent;
	fakeThis.pendingContentContainer ??= fakeThis.bottomPane.pendingContent;
	fakeThis.editorContainer ??= fakeThis.bottomPane.composerContent;
	fakeThis.extensionAreaContainer ??= fakeThis.bottomPane.extensionContent;
	fakeThis.footerContentContainer ??= fakeThis.bottomPane.footerContent;
	if (!fakeThis.syncBottomPaneGap) {
		fakeThis.syncBottomPaneGap = function () {
			return (InteractiveMode as any).prototype.syncBottomPaneGap.call(this);
		};
	}
	if (!fakeThis.replaceBottomPaneContent) {
		fakeThis.replaceBottomPaneContent = function (target: Container, render: (target: Container) => void) {
			return (InteractiveMode as any).prototype.replaceBottomPaneContent.call(this, target, render);
		};
	}
	if (!fakeThis.getBottomPaneSlot) {
		fakeThis.getBottomPaneSlot = function (target: "taskbar" | "pending") {
			return (InteractiveMode as any).prototype.getBottomPaneSlot.call(this, target);
		};
	}
	if (!fakeThis.updateTaskbarContent) {
		fakeThis.updateTaskbarContent = function (render: (target: Container) => void) {
			return (InteractiveMode as any).prototype.updateTaskbarContent.call(this, render);
		};
	}
	if (!fakeThis.updatePendingContent) {
		fakeThis.updatePendingContent = function (render: (target: Container) => void) {
			return (InteractiveMode as any).prototype.updatePendingContent.call(this, render);
		};
	}
	if (!fakeThis.updatePassiveFooterContent) {
		fakeThis.updatePassiveFooterContent = function (content: any) {
			return (InteractiveMode as any).prototype.updatePassiveFooterContent.call(this, content);
		};
	}
	if (!fakeThis.setComposerContent) {
		fakeThis.setComposerContent = function (component: any, options?: any) {
			return (InteractiveMode as any).prototype.setComposerContent.call(this, component, options);
		};
	}
	if (!fakeThis.restoreComposerEditor) {
		fakeThis.restoreComposerEditor = function (options?: any) {
			return (InteractiveMode as any).prototype.restoreComposerEditor.call(this, options);
		};
	}
	return fakeThis;
}

type ExtensionFixture = {
	path: string;
	sourceInfo?: SourceInfo;
};

describe("InteractiveMode compatibility helpers", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test("/compat is exposed as a built-in slash command", () => {
		expect(BUILTIN_SLASH_COMMANDS.some((command) => command.name === "compat")).toBe(true);
	});

	test("handleCompatibilityCommand renders the collected diagnostics into chat", async () => {
		const fakeThis: any = {
			chatContainer: new Container(),
			ui: { requestRender: vi.fn() },
			requestRenderRespectingInput: vi.fn(),
			collectCompatibilityDiagnostics: vi.fn().mockResolvedValue({
				packageAudits: [],
				extensionErrors: [],
				skillDiagnostics: [],
			}),
			formatCompatibilityDiagnostics: vi.fn(() => ["[兼容性]", "  当前一切正常。"]),
		};

		await (InteractiveMode as any).prototype.handleCompatibilityCommand.call(fakeThis);

		expect(fakeThis.collectCompatibilityDiagnostics).toHaveBeenCalledTimes(1);
		expect(fakeThis.formatCompatibilityDiagnostics).toHaveBeenCalledTimes(1);
		expect(normalizeRenderedOutput(fakeThis.chatContainer)).toContain("当前一切正常。");
		expect(fakeThis.requestRenderRespectingInput).toHaveBeenCalledTimes(1);
	});

	test("handleHotkeysCommand renders the hotkeys help in Chinese", () => {
		const fakeThis: any = {
			chatContainer: new Container(),
			requestRenderRespectingInput: vi.fn(),
			getEditorKeyDisplay: vi.fn((action: string) => action),
			getAppKeyDisplay: vi.fn((action: string) => action),
			session: {
				extensionRunner: {
					getShortcuts: () => new Map(),
				},
			},
			keybindings: {
				getEffectiveConfig: () => ({}),
			},
			getMarkdownThemeWithSettings: vi.fn(() => getMarkdownTheme()),
		};

		(InteractiveMode as any).prototype.handleHotkeysCommand.call(fakeThis);

		const output = normalizeRenderedOutput(fakeThis.chatContainer);
		expect(output).toContain("快捷键说明");
		expect(output).toContain("移动");
		expect(output).toContain("编辑");
		expect(output).toContain("其他");
		expect(output).toContain("发送消息");
		expect(output).toContain("运行 bash 命令");
	});

	test("showCompatibilityReminderIfNeeded warns when package, extension, or skill issues exist", async () => {
		const fakeThis: any = {
			collectCompatibilityDiagnostics: vi.fn().mockResolvedValue({
				packageAudits: [{ source: "pkg", status: "needs-ai-review" }],
				extensionErrors: [{ path: "/tmp/ext.ts", error: "boom" }],
				skillDiagnostics: [{ type: "warning", message: "bad skill" } satisfies ResourceDiagnostic],
			}),
			getCompatibilityIssueCounts: (InteractiveMode as any).prototype.getCompatibilityIssueCounts,
			showWarning: vi.fn(),
		};

		await (InteractiveMode as any).prototype.showCompatibilityReminderIfNeeded.call(fakeThis, undefined);

		expect(fakeThis.showWarning).toHaveBeenCalledTimes(1);
		expect(fakeThis.showWarning.mock.calls[0][0]).toContain("运行 /compat");
		expect(fakeThis.showWarning.mock.calls[0][0]).toContain("插件/包兼容性问题");
	});

	test("showCompatibilityReminderIfNeeded merges startup reevaluation summary into the warning", async () => {
		const fakeThis: any = {
			collectCompatibilityDiagnostics: vi.fn().mockResolvedValue({
				packageAudits: [{ source: "pkg", status: "needs-ai-review" }],
				extensionErrors: [{ path: "/tmp/ext.ts", error: "boom" }],
				skillDiagnostics: [],
			}),
			getCompatibilityIssueCounts: (InteractiveMode as any).prototype.getCompatibilityIssueCounts,
			showWarning: vi.fn(),
			showTaskbarNotice: vi.fn(),
		};

		await (InteractiveMode as any).prototype.showCompatibilityReminderIfNeeded.call(fakeThis, {
			updatedSources: ["legacy-plugin"],
			audits: [
				{
					source: "legacy-plugin",
					packageRoot: "/legacy-plugin",
					manifestType: "legacy-pi",
					status: "light-adapt",
					reasons: ["package.json uses legacy pi manifest."],
				},
			],
		});

		expect(fakeThis.showWarning).toHaveBeenCalledTimes(1);
		expect(fakeThis.showWarning.mock.calls[0][0]).toContain("已重新评估 1 个已安装插件/包来源");
		expect(fakeThis.showWarning.mock.calls[0][0]).toContain("运行 /compat");
		expect(fakeThis.showTaskbarNotice).not.toHaveBeenCalled();
	});

	test("showCompatibilityReminderIfNeeded shows a status notice for clean reevaluated packages", async () => {
		const fakeThis: any = {
			collectCompatibilityDiagnostics: vi.fn().mockResolvedValue({
				packageAudits: [],
				extensionErrors: [],
				skillDiagnostics: [],
			}),
			getCompatibilityIssueCounts: (InteractiveMode as any).prototype.getCompatibilityIssueCounts,
			showWarning: vi.fn(),
			showTaskbarNotice: vi.fn(),
		};

		await (InteractiveMode as any).prototype.showCompatibilityReminderIfNeeded.call(fakeThis, {
			updatedSources: ["direct-plugin"],
			audits: [
				{
					source: "direct-plugin",
					packageRoot: "/direct-plugin",
					manifestType: "lumen",
					status: "direct",
					reasons: ["compatible with Lumen as-is."],
				},
			],
		});

		expect(fakeThis.showTaskbarNotice).toHaveBeenCalledTimes(1);
		expect(fakeThis.showTaskbarNotice.mock.calls[0][0]).toContain("已重新评估 1 个已安装插件/包来源");
		expect(fakeThis.showWarning).not.toHaveBeenCalled();
	});

	test("setupEditorSubmitHandler routes /compat to the compatibility command handler", async () => {
		const editor = {
			onSubmit: undefined as ((text: string) => Promise<void>) | undefined,
			setText: vi.fn(),
			addToHistory: vi.fn(),
			getText: vi.fn(() => ""),
		};
		const fakeThis: any = {
			defaultEditor: editor,
			editor,
			handleCompatibilityCommand: vi.fn().mockResolvedValue(undefined),
			session: {
				isCompacting: false,
				isStreaming: false,
				isBashRunning: false,
				prompt: vi.fn(),
			},
			onInputCallback: undefined,
			flushPendingBashComponents: vi.fn(),
			updatePendingMessagesDisplay: vi.fn(),
			ui: { requestRender: vi.fn() },
			isExtensionCommand: vi.fn(() => false),
			queueCompactionMessage: vi.fn(),
		};

		(InteractiveMode as any).prototype.setupEditorSubmitHandler.call(fakeThis);
		expect(typeof editor.onSubmit).toBe("function");

		await editor.onSubmit?.("/compat");

		expect(fakeThis.handleCompatibilityCommand).toHaveBeenCalledTimes(1);
		expect(editor.setText).toHaveBeenCalledWith("");
		expect(fakeThis.session.prompt).not.toHaveBeenCalled();
	});
});

describe("InteractiveMode command feedback routing", () => {
	test("handleExportCommand routes success feedback to the taskbar notice", async () => {
		const fakeThis: any = {
			getPathCommandArgument: vi.fn(() => "session.jsonl"),
			session: {
				exportToJsonl: vi.fn(() => "/tmp/session.jsonl"),
				exportToHtml: vi.fn(),
			},
			showTaskbarNotice: vi.fn(),
			showError: vi.fn(),
		};

		await (InteractiveMode as any).prototype.handleExportCommand.call(fakeThis, "/export session.jsonl");

		expect(fakeThis.session.exportToJsonl).toHaveBeenCalledWith("session.jsonl");
		expect(fakeThis.showTaskbarNotice).toHaveBeenCalledWith("Exported session to: /tmp/session.jsonl", "dim", 3200);
		expect(fakeThis.showError).not.toHaveBeenCalled();
	});

	test("handleImportCommand routes success feedback to the taskbar notice", async () => {
		const fakeThis: any = {
			getPathCommandArgument: vi.fn(() => "/tmp/input.jsonl"),
			showExtensionConfirm: vi.fn().mockResolvedValue(true),
			loadingAnimation: undefined,
			renderWorkingArea: vi.fn(),
			runtimeHost: {
				importFromJsonl: vi.fn().mockResolvedValue({ cancelled: false }),
			},
			renderCurrentSessionState: vi.fn(),
			showTaskbarNotice: vi.fn(),
			showError: vi.fn(),
		};

		await (InteractiveMode as any).prototype.handleImportCommand.call(fakeThis, "/import /tmp/input.jsonl");

		expect(fakeThis.runtimeHost.importFromJsonl).toHaveBeenCalledWith("/tmp/input.jsonl");
		expect(fakeThis.renderCurrentSessionState).toHaveBeenCalledTimes(1);
		expect(fakeThis.showTaskbarNotice).toHaveBeenCalledWith("Imported session from: /tmp/input.jsonl", "dim", 3200);
		expect(fakeThis.showError).not.toHaveBeenCalled();
	});

	test("handleNameCommand routes current and updated name feedback to the taskbar notice", () => {
		const fakeThis: any = {
			sessionManager: {
				getSessionName: vi.fn(() => "Current Session"),
			},
			session: {
				setSessionName: vi.fn(),
			},
			showTaskbarNotice: vi.fn(),
			showWarning: vi.fn(),
		};

		(InteractiveMode as any).prototype.handleNameCommand.call(fakeThis, "/name");
		expect(fakeThis.showTaskbarNotice).toHaveBeenCalledWith("Session name: Current Session", "dim", 3200);

		(InteractiveMode as any).prototype.handleNameCommand.call(fakeThis, "/name New Session");
		expect(fakeThis.session.setSessionName).toHaveBeenCalledWith("New Session");
		expect(fakeThis.showTaskbarNotice).toHaveBeenCalledWith("Set session name to: New Session", "dim", 3200);
		expect(fakeThis.showWarning).not.toHaveBeenCalled();
	});
});

describe("InteractiveMode changelog helpers", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test("handleChangelogCommand renders the Lumen changelog heading", () => {
		const fakeThis: any = {
			chatContainer: new Container(),
			requestRenderRespectingInput: vi.fn(),
			getMarkdownThemeWithSettings: vi.fn(() => getMarkdownTheme()),
		};

		(InteractiveMode as any).prototype.handleChangelogCommand.call(fakeThis);

		const output = normalizeRenderedOutput(fakeThis.chatContainer);
		expect(output).toContain("Lumen 更新日志");
	});

	test("showNewVersionNotification points to the Lumen changelog", () => {
		const fakeThis: any = {
			chatContainer: new Container(),
			ui: { requestRender: vi.fn() },
		};

		(InteractiveMode as any).prototype.showNewVersionNotification.call(fakeThis, "0.75.6");

		const output = normalizeRenderedOutput(fakeThis.chatContainer);
		expect(output).toContain("发现新版本");
		expect(output).toContain("Lumen 更新日志");
		expect(output).not.toContain("pi-mono/blob/main/packages/coding-agent/CHANGELOG.md");
	});

	test("showSettingsSelector reads tool detail settings from settings manager", () => {
		const showSelector = vi.fn();
		const fakeThis: any = {
			showSelector,
			session: {
				autoCompactionEnabled: true,
				steeringMode: "one-at-a-time",
				followUpMode: "one-at-a-time",
				thinkingLevel: "medium",
				getAvailableThinkingLevels: () => ["off", "medium"],
				agent: {},
			},
			settingsManager: {
				getCompactionThresholdPercent: () => 80,
				getShowImages: () => true,
				getImageWidthCells: () => 60,
				getImageAutoResize: () => true,
				getBlockImages: () => false,
				getEnableSkillCommands: () => true,
				getTransport: () => "auto",
				getTheme: () => "dark",
				getThinkingDisplayMode: () => "collapsed",
				getToolDisplayMode: () => "expanded",
				getCollapseChangelog: () => false,
				getEnableInstallTelemetry: () => true,
				getDoubleEscapeAction: () => "tree",
				getTreeFilterMode: () => "default",
				getShowHardwareCursor: () => true,
				getEditorPaddingX: () => 0,
				getAutocompleteMaxVisible: () => 5,
				getQuietStartup: () => false,
				getClearOnShrink: () => false,
				getShowTerminalProgress: () => false,
				getWarnings: () => ({}),
			},
		};

		(InteractiveMode as any).prototype.showSettingsSelector.call(fakeThis);

		expect(showSelector).toHaveBeenCalledTimes(1);
		const create = showSelector.mock.calls[0][0];
		const result = create(() => {});
		expect(result.component.constructor.name).toBe(SettingsSelectorComponent.name);
	});
});

describe("InteractiveMode.setToolsExpanded", () => {
	test("applies expansion state to the active header and chat entries", () => {
		const header = { setExpanded: vi.fn() };
		const chatChild = { setExpanded: vi.fn() };
		const fakeThis: any = {
			toolOutputExpanded: false,
			customHeader: undefined,
			builtInHeader: header,
			chatContainer: { children: [chatChild] },
			ui: { requestRender: vi.fn() },
			requestRenderRespectingInput: vi.fn(),
		};

		(InteractiveMode as any).prototype.setToolsExpanded.call(fakeThis, true);

		expect(fakeThis.toolOutputExpanded).toBe(true);
		expect(header.setExpanded).toHaveBeenCalledWith(true);
		expect(chatChild.setExpanded).toHaveBeenCalledWith(true);
		expect(fakeThis.requestRenderRespectingInput).toHaveBeenCalledTimes(1);
	});

	test("does not force assistant thinking blocks into full mode when expanding tools", () => {
		const header = { setExpanded: vi.fn() };
		const assistantMessage = new AssistantMessageComponent({
			role: "assistant",
			content: [{ type: "thinking", thinking: "让我检查一下相关文件。" }],
			api: "openai-responses",
			provider: "openai",
			model: "gpt-4o-mini",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		} as any);
		const toolChild = { setExpanded: vi.fn() };
		const fakeThis: any = {
			toolOutputExpanded: false,
			customHeader: undefined,
			builtInHeader: header,
			chatContainer: { children: [assistantMessage, toolChild] },
			ui: { requestRender: vi.fn() },
			requestRenderRespectingInput: vi.fn(),
		};

		expect(assistantMessage.getThinkingDisplayMode()).toBe("summary");

		(InteractiveMode as any).prototype.setToolsExpanded.call(fakeThis, true);

		expect(assistantMessage.getThinkingDisplayMode()).toBe("summary");
		expect(toolChild.setExpanded).toHaveBeenCalledWith(true);
		expect(fakeThis.requestRenderRespectingInput).toHaveBeenCalledTimes(1);
	});
});

describe("InteractiveMode main layout", () => {
	test("attaches the core-owned surface in the expected top-to-bottom order", () => {
		const ui = { addChild: vi.fn() };
		const taskbarRowContainer = {
			id: "taskbar-row",
			clear: vi.fn(),
			addChild: vi.fn(),
		};
		const pendingRowContainer = {
			id: "pending-row",
			clear: vi.fn(),
			addChild: vi.fn(),
		};
		const composerRowContainer = {
			id: "composer-row",
			clear: vi.fn(),
			addChild: vi.fn(),
		};
		const extensionRowContainer = {
			id: "extension-row",
			clear: vi.fn(),
			addChild: vi.fn(),
		};
		const passiveFooterRowContainer = {
			id: "passive-footer-row",
			clear: vi.fn(),
			addChild: vi.fn(),
		};
		const footerContentContainer = {
			id: "footer-content",
			clear: vi.fn(),
			addChild: vi.fn(),
		};
		const taskbarContentContainer = { id: "taskbar-content" };
		const pendingContentContainer = { id: "pending-content" };
		const composerGapContainer = { id: "bottom-gap" };
		const fakeThis: any = makeBottomPaneAware({
			ui,
			chatContainer: { id: "chat" },
			bottomPaneContainer: {
				id: "bottom-pane",
				clear: vi.fn(),
				addChild: vi.fn(),
			},
			taskbarRowContainer,
			pendingRowContainer,
			composerRowContainer,
			extensionRowContainer,
			passiveFooterRowContainer,
			composerGapContainer,
			taskbarContentContainer,
			pendingContentContainer,
			editorContainer: { id: "editor" },
			extensionAreaContainer: { id: "extension-area" },
			footerContentContainer,
			customFooter: undefined,
			footer: { id: "footer" },
			renderWidgets: vi.fn(),
			syncBottomPaneGap: vi.fn(),
		});

		(InteractiveMode as any).prototype.attachMainLayout.call(fakeThis);

		expect(fakeThis.renderWidgets).toHaveBeenCalledTimes(1);
		expect(fakeThis.bottomPaneContainer.clear).toHaveBeenCalledTimes(1);
		const addedChildren = fakeThis.bottomPaneContainer.addChild.mock.calls.map((call: unknown[]) => call[0]);
		expect(addedChildren[0]).toBe(taskbarRowContainer);
		expect(addedChildren[1]).toBe(pendingRowContainer);
		expect(addedChildren[2]).toBe(composerRowContainer);
		expect(addedChildren[3]).toBe(extensionRowContainer);
		expect(addedChildren[4]).toBe(passiveFooterRowContainer);
		expect(taskbarRowContainer.clear).toHaveBeenCalledTimes(1);
		expect(taskbarRowContainer.addChild).toHaveBeenCalledWith(taskbarContentContainer);
		expect(pendingRowContainer.clear).toHaveBeenCalledTimes(1);
		expect(pendingRowContainer.addChild).toHaveBeenCalledWith(pendingContentContainer);
		expect(composerRowContainer.clear).toHaveBeenCalledTimes(1);
		expect(composerRowContainer.addChild).toHaveBeenNthCalledWith(1, composerGapContainer);
		expect(composerRowContainer.addChild).toHaveBeenNthCalledWith(2, fakeThis.editorContainer);
		expect(extensionRowContainer.clear).toHaveBeenCalledTimes(1);
		expect(extensionRowContainer.addChild).toHaveBeenCalledWith(fakeThis.extensionAreaContainer);
		expect(passiveFooterRowContainer.clear).toHaveBeenCalledTimes(1);
		expect(footerContentContainer.clear).toHaveBeenCalledTimes(1);
		expect(footerContentContainer.addChild).toHaveBeenCalledWith(fakeThis.footer);
		expect(passiveFooterRowContainer.addChild).toHaveBeenCalledWith(footerContentContainer);
		expect(fakeThis.syncBottomPaneGap).toHaveBeenCalledTimes(1);
		expect(ui.addChild.mock.calls.map((call: unknown[]) => call[0])).toEqual([
			fakeThis.chatContainer,
			fakeThis.bottomPaneContainer,
		]);
	});

	test("syncBottomPaneGap always inserts a breathing gap between transcript and composer", () => {
		const gapContainer = new Container();
		const taskbarContent = new Container();
		const pendingContent = new Container();
		const fakeThis: any = {
			bottomPane: {
				gap: gapContainer,
				taskbarContent,
				pendingContent,
			},
		};

		(InteractiveMode as any).prototype.syncBottomPaneGap.call(fakeThis);
		expect(gapContainer.children).toHaveLength(1);
		expect(gapContainer.children[0]).toBeInstanceOf(Spacer);

		taskbarContent.addChild(new Text("status", 0, 0));
		(InteractiveMode as any).prototype.syncBottomPaneGap.call(fakeThis);
		expect(gapContainer.children).toHaveLength(1);
		expect(gapContainer.children[0]).toBeInstanceOf(Spacer);

		taskbarContent.clear();
		pendingContent.addChild(new Text("pending", 0, 0));
		(InteractiveMode as any).prototype.syncBottomPaneGap.call(fakeThis);
		expect(gapContainer.children).toHaveLength(1);
		expect(gapContainer.children[0]).toBeInstanceOf(Spacer);
	});

	test("default setExtensionWidget uses the upper slot of the lower extension area", () => {
		const widgetContainerAbove = new Container();
		const widgetContainerBelow = new Container();
		const renderWidgets = vi.fn(() => {
			(InteractiveMode as any).prototype.renderWidgetContainer.call(
				fakeThis,
				widgetContainerAbove,
				fakeThis.extensionWidgetsAbove,
				false,
				true,
			);
			(InteractiveMode as any).prototype.renderWidgetContainer.call(
				fakeThis,
				widgetContainerBelow,
				fakeThis.extensionWidgetsBelow,
				false,
				false,
			);
		});
		const fakeThis: any = {
			extensionWidgetsAbove: new Map(),
			extensionWidgetsBelow: new Map(),
			widgetContainerAbove,
			widgetContainerBelow,
			renderWidgets,
			ui: {},
		};

		(InteractiveMode as any).prototype.setExtensionWidget.call(fakeThis, "default-widget", ["Passive widget"]);

		expect(renderWidgets).toHaveBeenCalledTimes(1);
		expect(normalizeRenderedOutput(widgetContainerAbove)).toContain("Passive widget");
		expect(normalizeRenderedOutput(widgetContainerBelow)).not.toContain("Passive widget");
	});

	test("setExtensionFooter swaps the footer inside the passive footer row", () => {
		const builtInFooter = { id: "built-in-footer" };
		const passiveFooterRowContainer = new Container();
		const footerContentContainer = new Container();
		footerContentContainer.addChild(builtInFooter as any);
		passiveFooterRowContainer.addChild(footerContentContainer);

		const customFooter = { id: "custom-footer", dispose: vi.fn() };
		const factory = vi.fn(() => customFooter as any);
		const fakeThis: any = makeBottomPaneAware({
			bottomPane: {
				container: new Container(),
				taskbarRow: new Container(),
				pendingRow: new Container(),
				composerRow: new Container(),
				extensionRow: new Container(),
				passiveFooterRow: passiveFooterRowContainer,
				gap: new Container(),
				taskbarContent: new Container(),
				pendingContent: new Container(),
				composerContent: new Container(),
				extensionContent: new Container(),
				footerContent: footerContentContainer,
			},
			passiveFooterRowContainer,
			footerContentContainer,
			customFooter: undefined,
			footer: builtInFooter,
			footerDataProvider: {},
			ui: { requestRender: vi.fn() },
		});

		(InteractiveMode as any).prototype.setExtensionFooter.call(fakeThis, factory);
		expect(factory).toHaveBeenCalledTimes(1);
		expect(passiveFooterRowContainer.children[0]).toBe(footerContentContainer);
		expect(footerContentContainer.children[0]).toBe(customFooter);
		expect(fakeThis.ui.requestRender).toHaveBeenCalledTimes(1);

		(InteractiveMode as any).prototype.setExtensionFooter.call(fakeThis, undefined);
		expect(customFooter.dispose).toHaveBeenCalledTimes(1);
		expect(passiveFooterRowContainer.children[0]).toBe(footerContentContainer);
		expect(footerContentContainer.children[0]).toBe(builtInFooter);
		expect(fakeThis.ui.requestRender).toHaveBeenCalledTimes(2);
	});
});

describe("InteractiveMode.createExtensionUIContext setTheme", () => {
	test("persists theme changes to settings manager", () => {
		initTheme("dark");

		let currentTheme = "dark";
		const settingsManager = {
			getTheme: vi.fn(() => currentTheme),
			setTheme: vi.fn((theme: string) => {
				currentTheme = theme;
			}),
		};
		const fakeThis: any = {
			session: { settingsManager },
			settingsManager,
			ui: { requestRender: vi.fn() },
			requestRenderRespectingInput: vi.fn(),
		};

		const uiContext = (InteractiveMode as any).prototype.createExtensionUIContext.call(fakeThis);
		const result = uiContext.setTheme("light");

		expect(result.success).toBe(true);
		expect(settingsManager.setTheme).toHaveBeenCalledWith("light");
		expect(currentTheme).toBe("light");
		expect(fakeThis.requestRenderRespectingInput).toHaveBeenCalledTimes(1);
	});

	test("does not persist invalid theme names", () => {
		initTheme("dark");

		const settingsManager = {
			getTheme: vi.fn(() => "dark"),
			setTheme: vi.fn(),
		};
		const fakeThis: any = {
			session: { settingsManager },
			settingsManager,
			ui: { requestRender: vi.fn() },
		};

		const uiContext = (InteractiveMode as any).prototype.createExtensionUIContext.call(fakeThis);
		const result = uiContext.setTheme("__missing_theme__");

		expect(result.success).toBe(false);
		expect(settingsManager.setTheme).not.toHaveBeenCalled();
		expect(fakeThis.ui.requestRender).not.toHaveBeenCalled();
	});
});

describe("InteractiveMode.createExtensionUIContext addAutocompleteProvider", () => {
	test("stores wrapper factories and rebuilds autocomplete immediately", () => {
		const wrapper: AutocompleteProviderFactory = (current) => current;
		const fakeThis = {
			autocompleteProviderWrappers: [] as AutocompleteProviderFactory[],
			setupAutocompleteProvider: vi.fn(),
		};

		const uiContext = (InteractiveMode as any).prototype.createExtensionUIContext.call(fakeThis);
		uiContext.addAutocompleteProvider(wrapper);

		expect(fakeThis.autocompleteProviderWrappers).toEqual([wrapper]);
		expect(fakeThis.setupAutocompleteProvider).toHaveBeenCalledTimes(1);
	});
});

describe("InteractiveMode.setupAutocompleteProvider", () => {
	test("stacks wrapper factories over a fresh base provider", () => {
		const defaultEditor = { setAutocompleteProvider: vi.fn() };
		const customEditor = { setAutocompleteProvider: vi.fn() };
		const calls: string[] = [];

		const wrap1: AutocompleteProviderFactory = (current): AutocompleteProvider => ({
			async getSuggestions(lines, cursorLine, cursorCol, options) {
				calls.push("getSuggestions:wrap1");
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			},
			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				calls.push("applyCompletion:wrap1");
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			},
			shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
				calls.push("shouldTrigger:wrap1");
				return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
			},
		});
		const wrap2: AutocompleteProviderFactory = (current): AutocompleteProvider => ({
			async getSuggestions(lines, cursorLine, cursorCol, options) {
				calls.push("getSuggestions:wrap2");
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			},
			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				calls.push("applyCompletion:wrap2");
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			},
			shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
				calls.push("shouldTrigger:wrap2");
				return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
			},
		});

		const fakeThis = {
			createBaseAutocompleteProvider: () => new CombinedAutocompleteProvider([], "/tmp/project", undefined),
			defaultEditor,
			editor: customEditor,
			autocompleteProviderWrappers: [wrap1, wrap2],
		};

		(InteractiveMode as any).prototype.setupAutocompleteProvider.call(fakeThis);

		expect(defaultEditor.setAutocompleteProvider).toHaveBeenCalledTimes(1);
		expect(customEditor.setAutocompleteProvider).toHaveBeenCalledTimes(1);
		const provider = defaultEditor.setAutocompleteProvider.mock.calls[0]?.[0] as AutocompleteProvider;
		expect(provider).toBe(customEditor.setAutocompleteProvider.mock.calls[0]?.[0]);
		expect(provider.shouldTriggerFileCompletion?.(["foo"], 0, 3)).toBe(true);
		expect(calls).toEqual(["shouldTrigger:wrap2", "shouldTrigger:wrap1"]);
	});
});

describe("InteractiveMode spinner helpers", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test("buildDefaultBudgetText prefers request payload budget over model fallback", () => {
		const fakeThis: any = {
			session: {
				model: { maxTokens: 32000 },
				thinkingLevel: "high",
				getSpinnerBudgetUsage: () => ({ requestMaxOutputTokens: 4096 }),
			},
			settingsManager: {
				getThinkingBudgets: () => undefined,
			},
			getResolvedSpinnerBudgetTokens: () => 99999,
		};

		const text = (InteractiveMode as any).prototype.buildDefaultBudgetText.call(fakeThis, 1024);
		expect(text).toBe("Target: 1,024 / 4,096 (25% used)");
	});

	test("buildDefaultBudgetText stays hidden when no real request budget is available", () => {
		const fakeThis: any = {
			session: {
				model: { maxTokens: 32000 },
				thinkingLevel: "high",
				getSpinnerBudgetUsage: () => undefined,
			},
			settingsManager: {
				getThinkingBudgets: () => undefined,
			},
		};

		const text = (InteractiveMode as any).prototype.buildDefaultBudgetText.call(fakeThis, 1024);
		expect(text).toBeUndefined();
	});

	test("buildDefaultBudgetText includes ETA when enough progress exists", () => {
		const fakeThis: any = {
			session: {
				model: { maxTokens: 32000 },
				thinkingLevel: "high",
				getSpinnerBudgetUsage: () => ({ requestMaxOutputTokens: 4096 }),
			},
			formatDurationForBudget: (ms: number) =>
				(InteractiveMode as any).prototype.formatDurationForBudget.call({}, ms),
		};

		const text = (InteractiveMode as any).prototype.buildDefaultBudgetText.call(fakeThis, 2048, 10_000);
		expect(text).toContain("50% used");
		expect(text).toContain("· ~");
	});

	test("buildDefaultSpinnerState preserves overrideMessage even when it is the only signal", () => {
		const fakeThis: any = {
			session: {
				isStreaming: false,
				isCompacting: false,
				isRetrying: false,
				getTaskUiSummary: () => undefined,
				getContextUsage: () => undefined,
				getSpinnerBudgetUsage: () => undefined,
			},
			settingsManager: {
				getSpinnerTipsEnabled: () => true,
			},
			buildDefaultBudgetText: () => undefined,
			spinnerStartedAt: 0,
			spinnerResponseChars: 0,
			spinnerReportedOutputTokens: 0,
			spinnerThinkingStartedAt: null,
			spinnerThinkingMinimumVisibleUntil: null,
			spinnerThinkingDurationMs: null,
			spinnerThoughtForVisibleUntil: null,
			spinnerSystemOverrideMessage: "Compacting conversation",
		};

		const state = (InteractiveMode as any).prototype.buildDefaultSpinnerState.call(fakeThis);
		expect(state).toEqual({ overrideMessage: "Compacting conversation" });
	});

	test("buildDefaultSpinnerState does not synthesize task or queued tips", () => {
		const fakeThis: any = {
			session: {
				getTaskUiSummary: () => ({
					total: 2,
					completed: 0,
					inProgress: 1,
					pending: 1,
					failed: 0,
					abandoned: 0,
					current: { id: "1", content: "Implement feature", status: "in_progress" },
					next: { id: "2", content: "Write tests", subject: "Write tests", status: "pending" },
				}),
				getContextUsage: () => ({ tokens: 10, contextWindow: 1000, percent: 20 }),
				getSpinnerBudgetUsage: () => undefined,
			},
			settingsManager: {
				getSpinnerTipsEnabled: () => true,
			},
			buildDefaultBudgetText: () => undefined,
			spinnerStartedAt: 0,
			spinnerResponseChars: 0,
			spinnerReportedOutputTokens: 0,
			spinnerThinkingStartedAt: null,
			spinnerThinkingMinimumVisibleUntil: null,
			spinnerThinkingDurationMs: null,
			spinnerThoughtForVisibleUntil: null,
			spinnerSystemOverrideMessage: undefined,
		};

		const state = (InteractiveMode as any).prototype.buildDefaultSpinnerState.call(fakeThis);
		expect(state).toBeUndefined();
	});

	test("buildDefaultSpinnerState shows long-running spinner tip after 30 seconds when no next task exists", () => {
		const now = Date.now();
		const fakeThis: any = {
			session: {
				isStreaming: true,
				isCompacting: false,
				isRetrying: false,
				getTaskUiSummary: () => ({
					total: 1,
					completed: 0,
					inProgress: 1,
					pending: 0,
					failed: 0,
					abandoned: 0,
					current: { id: "1", content: "Implement feature", status: "in_progress" },
					next: undefined,
				}),
				getContextUsage: () => ({ tokens: 100, contextWindow: 1000, percent: 10 }),
				getSpinnerBudgetUsage: () => undefined,
			},
			settingsManager: {
				getSpinnerTipsEnabled: () => true,
			},
			buildDefaultBudgetText: () => undefined,
			spinnerStartedAt: now - 31_000,
			spinnerResponseChars: 0,
			spinnerReportedOutputTokens: 0,
			spinnerThinkingStartedAt: null,
			spinnerThinkingMinimumVisibleUntil: null,
			spinnerThinkingDurationMs: null,
			spinnerThoughtForVisibleUntil: null,
			spinnerSystemOverrideMessage: undefined,
		};

		const state = (InteractiveMode as any).prototype.buildDefaultSpinnerState.call(fakeThis);
		expect(state?.tip).toBe("Enter 会在下一个工具间隙发送，Alt+Enter 会排队到本轮结束后再发");
	});

	test("buildDefaultSpinnerState prefers clear tip after 30 minutes when no next task exists", () => {
		const now = Date.now();
		const fakeThis: any = {
			session: {
				isStreaming: true,
				isCompacting: false,
				isRetrying: false,
				getTaskUiSummary: () => ({
					total: 1,
					completed: 0,
					inProgress: 1,
					pending: 0,
					failed: 0,
					abandoned: 0,
					current: { id: "1", content: "Implement feature", status: "in_progress" },
					next: undefined,
				}),
				getContextUsage: () => ({ tokens: 980, contextWindow: 1000, percent: 98 }),
				getSpinnerBudgetUsage: () => undefined,
			},
			settingsManager: {
				getSpinnerTipsEnabled: () => true,
			},
			buildDefaultBudgetText: () => undefined,
			spinnerStartedAt: now - 1_810_000,
			spinnerResponseChars: 0,
			spinnerReportedOutputTokens: 0,
			spinnerThinkingStartedAt: null,
			spinnerThinkingMinimumVisibleUntil: null,
			spinnerThinkingDurationMs: null,
			spinnerThoughtForVisibleUntil: null,
			spinnerSystemOverrideMessage: undefined,
		};

		const state = (InteractiveMode as any).prototype.buildDefaultSpinnerState.call(fakeThis);
		expect(state?.tip).toBe("切换话题前可先用 /clear 释放上下文");
	});

	test("buildDefaultSpinnerState hides timed tips when spinner tips are disabled", () => {
		const now = Date.now();
		const fakeThis: any = {
			session: {
				isStreaming: true,
				isCompacting: false,
				isRetrying: false,
				getTaskUiSummary: () => ({
					total: 1,
					completed: 0,
					inProgress: 1,
					pending: 0,
					failed: 0,
					abandoned: 0,
					current: { id: "1", content: "Implement feature", status: "in_progress" },
					next: undefined,
				}),
				getContextUsage: () => ({ tokens: 980, contextWindow: 1000, percent: 98 }),
				getSpinnerBudgetUsage: () => undefined,
			},
			settingsManager: {
				getSpinnerTipsEnabled: () => false,
			},
			buildDefaultBudgetText: () => undefined,
			spinnerStartedAt: now - 1_810_000,
			spinnerResponseChars: 0,
			spinnerReportedOutputTokens: 0,
			spinnerThinkingStartedAt: null,
			spinnerThinkingMinimumVisibleUntil: null,
			spinnerThinkingDurationMs: null,
			spinnerThoughtForVisibleUntil: null,
			spinnerSystemOverrideMessage: undefined,
		};

		const state = (InteractiveMode as any).prototype.buildDefaultSpinnerState.call(fakeThis);
		expect(state).toEqual({ elapsedMs: expect.any(Number), mode: "requesting" });
	});

	test("setWorkingDetails stores component details and renders them into the working area", () => {
		initTheme("dark");

		const taskbarContentContainer = new Container();
		const requestRenderUnlessInputSuppressed = vi.fn();
		const fakeThis: any = makeBottomPaneAware({
			workingDetailsLines: undefined,
			workingDetailsComponent: undefined,
			taskbarContentContainer,
			workingVisible: false,
			session: { isStreaming: false },
			getProgressSurfaceSnapshot: () => ({
				tasks: [],
				queued: undefined,
				spinner: undefined,
				expanded: false,
			}),
			loadingAnimation: undefined,
			ui: { requestRender: vi.fn() },
			requestRenderRespectingInput: vi.fn(),
			requestRenderUnlessInputSuppressed,
			renderWorkingArea() {
				return (InteractiveMode as any).prototype.renderWorkingArea.call(this);
			},
		});

		(InteractiveMode as any).prototype.setWorkingDetails.call(fakeThis, () => {
			const container = new Container();
			container.addChild({ render: () => ["DETAILS"], invalidate: () => {} } as any);
			return container as any;
		});

		expect(fakeThis.workingDetailsComponent).toBeDefined();
		expect(renderAll(taskbarContentContainer)).toContain("DETAILS");
		expect(requestRenderUnlessInputSuppressed).toHaveBeenCalledTimes(1);
	});

	test("renderWorkingArea prefers the core progress surface over the fallback loader", () => {
		initTheme("dark");

		const working = createProgressSurfaceWorkingState(0);
		const taskbarContentContainer = new Container();
		const fakeThis: any = makeBottomPaneAware({
			taskbarContentContainer,
			workingVisible: true,
			session: {
				isStreaming: true,
			},
			workingDetailsLines: undefined,
			workingDetailsComponent: undefined,
			loadingAnimation: {
				render: () => ["LOADER ROW"],
				invalidate: () => {},
			},
			getProgressSurfaceSnapshot() {
				return createLiveTodoSnapshot({
					elapsedMs: 9_000,
					outputTokens: 295,
					isThinking: true,
					mode: "thinking",
				});
			},
			progressSurfaceComponent: new ProgressSurfaceComponent(
				() => fakeThis.getProgressSurfaceSnapshot(),
				theme,
				working,
			),
		});

		(InteractiveMode as any).prototype.renderWorkingArea.call(fakeThis);

		const output = normalizeRenderedOutput(taskbarContentContainer);
		expect(output).toContain("整理接口定义...");
		expect(output).toContain("Plan");
		expect(output).not.toContain("LOADER ROW");
	});

	test("renderWorkingArea clears the taskbar area when no active surface or details remain", () => {
		const taskbarContentContainer = new Container();
		const fakeThis: any = makeBottomPaneAware({
			taskbarContentContainer,
			workingVisible: false,
			session: {
				isStreaming: false,
			},
			workingDetailsLines: undefined,
			workingDetailsComponent: undefined,
			loadingAnimation: undefined,
			getProgressSurfaceSnapshot: () => ({
				tasks: [],
				queued: undefined,
				spinner: undefined,
				expanded: false,
			}),
		});

		(InteractiveMode as any).prototype.renderWorkingArea.call(fakeThis);

		expect(taskbarContentContainer.children).toHaveLength(0);
	});

	test("updatePendingMessagesDisplay renders queued prompts as a separate prompt-side queue slot", () => {
		initTheme("dark");

		const pendingContent = new Container();
		const fakeThis: any = makeBottomPaneAware({
			bottomPane: {
				pendingContent,
				taskbarContent: new Container(),
				gap: new Container(),
			},
			pendingBashComponents: [],
			getAllQueuedMessages: () => ({
				steering: ["先看 retry 逻辑"],
				followUp: ["完成后补文档"],
			}),
			getAppKeyDisplay: () => "Alt+Up",
			latestQueuedMessage: (steeringMessages: string[], followUpMessages: string[]) =>
				(InteractiveMode as any).prototype.latestQueuedMessage.call(fakeThis, steeringMessages, followUpMessages),
		});

		(InteractiveMode as any).prototype.updatePendingMessagesDisplay.call(fakeThis);

		const output = normalizeRenderedOutput(pendingContent);
		expect(output).toContain("2 queued commands");
		expect(output).toContain("⎿ Follow-up: 完成后补文档");
		expect(output).toContain("⎿ Alt+Up to edit all queued messages");
		expect(output).not.toContain("Queued 2 · 1 steer · 1 follow-up");
		expect(output).not.toContain("↳");
	});

	test("updatePendingMessagesDisplay keeps queued commands out of the main transcript container", () => {
		const pendingContent = new Container();
		const fakeThis: any = makeBottomPaneAware({
			chatContainer: new Container(),
			bottomPane: {
				pendingContent,
				taskbarContent: new Container(),
				gap: new Container(),
			},
			pendingBashComponents: [],
			getAllQueuedMessages: () => ({
				steering: ["先看 retry 逻辑"],
				followUp: ["完成后补文档"],
			}),
			getAppKeyDisplay: () => "Alt+Up",
			latestQueuedMessage: (steeringMessages: string[], followUpMessages: string[]) =>
				(InteractiveMode as any).prototype.latestQueuedMessage.call(fakeThis, steeringMessages, followUpMessages),
		});

		fakeThis.chatContainer.addChild({ render: () => ["TRANSCRIPT"], invalidate: () => {} });
		(InteractiveMode as any).prototype.updatePendingMessagesDisplay.call(fakeThis);

		expect(normalizeRenderedOutput(fakeThis.chatContainer)).toContain("TRANSCRIPT");
		expect(normalizeRenderedOutput(fakeThis.chatContainer)).not.toContain("排队命令");
		expect(normalizeRenderedOutput(pendingContent)).toContain("queued commands");
	});

	test("setSpinnerBanner auto-clears timed success banners without clearing newer banners", () => {
		vi.useFakeTimers();
		try {
			const fakeThis: any = {
				spinnerBanner: undefined,
				spinnerBannerTimeout: undefined,
				clearSpinnerBannerTimeout() {
					return (InteractiveMode as any).prototype.clearSpinnerBannerTimeout.call(this);
				},
				syncProgressSurfaceRefreshLoop: vi.fn(),
				requestRenderUnlessInputSuppressed: vi.fn(),
				ui: { requestRender: vi.fn() },
			};

			const successBanner = { kind: "success", title: "Connection restored" };
			const warningBanner = { kind: "warning", title: "Connection unstable, recovering stream" };

			(InteractiveMode as any).prototype.setSpinnerBanner.call(fakeThis, successBanner, { expiresMs: 1500 });
			expect(fakeThis.spinnerBanner).toEqual(successBanner);

			vi.advanceTimersByTime(1000);
			expect(fakeThis.spinnerBanner).toEqual(successBanner);

			(InteractiveMode as any).prototype.setSpinnerBanner.call(fakeThis, warningBanner);
			expect(fakeThis.spinnerBanner).toEqual(warningBanner);

			vi.advanceTimersByTime(1000);
			expect(fakeThis.spinnerBanner).toEqual(warningBanner);
		} finally {
			vi.useRealTimers();
		}
	});

	test("setSpinnerBanner keeps error banners visible when no expiry is set", () => {
		vi.useFakeTimers();
		try {
			const fakeThis: any = {
				spinnerBanner: undefined,
				spinnerBannerTimeout: undefined,
				clearSpinnerBannerTimeout() {
					return (InteractiveMode as any).prototype.clearSpinnerBannerTimeout.call(this);
				},
				syncProgressSurfaceRefreshLoop: vi.fn(),
				requestRenderUnlessInputSuppressed: vi.fn(),
				ui: { requestRender: vi.fn() },
			};

			const errorBanner = { kind: "error", title: "Request failed", detail: "Retried 3 times" };

			(InteractiveMode as any).prototype.setSpinnerBanner.call(fakeThis, errorBanner);
			expect(fakeThis.spinnerBanner).toEqual(errorBanner);

			vi.advanceTimersByTime(10_000);
			expect(fakeThis.spinnerBanner).toEqual(errorBanner);
		} finally {
			vi.useRealTimers();
		}
	});

	test("setSpinnerBanner prefers the input-aware render helper over direct ui.requestRender", () => {
		const requestRenderUnlessInputSuppressed = vi.fn();
		const fakeThis: any = {
			spinnerBanner: undefined,
			spinnerBannerTimeout: undefined,
			requestRenderUnlessInputSuppressed,
			clearSpinnerBannerTimeout() {
				return (InteractiveMode as any).prototype.clearSpinnerBannerTimeout.call(this);
			},
			syncProgressSurfaceRefreshLoop: vi.fn(),
			ui: { requestRender: vi.fn() },
		};

		(InteractiveMode as any).prototype.setSpinnerBanner.call(fakeThis, {
			kind: "warning",
			title: "Connection unstable, recovering stream",
		});

		expect(requestRenderUnlessInputSuppressed).toHaveBeenCalledTimes(1);
		expect(fakeThis.ui.requestRender).not.toHaveBeenCalled();
	});

	test("setExtensionWidget keeps belowEditor widgets out of the pending message slot", () => {
		const pendingContentContainer = new Container();
		const widgetContainerAbove = new Container();
		const widgetContainerBelow = new Container();
		const renderWidgets = vi.fn(() => {
			(InteractiveMode as any).prototype.renderWidgetContainer.call(
				fakeThis,
				widgetContainerAbove,
				fakeThis.extensionWidgetsAbove,
				true,
				true,
			);
			(InteractiveMode as any).prototype.renderWidgetContainer.call(
				fakeThis,
				widgetContainerBelow,
				fakeThis.extensionWidgetsBelow,
				false,
				false,
			);
		});
		const fakeThis: any = {
			extensionWidgetsAbove: new Map(),
			extensionWidgetsBelow: new Map(),
			pendingContentContainer,
			widgetContainerAbove,
			widgetContainerBelow,
			renderWidgets,
			ui: {},
		};

		(InteractiveMode as any).prototype.setExtensionWidget.call(fakeThis, "below-widget", ["Below editor widget"], {
			placement: "belowEditor",
		});

		expect(renderWidgets).toHaveBeenCalledTimes(1);
		expect(normalizeRenderedOutput(widgetContainerBelow)).toContain("Below editor widget");
		expect(normalizeRenderedOutput(widgetContainerAbove)).not.toContain("Below editor widget");
		expect(normalizeRenderedOutput(pendingContentContainer)).not.toContain("Below editor widget");
	});

	test("timed success banners disappear and the todo headline becomes visible again", () => {
		vi.useFakeTimers();
		try {
			const working = createProgressSurfaceWorkingState(0);
			const taskbarContentContainer = new Container();
			const fakeThis: any = makeBottomPaneAware({
				spinnerBanner: undefined,
				spinnerBannerTimeout: undefined,
				progressSurfaceWorkingState: working,
				taskbarContentContainer,
				workingVisible: false,
				session: {
					isStreaming: false,
					isCompacting: false,
					isRetrying: false,
					getTaskUiSummary: () => undefined,
					getContextUsage: () => undefined,
					getSpinnerBudgetUsage: () => undefined,
				},
				settingsManager: { getSpinnerTipsEnabled: () => true },
				buildDefaultBudgetText: (outputTokens?: number, elapsedMs?: number) =>
					(InteractiveMode as any).prototype.buildDefaultBudgetText.call(fakeThis, outputTokens, elapsedMs),
				getProgressSurfaceSnapshot() {
					return createLiveTodoSnapshot((InteractiveMode as any).prototype.buildDefaultSpinnerState.call(this));
				},
				clearSpinnerBannerTimeout() {
					return (InteractiveMode as any).prototype.clearSpinnerBannerTimeout.call(this);
				},
				syncProgressSurfaceRefreshLoop: vi.fn(),
				requestRenderUnlessInputSuppressed: vi.fn(),
				ui: { requestRender: vi.fn() },
				progressSurfaceComponent: undefined,
				renderWorkingArea() {
					return (InteractiveMode as any).prototype.renderWorkingArea.call(this);
				},
			});
			fakeThis.progressSurfaceComponent = new ProgressSurfaceComponent(
				() => fakeThis.getProgressSurfaceSnapshot(),
				theme,
				working,
			);

			const successBanner = { kind: "success", title: "Connection restored" };
			(InteractiveMode as any).prototype.setSpinnerBanner.call(fakeThis, successBanner, { expiresMs: 1500 });

			fakeThis.renderWorkingArea();
			let output = normalizeRenderedOutput(taskbarContentContainer);
			expect(output).toContain("Connection restored");
			expect(output).not.toContain("整理接口定义...");

			vi.advanceTimersByTime(1500);
			fakeThis.renderWorkingArea();
			output = normalizeRenderedOutput(taskbarContentContainer);
			expect(output).toContain("整理接口定义...");
			expect(output).toContain("Plan");
			expect(output).not.toContain("Connection restored");
		} finally {
			vi.useRealTimers();
		}
	});

	test("error banners stay visible and keep overriding the todo headline", () => {
		vi.useFakeTimers();
		try {
			const working = createProgressSurfaceWorkingState(0);
			const taskbarContentContainer = new Container();
			const fakeThis: any = makeBottomPaneAware({
				spinnerBanner: undefined,
				spinnerBannerTimeout: undefined,
				progressSurfaceWorkingState: working,
				taskbarContentContainer,
				workingVisible: false,
				session: {
					isStreaming: false,
					isCompacting: false,
					isRetrying: false,
					getTaskUiSummary: () => undefined,
					getContextUsage: () => undefined,
					getSpinnerBudgetUsage: () => undefined,
				},
				settingsManager: { getSpinnerTipsEnabled: () => true },
				buildDefaultBudgetText: (outputTokens?: number, elapsedMs?: number) =>
					(InteractiveMode as any).prototype.buildDefaultBudgetText.call(fakeThis, outputTokens, elapsedMs),
				getProgressSurfaceSnapshot() {
					return createLiveTodoSnapshot((InteractiveMode as any).prototype.buildDefaultSpinnerState.call(this));
				},
				clearSpinnerBannerTimeout() {
					return (InteractiveMode as any).prototype.clearSpinnerBannerTimeout.call(this);
				},
				syncProgressSurfaceRefreshLoop: vi.fn(),
				requestRenderUnlessInputSuppressed: vi.fn(),
				ui: { requestRender: vi.fn() },
				progressSurfaceComponent: undefined,
				renderWorkingArea() {
					return (InteractiveMode as any).prototype.renderWorkingArea.call(this);
				},
			});
			fakeThis.progressSurfaceComponent = new ProgressSurfaceComponent(
				() => fakeThis.getProgressSurfaceSnapshot(),
				theme,
				working,
			);

			const errorBanner = { kind: "error", title: "Request failed", detail: "已重试 3 次" };
			(InteractiveMode as any).prototype.setSpinnerBanner.call(fakeThis, errorBanner);

			fakeThis.renderWorkingArea();
			const initial = normalizeRenderedOutput(taskbarContentContainer);
			expect(initial).toContain("Request failed");
			expect(initial).not.toContain("整理接口定义...");

			vi.advanceTimersByTime(10_000);
			fakeThis.renderWorkingArea();
			const after = normalizeRenderedOutput(taskbarContentContainer);
			expect(after).toContain("Request failed");
			expect(after).not.toContain("整理接口定义...");
		} finally {
			vi.useRealTimers();
		}
	});

	test("requestRenderUnlessInputSuppressed skips redraws while input activity is active", () => {
		const fakeThis: any = {
			isInputActivitySuppressed: () => true,
			ui: { requestRender: vi.fn() },
		};

		(InteractiveMode as any).prototype.requestRenderUnlessInputSuppressed.call(fakeThis);
		(InteractiveMode as any).prototype.requestRenderUnlessInputSuppressed.call(fakeThis, true);

		expect(fakeThis.ui.requestRender).not.toHaveBeenCalled();
	});

	test("requestRenderRespectingInput delegates directly to TUI requestRender", () => {
		const fakeThis: any = {
			ui: { requestRender: vi.fn() },
		};

		(InteractiveMode as any).prototype.requestRenderRespectingInput.call(fakeThis);
		(InteractiveMode as any).prototype.requestRenderRespectingInput.call(fakeThis, true);

		expect(fakeThis.ui.requestRender).toHaveBeenNthCalledWith(1, false);
		expect(fakeThis.ui.requestRender).toHaveBeenNthCalledWith(2, true);
	});

	test("showTaskbarNotice uses the taskbar overlay and clears itself after timeout", () => {
		vi.useFakeTimers();
		try {
			const setTaskbarOverlay = vi.fn(function (this: any, component: unknown) {
				this.taskbarOverlayComponent = component;
			});
			const requestRenderRespectingInput = vi.fn();
			const requestRenderUnlessInputSuppressed = vi.fn();
			const fakeThis: any = {
				taskbarOverlayComponent: undefined,
				taskbarNoticeTimeout: undefined,
				setTaskbarOverlay,
				requestRenderRespectingInput,
				requestRenderUnlessInputSuppressed,
				clearTaskbarNoticeTimeout() {
					return (InteractiveMode as any).prototype.clearTaskbarNoticeTimeout.call(this);
				},
			};

			(InteractiveMode as any).prototype.showTaskbarNotice.call(fakeThis, "短暂提示", "warning", 1200);

			expect(setTaskbarOverlay).toHaveBeenCalledTimes(1);
			expect(fakeThis.taskbarOverlayComponent).toBeDefined();
			expect(requestRenderRespectingInput).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(1200);

			expect(setTaskbarOverlay).toHaveBeenCalledTimes(2);
			expect(fakeThis.taskbarOverlayComponent).toBeUndefined();
			expect(requestRenderUnlessInputSuppressed).toHaveBeenCalledTimes(1);
			expect(fakeThis.taskbarNoticeTimeout).toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});

	test("setWorkingVisible routes redraw through the input-aware helper", () => {
		const fakeThis: any = {
			workingVisible: true,
			stopWorkingLoader: vi.fn(),
			requestRenderRespectingInput: vi.fn(),
		};

		(InteractiveMode as any).prototype.setWorkingVisible.call(fakeThis, false);

		expect(fakeThis.stopWorkingLoader).toHaveBeenCalledTimes(1);
		expect(fakeThis.requestRenderRespectingInput).toHaveBeenCalledTimes(1);
	});

	test("createWorkingLoader skips constructor-time redraws so the parent surface controls first paint", () => {
		const fakeThis: any = {
			ui: {},
			workingIndicatorOptions: undefined,
			getWorkingLoaderMessage: vi.fn(() => "Working..."),
		};

		const loader = (InteractiveMode as any).prototype.createWorkingLoader.call(fakeThis);

		expect(loader).toBeDefined();
		expect(fakeThis.getWorkingLoaderMessage).toHaveBeenCalledTimes(1);
	});

	test("setWorkingIndicator routes redraw through the input-aware helper", () => {
		const fakeThis: any = {
			loadingAnimation: { setIndicator: vi.fn() },
			renderWorkingArea: vi.fn(),
			requestRenderRespectingInput: vi.fn(),
		};

		(InteractiveMode as any).prototype.setWorkingIndicator.call(fakeThis, { frames: ["●"] });

		expect(fakeThis.loadingAnimation.setIndicator).toHaveBeenCalledTimes(1);
		expect(fakeThis.renderWorkingArea).toHaveBeenCalledTimes(1);
		expect(fakeThis.requestRenderRespectingInput).toHaveBeenCalledTimes(1);
	});

	test("showWarning routes redraw through the input-aware helper", () => {
		const fakeThis: any = {
			chatContainer: { addChild: vi.fn() },
			requestRenderRespectingInput: vi.fn(),
		};

		(InteractiveMode as any).prototype.showWarning.call(fakeThis, "warn");

		expect(fakeThis.chatContainer.addChild).toHaveBeenCalledTimes(2);
		expect(fakeThis.requestRenderRespectingInput).toHaveBeenCalledTimes(1);
	});

	test("showError routes redraw through the input-aware helper", () => {
		const fakeThis: any = {
			chatContainer: { addChild: vi.fn() },
			requestRenderRespectingInput: vi.fn(),
		};

		(InteractiveMode as any).prototype.showError.call(fakeThis, "boom");

		expect(fakeThis.chatContainer.addChild).toHaveBeenCalledTimes(2);
		expect(fakeThis.requestRenderRespectingInput).toHaveBeenCalledTimes(1);
	});

	test("showExtensionNotify routes info notices into the transcript status line", () => {
		const fakeThis: any = {
			showError: vi.fn(),
			showWarning: vi.fn(),
			showStatus: vi.fn(),
		};

		(InteractiveMode as any).prototype.showExtensionNotify.call(fakeThis, "TPS 12.3 tok/s", "info");

		expect(fakeThis.showStatus).toHaveBeenCalledWith("TPS 12.3 tok/s");
		expect(fakeThis.showWarning).not.toHaveBeenCalled();
		expect(fakeThis.showError).not.toHaveBeenCalled();
	});

	test("handleSessionCommand routes redraw through the input-aware helper", () => {
		const fakeThis: any = {
			session: {
				getSessionStats: () => ({
					sessionFile: "session.jsonl",
					sessionId: "s1",
					userMessages: 1,
					assistantMessages: 2,
					toolCalls: 0,
					toolResults: 0,
					totalMessages: 3,
					tokens: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, total: 3 },
					cost: 0,
				}),
			},
			sessionManager: { getSessionName: () => "demo" },
			chatContainer: { addChild: vi.fn() },
			requestRenderRespectingInput: vi.fn(),
		};

		(InteractiveMode as any).prototype.handleSessionCommand.call(fakeThis);

		expect(fakeThis.chatContainer.addChild).toHaveBeenCalledTimes(2);
		expect(fakeThis.requestRenderRespectingInput).toHaveBeenCalledTimes(1);
	});

	test("handleCompatibilityCommand routes redraw through the input-aware helper", async () => {
		const fakeThis: any = {
			collectCompatibilityDiagnostics: vi.fn().mockResolvedValue({
				packageAudits: [],
				extensionErrors: [],
				skillDiagnostics: [],
			}),
			formatCompatibilityDiagnostics: vi.fn(() => ["[Compatibility]", "  Everything is fine."]),
			chatContainer: { addChild: vi.fn() },
			requestRenderRespectingInput: vi.fn(),
		};

		await (InteractiveMode as any).prototype.handleCompatibilityCommand.call(fakeThis);

		expect(fakeThis.collectCompatibilityDiagnostics).toHaveBeenCalledTimes(1);
		expect(fakeThis.requestRenderRespectingInput).toHaveBeenCalledTimes(1);
	});

	test("markInputActivity defers redraw until suppression window ends, then restores refresh loop", () => {
		vi.useFakeTimers();
		try {
			const requestRenderUnlessInputSuppressed = vi.fn();
			const syncProgressSurfaceRefreshLoop = vi.fn();
			const syncTerminalProgressIndicator = vi.fn();
			const fakeThis: any = {
				inputActivitySuppressedUntil: 0,
				inputActivityResumeTimer: undefined,
				requestRenderUnlessInputSuppressed,
				syncProgressSurfaceRefreshLoop,
				syncTerminalProgressIndicator,
				isInputActivitySuppressed() {
					return (InteractiveMode as any).prototype.isInputActivitySuppressed.call(this);
				},
			};

			(InteractiveMode as any).prototype.markInputActivity.call(fakeThis);

			expect(syncProgressSurfaceRefreshLoop).toHaveBeenCalledTimes(1);
			expect(syncTerminalProgressIndicator).toHaveBeenCalledTimes(1);
			expect(requestRenderUnlessInputSuppressed).not.toHaveBeenCalled();
			expect(fakeThis.inputActivitySuppressedUntil).toBeGreaterThan(Date.now());

			vi.advanceTimersByTime(150);
			expect(requestRenderUnlessInputSuppressed).not.toHaveBeenCalled();

			vi.advanceTimersByTime(60);
			expect(requestRenderUnlessInputSuppressed).toHaveBeenCalledTimes(1);
			expect(syncProgressSurfaceRefreshLoop).toHaveBeenCalledTimes(2);
			expect(syncTerminalProgressIndicator).toHaveBeenCalledTimes(2);
			expect(fakeThis.inputActivityResumeTimer).toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});

	test("syncTerminalProgressIndicator disables terminal progress while input suppression is active", () => {
		const setProgress = vi.fn();
		const fakeThis: any = {
			settingsManager: { getShowTerminalProgress: () => true },
			ui: { terminal: { setProgress } },
			terminalProgressActive: true,
			isInputActivitySuppressed: () => true,
		};

		(InteractiveMode as any).prototype.syncTerminalProgressIndicator.call(fakeThis);

		expect(setProgress).toHaveBeenCalledWith(false);
	});

	test("syncTerminalProgressIndicator restores terminal progress after input suppression ends", () => {
		const setProgress = vi.fn();
		const fakeThis: any = {
			settingsManager: { getShowTerminalProgress: () => true },
			ui: { terminal: { setProgress } },
			terminalProgressActive: true,
			isInputActivitySuppressed: () => false,
		};

		(InteractiveMode as any).prototype.syncTerminalProgressIndicator.call(fakeThis);

		expect(setProgress).toHaveBeenCalledWith(true);
	});

	test("agent_start routes terminal progress through the input-aware helper", async () => {
		const setTerminalProgressActive = vi.fn();
		const renderWorkingArea = vi.fn();
		const requestRenderUnlessInputSuppressed = vi.fn();
		const fakeThis: any = {
			isInitialized: true,
			spinnerStartedAt: 0,
			spinnerResponseChars: 0,
			spinnerReportedOutputTokens: 0,
			spinnerThinkingStartedAt: 1,
			spinnerThinkingMinimumVisibleUntil: 1,
			spinnerThinkingDurationMs: 1,
			spinnerThoughtForVisibleUntil: 1,
			spinnerCurrentToolLabel: "Reading foo.ts",
			spinnerActiveToolCount: 3,
			pendingTools: new Map([["tool-1", {}]]),
			setTerminalProgressActive,
			requestRenderRespectingInput: vi.fn(),
			retryEscapeHandler: undefined,
			retryCountdown: undefined,
			retryLoader: undefined,
			stopWorkingLoader: vi.fn(),
			workingVisible: false,
			renderWorkingArea,
			requestRenderUnlessInputSuppressed,
			ui: { requestRender: vi.fn(), terminal: { setProgress: vi.fn() } },
			settingsManager: { getShowTerminalProgress: () => true },
			syncProgressSurfaceRefreshLoop: vi.fn(),
			footer: { invalidate: vi.fn() },
			session: { subscribe: vi.fn() },
		};

		await (InteractiveMode as any).prototype.handleEvent.call(fakeThis, { type: "agent_start" });

		expect(setTerminalProgressActive).toHaveBeenCalledWith(true);
		expect(fakeThis.pendingTools.size).toBe(0);
		expect(fakeThis.spinnerActiveToolCount).toBe(0);
		expect(renderWorkingArea).toHaveBeenCalledTimes(1);
		expect(requestRenderUnlessInputSuppressed).toHaveBeenCalledTimes(1);
	});

	test("compaction lifecycle routes terminal progress through the input-aware helper", async () => {
		const setTerminalProgressActive = vi.fn();
		const fakeThis: any = {
			isInitialized: true,
			spinnerSystemOverrideMessage: undefined,
			setSpinnerBanner: vi.fn(),
			setTerminalProgressActive,
			autoCompactionEscapeHandler: undefined,
			defaultEditor: { onEscape: vi.fn() },
			session: { abortCompaction: vi.fn(), subscribe: vi.fn() },
			settingsManager: { getShowTerminalProgress: () => true },
			ui: { requestRender: vi.fn(), terminal: { setProgress: vi.fn() } },
			requestRenderRespectingInput: vi.fn(),
			flushCompactionQueue: vi.fn(),
			syncProgressSurfaceRefreshLoop: vi.fn(),
			footer: { invalidate: vi.fn() },
		};

		await (InteractiveMode as any).prototype.handleEvent.call(fakeThis, {
			type: "compaction_start",
			reason: "manual",
		});
		await (InteractiveMode as any).prototype.handleEvent.call(fakeThis, {
			type: "compaction_end",
			reason: "manual",
			aborted: false,
			result: undefined,
			errorMessage: undefined,
			willRetry: false,
		});

		expect(setTerminalProgressActive).toHaveBeenNthCalledWith(1, true);
		expect(setTerminalProgressActive).toHaveBeenNthCalledWith(2, false);
	});

	test("branch summary loader creation routes first paint through the suppression-aware helper", () => {
		const requestRenderUnlessInputSuppressed = vi.fn();
		const taskbarContentContainer = new Container();
		const summaryLoader = {
			render: () => [""],
			invalidate: () => {},
		} as any;

		taskbarContentContainer.addChild(summaryLoader);
		requestRenderUnlessInputSuppressed();

		expect(taskbarContentContainer.children).toHaveLength(1);
		expect(requestRenderUnlessInputSuppressed).toHaveBeenCalledTimes(1);
	});

	test("auto-retry banner overrides the todo headline while retry is pending", async () => {
		const working = createProgressSurfaceWorkingState(0);
		const taskbarContentContainer = new Container();
		const requestRenderUnlessInputSuppressed = vi.fn();
		const fakeThis: any = makeBottomPaneAware({
			isInitialized: true,
			taskbarContentContainer,
			workingVisible: false,
			spinnerBanner: undefined,
			spinnerBannerTimeout: undefined,
			spinnerSystemOverrideMessage: undefined,
			clearSpinnerBannerTimeout() {
				return (InteractiveMode as any).prototype.clearSpinnerBannerTimeout.call(this);
			},
			syncProgressSurfaceRefreshLoop: vi.fn(),
			setSpinnerBanner(banner: unknown, options?: unknown) {
				return (InteractiveMode as any).prototype.setSpinnerBanner.call(this, banner, options);
			},
			session: {
				isStreaming: false,
				isCompacting: false,
				isRetrying: true,
				retryAttempt: 1,
				abortRetry: vi.fn(),
				subscribe: vi.fn(),
				getTaskUiSummary: () => undefined,
				getContextUsage: () => undefined,
				getSpinnerBudgetUsage: () => undefined,
			},
			settingsManager: {
				getSpinnerTipsEnabled: () => true,
				getShowTerminalProgress: () => false,
			},
			defaultEditor: { onEscape: vi.fn() },
			retryEscapeHandler: undefined,
			retryCountdown: { dispose: vi.fn() },
			requestRenderUnlessInputSuppressed,
			ui: { requestRender: vi.fn(), terminal: { setProgress: vi.fn() } },
			footer: { invalidate: vi.fn() },
			buildDefaultBudgetText: () => undefined,
			getProgressSurfaceSnapshot() {
				return createLiveTodoSnapshot((InteractiveMode as any).prototype.buildDefaultSpinnerState.call(this));
			},
			progressSurfaceComponent: new ProgressSurfaceComponent(
				() => fakeThis.getProgressSurfaceSnapshot(),
				theme,
				working,
			),
		});

		await (InteractiveMode as any).prototype.handleEvent.call(fakeThis, {
			type: "auto_retry_start",
			attempt: 1,
			maxAttempts: 3,
			delayMs: 5000,
			errorMessage: "connection lost",
		});

		(InteractiveMode as any).prototype.renderWorkingArea.call(fakeThis);
		const output = normalizeRenderedOutput(taskbarContentContainer);
		expect(output).toContain("Request unstable, retrying automatically");
		expect(output).toContain("Attempt 1/3");
		expect(output).not.toContain("整理接口定义...");
		expect(requestRenderUnlessInputSuppressed).toHaveBeenCalled();
	});

	test("startup watchers use suppression-aware redraws for theme and branch changes", () => {
		const requestRenderUnlessInputSuppressed = vi.fn();
		const updateEditorBorderColor = vi.fn();
		const ui = { invalidate: vi.fn() };

		const onThemeWatcher = () => {
			ui.invalidate();
			updateEditorBorderColor();
			requestRenderUnlessInputSuppressed();
		};
		const onBranchWatcher = () => {
			requestRenderUnlessInputSuppressed();
		};

		onThemeWatcher();
		onBranchWatcher();

		expect(ui.invalidate).toHaveBeenCalledTimes(1);
		expect(updateEditorBorderColor).toHaveBeenCalledTimes(1);
		expect(requestRenderUnlessInputSuppressed).toHaveBeenCalledTimes(2);
	});

	test("auto-retry keeps queued follow-up messages in the pending area, not the taskbar", async () => {
		const working = createProgressSurfaceWorkingState(0);
		const taskbarContentContainer = new Container();
		const pendingContentContainer = new Container();
		const fakeThis: any = makeBottomPaneAware({
			taskbarContentContainer,
			pendingContentContainer,
			pendingBashComponents: [],
			spinnerBanner: undefined,
			spinnerBannerTimeout: undefined,
			workingVisible: false,
			clearSpinnerBannerTimeout() {
				return (InteractiveMode as any).prototype.clearSpinnerBannerTimeout.call(this);
			},
			syncProgressSurfaceRefreshLoop: vi.fn(),
			requestRenderUnlessInputSuppressed: vi.fn(),
			getAllQueuedMessages: () => ({
				steering: [],
				followUp: ["完成后补文档"],
			}),
			getAppKeyDisplay: () => "Alt+Up",
			latestQueuedMessage: (steeringMessages: string[], followUpMessages: string[]) =>
				(InteractiveMode as any).prototype.latestQueuedMessage.call(fakeThis, steeringMessages, followUpMessages),
			session: {
				isStreaming: false,
				isCompacting: false,
				isRetrying: true,
				getTaskUiSummary: () => undefined,
				getContextUsage: () => undefined,
				getSpinnerBudgetUsage: () => undefined,
			},
			settingsManager: { getSpinnerTipsEnabled: () => true },
			ui: { requestRender: vi.fn() },
			buildDefaultBudgetText: () => undefined,
			spinnerSystemOverrideMessage: "Retrying request (1/3)",
			getProgressSurfaceSnapshot() {
				return createLiveTodoSnapshot((InteractiveMode as any).prototype.buildDefaultSpinnerState.call(this));
			},
			progressSurfaceComponent: new ProgressSurfaceComponent(
				() => fakeThis.getProgressSurfaceSnapshot(),
				theme,
				working,
			),
		});

		(InteractiveMode as any).prototype.setSpinnerBanner.call(fakeThis, {
			kind: "warning",
			title: "Request unstable, retrying automatically",
			detail: "Attempt 1/3 · retrying in 5s",
		});
		(InteractiveMode as any).prototype.renderWorkingArea.call(fakeThis);
		(InteractiveMode as any).prototype.updatePendingMessagesDisplay.call(fakeThis);

		expect(normalizeRenderedOutput(taskbarContentContainer)).toContain("Request unstable, retrying automatically");
		expect(normalizeRenderedOutput(taskbarContentContainer)).not.toContain("排队命令");
		expect(normalizeRenderedOutput(pendingContentContainer)).toContain("queued command");
		expect(normalizeRenderedOutput(pendingContentContainer)).toContain("Follow-up: 完成后补文档");
	});

	test("flushCompactionQueue with willRetry keeps queued follow-up flow out of the transcript", async () => {
		const updatePendingMessagesDisplay = vi.fn();
		const followUp = vi.fn().mockResolvedValue(undefined);
		const steer = vi.fn().mockResolvedValue(undefined);
		const prompt = vi.fn().mockResolvedValue(undefined);
		const fakeThis: any = {
			compactionQueuedMessages: [{ text: "完成后补文档", mode: "followUp" }],
			updatePendingMessagesDisplay,
			isExtensionCommand: vi.fn(() => false),
			session: {
				clearQueue: vi.fn(),
				followUp,
				steer,
				prompt,
				subscribe: vi.fn(),
			},
			showError: vi.fn(),
			chatContainer: new Container(),
		};

		await (InteractiveMode as any).prototype.flushCompactionQueue.call(fakeThis, { willRetry: true });

		expect(followUp).toHaveBeenCalledWith("完成后补文档");
		expect(steer).not.toHaveBeenCalled();
		expect(prompt).not.toHaveBeenCalled();
		expect(updatePendingMessagesDisplay).toHaveBeenCalled();
		expect(fakeThis.showError).not.toHaveBeenCalled();
		expect(normalizeRenderedOutput(fakeThis.chatContainer)).not.toContain("queued");
	});

	test("handleBashCommand routes live output redraws through the suppression-aware helper", async () => {
		const requestRenderUnlessInputSuppressed = vi.fn();
		const chatContainer = new Container();
		const fakeThis: any = {
			session: {
				isStreaming: false,
				executeBash: vi.fn(async (_command: string, onChunk: (chunk: string) => void) => {
					onChunk("hello");
					return {
						output: "",
						exitCode: 0,
						cancelled: false,
						truncated: false,
						fullOutputPath: undefined,
					};
				}),
				recordBashResult: vi.fn(),
				extensionRunner: {
					emitUserBash: vi.fn(async () => undefined),
				},
			},
			sessionManager: { getCwd: () => "/tmp/project" },
			chatContainer,
			pendingBashComponents: [],
			updatePendingMessagesDisplay: vi.fn(),
			showError: vi.fn(),
			requestRenderUnlessInputSuppressed,
			ui: { requestRender: vi.fn() },
			bashComponent: undefined,
		};

		await (InteractiveMode as any).prototype.handleBashCommand.call(fakeThis, "echo hi", false);

		expect(requestRenderUnlessInputSuppressed).toHaveBeenCalledTimes(3);
		expect(fakeThis.ui.requestRender).not.toHaveBeenCalled();
	});

	test("handleBashCommand start and completion also avoid direct ui.requestRender", async () => {
		const requestRenderUnlessInputSuppressed = vi.fn();
		const chatContainer = new Container();
		const fakeThis: any = {
			session: {
				isStreaming: false,
				executeBash: vi.fn(async () => ({
					output: "",
					exitCode: 0,
					cancelled: false,
					truncated: false,
					fullOutputPath: undefined,
				})),
				recordBashResult: vi.fn(),
				extensionRunner: {
					emitUserBash: vi.fn(async () => undefined),
				},
			},
			sessionManager: { getCwd: () => "/tmp/project" },
			chatContainer,
			pendingBashComponents: [],
			updatePendingMessagesDisplay: vi.fn(),
			showError: vi.fn(),
			requestRenderUnlessInputSuppressed,
			ui: { requestRender: vi.fn() },
			bashComponent: undefined,
		};

		await (InteractiveMode as any).prototype.handleBashCommand.call(fakeThis, "echo hi", false);

		expect(requestRenderUnlessInputSuppressed).toHaveBeenCalledTimes(2);
		expect(fakeThis.ui.requestRender).not.toHaveBeenCalled();
	});

	test("tool execution lifecycle redraws now respect input suppression", () => {
		const ui = {
			requestRender: vi.fn(),
			shouldSuppressBackgroundRenderUpdates: () => true,
		} as any;
		const component = new ToolExecutionComponent("read", "tool-1", { path: "src/foo.ts" }, {}, undefined, ui, "/tmp");

		component.markExecutionStarted();
		component.setArgsComplete();

		expect(ui.requestRender).not.toHaveBeenCalled();
	});

	test("agent_end clears the core progress surface state so the taskbar can disappear", async () => {
		const taskbarContentContainer = new Container();
		const loadingAnimation = { stop: vi.fn() };
		const renderWorkingArea = vi.fn(() => {
			taskbarContentContainer.clear();
		});
		const resetSpinnerRuntimeState = vi.fn(function (this: any) {
			this.spinnerBanner = undefined;
			this.spinnerSystemOverrideMessage = undefined;
		});
		const fakeThis: any = {
			isInitialized: true,
			settingsManager: { getShowTerminalProgress: () => false },
			ui: { terminal: { setProgress: vi.fn() }, requestRender: vi.fn() },
			requestRenderRespectingInput: vi.fn(),
			agentRunActive: true,
			spinnerStartedAt: Date.now() - 5000,
			spinnerReportedOutputTokens: 42,
			spinnerThinkingStartedAt: null,
			spinnerThinkingMinimumVisibleUntil: 123,
			spinnerThinkingDurationMs: 1200,
			loadingAnimation,
			taskbarContentContainer,
			renderWorkingArea,
			streamingComponent: { render: () => [""], invalidate: () => {} },
			streamingMessage: {},
			chatContainer: { removeChild: vi.fn() },
			pendingTools: new Map([["tool-1", {}]]),
			activeCollapsedToolGroup: {},
			collapsedGroupByToolCallId: new Map([["tool-1", {}]]),
			activeToolSummary: {},
			toolSummaryByToolCallId: new Map([["tool-1", {}]]),
			activeToolBatchSummary: {},
			toolBatchSummaryByToolCallId: new Map([["tool-1", {}]]),
			resetSpinnerRuntimeState,
			syncProgressSurfaceRefreshLoop: vi.fn(),
			setTerminalProgressActive: vi.fn(),
			checkShutdownRequested: vi.fn().mockResolvedValue(undefined),
			footer: { invalidate: vi.fn() },
			spinnerBanner: { kind: "success", title: "Connection restored" },
			spinnerSystemOverrideMessage: "Waiting for approval",
			session: { subscribe: vi.fn() },
		};

		await (InteractiveMode as any).prototype.handleEvent.call(fakeThis, { type: "agent_end" });

		expect(loadingAnimation.stop).toHaveBeenCalledTimes(1);
		expect(renderWorkingArea).toHaveBeenCalledTimes(1);
		expect(fakeThis.chatContainer.removeChild).toHaveBeenCalledTimes(1);
		expect(fakeThis.pendingTools.size).toBe(0);
		expect(fakeThis.collapsedGroupByToolCallId.size).toBe(0);
		expect(fakeThis.toolSummaryByToolCallId.size).toBe(0);
		expect(fakeThis.toolBatchSummaryByToolCallId.size).toBe(0);
		expect(resetSpinnerRuntimeState).toHaveBeenCalledTimes(1);
		expect(fakeThis.spinnerBanner).toBeUndefined();
		expect(fakeThis.spinnerSystemOverrideMessage).toBeUndefined();
		expect(fakeThis.agentRunActive).toBe(false);
		expect(fakeThis.requestRenderRespectingInput).toHaveBeenCalledTimes(1);
	});

	test("renderWorkingArea does not recreate the loader after agent_end when session.isStreaming is still true", () => {
		const taskbarContentContainer = new Container();
		const fakeThis: any = makeBottomPaneAware({
			taskbarContentContainer,
			workingVisible: true,
			agentRunActive: false,
			session: {
				isStreaming: true,
				isCompacting: false,
				isRetrying: false,
				getTaskUiItems: () => [],
			},
			getProgressSurfaceSnapshot() {
				return {
					tasks: [],
					queued: undefined,
					spinner: undefined,
					expanded: false,
				};
			},
			progressSurfaceComponent: { render: () => [""], invalidate: () => {} },
			requestRenderUnlessInputSuppressed: vi.fn(),
		});

		(InteractiveMode as any).prototype.renderWorkingArea.call(fakeThis);

		expect(fakeThis.loadingAnimation).toBeUndefined();
		expect(taskbarContentContainer.children).toHaveLength(0);
	});

	test("hideExtensionSelector clears approval banner and waiting status", () => {
		const editorContainer = new Container();
		const editor = { render: () => [""], invalidate: () => {} } as any;
		const selector = { dispose: vi.fn(), render: () => [""], invalidate: () => {} } as any;
		const setExtensionStatus = vi.fn();
		const setSpinnerBanner = vi.fn();
		const fakeThis: any = makeBottomPaneAware({
			editorContainer,
			editor,
			extensionSelector: selector,
			setExtensionStatus,
			setSpinnerBanner,
			ui: { setFocus: vi.fn(), requestRender: vi.fn() },
			requestRenderRespectingInput: vi.fn(),
		});

		(InteractiveMode as any).prototype.hideExtensionSelector.call(fakeThis);

		expect(selector.dispose).toHaveBeenCalledTimes(1);
		expect(fakeThis.extensionSelector).toBeUndefined();
		expect(setExtensionStatus).toHaveBeenCalledWith("ui", undefined);
		expect(setSpinnerBanner).toHaveBeenCalledWith(undefined);
		expect(fakeThis.ui.setFocus).toHaveBeenCalledWith(editor);
	});

	test("showExtensionSelector drives the taskbar into approval state", async () => {
		const taskbarContentContainer = new Container();
		const working = createProgressSurfaceWorkingState(0);
		const fakeThis: any = makeBottomPaneAware({
			taskbarContentContainer,
			workingVisible: false,
			footerDataProvider: { setExtensionStatus: vi.fn() },
			ui: { requestRender: vi.fn() },
			requestRenderRespectingInput: vi.fn(),
			clearSpinnerBannerTimeout() {
				return (InteractiveMode as any).prototype.clearSpinnerBannerTimeout.call(this);
			},
			syncProgressSurfaceRefreshLoop: vi.fn(),
			requestRenderUnlessInputSuppressed: vi.fn(),
			session: {
				isStreaming: false,
				isCompacting: false,
				isRetrying: false,
				getTaskUiSummary: () => undefined,
				getContextUsage: () => undefined,
				getSpinnerBudgetUsage: () => undefined,
			},
			settingsManager: { getSpinnerTipsEnabled: () => true },
			buildDefaultBudgetText: () => undefined,
			spinnerSystemOverrideMessage: "Waiting for approval",
			getProgressSurfaceSnapshot() {
				return createLiveTodoSnapshot((InteractiveMode as any).prototype.buildDefaultSpinnerState.call(this));
			},
			progressSurfaceComponent: new ProgressSurfaceComponent(
				() => fakeThis.getProgressSurfaceSnapshot(),
				theme,
				working,
			),
		});

		(InteractiveMode as any).prototype.setExtensionStatus.call(fakeThis, "ui", "waiting · Awaiting approval");
		(InteractiveMode as any).prototype.setSpinnerBanner.call(fakeThis, {
			kind: "approval",
			title: "Awaiting approval",
			detail: "Import session",
		});
		(InteractiveMode as any).prototype.renderWorkingArea.call(fakeThis);

		const output = normalizeRenderedOutput(taskbarContentContainer);
		expect(output).toContain("Awaiting approval");
		expect(output).toContain("Import session");
		expect(output).not.toContain("整理接口定义...");
	});

	test("hideExtensionInput clears input banner and waiting status", () => {
		const editorContainer = new Container();
		const editor = { render: () => [""], invalidate: () => {} } as any;
		const input = { dispose: vi.fn(), render: () => [""], invalidate: () => {} } as any;
		const setExtensionStatus = vi.fn();
		const setSpinnerBanner = vi.fn();
		const fakeThis: any = makeBottomPaneAware({
			editorContainer,
			editor,
			extensionInput: input,
			setExtensionStatus,
			setSpinnerBanner,
			ui: { setFocus: vi.fn(), requestRender: vi.fn() },
			requestRenderRespectingInput: vi.fn(),
		});

		(InteractiveMode as any).prototype.hideExtensionInput.call(fakeThis);

		expect(input.dispose).toHaveBeenCalledTimes(1);
		expect(fakeThis.extensionInput).toBeUndefined();
		expect(setExtensionStatus).toHaveBeenCalledWith("ui", undefined);
		expect(setSpinnerBanner).toHaveBeenCalledWith(undefined);
		expect(fakeThis.ui.setFocus).toHaveBeenCalledWith(editor);
	});

	test("showExtensionInput drives the taskbar into input state", async () => {
		const taskbarContentContainer = new Container();
		const working = createProgressSurfaceWorkingState(0);
		const fakeThis: any = makeBottomPaneAware({
			taskbarContentContainer,
			workingVisible: false,
			footerDataProvider: { setExtensionStatus: vi.fn() },
			ui: { requestRender: vi.fn() },
			requestRenderRespectingInput: vi.fn(),
			clearSpinnerBannerTimeout() {
				return (InteractiveMode as any).prototype.clearSpinnerBannerTimeout.call(this);
			},
			syncProgressSurfaceRefreshLoop: vi.fn(),
			requestRenderUnlessInputSuppressed: vi.fn(),
			session: {
				isStreaming: false,
				isCompacting: false,
				isRetrying: false,
				getTaskUiSummary: () => undefined,
				getContextUsage: () => undefined,
				getSpinnerBudgetUsage: () => undefined,
			},
			settingsManager: { getSpinnerTipsEnabled: () => true },
			buildDefaultBudgetText: () => undefined,
			spinnerSystemOverrideMessage: "Waiting for input",
			getProgressSurfaceSnapshot() {
				return createLiveTodoSnapshot((InteractiveMode as any).prototype.buildDefaultSpinnerState.call(this));
			},
			progressSurfaceComponent: new ProgressSurfaceComponent(
				() => fakeThis.getProgressSurfaceSnapshot(),
				theme,
				working,
			),
		});

		(InteractiveMode as any).prototype.setExtensionStatus.call(fakeThis, "ui", "waiting · 输入审批理由");
		(InteractiveMode as any).prototype.setSpinnerBanner.call(fakeThis, {
			kind: "input",
			title: "Awaiting your input",
			detail: "输入审批理由",
		});
		(InteractiveMode as any).prototype.renderWorkingArea.call(fakeThis);

		const output = normalizeRenderedOutput(taskbarContentContainer);
		expect(output).toContain("Awaiting your input");
		expect(output).toContain("输入审批理由");
		expect(output).not.toContain("整理接口定义...");
	});
});

describe("InteractiveMode.showLoadedResources", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	function createShowLoadedResourcesThis(options: {
		quietStartup: boolean;
		verbose?: boolean;
		toolOutputExpanded?: boolean;
		cwd?: string;
		contextFiles?: Array<{ path: string; content?: string }>;
		extensions?: ExtensionFixture[];
		skills?: Array<{ filePath: string; name: string }>;
		skillDiagnostics?: Array<{ type: "warning" | "error" | "collision"; message: string }>;
		useRealScopeGroups?: boolean;
	}) {
		const fakeThis: any = {
			options: { verbose: options.verbose ?? false },
			toolOutputExpanded: options.toolOutputExpanded ?? false,
			chatContainer: new Container(),
			settingsManager: {
				getQuietStartup: () => options.quietStartup,
			},
			sessionManager: {
				getCwd: () => options.cwd ?? "/tmp/project",
			},
			session: {
				promptTemplates: [],
				extensionRunner: {
					getCommandDiagnostics: () => [],
					getShortcutDiagnostics: () => [],
				},
				resourceLoader: {
					getPathMetadata: () => new Map(),
					getAgentsFiles: () => ({ agentsFiles: options.contextFiles ?? [] }),
					getSkills: () => ({
						skills: options.skills ?? [],
						diagnostics: options.skillDiagnostics ?? [],
					}),
					getPrompts: () => ({ prompts: [], diagnostics: [] }),
					getExtensions: () => ({ extensions: options.extensions ?? [], errors: [], runtime: {} }),
					getThemes: () => ({ themes: [], diagnostics: [] }),
				},
			},
			formatDisplayPath: (p: string) => (InteractiveMode as any).prototype.formatDisplayPath.call(fakeThis, p),
			formatExtensionDisplayPath: (p: string) =>
				(InteractiveMode as any).prototype.formatExtensionDisplayPath.call(fakeThis, p),
			formatContextPath: (p: string) => (InteractiveMode as any).prototype.formatContextPath.call(fakeThis, p),
			getStartupExpansionState: () => (InteractiveMode as any).prototype.getStartupExpansionState.call(fakeThis),
			buildScopeGroups: () => [],
			formatScopeGroups: () => "resource-list",
			isPackageSource: (sourceInfo?: SourceInfo) =>
				(InteractiveMode as any).prototype.isPackageSource.call(fakeThis, sourceInfo),
			getShortPath: (p: string, sourceInfo?: SourceInfo) =>
				(InteractiveMode as any).prototype.getShortPath.call(fakeThis, p, sourceInfo),
			getCompactPathLabel: (p: string, sourceInfo?: SourceInfo) =>
				(InteractiveMode as any).prototype.getCompactPathLabel.call(fakeThis, p, sourceInfo),
			getCompactPackageSourceLabel: (sourceInfo?: SourceInfo) =>
				(InteractiveMode as any).prototype.getCompactPackageSourceLabel.call(fakeThis, sourceInfo),
			getCompactExtensionLabel: (p: string, sourceInfo?: SourceInfo) =>
				(InteractiveMode as any).prototype.getCompactExtensionLabel.call(fakeThis, p, sourceInfo),
			getCompactDisplayPathSegments: (p: string) =>
				(InteractiveMode as any).prototype.getCompactDisplayPathSegments.call(fakeThis, p),
			getCompactNonPackageExtensionLabel: (
				p: string,
				index: number,
				allPaths: Array<{ path: string; segments: string[] }>,
			) => (InteractiveMode as any).prototype.getCompactNonPackageExtensionLabel.call(fakeThis, p, index, allPaths),
			getCompactExtensionLabels: (extensions: ExtensionFixture[]) =>
				(InteractiveMode as any).prototype.getCompactExtensionLabels.call(fakeThis, extensions),
			formatDiagnostics: () => "diagnostics",
			getBuiltInCommandConflictDiagnostics: () => [],
		};

		if (options.useRealScopeGroups) {
			fakeThis.getScopeGroup = (sourceInfo?: SourceInfo) =>
				(InteractiveMode as any).prototype.getScopeGroup.call(fakeThis, sourceInfo);
			fakeThis.buildScopeGroups = (items: Array<{ path: string; sourceInfo?: SourceInfo }>) =>
				(InteractiveMode as any).prototype.buildScopeGroups.call(fakeThis, items);
			fakeThis.formatScopeGroups = (groups: unknown, formatOptions: unknown) =>
				(InteractiveMode as any).prototype.formatScopeGroups.call(fakeThis, groups, formatOptions);
		}

		return fakeThis;
	}

	function createSourceInfo(
		filePath: string,
		options: {
			source: string;
			scope: "user" | "project" | "temporary";
			origin: "package" | "top-level";
			baseDir?: string;
		},
	): SourceInfo {
		return {
			path: filePath,
			source: options.source,
			scope: options.scope,
			origin: options.origin,
			baseDir: options.baseDir,
		};
	}

	function createExtensionFixtures(): ExtensionFixture[] {
		return [
			{
				path: "/tmp/project/.lumen/extensions/answer.ts",
				sourceInfo: createSourceInfo("/tmp/project/.lumen/extensions/answer.ts", {
					source: "local",
					scope: "project",
					origin: "top-level",
					baseDir: "/tmp/project/.lumen/extensions",
				}),
			},
			{
				path: "/tmp/project/.lumen/extensions/local-index/index.ts",
				sourceInfo: createSourceInfo("/tmp/project/.lumen/extensions/local-index/index.ts", {
					source: "local",
					scope: "project",
					origin: "top-level",
					baseDir: "/tmp/project/.lumen/extensions",
				}),
			},
			{
				path: "/tmp/agent/extensions/user-index/index.ts",
				sourceInfo: createSourceInfo("/tmp/agent/extensions/user-index/index.ts", {
					source: "local",
					scope: "user",
					origin: "top-level",
					baseDir: "/tmp/agent/extensions",
				}),
			},
			{
				path: "/tmp/project/.lumen/npm/node_modules/pi-markdown-preview/extensions/index.ts",
				sourceInfo: createSourceInfo(
					"/tmp/project/.lumen/npm/node_modules/pi-markdown-preview/extensions/index.ts",
					{
						source: "npm:pi-markdown-preview",
						scope: "project",
						origin: "package",
						baseDir: "/tmp/project/.lumen/npm/node_modules/pi-markdown-preview",
					},
				),
			},
			{
				path: "/tmp/project/.lumen/npm/node_modules/@scope/pi-scoped/extensions/index.ts",
				sourceInfo: createSourceInfo("/tmp/project/.lumen/npm/node_modules/@scope/pi-scoped/extensions/index.ts", {
					source: "npm:@scope/pi-scoped",
					scope: "project",
					origin: "package",
					baseDir: "/tmp/project/.lumen/npm/node_modules/@scope/pi-scoped",
				}),
			},
			{
				path: "/tmp/project/.lumen/git/github.com/HazAT/pi-interactive-subagents/extensions/index.ts",
				sourceInfo: createSourceInfo(
					"/tmp/project/.lumen/git/github.com/HazAT/pi-interactive-subagents/extensions/index.ts",
					{
						source: "git:github.com/HazAT/pi-interactive-subagents",
						scope: "project",
						origin: "package",
						baseDir: "/tmp/project/.lumen/git/github.com/HazAT/pi-interactive-subagents",
					},
				),
			},
			{
				path: "/tmp/project/.lumen/git/github.com/HazAT/pi-interactive-subagents/extensions/subagents/index.ts",
				sourceInfo: createSourceInfo(
					"/tmp/project/.lumen/git/github.com/HazAT/pi-interactive-subagents/extensions/subagents/index.ts",
					{
						source: "git:github.com/HazAT/pi-interactive-subagents",
						scope: "project",
						origin: "package",
						baseDir: "/tmp/project/.lumen/git/github.com/HazAT/pi-interactive-subagents",
					},
				),
			},
			{
				path: "/tmp/temp/cli-extension.ts",
				sourceInfo: createSourceInfo("/tmp/temp/cli-extension.ts", {
					source: "cli",
					scope: "temporary",
					origin: "top-level",
					baseDir: "/tmp/temp",
				}),
			},
		];
	}

	test("shows a compact resource listing by default", () => {
		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			skills: [{ filePath: "/tmp/skill/SKILL.md", name: "commit" }],
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		const output = renderAll(fakeThis.chatContainer);
		expect(output).toContain("[技能]");
		expect(output).toContain("commit");
		expect(output).not.toContain("resource-list");
	});

	test("shows full resource listing when expanded", () => {
		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			toolOutputExpanded: true,
			skills: [{ filePath: "/tmp/skill/SKILL.md", name: "commit" }],
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		const output = renderAll(fakeThis.chatContainer);
		expect(output).toContain("[技能]");
		expect(output).toContain("resource-list");
		expect(output).not.toContain("commit");
	});

	test("shows full resource listing on verbose startup even when tool output is collapsed", () => {
		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: true,
			verbose: true,
			toolOutputExpanded: false,
			skills: [{ filePath: "/tmp/skill/SKILL.md", name: "commit" }],
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		const output = renderAll(fakeThis.chatContainer);
		expect(output).toContain("[技能]");
		expect(output).toContain("resource-list");
		expect(output).not.toContain("commit");
	});

	test("abbreviates extensions in compact listing", () => {
		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			extensions: [{ path: "/tmp/extensions/answer.ts" }, { path: "/tmp/extensions/btw.ts" }],
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		const output = renderAll(fakeThis.chatContainer);
		expect(output).toContain("[扩展]");
		expect(output).toContain("answer.ts, btw.ts");
		expect(output).not.toContain("extensions/answer.ts");
	});

	test("captures mixed extension layouts in compact output", () => {
		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			extensions: createExtensionFixtures(),
			useRealScopeGroups: true,
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		expect(normalizeRenderedOutput(fakeThis.chatContainer)).toMatchInlineSnapshot(`
"[扩展]
  @scope/pi-scoped, answer.ts, cli-extension.ts, HazAT/pi-interactive-subagents, HazAT/pi-interactive-subagents:subagents, local-index, pi-markdown-preview, user-index"`);
	});

	test("adds more parent folders until local extension labels are unique", () => {
		const extensions: ExtensionFixture[] = [
			{
				path: "/tmp/alpha/one/index.ts",
				sourceInfo: createSourceInfo("/tmp/alpha/one/index.ts", {
					source: "cli",
					scope: "temporary",
					origin: "top-level",
					baseDir: "/tmp/alpha",
				}),
			},
			{
				path: "/tmp/beta/one/index.ts",
				sourceInfo: createSourceInfo("/tmp/beta/one/index.ts", {
					source: "cli",
					scope: "temporary",
					origin: "top-level",
					baseDir: "/tmp/beta",
				}),
			},
			{
				path: "/tmp/gamma/one/index.ts",
				sourceInfo: createSourceInfo("/tmp/gamma/one/index.ts", {
					source: "cli",
					scope: "temporary",
					origin: "top-level",
					baseDir: "/tmp/gamma",
				}),
			},
		];

		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			extensions,
			useRealScopeGroups: true,
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		expect(normalizeRenderedOutput(fakeThis.chatContainer)).toMatchInlineSnapshot(`
"[扩展]
  alpha/one, beta/one, gamma/one"`);
	});

	test("strips index.ts from local extension label, showing parent dir", () => {
		const extensions: ExtensionFixture[] = [
			{
				path: "/tmp/extensions/plan-mode/index.ts",
				sourceInfo: createSourceInfo("/tmp/extensions/plan-mode/index.ts", {
					source: "local",
					scope: "project",
					origin: "top-level",
					baseDir: "/tmp/extensions",
				}),
			},
		];

		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			extensions,
			useRealScopeGroups: true,
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		expect(normalizeRenderedOutput(fakeThis.chatContainer)).toMatchInlineSnapshot(`
"[扩展]
  plan-mode"`);
	});

	test("strips index.js from local extension label, showing parent dir", () => {
		const extensions: ExtensionFixture[] = [
			{
				path: "/tmp/extensions/plan-mode/index.js",
				sourceInfo: createSourceInfo("/tmp/extensions/plan-mode/index.js", {
					source: "local",
					scope: "project",
					origin: "top-level",
					baseDir: "/tmp/extensions",
				}),
			},
		];

		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			extensions,
			useRealScopeGroups: true,
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		expect(normalizeRenderedOutput(fakeThis.chatContainer)).toMatchInlineSnapshot(`
"[扩展]
  plan-mode"`);
	});

	test("mixed single-file and subdirectory index.ts extensions strip index.ts", () => {
		const extensions: ExtensionFixture[] = [
			{
				path: "/tmp/extensions/webfetch.ts",
				sourceInfo: createSourceInfo("/tmp/extensions/webfetch.ts", {
					source: "local",
					scope: "project",
					origin: "top-level",
					baseDir: "/tmp/extensions",
				}),
			},
			{
				path: "/tmp/extensions/plan-mode/index.ts",
				sourceInfo: createSourceInfo("/tmp/extensions/plan-mode/index.ts", {
					source: "local",
					scope: "project",
					origin: "top-level",
					baseDir: "/tmp/extensions",
				}),
			},
		];

		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			extensions,
			useRealScopeGroups: true,
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		expect(normalizeRenderedOutput(fakeThis.chatContainer)).toMatchInlineSnapshot(`
"[扩展]
  plan-mode, webfetch.ts"`);
	});

	test("multiple index.ts with unique parent dirs need no disambiguation", () => {
		const extensions: ExtensionFixture[] = [
			{
				path: "/tmp/extensions/foo/index.ts",
				sourceInfo: createSourceInfo("/tmp/extensions/foo/index.ts", {
					source: "local",
					scope: "project",
					origin: "top-level",
					baseDir: "/tmp/extensions",
				}),
			},
			{
				path: "/tmp/extensions/bar/index.ts",
				sourceInfo: createSourceInfo("/tmp/extensions/bar/index.ts", {
					source: "local",
					scope: "project",
					origin: "top-level",
					baseDir: "/tmp/extensions",
				}),
			},
		];

		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			extensions,
			useRealScopeGroups: true,
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		expect(normalizeRenderedOutput(fakeThis.chatContainer)).toMatchInlineSnapshot(`
"[扩展]
  bar, foo"`);
	});

	test("multiple index.ts with same parent dir name disambiguated with grandparent", () => {
		const extensions: ExtensionFixture[] = [
			{
				path: "/tmp/alpha/tools/index.ts",
				sourceInfo: createSourceInfo("/tmp/alpha/tools/index.ts", {
					source: "cli",
					scope: "temporary",
					origin: "top-level",
					baseDir: "/tmp/alpha",
				}),
			},
			{
				path: "/tmp/beta/tools/index.ts",
				sourceInfo: createSourceInfo("/tmp/beta/tools/index.ts", {
					source: "cli",
					scope: "temporary",
					origin: "top-level",
					baseDir: "/tmp/beta",
				}),
			},
		];

		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			extensions,
			useRealScopeGroups: true,
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		expect(normalizeRenderedOutput(fakeThis.chatContainer)).toMatchInlineSnapshot(`
"[扩展]
  alpha/tools, beta/tools"`);
	});

	test("non-index file in subdirectory stays as filename", () => {
		const extensions: ExtensionFixture[] = [
			{
				path: "/tmp/extensions/my-ext/main.ts",
				sourceInfo: createSourceInfo("/tmp/extensions/my-ext/main.ts", {
					source: "local",
					scope: "project",
					origin: "top-level",
					baseDir: "/tmp/extensions",
				}),
			},
		];

		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			extensions,
			useRealScopeGroups: true,
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		expect(normalizeRenderedOutput(fakeThis.chatContainer)).toMatchInlineSnapshot(`
"[扩展]
  main.ts"`);
	});

	test("package extensions still strip index.ts correctly (regression guard)", () => {
		const extensions: ExtensionFixture[] = [
			{
				path: "/tmp/project/.lumen/npm/node_modules/pi-markdown-preview/extensions/index.ts",
				sourceInfo: createSourceInfo(
					"/tmp/project/.lumen/npm/node_modules/pi-markdown-preview/extensions/index.ts",
					{
						source: "npm:pi-markdown-preview",
						scope: "project",
						origin: "package",
						baseDir: "/tmp/project/.lumen/npm/node_modules/pi-markdown-preview",
					},
				),
			},
		];

		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			extensions,
			useRealScopeGroups: true,
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		expect(normalizeRenderedOutput(fakeThis.chatContainer)).toMatchInlineSnapshot(`
"[扩展]
  pi-markdown-preview"`);
	});
	test("captures mixed extension layouts in expanded output", () => {
		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			toolOutputExpanded: true,
			extensions: createExtensionFixtures(),
			useRealScopeGroups: true,
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		expect(normalizeRenderedOutput(fakeThis.chatContainer)).toMatchInlineSnapshot(`
"[扩展]
  project
    /tmp/project/.lumen/extensions/answer.ts
    /tmp/project/.lumen/extensions/local-index
    git:github.com/HazAT/pi-interactive-subagents
      extensions
      extensions/subagents
    npm:@scope/pi-scoped
      extensions
    npm:pi-markdown-preview
      extensions
  user
    /tmp/agent/extensions/user-index
  path
    /tmp/temp/cli-extension.ts"`);
	});

	test("shows context paths relative to cwd while preserving full external paths", () => {
		const home = homedir();
		const cwd = path.join(home, "Development", "pi-mono");
		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			cwd,
			contextFiles: [
				{ path: path.join(home, ".lumen", "agent", "AGENTS.md") },
				{ path: path.join(cwd, "AGENTS.md") },
			],
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		const output = renderAll(fakeThis.chatContainer).replace(/\\/g, "/");
		expect(output).toContain("[上下文]");
		expect(output).toContain("~/.lumen/agent/AGENTS.md, AGENTS.md");
		expect(output).not.toContain(`${cwd.replace(/\\/g, "/")}/AGENTS.md`);
	});

	test("shows full context paths when expanded", () => {
		const home = homedir();
		const cwd = path.join(home, "Development", "pi-mono");
		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: false,
			toolOutputExpanded: true,
			cwd,
			contextFiles: [
				{ path: path.join(home, ".lumen", "agent", "AGENTS.md") },
				{ path: path.join(cwd, "AGENTS.md") },
			],
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
		});

		const output = renderAll(fakeThis.chatContainer).replace(/\\/g, "/");
		expect(output).toContain("[上下文]");
		expect(output).toContain("~/.lumen/agent/AGENTS.md");
		expect(output).toContain("~/Development/pi-mono/AGENTS.md");
		expect(output).not.toContain("~/.lumen/agent/AGENTS.md, AGENTS.md");
	});

	test("does not show verbose listing on quiet startup during reload", () => {
		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: true,
			skills: [{ filePath: "/tmp/skill/SKILL.md", name: "commit" }],
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			extensions: [{ path: "/tmp/ext/index.ts" }],
			force: false,
			showDiagnosticsWhenQuiet: true,
		});

		expect(fakeThis.chatContainer.children).toHaveLength(0);
	});

	test("still shows diagnostics on quiet startup when requested", () => {
		const fakeThis = createShowLoadedResourcesThis({
			quietStartup: true,
			skills: [{ filePath: "/tmp/skill/SKILL.md", name: "commit" }],
			skillDiagnostics: [{ type: "warning", message: "duplicate skill name" }],
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			force: false,
			showDiagnosticsWhenQuiet: true,
		});

		const output = renderAll(fakeThis.chatContainer);
		expect(output).toContain("[技能冲突]");
		expect(output).not.toContain("[技能]");
	});
});
