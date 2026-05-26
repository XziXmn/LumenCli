import { beforeAll, describe, expect, it } from "vitest";
import { ThemeSelectorComponent } from "../src/modes/interactive/components/theme-selector.js";
import { ThinkingSelectorComponent } from "../src/modes/interactive/components/thinking-selector.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";
import { stripAnsi } from "../src/utils/ansi.js";

describe("TUI selector localization", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("shows current theme label in Chinese", () => {
		const selector = new ThemeSelectorComponent(
			"dark",
			() => {},
			() => {},
			() => {},
		);
		const output = stripAnsi(selector.render(80).join("\n"));

		expect(output).toContain("（当前）");
		expect(output).not.toContain("(current)");
	});

	it("shows thinking level descriptions in Chinese", () => {
		const selector = new ThinkingSelectorComponent(
			"medium",
			["off", "minimal", "medium", "high"],
			() => {},
			() => {},
		);
		const output = stripAnsi(selector.render(100).join("\n"));

		expect(output).toContain("不启用思考");
		expect(output).toContain("极简思考");
		expect(output).toContain("中等思考");
		expect(output).toContain("深入思考");
		expect(output).not.toContain("No reasoning");
		expect(output).not.toContain("Deep reasoning");
	});
});
