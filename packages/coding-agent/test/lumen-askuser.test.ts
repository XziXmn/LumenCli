import { describe, expect, it } from "vitest";
import { formatAskUserFooterStatus, formatAskUserResultSummary } from "../src/core/lumen-askuser.ts";

describe("lumenAskUser formatting", () => {
	it("formats footer status as awaiting input", () => {
		expect(formatAskUserFooterStatus("Choose a deployment target")).toBe(
			"awaiting input · Choose a deployment target",
		);
	});

	it("formats completed and cancelled summaries", () => {
		expect(
			formatAskUserResultSummary({
				question: "Continue?",
				mode: "confirm",
				answer: "Yes",
				cancelled: false,
			}),
		).toBe("Input received · Yes");

		expect(
			formatAskUserResultSummary({
				question: "Continue?",
				mode: "confirm",
				answer: null,
				cancelled: true,
			}),
		).toBe("Input cancelled");
	});
});
