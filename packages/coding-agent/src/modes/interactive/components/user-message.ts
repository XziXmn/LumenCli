import { Box, Container, Markdown, type MarkdownTheme, Spacer } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

/**
 * Component that renders a user message
 */
export class UserMessageComponent extends Container {
	private contentBox: Box;

	constructor(text: string, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super();
		this.addChild(new Spacer(1));
		this.contentBox = new Box(1, 0, (content: string) => theme.bg("userMessageBg", content));
		this.contentBox.addChild(
			new Markdown(text, 0, 0, markdownTheme, {
				color: (content: string) => theme.fg("userMessageText", content),
			}),
		);
		this.addChild(this.contentBox);
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		if (lines.length === 0) {
			return lines;
		}

		const firstContentIdx = lines.findIndex((line) => line.trim().length > 0);
		if (firstContentIdx >= 0) {
			lines[firstContentIdx] = OSC133_ZONE_START + lines[firstContentIdx];
			lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[lines.length - 1];
		}
		return lines;
	}
}
