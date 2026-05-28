import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { Container, type SelectItem, SelectList, type SelectListLayoutOptions } from "@earendil-works/pi-tui";
import { getSelectListTheme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { TUI_COPY } from "./interactive-strings.ts";

const THINKING_SELECT_LIST_LAYOUT: SelectListLayoutOptions = {
	minPrimaryColumnWidth: 14,
	maxPrimaryColumnWidth: 36,
};

/**
 * Per-level metadata.
 * - tokens: rough budget estimate (provider-dependent; values are typical defaults).
 * - tier: visual tier name (used purely for the colored dot in the label).
 * - description: shown in the right column of the SelectList.
 *
 * Token estimates align with oh-my-pi conventions but are advisory only —
 * the actual budget depends on the model's thinkingLevelMap and provider.
 */
const LEVEL_METADATA: Record<
	ThinkingLevel,
	{ description: string; tokens: number; tier: "off" | "min" | "low" | "med" | "high" | "max" }
> = {
	off: { description: TUI_COPY.thinkingSelector.off, tokens: 0, tier: "off" },
	minimal: { description: TUI_COPY.thinkingSelector.minimal, tokens: 1024, tier: "min" },
	low: { description: TUI_COPY.thinkingSelector.low, tokens: 2048, tier: "low" },
	medium: { description: TUI_COPY.thinkingSelector.medium, tokens: 8192, tier: "med" },
	high: { description: TUI_COPY.thinkingSelector.high, tokens: 16384, tier: "high" },
	xhigh: { description: TUI_COPY.thinkingSelector.xhigh, tokens: 32768, tier: "max" },
};

/** Visual tier dot. Colors are kept inside the label string with ANSI so the
 * SelectList doesn't need modification. The dot character signals tier at a glance. */
const TIER_DOT: Record<(typeof LEVEL_METADATA)[ThinkingLevel]["tier"], string> = {
	off: "\u001b[90m\u25CB\u001b[0m", // grey hollow
	min: "\u001b[36m\u25CF\u001b[0m", // cyan
	low: "\u001b[34m\u25CF\u001b[0m", // blue
	med: "\u001b[33m\u25CF\u001b[0m", // yellow
	high: "\u001b[35m\u25CF\u001b[0m", // magenta
	max: "\u001b[31m\u25CF\u001b[0m", // red
};

/**
 * Format the label column: `<dot> <level> <padded-tokens>`.
 * Tokens are shown as `~Nk` for visual scanning; "off" gets no token count.
 */
function formatLabel(level: ThinkingLevel): string {
	const meta = LEVEL_METADATA[level];
	const dot = TIER_DOT[meta.tier];
	const levelStr = level.padEnd(7);
	const tokens = meta.tokens === 0 ? "" : `~${Math.round(meta.tokens / 1024)}k`;
	return `${dot} ${levelStr}${tokens}`;
}

/**
 * Public helper: get token estimate for a thinking level.
 * Other code (e.g. status line) can use this to display
 * "estimated extra cost" hints.
 */
export function thinkingTokenEstimate(level: ThinkingLevel): number {
	return LEVEL_METADATA[level].tokens;
}

/** Public: get the long-form description (used by /thinking command output). */
export function thinkingLevelDescription(level: ThinkingLevel): string {
	return LEVEL_METADATA[level].description;
}

/**
 * Component that renders a thinking level selector with borders.
 *
 * [Lumen customization] Enhanced label rendering:
 *   - Tier dot indicates relative cost at a glance
 *   - Token estimate displayed inline (~Nk)
 *   - Description shows cost band
 */
export class ThinkingSelectorComponent extends Container {
	private selectList: SelectList;

	constructor(
		currentLevel: ThinkingLevel,
		availableLevels: ThinkingLevel[],
		onSelect: (level: ThinkingLevel) => void,
		onCancel: () => void,
	) {
		super();

		const thinkingLevels: SelectItem[] = availableLevels.map((level) => ({
			value: level,
			label: formatLabel(level),
			description: LEVEL_METADATA[level].description,
		}));

		// Add top border
		this.addChild(new DynamicBorder());

		// Create selector
		this.selectList = new SelectList(
			thinkingLevels,
			thinkingLevels.length,
			getSelectListTheme(),
			THINKING_SELECT_LIST_LAYOUT,
		);

		// Preselect current level
		const currentIndex = thinkingLevels.findIndex((item) => item.value === currentLevel);
		if (currentIndex !== -1) {
			this.selectList.setSelectedIndex(currentIndex);
		}

		this.selectList.onSelect = (item) => {
			onSelect(item.value as ThinkingLevel);
		};

		this.selectList.onCancel = () => {
			onCancel();
		};

		this.addChild(this.selectList);

		// Add bottom border
		this.addChild(new DynamicBorder());
	}

	getSelectList(): SelectList {
		return this.selectList;
	}
}
