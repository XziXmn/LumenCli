import { beforeAll, describe, expect, it } from "vitest";
import { ConfigSelectorComponent } from "../src/modes/interactive/components/config-selector.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

describe("TUI config selector localization", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("shows config selector shell copy in Chinese", () => {
		const selector = new ConfigSelectorComponent(
			{ extensions: [], skills: [], prompts: [], themes: [] },
			{
				getGlobalSettings: () => ({}),
				getProjectSettings: () => ({}),
				setExtensionPaths: () => {},
				setSkillPaths: () => {},
				setPromptTemplatePaths: () => {},
				setThemePaths: () => {},
				setProjectExtensionPaths: () => {},
				setProjectSkillPaths: () => {},
				setProjectPromptTemplatePaths: () => {},
				setProjectThemePaths: () => {},
				setPackages: () => {},
				setProjectPackages: () => {},
			} as any,
			process.cwd(),
			process.cwd(),
			() => {},
			() => {},
			() => {},
		);

		const output = stripAnsi(selector.render(120).join("\n"));
		expect(output).toContain("资源配置");
		expect(output).toContain("输入即可筛选资源");
		expect(output).toContain("没有找到资源");
		expect(output).not.toContain("Resource Configuration");
		expect(output).not.toContain("Type to filter resources");
	});
});
