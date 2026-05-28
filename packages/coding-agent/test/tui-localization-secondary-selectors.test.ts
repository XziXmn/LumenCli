import { beforeAll, describe, expect, it } from "vitest";
import { ScopedModelsSelectorComponent } from "../src/modes/interactive/components/scoped-models-selector.ts";
import { UserMessageSelectorComponent } from "../src/modes/interactive/components/user-message-selector.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

describe("TUI secondary selector localization", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("shows scoped model selector helper copy in Chinese", () => {
		const selector = new ScopedModelsSelectorComponent(
			{
				allModels: [
					{
						id: "gpt-5",
						name: "GPT-5",
						api: "openai-responses",
						provider: "openai",
						baseUrl: "https://api.openai.com/v1",
						reasoning: true,
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 200000,
						maxTokens: 32768,
					},
				],
				enabledModelIds: null,
			},
			{
				onChange: () => {},
				onPersist: () => {},
				onCancel: () => {},
			},
		);

		const output = stripAnsi(selector.render(100).join("\n"));
		expect(output).toContain("模型范围配置");
		expect(output).toContain("仅当前会话生效");
		expect(output).toContain("可保存到设置");
		expect(output).toContain("全部启用");
		expect(output).toContain("模型名称：GPT-5");
		expect(output).not.toContain("Model Configuration");
		expect(output).not.toContain("all enabled");
	});

	it("shows user message selector title and empty state in Chinese", () => {
		const selector = new UserMessageSelectorComponent(
			[],
			() => {},
			() => {},
		);
		const output = stripAnsi(selector.render(100).join("\n"));

		expect(output).toContain("从消息分叉");
		expect(output).toContain("没有可用于分叉的用户消息");
		expect(output).not.toContain("Fork from Message");
		expect(output).not.toContain("No user messages found");
	});
});
