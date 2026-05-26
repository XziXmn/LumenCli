/**
 * Bordered output container with optional header and sections.
 *
 * Renders a box-drawing bordered block with:
 * - Header line (top border + title + meta)
 * - Content sections (optional section labels as mid-borders)
 * - Bottom border
 * - Border color changes based on state (running=accent, success=dim, error=red)
 *
 * [Provenance] 来源: oh-my-pi/packages/coding-agent/src/tui/output-block.ts
 * [Provenance] 移植方式: 重写 (用我们的 pi-tui API + Theme)
 */

import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Theme, ThemeColor } from "../theme/theme.ts";
import { BOX_SHARP, Hasher, padding, padToWidth, type RenderCache, type State } from "./lumen-tui-utils.ts";

// ============================================================================
// Types
// ============================================================================

export interface OutputBlockSection {
	label?: string;
	lines: string[];
}

export interface OutputBlockOptions {
	header?: string;
	headerMeta?: string;
	state?: State;
	sections?: OutputBlockSection[];
	width: number;
	applyBg?: boolean;
}

// ============================================================================
// Core Renderer
// ============================================================================

export function renderOutputBlock(options: OutputBlockOptions, theme: Theme): string[] {
	const { header, headerMeta, state, sections = [], width, applyBg = true } = options;
	const h = BOX_SHARP.horizontal;
	const v = BOX_SHARP.vertical;
	const cap = h.repeat(3);
	const lineWidth = Math.max(0, width);

	// Border color: running/pending → accent, success → dim, error → error, warning → warning
	const borderColor: ThemeColor =
		state === "error"
			? "error"
			: state === "warning"
				? "warning"
				: state === "running" || state === "pending"
					? "accent"
					: "dim";
	const border = (text: string) => theme.fg(borderColor, text);

	// Background function for the block
	const bgFn = (() => {
		if (!state || !applyBg) return undefined;
		const bgAnsi = theme.getBgAnsi(getStateBgColorForBlock(state));
		return (text: string) => {
			// Stabilize background: re-apply after any SGR reset within the line
			const stabilized = text
				.replace(/\x1b\[(?:0)?m/g, (m) => `${m}${bgAnsi}`)
				.replace(/\x1b\[49m/g, (m) => `${m}${bgAnsi}`);
			return `${bgAnsi}${stabilized}\x1b[49m`;
		};
	})();

	const buildBarLine = (leftChar: string, rightChar: string, label?: string, meta?: string): string => {
		const left = border(`${leftChar}${cap}`);
		const right = border(rightChar);
		if (lineWidth <= 0) return left + right;
		const labelText = [label, meta].filter(Boolean).join(" \u00B7 ");
		const rawLabel = labelText ? ` ${labelText} ` : " ";
		const leftWidth = visibleWidth(left);
		const rightWidth = visibleWidth(right);
		const maxLabelWidth = Math.max(0, lineWidth - leftWidth - rightWidth);
		const trimmedLabel = truncateToWidth(rawLabel, maxLabelWidth);
		const labelWidth = visibleWidth(trimmedLabel);
		const fillCount = Math.max(0, lineWidth - leftWidth - labelWidth - rightWidth);
		return `${left}${trimmedLabel}${border(h.repeat(fillCount))}${right}`;
	};

	const contentPrefix = border(`${v} `);
	const contentSuffix = border(v);
	const contentWidth = Math.max(0, lineWidth - visibleWidth(contentPrefix) - visibleWidth(contentSuffix));
	const lines: string[] = [];

	// Top border
	lines.push(padToWidth(buildBarLine(BOX_SHARP.topLeft, BOX_SHARP.topRight, header, headerMeta), lineWidth, bgFn));

	// Sections
	const hasSections = sections.length > 0;
	const normalizedSections = hasSections ? sections : [{ lines: [] as string[] }];

	for (const section of normalizedSections) {
		if (section.label) {
			lines.push(padToWidth(buildBarLine(BOX_SHARP.teeRight, BOX_SHARP.teeLeft, section.label), lineWidth, bgFn));
		}
		const allLines = section.lines.flatMap((l) => l.split("\n"));
		for (const line of allLines) {
			const wrappedLines = wrapTextWithAnsi(line.trimEnd(), contentWidth);
			for (const wrappedLine of wrappedLines) {
				const innerPad = padding(Math.max(0, contentWidth - visibleWidth(wrappedLine)));
				const fullLine = `${contentPrefix}${wrappedLine}${innerPad}${contentSuffix}`;
				lines.push(padToWidth(fullLine, lineWidth, bgFn));
			}
		}
	}

	// Bottom border
	const bottomLeft = border(`${BOX_SHARP.bottomLeft}${cap}`);
	const bottomRight = border(BOX_SHARP.bottomRight);
	const bottomFillCount = Math.max(0, lineWidth - visibleWidth(bottomLeft) - visibleWidth(bottomRight));
	const bottomLine = `${bottomLeft}${border(h.repeat(bottomFillCount))}${bottomRight}`;
	lines.push(padToWidth(bottomLine, lineWidth, bgFn));

	return lines;
}

// ============================================================================
// Cached Output Block
// ============================================================================

/**
 * Cached wrapper around `renderOutputBlock`.
 *
 * Output blocks are re-rendered on every frame via `render(width)` closures,
 * but their content rarely changes. This cache avoids redundant visibleWidth()
 * and padding() computations on ~99% of render calls.
 */
export class CachedOutputBlock {
	#cache?: RenderCache;

	/** Render with caching. Returns cached result if options haven't changed. */
	render(options: OutputBlockOptions, theme: Theme): string[] {
		const key = this.#buildKey(options);
		if (this.#cache?.key === key) return this.#cache.lines;
		const lines = renderOutputBlock(options, theme);
		this.#cache = { key, lines };
		return lines;
	}

	/** Invalidate the cache, forcing a rebuild on next render. */
	invalidate(): void {
		this.#cache = undefined;
	}

	#buildKey(options: OutputBlockOptions): bigint {
		const h = new Hasher();
		h.u32(options.width);
		h.optional(options.header);
		h.optional(options.headerMeta);
		h.optional(options.state);
		h.bool(options.applyBg ?? true);
		if (options.sections) {
			for (const s of options.sections) {
				h.optional(s.label);
				for (const line of s.lines) {
					h.str(line);
				}
			}
		}
		return h.digest();
	}
}

// ============================================================================
// Internal Helpers
// ============================================================================

import type { ThemeBg } from "../theme/theme.ts";

function getStateBgColorForBlock(state: State): ThemeBg {
	if (state === "success") return "toolSuccessBg";
	if (state === "error") return "toolErrorBg";
	return "toolPendingBg";
}
