import { describe, expect, test, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

describe("InteractiveMode compaction events", () => {
	test("rebuilds chat and appends a synthetic compaction summary at the bottom", async () => {
		const taskbarContent = { clear: vi.fn() };
		const fakeThis = {
			isInitialized: true,
			footer: { invalidate: vi.fn() },
			syncProgressSurfaceRefreshLoop: vi.fn(),
			setSpinnerBanner: vi.fn(),
			setTerminalProgressActive: vi.fn(),
			autoCompactionEscapeHandler: undefined as (() => void) | undefined,
			autoCompactionLoader: undefined,
			defaultEditor: {},
			bottomPane: {
				taskbarContent,
			},
			taskbarContentContainer: taskbarContent,
			chatContainer: { clear: vi.fn() },
			rebuildChatFromMessages: vi.fn(),
			addMessageToChat: vi.fn(),
			showError: vi.fn(),
			showTaskbarNotice: vi.fn(),
			showWarning: vi.fn(),
			flushCompactionQueue: vi.fn().mockResolvedValue(undefined),
			settingsManager: { getShowTerminalProgress: () => false },
			ui: { requestRender: vi.fn(), terminal: { setProgress: vi.fn() } },
			requestRenderRespectingInput: vi.fn(),
		};

		const handleEvent = Reflect.get(InteractiveMode.prototype, "handleEvent") as (
			this: typeof fakeThis,
			event: {
				type: "compaction_end";
				reason: "manual" | "threshold" | "overflow";
				result: { tokensBefore: number; summary: string } | undefined;
				aborted: boolean;
				willRetry: boolean;
				errorMessage?: string;
				notices?: Array<{ level: "info" | "warning"; message: string }>;
			},
		) => Promise<void>;

		await handleEvent.call(fakeThis, {
			type: "compaction_end",
			reason: "manual",
			result: {
				tokensBefore: 123,
				summary: "summary",
			},
			aborted: false,
			willRetry: false,
		});

		expect(fakeThis.chatContainer.clear).toHaveBeenCalledTimes(1);
		expect(fakeThis.rebuildChatFromMessages).toHaveBeenCalledTimes(1);
		expect(fakeThis.addMessageToChat).toHaveBeenCalledTimes(1);
		expect(fakeThis.addMessageToChat).toHaveBeenCalledWith(
			expect.objectContaining({
				role: "compactionSummary",
				tokensBefore: 123,
				summary: "summary",
			}),
		);
		expect(fakeThis.flushCompactionQueue).toHaveBeenCalledWith({ willRetry: false });
	});

	test("renders compaction notices through the standard status and warning helpers", async () => {
		initTheme("dark");
		const taskbarContent = { clear: vi.fn() };
		const fakeThis = {
			isInitialized: true,
			footer: { invalidate: vi.fn() },
			syncProgressSurfaceRefreshLoop: vi.fn(),
			setSpinnerBanner: vi.fn(),
			setTerminalProgressActive: vi.fn(),
			autoCompactionEscapeHandler: undefined as (() => void) | undefined,
			autoCompactionLoader: undefined,
			defaultEditor: {},
			bottomPane: {
				taskbarContent,
			},
			taskbarContentContainer: taskbarContent,
			chatContainer: { clear: vi.fn() },
			rebuildChatFromMessages: vi.fn(),
			addMessageToChat: vi.fn(),
			showError: vi.fn(),
			showTaskbarNotice: vi.fn(),
			showWarning: vi.fn(),
			flushCompactionQueue: vi.fn().mockResolvedValue(undefined),
			settingsManager: { getShowTerminalProgress: () => false },
			ui: { requestRender: vi.fn(), terminal: { setProgress: vi.fn() } },
			requestRenderRespectingInput: vi.fn(),
		};

		const handleEvent = Reflect.get(InteractiveMode.prototype, "handleEvent") as (
			this: typeof fakeThis,
			event: {
				type: "compaction_end";
				reason: "manual" | "threshold" | "overflow";
				result: { tokensBefore: number; summary: string } | undefined;
				aborted: boolean;
				willRetry: boolean;
				errorMessage?: string;
				notices?: Array<{ level: "info" | "warning"; message: string }>;
			},
		) => Promise<void>;

		await handleEvent.call(fakeThis, {
			type: "compaction_end",
			reason: "overflow",
			result: {
				tokensBefore: 123,
				summary: "summary",
			},
			aborted: false,
			willRetry: false,
			notices: [
				{ level: "warning", message: "warning notice" },
				{ level: "info", message: "info notice" },
			],
		});

		expect(fakeThis.showWarning).toHaveBeenCalledWith("warning notice");
		expect(fakeThis.showTaskbarNotice).toHaveBeenCalledWith("info notice");
	});
});
