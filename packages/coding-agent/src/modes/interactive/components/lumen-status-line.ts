/**
 * Standardized status line rendering for tool output.
 *
 * Format: icon + title + description + badge + meta
 * Example: ⠋ Bash: npm run check · Elapsed 3.2s · 142 lines
 *
 * [Provenance] 来源: oh-my-pi/packages/coding-agent/src/tui/status-line.ts
 * [Provenance] 移植方式: 重写 (用我们的 Theme API)
 */

import type { Theme, ThemeColor } from "../theme/theme.js";
import { SPINNER_FRAMES, STATUS_SYMBOLS, type State, type ToolUIStatus } from "./lumen-tui-utils.js";

// ============================================================================
// Status Icon Formatting
// ============================================================================

/**
 * Get the appropriate status icon with color for a given state.
 */
export function formatStatusIcon(status: ToolUIStatus, theme: Theme, spinnerFrame?: number): string {
	switch (status) {
		case "success":
			return theme.fg("success", STATUS_SYMBOLS.success);
		case "error":
			return theme.fg("error", STATUS_SYMBOLS.error);
		case "warning":
			return theme.fg("warning", STATUS_SYMBOLS.warning);
		case "info":
			return theme.fg("accent", STATUS_SYMBOLS.info);
		case "pending":
			return theme.fg("muted", STATUS_SYMBOLS.pending);
		case "running": {
			if (spinnerFrame !== undefined) {
				const frame = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];
				return theme.fg("accent", frame);
			}
			return theme.fg("accent", SPINNER_FRAMES[0]);
		}
		case "aborted":
			return theme.fg("error", STATUS_SYMBOLS.error);
	}
}

/**
 * Map a State to a ToolUIStatus for icon rendering.
 */
export function stateToUIStatus(state: State): ToolUIStatus {
	return state;
}

// ============================================================================
// Status Line
// ============================================================================

export interface StatusLineOptions {
	icon?: ToolUIStatus;
	spinnerFrame?: number;
	title: string;
	titleColor?: ThemeColor;
	description?: string;
	badge?: { label: string; color: ThemeColor };
	meta?: string[];
}

/**
 * Render a single-line status header.
 *
 * Format: `icon title: description [badge] · meta1 · meta2`
 */
export function renderStatusLine(options: StatusLineOptions, theme: Theme): string {
	const SEP_DOT = " \u00B7 "; // · with spaces

	const icon = options.icon ? formatStatusIcon(options.icon, theme, options.spinnerFrame) : "";
	const titleColor = options.titleColor ?? "accent";
	const title = theme.fg(titleColor, options.title);
	let line = icon ? `${icon} ${title}` : title;

	if (options.description) {
		line += `: ${theme.fg("muted", options.description)}`;
	}

	if (options.badge) {
		const { label, color } = options.badge;
		line += ` ${theme.fg(color, `\u27E6${label}\u27E7`)}`; // ⟦label⟧
	}

	const meta = options.meta?.filter((value) => value.trim().length > 0) ?? [];
	if (meta.length > 0) {
		line += ` ${theme.fg("dim", meta.join(SEP_DOT))}`;
	}

	return line;
}
