import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Container, Markdown, type MarkdownTheme, Spacer, Text } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.ts";

const LEADING_MARGIN = 1;

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

/**
 * Thinking display mode:
 * - "full": show complete thinking content
 * - "summary": show a compact summary row
 * - "hidden": show a static hidden label
 */
export type ThinkingDisplayMode = "full" | "summary" | "hidden";

/**
 * Component that renders a complete assistant message.
 *
 * Assistant turns treat thinking as a first-class transcript block:
 * - summary by default
 * - full when expanded
 * - hidden when the user toggles thinking off
 */
export class AssistantMessageComponent extends Container {
	private contentContainer: Container;
	private thinkingMode: ThinkingDisplayMode;
	private markdownTheme: MarkdownTheme;
	private hiddenThinkingLabel: string;
	private lastMessage?: AssistantMessage;
	private hasToolCalls = false;

	constructor(
		message?: AssistantMessage,
		hideThinkingBlock = false,
		markdownTheme: MarkdownTheme = getMarkdownTheme(),
		hiddenThinkingLabel = "Thinking...",
	) {
		super();

		this.thinkingMode = hideThinkingBlock ? "hidden" : "summary";
		this.markdownTheme = markdownTheme;
		this.hiddenThinkingLabel = hiddenThinkingLabel;

		// Leading margin — each block owns its own top spacing
		this.addChild(new Spacer(LEADING_MARGIN));

		// Container for text/thinking content
		this.contentContainer = new Container();
		this.addChild(this.contentContainer);

		if (message) {
			this.updateContent(message);
		}
	}

	override invalidate(): void {
		super.invalidate();
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setHideThinkingBlock(hide: boolean): void {
		this.thinkingMode = hide ? "hidden" : "summary";
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setExpanded(expanded: boolean): void {
		if (this.thinkingMode === "hidden") return;
		this.thinkingMode = expanded ? "full" : "summary";
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	getThinkingDisplayMode(): ThinkingDisplayMode {
		return this.thinkingMode;
	}

	setHiddenThinkingLabel(label: string): void {
		this.hiddenThinkingLabel = label;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		if (this.hasToolCalls || lines.length === 0) {
			return lines;
		}

		// Attach zone markers to the first non-empty content line (skip leading spacer)
		const firstContentIdx = lines.findIndex((l) => l.trim().length > 0);
		if (firstContentIdx >= 0) {
			lines[firstContentIdx] = OSC133_ZONE_START + lines[firstContentIdx];
			lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[lines.length - 1];
		}
		return lines;
	}

	updateContent(message: AssistantMessage): void {
		this.lastMessage = message;

		// Clear content container
		this.contentContainer.clear();

		const hasVisibleContent = message.content.some(
			(c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()),
		);

		// Render content in order
		for (let i = 0; i < message.content.length; i++) {
			const content = message.content[i];
			if (content.type === "text" && content.text.trim()) {
				// Assistant text messages with no background - trim the text
				// Set paddingY=0 to avoid extra spacing before tool executions
				this.contentContainer.addChild(new Markdown(content.text.trim(), 1, 0, this.markdownTheme));
			} else if (content.type === "thinking" && content.thinking.trim()) {
				const hasVisibleContentAfter = message.content
					.slice(i + 1)
					.some((c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));

				switch (this.thinkingMode) {
					case "hidden": {
						this.contentContainer.addChild(
							new Text(theme.italic(theme.fg("thinkingText", this.hiddenThinkingLabel)), 1, 0),
						);
						break;
					}
					case "summary": {
						const firstMeaningfulLine = content.thinking
							.split("\n")
							.map((line) => line.trim())
							.find((line) => line.length > 0 && !/^([*_#>\-\s`]|Examining\b)/i.test(line))
							?.slice(0, 160);
						const fallbackLine = content.thinking
							.split("\n")
							.map((line) => line.trim())
							.find((line) => line.length > 0)
							?.replace(/[*_`#>-]/g, "")
							.trim()
							.slice(0, 160);
						const previewLine = firstMeaningfulLine ?? fallbackLine;
						this.contentContainer.addChild(new Text(theme.italic(theme.fg("thinkingText", "∴ Thinking…")), 1, 0));
						if (previewLine) {
							this.contentContainer.addChild(new Spacer(1));
							this.contentContainer.addChild(
								new Text(
									theme.fg("thinkingText", `  ${previewLine}${previewLine.length >= 160 ? "..." : ""}`),
									0,
									0,
								),
							);
						}
						break;
					}
					case "full": {
						this.contentContainer.addChild(new Text(theme.italic(theme.fg("thinkingText", "∴ Thinking…")), 1, 0));
						this.contentContainer.addChild(new Spacer(1));
						this.contentContainer.addChild(
							new Markdown(content.thinking.trim(), 2, 0, this.markdownTheme, {
								color: (text: string) => theme.fg("thinkingText", text),
								italic: true,
							}),
						);
						break;
					}
				}

				if (hasVisibleContentAfter) {
					this.contentContainer.addChild(new Spacer(1));
				}
			}
		}

		// Check if aborted - show after partial content
		// But only if there are no tool calls (tool execution components will show the error)
		const hasToolCalls = message.content.some((c) => c.type === "toolCall");
		this.hasToolCalls = hasToolCalls;
		if (!hasToolCalls) {
			if (message.stopReason === "aborted") {
				const abortMessage =
					message.errorMessage && message.errorMessage !== "Request was aborted"
						? message.errorMessage
						: "Operation aborted";
				if (hasVisibleContent) {
					this.contentContainer.addChild(new Spacer(0));
				}
				this.contentContainer.addChild(new Text(theme.fg("error", abortMessage), 1, 0));
			} else if (message.stopReason === "error") {
				const errorMsg = message.errorMessage || "Unknown error";
				if (hasVisibleContent) {
					this.contentContainer.addChild(new Spacer(0));
				}
				this.contentContainer.addChild(new Text(theme.fg("error", `Error: ${errorMsg}`), 1, 0));
			}
		}
	}
}
