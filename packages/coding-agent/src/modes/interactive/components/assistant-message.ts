import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
	type Component,
	Container,
	Markdown,
	type MarkdownTheme,
	Spacer,
	Text,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.ts";
import { TUI_COPY } from "./interactive-strings.ts";

const LEADING_MARGIN = 1;

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

const GUTTER_WIDTH = 2;
const THINKING_PREFIX = "∴ ";

/**
 * Wrapper around Markdown that adds a left-rail gutter.
 * First line gets a colored dot; subsequent lines get plain spacing.
 * This implements the Claude-style assistant body text left rail.
 */
class GutterMarkdown implements Component {
	private readonly markdown: Markdown;

	constructor(text: string, markdownTheme: MarkdownTheme) {
		this.markdown = new Markdown(text, 0, 0, markdownTheme);
	}

	render(width: number): string[] {
		const contentWidth = Math.max(0, width - GUTTER_WIDTH);
		const lines = this.markdown.render(contentWidth);
		// Use ● to match Claude's BLACK_CIRCLE platform-adaptive glyph.
		const dotPrefix = theme.fg("text", "●");
		return lines.map((line, i) => {
			const prefix = i === 0 ? `${dotPrefix} ` : "  ";
			const remainingWidth = Math.max(0, width - visibleWidth(prefix));
			return prefix + truncateToWidth(line, remainingWidth);
		});
	}

	invalidate(): void {
		this.markdown.invalidate();
	}
}

class PrefixedWrappedText implements Component {
	private readonly text: string;
	private readonly prefix: string;
	private readonly style: (text: string) => string;

	constructor(text: string, prefix: string, style: (text: string) => string) {
		this.text = text;
		this.prefix = prefix;
		this.style = style;
	}

	render(width: number): string[] {
		const prefixWidth = visibleWidth(this.prefix);
		const contentWidth = Math.max(1, width - prefixWidth);
		const lines = this.text
			? this.text.split("\n").flatMap((line) => {
					const value = line.trim();
					return value.length > 0 ? [truncateToWidth(value, contentWidth)] : [""];
				})
			: [""];

		return lines.map((line, index) => {
			const prefix = index === 0 ? this.prefix : " ".repeat(prefixWidth);
			return this.style(truncateToWidth(`${prefix}${line}`, width));
		});
	}

	invalidate(): void {}
}

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
				// Assistant body text with left-rail dot on the first visual line.
				// GutterMarkdown renders a • at column 0 on line 1, plain indent on wrapped lines.
				this.contentContainer.addChild(new GutterMarkdown(content.text.trim(), this.markdownTheme));
			} else if (content.type === "thinking" && content.thinking.trim()) {
				const hasVisibleAssistantContentAfter = message.content
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
						const summaryText = previewLine?.trim() || TUI_COPY.thinkingBlock.thinkingPlaceholder;
						this.contentContainer.addChild(
							new PrefixedWrappedText(
								`${summaryText}${previewLine && previewLine.length >= 160 ? "..." : ""}`,
								THINKING_PREFIX,
								(text) => theme.italic(theme.fg("thinkingText", text)),
							),
						);
						break;
					}
					case "full": {
						this.contentContainer.addChild(
							new Text(theme.italic(theme.fg("thinkingText", TUI_COPY.thinkingBlock.fullTitle)), 1, 0),
						);
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

				if (hasVisibleAssistantContentAfter) {
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
						: TUI_COPY.thinkingBlock.aborted;
				if (hasVisibleContent) {
					this.contentContainer.addChild(new Spacer(0));
				}
				this.contentContainer.addChild(new Text(theme.fg("error", abortMessage), 1, 0));
			} else if (message.stopReason === "error") {
				const errorMsg = message.errorMessage || TUI_COPY.interactiveNotices.unknownError;
				if (hasVisibleContent) {
					this.contentContainer.addChild(new Spacer(0));
				}
				this.contentContainer.addChild(
					new Text(theme.fg("error", `${TUI_COPY.thinkingBlock.errorPrefix}${errorMsg}`), 1, 0),
				);
			}
		}
	}
}
