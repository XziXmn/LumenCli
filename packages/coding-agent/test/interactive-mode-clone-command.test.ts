import { describe, expect, it, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

type CloneCommandContext = {
	sessionManager: { getLeafId: () => string | null };
	runtimeHost: {
		fork: (entryId: string, options?: { position?: "before" | "at" }) => Promise<{ cancelled: boolean }>;
	};
	renderCurrentSessionState: () => void;
	editor: { setText: (text: string) => void };
	showTaskbarNotice: (message: string) => void;
	showError: (message: string) => void;
	ui: { requestRender: () => void };
};

type InteractiveModePrototype = {
	handleCloneCommand(this: CloneCommandContext): Promise<void>;
};

const interactiveModePrototype = InteractiveMode.prototype as unknown as InteractiveModePrototype;

describe("InteractiveMode /clone", () => {
	it("clones the current leaf into a new session", async () => {
		const fork = vi.fn(async () => ({ cancelled: false }));
		const renderCurrentSessionState = vi.fn();
		const setText = vi.fn();
		const showTaskbarNotice = vi.fn();
		const showError = vi.fn();
		const requestRender = vi.fn();

		const context: CloneCommandContext = {
			sessionManager: { getLeafId: () => "leaf-123" },
			runtimeHost: { fork },
			renderCurrentSessionState,
			editor: { setText },
			showTaskbarNotice,
			showError,
			ui: { requestRender },
		};

		await interactiveModePrototype.handleCloneCommand.call(context);

		expect(fork).toHaveBeenCalledWith("leaf-123", { position: "at" });
		expect(renderCurrentSessionState).toHaveBeenCalled();
		expect(setText).toHaveBeenCalledWith("");
		expect(showTaskbarNotice).toHaveBeenCalledWith("Cloned into a new session");
		expect(showError).not.toHaveBeenCalled();
		expect(requestRender).not.toHaveBeenCalled();
	});

	it("shows a status message when there is nothing to clone", async () => {
		const fork = vi.fn(async () => ({ cancelled: false }));
		const showTaskbarNotice = vi.fn();
		const showError = vi.fn();

		const context: CloneCommandContext = {
			sessionManager: { getLeafId: () => null },
			runtimeHost: { fork },
			renderCurrentSessionState: vi.fn(),
			editor: { setText: vi.fn() },
			showTaskbarNotice,
			showError,
			ui: { requestRender: vi.fn() },
		};

		await interactiveModePrototype.handleCloneCommand.call(context);

		expect(fork).not.toHaveBeenCalled();
		expect(showTaskbarNotice).toHaveBeenCalledWith("No content available to clone");
		expect(showError).not.toHaveBeenCalled();
	});
});
