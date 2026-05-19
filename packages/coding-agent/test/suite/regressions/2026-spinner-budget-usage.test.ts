import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { createHarness } from "../harness.js";

describe("spinner budget usage extraction", () => {
	it("captures the real request max output tokens from provider payloads", async () => {
		const harness = await createHarness();
		try {
			harness.setResponses([fauxAssistantMessage("ok")]);

			await harness.session.prompt("Say ok");
			await harness.session.agent.waitForIdle();

			expect(harness.session.getSpinnerBudgetUsage()).toEqual({
				requestMaxOutputTokens: 16384,
			});
		} finally {
			harness.cleanup();
		}
	});
});
