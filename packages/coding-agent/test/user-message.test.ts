import { describe, expect, test } from "vitest";
import { UserMessageComponent } from "../src/modes/interactive/components/user-message.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
const BG_RESET = "\x1b[49m";

describe("UserMessageComponent", () => {
	test("keeps user message height stable while moving closing OSC markers off line end", () => {
		initTheme("dark");

		const component = new UserMessageComponent("hello");
		const lines = component.render(20);

		expect(lines).toHaveLength(2);
		const firstContentIdx = lines.findIndex((l) => l.trim().length > 0);
		expect(firstContentIdx).toBeGreaterThanOrEqual(0);
		expect(lines[firstContentIdx]).toContain(OSC133_ZONE_START);
		expect(lines[firstContentIdx].endsWith(BG_RESET)).toBe(true);
		expect(lines[firstContentIdx]).toContain("hello");
		expect(lines[0].trim()).toBe("");
		expect(lines[lines.length - 1].startsWith(OSC133_ZONE_END + OSC133_ZONE_FINAL)).toBe(true);
		expect(lines[lines.length - 1].endsWith(BG_RESET)).toBe(true);
	});
});
