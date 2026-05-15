import { Box, Container, Markdown, type MarkdownTheme, Text } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

/** Claude Code style: PLAY_ICON prefix for user messages */
const USER_MSG_PREFIX = "\u25B6"; // ▶

/**
 * Component that renders a user message.
 *
 * Claude Code style: full-width dark background bar with ▶ prefix.
 */
export class UserMessageComponent extends Container {
	private contentBox: Box;

	constructor(text: string, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super();
		// Claude Code style: full-width background with ▶ prefix
		this.contentBox = new Box(0, 0, (content: string) => theme.bg("userMessageBg", content));

		// Single-line messages: render as simple text with ▶ prefix
		// Multi-line messages: render with Markdown for formatting
		const lines = text.split("\n");
		if (lines.length === 1) {
			this.contentBox.addChild(
				new Text(`  ${theme.fg("accent", USER_MSG_PREFIX)}  ${theme.fg("userMessageText", text)}`, 0, 0),
			);
		} else {
			// First line with ▶ prefix
			this.contentBox.addChild(
				new Text(`  ${theme.fg("accent", USER_MSG_PREFIX)}  ${theme.fg("userMessageText", lines[0])}`, 0, 0),
			);
			// Remaining lines as markdown with indent matching the prefix
			const rest = lines.slice(1).join("\n");
			if (rest.trim()) {
				this.contentBox.addChild(
					new Markdown(rest, 5, 0, markdownTheme, {
						color: (content: string) => theme.fg("userMessageText", content),
					}),
				);
			}
		}
		this.addChild(this.contentBox);
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		if (lines.length === 0) {
			return lines;
		}

		lines[0] = `${OSC133_ZONE_START}${lines[0]}`;
		lines[lines.length - 1] = `${OSC133_ZONE_END}${OSC133_ZONE_FINAL}${lines[lines.length - 1]}`;
		return lines;
	}
}
