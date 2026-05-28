import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Container, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, test } from "vitest";
import { AssistantMessageComponent } from "../src/modes/interactive/components/assistant-message.ts";
import { AssistantToolSummaryComponent } from "../src/modes/interactive/components/assistant-tool-summary.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

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
		const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
		expect(firstContentIndex).toBeGreaterThanOrEqual(0);
		expect(lines[firstContentIndex!]).toContain(OSC133_ZONE_START);
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

	test("summary mode renders a direct ∴ preview line instead of a standalone title block", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(
			createAssistantMessage([{ type: "thinking", thinking: "I need to examine the code structure first." }]),
		);
		const output = component.render(80).join("\n");

		// Should NOT have a standalone "∴ Thinking…" title line
		expect(output).not.toContain("Thinking…");
		// Should have a direct ∴ preview line
		expect(output).toContain("∴");
		expect(output).toContain("examine the code structure");
	});

	test("summary mode renders thinking preview without separate title when followed by text", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(
			createAssistantMessage([
				{ type: "thinking", thinking: "Let me analyze this carefully." },
				{ type: "text", text: "Here is my analysis." },
			]),
		);
		const output = component.render(80).join("\n");

		// Should NOT have a standalone "∴ Thinking…" title line
		expect(output).not.toContain("Thinking…");
		// Should have the preview and the text
		expect(output).toContain("∴");
		expect(output).toContain("analyze this carefully");
		expect(output).toContain("Here is my analysis");
	});

	test("hidden mode still renders the hidden label", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(
			createAssistantMessage([{ type: "thinking", thinking: "Some thinking." }]),
			true, // hideThinkingBlock
		);
		const output = component.render(80).join("\n");

		expect(output).toContain("Thinking...");
	});

	test("expanded mode still renders full thinking content", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(
			createAssistantMessage([{ type: "thinking", thinking: "Full thinking content here." }]),
		);
		component.setExpanded(true);
		const output = component.render(80).join("\n");

		expect(output).toContain("Full thinking content here");
	});

	test("renders localized aborted and error messages", () => {
		initTheme("dark");

		const abortedComponent = new AssistantMessageComponent({
			...createAssistantMessage([{ type: "text", text: "partial" }]),
			stopReason: "aborted",
			errorMessage: undefined,
		});
		const abortedOutput = abortedComponent.render(80).join("\n");
		expect(abortedOutput).toContain("Aborted");

		const errorComponent = new AssistantMessageComponent({
			...createAssistantMessage([{ type: "text", text: "partial" }]),
			stopReason: "error",
			errorMessage: undefined,
		});
		const errorOutput = errorComponent.render(80).join("\n");
		expect(errorOutput).toContain("Error: Unknown error");
	});

	test("thinking summary never renders ∴ on its own line for a normal thinking block", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(
			createAssistantMessage([{ type: "thinking", thinking: "Let me inspect the relevant files." }]),
		);
		const output = stripAnsi(component.render(80).join("\n"));
		const lines = output
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l.length > 0);

		// Every non-empty line that contains ∴ must also contain the preview text after it
		const thereforeLines = lines.filter((l) => l.includes("∴"));
		expect(thereforeLines.length).toBeGreaterThan(0);
		for (const line of thereforeLines) {
			// The line should be "∴ <preview>" — not just "∴" alone
			expect(line.length).toBeGreaterThan(1);
			expect(line).toMatch(/^∴ .+/);
		}
	});

	test("thinking summary falls back to placeholder when preview extraction yields empty", () => {
		initTheme("dark");

		// Content that would yield empty preview after stripping
		const component = new AssistantMessageComponent(
			createAssistantMessage([{ type: "thinking", thinking: "> > >" }]),
		);
		const output = component.render(80).join("\n");

		// Should contain the fallback placeholder
		expect(output).toContain("∴");
		expect(output).toContain("Thinking…");
	});

	test("assistant body text renders with a dot on the first visual line", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(createAssistantMessage([{ type: "text", text: "Hello world" }]));
		const lines = component.render(80);

		// Find lines with content (skip spacers)
		const contentLines = lines.filter((l) => l.trim().length > 0);
		expect(contentLines.length).toBeGreaterThan(0);

		// First content line should contain the dot (●) and the text
		const firstContent = contentLines[0]!;
		expect(firstContent).toContain("●");
		expect(firstContent).toContain("Hello world");
	});

	test("assistant body gutter does not overflow terminal width near the wrap boundary", () => {
		initTheme("dark");

		const longText =
			"我需要进行一次任务模拟，重复调用各类工具，并确保这条正文在接近终端宽度时仍然正确换行，不会因为正文左侧圆点 gutter 而超过终端宽度。";
		const component = new AssistantMessageComponent(createAssistantMessage([{ type: "text", text: longText }]));
		const lines = component.render(120);

		for (const line of lines) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(120);
		}
	});

	test("assistant body dot appears only on the first visual line of a wrapped text block", () => {
		initTheme("dark");

		const longText =
			"这一段正文需要足够长，才能在较窄的终端宽度里产生自动换行，从而验证圆点只出现在正文块的第一视觉行，后续行应该只有普通缩进。";
		const component = new AssistantMessageComponent(createAssistantMessage([{ type: "text", text: longText }]));
		const output = stripAnsi(component.render(48).join("\n"));
		const contentLines = output.split("\n").filter((line) => line.trim().length > 0);

		expect(contentLines.length).toBeGreaterThan(1);
		expect(contentLines[0]?.startsWith("● ")).toBe(true);
		for (const line of contentLines.slice(1)) {
			expect(line.startsWith("● ")).toBe(false);
			expect(line.startsWith("  ")).toBe(true);
		}
	});

	test("same-turn thinking -> tool summary renders without a blank separator line", () => {
		initTheme("dark");

		const container = new Container();
		const assistantComponent = new AssistantMessageComponent(
			createAssistantMessage([{ type: "thinking", thinking: "Analyzing the code." }]),
		);
		// Same turn: addLeadingMargin = false (the streaming component owns the top margin)
		const toolSummary = new AssistantToolSummaryComponent("read", { path: "README.md" }, undefined, process.cwd(), {
			addLeadingMargin: false,
		});
		container.addChild(assistantComponent);
		container.addChild(toolSummary);

		const output = stripAnsi(container.render(80).join("\n"));
		const lines = output.split("\n");
		const nonEmptyLines = lines.map((line, index) => ({ line, index })).filter(({ line }) => line.trim().length > 0);

		// Find the line with the thinking preview and the line with the tool title
		const thinkingPos = nonEmptyLines.findIndex(({ line }) => line.includes("∴"));
		const toolPos = nonEmptyLines.findIndex(({ line }) => line.includes("Read(README.md)"));
		expect(thinkingPos).toBeGreaterThanOrEqual(0);
		expect(toolPos).toBe(thinkingPos + 1);
	});

	test("same-turn text -> tool summary renders without a blank separator line", () => {
		initTheme("dark");

		const container = new Container();
		const assistantComponent = new AssistantMessageComponent(
			createAssistantMessage([{ type: "text", text: "Let me check the file." }]),
		);
		// Same turn: addLeadingMargin = false (the streaming component owns the top margin)
		const toolSummary = new AssistantToolSummaryComponent("read", { path: "README.md" }, undefined, process.cwd(), {
			addLeadingMargin: false,
		});
		container.addChild(assistantComponent);
		container.addChild(toolSummary);

		const output = stripAnsi(container.render(80).join("\n"));
		const lines = output.split("\n");
		const nonEmptyLines = lines.map((line, index) => ({ line, index })).filter(({ line }) => line.trim().length > 0);

		// Find the line with the body text and the line with the tool title
		const textPos = nonEmptyLines.findIndex(({ line }) => line.includes("Let me check"));
		const toolPos = nonEmptyLines.findIndex(({ line }) => line.includes("Read(README.md)"));
		expect(textPos).toBeGreaterThanOrEqual(0);
		expect(toolPos).toBe(textPos + 1);
	});
});
