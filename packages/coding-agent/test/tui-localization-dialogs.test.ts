import { setKeybindings, TUI } from "@earendil-works/pi-tui";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.js";
import { KeybindingsManager } from "../src/core/keybindings.js";
import type { SessionTreeNode } from "../src/core/session-manager.js";
import { LoginDialogComponent } from "../src/modes/interactive/components/login-dialog.js";
import { TreeSelectorComponent } from "../src/modes/interactive/components/tree-selector.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";
import { stripAnsi } from "../src/utils/ansi.js";

function makeTree(): SessionTreeNode[] {
	return [
		{
			entry: {
				type: "message",
				id: "user-1",
				parentId: null,
				timestamp: new Date().toISOString(),
				message: { role: "user", content: "hello", timestamp: Date.now() },
			},
			children: [],
		},
	];
}

describe("TUI dialog localization", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	beforeEach(() => {
		setKeybindings(new KeybindingsManager());
	});

	it("shows login dialog labels in Chinese", () => {
		const tui = new TUI(new VirtualTerminal(80, 20));
		const dialog = new LoginDialogComponent(tui, "anthropic", () => {}, "Anthropic");
		dialog.showPrompt("请输入 API 密钥：", "sk-ant-...");

		const output = stripAnsi(dialog.render(80).join("\n"));
		expect(output).toContain("登录 Anthropic");
		expect(output).toContain("例如：sk-ant-...");
		expect(output).toContain("取消");
		expect(output).toContain("提交");
		expect(output).not.toContain("Login to Anthropic");
		expect(output).not.toContain("to submit");
	});

	it("shows tree selector title and search hint in Chinese", () => {
		const selector = new TreeSelectorComponent(
			makeTree(),
			"user-1",
			24,
			() => {},
			() => {},
		);
		const output = stripAnsi(selector.render(120).join("\n"));

		expect(output).toContain("会话树");
		expect(output).toContain("输入即可搜索：");
		expect(output).toContain("用户：");
		expect(output).not.toContain("Session Tree");
		expect(output).not.toContain("Type to search:");
	});
});
