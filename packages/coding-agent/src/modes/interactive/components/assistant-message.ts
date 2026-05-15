import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Container, Markdown, type MarkdownTheme, Spacer, Text } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

/**
 * Thinking display mode:
 * - "full": show complete thinking content (italic, colored)
 * - "summary": show one-line summary with char count (collapsible)
 * - "hidden": show static "Thinking..." label
 *
 * [Lumen customization] Added "summary" mode for opencode-style collapsible reasoning.
 */
export type ThinkingDisplayMode = "full" | "summary" | "hidden";

/**
 * Component that renders a complete assistant message.
 *
 * [Lumen customization] Enhanced thinking display:
 * - Three modes: full / summary / hidden
 * - Summary mode shows a one-line collapsible indicator with char count
 * - Supports toggling via setThinkingDisplayMode()
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

		// Map legacy boolean to new mode
		// Default "summary": shows thinking during streaming (Claude Code style), hides after completion
		this.thinkingMode = hideThinkingBlock ? "hidden" : "summary";
		this.markdownTheme = markdownTheme;
		this.hiddenThinkingLabel = hiddenThinkingLabel;

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

	/** Legacy API: maps boolean to mode. */
	setHideThinkingBlock(hide: boolean): void {
		this.thinkingMode = hide ? "hidden" : "summary";
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	/** New API: set thinking display mode directly. */
	setThinkingDisplayMode(mode: ThinkingDisplayMode): void {
		this.thinkingMode = mode;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	/** Get current thinking display mode. */
	getThinkingDisplayMode(): ThinkingDisplayMode {
		return this.thinkingMode;
	}

	/** Toggle between summary and full. */
	toggleThinkingExpansion(): void {
		if (this.thinkingMode === "summary") {
			this.thinkingMode = "full";
		} else if (this.thinkingMode === "full") {
			this.thinkingMode = "summary";
		}
		// "hidden" stays hidden (user must explicitly change)
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
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

		lines[0] = OSC133_ZONE_START + lines[0];
		lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[lines.length - 1];
		return lines;
	}

	updateContent(message: AssistantMessage): void {
		this.lastMessage = message;

		// Clear content container
		this.contentContainer.clear();

		// Only add top spacer if there's actual visible text content
		// (not thinking — thinking is transient and hidden after completion)
		const hasTextContent = message.content.some((c) => c.type === "text" && c.text.trim());
		if (hasTextContent) {
			this.contentContainer.addChild(new Spacer(1));
		}

		// Render content in order
		for (let i = 0; i < message.content.length; i++) {
			const content = message.content[i];
			if (content.type === "text" && content.text.trim()) {
				// Assistant text messages with no background - trim the text
				// Set paddingY=0 to avoid extra spacing before tool executions
				this.contentContainer.addChild(new Markdown(content.text.trim(), 1, 0, this.markdownTheme));
			} else if (content.type === "thinking" && content.thinking.trim()) {
				// Show thinking content regardless of streaming state.
				// In summary mode: show ".: Thinking..." + preview
				// In full mode: show complete thinking
				// In hidden mode: show "Thinking..." label

				// Add spacing only when another visible assistant content block follows.
				// This avoids a superfluous blank line before separately-rendered tool execution blocks.
				const hasVisibleContentAfter = message.content
					.slice(i + 1)
					.some((c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));

				switch (this.thinkingMode) {
					case "hidden": {
						// Show static thinking label (only during streaming)
						this.contentContainer.addChild(
							new Text(theme.italic(theme.fg("thinkingText", this.hiddenThinkingLabel)), 1, 0),
						);
						break;
					}
					case "summary": {
						// Claude Code style: ".: Thinking..." on one line, then a single-line preview
						this.contentContainer.addChild(
							new Text(
								`${theme.fg("dim", ".: ")}${theme.italic(theme.fg("thinkingText", "Thinking..."))}`,
								1,
								0,
							),
						);
						// Show only the first meaningful line as a dim preview
						const firstLine = content.thinking
							.split("\n")
							.find((l) => l.trim().length > 0)
							?.trim()
							.slice(0, 80);
						if (firstLine) {
							this.contentContainer.addChild(
								new Text(theme.fg("dim", `  ${firstLine}${firstLine.length >= 80 ? "..." : ""}`), 0, 0),
							);
						}
						break;
					}
					case "full": {
						// Full thinking traces in thinkingText color, italic
						this.contentContainer.addChild(
							new Markdown(content.thinking.trim(), 1, 0, this.markdownTheme, {
								color: (text: string) => theme.fg("thinkingText", text),
								italic: true,
							}),
						);
						break;
					}
				}

				if (hasVisibleContentAfter && this.thinkingMode === "full") {
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
				if (hasTextContent) {
					this.contentContainer.addChild(new Spacer(1));
				}
				this.contentContainer.addChild(new Text(theme.fg("error", abortMessage), 1, 0));
			} else if (message.stopReason === "error") {
				const errorMsg = message.errorMessage || "Unknown error";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", `Error: ${errorMsg}`), 1, 0));
			}
		}
	}
}
