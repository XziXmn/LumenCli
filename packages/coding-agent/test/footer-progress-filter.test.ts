import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { FooterDataProvider } from "../src/core/footer-data-provider.ts";
import { FooterComponent } from "../src/modes/interactive/components/footer.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";
import { createTestSession } from "./utilities.ts";

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
		footerData.setExtensionStatus("ui", "waiting · Awaiting input");
		footerData.setExtensionStatus("task", "task running");
		footerData.setExtensionStatus("todo", "todo 1/4");
		footerData.setExtensionStatus("queue", "queued 2");
		footerData.setExtensionStatus("custom", "custom passive state");

		const footer = new FooterComponent(ctx.session, footerData);
		const rendered = stripAnsi(footer.render(160).join("\n"));

		expect(rendered).toContain("custom passive state");
		expect(rendered).not.toContain("waiting · Awaiting input");
		expect(rendered).not.toContain("task running");
		expect(rendered).not.toContain("todo 1/4");
		expect(rendered).not.toContain("queued 2");

		footer.dispose();
		footerData.dispose();
	});

	it("also hides approval-style ui status text so footer stays passive", () => {
		const ctx = createTestSession({ inMemory: true });
		cleanup = ctx.cleanup;

		const footerData = new FooterDataProvider(ctx.tempDir);
		footerData.setExtensionStatus("ui", "waiting · Awaiting approval");
		footerData.setExtensionStatus("queue", "queued 1");
		footerData.setExtensionStatus("custom", "passive footer note");

		const footer = new FooterComponent(ctx.session, footerData);
		const rendered = stripAnsi(footer.render(160).join("\n"));

		expect(rendered).toContain("passive footer note");
		expect(rendered).not.toContain("Awaiting approval");
		expect(rendered).not.toContain("queued 1");

		footer.dispose();
		footerData.dispose();
	});
});
