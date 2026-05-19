import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import type { ExtensionAPI } from "../../../src/core/extensions/index.js";
import { createHarness } from "../harness.js";

describe("compaction hook lifecycle events", () => {
	it("emits pre and post compaction hook events around extension-driven compaction", async () => {
		const harness = await createHarness({
			extensionFactories: [
				(pi: ExtensionAPI) => {
					pi.on("session_before_compact", () => ({
						compaction: {
							summary: "hook summary",
							firstKeptEntryId: "entry-1",
							tokensBefore: 123,
							details: {},
						},
					}));
					pi.on("session_compact", () => {});
				},
			],
		});

		try {
			harness.setResponses([fauxAssistantMessage("first"), fauxAssistantMessage("second")]);
			await harness.session.prompt("one");
			await harness.session.agent.waitForIdle();
			await harness.session.prompt("two");
			await harness.session.agent.waitForIdle();

			await harness.session.compact();

			expect(harness.eventsOfType("compaction_hooks_start")).toEqual([
				{ type: "compaction_hooks_start", phase: "pre", reason: "manual" },
				{ type: "compaction_hooks_start", phase: "post", reason: "manual" },
			]);
			expect(harness.eventsOfType("compaction_hooks_end")).toEqual([
				{ type: "compaction_hooks_end", phase: "pre", reason: "manual" },
				{ type: "compaction_hooks_end", phase: "post", reason: "manual" },
			]);
		} finally {
			harness.cleanup();
		}
	});
});
