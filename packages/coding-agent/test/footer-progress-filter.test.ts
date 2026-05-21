import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { FooterDataProvider } from "../src/core/footer-data-provider.js";
import { FooterComponent } from "../src/modes/interactive/components/footer.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";
import { stripAnsi } from "../src/utils/ansi.js";
import { createTestSession } from "./utilities.js";

describe("FooterComponent progress status filtering", () => {
	let cleanup: (() => void) | undefined;

	beforeAll(() => {
		initTheme("dark");
	});

	afterEach(() => {
		cleanup?.();
		cleanup = undefined;
	});

	it("hides progress-related extension statuses while keeping passive ones", () => {
		const ctx = createTestSession({ inMemory: true });
		cleanup = ctx.cleanup;

		const footerData = new FooterDataProvider(ctx.tempDir);
		footerData.setExtensionStatus("ui", "waiting · 等待输入");
		footerData.setExtensionStatus("task", "task running");
		footerData.setExtensionStatus("todo", "todo 1/4");
		footerData.setExtensionStatus("queue", "queued 2");
		footerData.setExtensionStatus("custom", "custom passive state");

		const footer = new FooterComponent(ctx.session, footerData);
		const rendered = stripAnsi(footer.render(160).join("\n"));

		expect(rendered).toContain("custom passive state");
		expect(rendered).not.toContain("waiting · 等待输入");
		expect(rendered).not.toContain("task running");
		expect(rendered).not.toContain("todo 1/4");
		expect(rendered).not.toContain("queued 2");

		footer.dispose();
		footerData.dispose();
	});
});
