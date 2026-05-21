import type { AssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, test } from "vitest";
import { AssistantMessageComponent } from "../src/modes/interactive/components/assistant-message.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";
import { stripAnsi } from "../src/utils/ansi.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

function createAssistantMessage(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "gpt-4o-mini",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

describe("AssistantMessageComponent", () => {
	test("adds OSC 133 zone markers to assistant messages without tool calls", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(createAssistantMessage([{ type: "text", text: "hello" }]));
		const lines = component.render(40);

		expect(lines).not.toHaveLength(0);
		// Zone markers attach to the first non-empty content line (after leading spacer)
		const firstContentIdx = lines.findIndex((l) => l.trim().length > 0);
		expect(firstContentIdx).toBeGreaterThanOrEqual(0);
		expect(lines[firstContentIdx]).toContain(OSC133_ZONE_START);
		expect(lines[lines.length - 1].startsWith(OSC133_ZONE_END + OSC133_ZONE_FINAL)).toBe(true);
	});

	test("does not add OSC 133 zone markers when assistant message contains tool calls", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(
			createAssistantMessage([
				{ type: "text", text: "calling tool" },
				{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "file.txt" } },
			]),
		);
		const rendered = component.render(60).join("\n");

		expect(rendered.includes(OSC133_ZONE_START)).toBe(false);
		expect(rendered.includes(OSC133_ZONE_END)).toBe(false);
		expect(rendered.includes(OSC133_ZONE_FINAL)).toBe(false);
	});

	test("renders thinking in summary mode by default and full mode when expanded", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(
			createAssistantMessage([{ type: "thinking", thinking: "First line\nSecond line" }]),
		);

		const summary = stripAnsi(component.render(80).join("\n"));
		expect(summary).toContain("∴ ");
		expect(summary).toContain("Thinking");
		expect(summary).toContain("First line");
		expect(summary).not.toContain("Second line");
		expect(summary).not.toContain("to expand");
		expect(summary).toContain("∴ Thinking…");
		expect(summary).toContain("\n  First line");

		component.setExpanded(true);
		const expanded = stripAnsi(component.render(80).join("\n"));
		expect(expanded).toContain("∴ Thinking…");
		expect(expanded).toContain("First line");
		expect(expanded).toContain("Second line");
	});

	test("renders thinking preview with markdown styling in summary mode", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(
			createAssistantMessage([{ type: "thinking", thinking: "**Examining the Project**\nSecond line" }]),
		);

		const summary = stripAnsi(component.render(80).join("\n"));
		expect(summary).toContain("∴ Thinking…");
		expect(summary).toContain("Second line");
		expect(summary).not.toContain("Examining the Project");
		expect(summary).not.toContain("**Examining the Project**");
	});

	test("renders hidden thinking label when thinking is hidden", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(
			createAssistantMessage([{ type: "thinking", thinking: "secret plan" }]),
			true,
		);

		const rendered = stripAnsi(component.render(80).join("\n"));
		expect(rendered).toContain("Thinking...");
		expect(rendered).not.toContain("secret plan");
	});
});
