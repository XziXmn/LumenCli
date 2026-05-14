/**
 * Lumen HUD Footer
 *
 * 3-line status bar inspired by claude-hud:
 * Line 1: [Model] │ project git:(branch*)                    thinking-level
 * Line 2: Context ████░░░░░░ 45% (90k/200k) │ ↑10k ↓426 R38k │ $0.12 │ 15m
 * Line 3: ⚒ tool-activity │ extension statuses (if any)
 *
 * [Lumen customization] Complete rewrite of Pi's footer for HUD-style display.
 */

import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { AgentSession } from "../../../core/agent-session.js";
import type { ReadonlyFooterDataProvider } from "../../../core/footer-data-provider.js";
import { theme } from "../theme/theme.js";

// ============================================================================
// Helpers
// ============================================================================

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

/**
 * Render a visual progress bar: ████░░░░░░
 * Colors: green (<70%) → yellow (70-85%) → red (>85%)
 */
function renderContextBar(percent: number, barWidth = 12): string {
	const filled = Math.round((percent / 100) * barWidth);
	const empty = barWidth - filled;
	const filledStr = "█".repeat(filled);
	const emptyStr = "░".repeat(empty);

	let color: "success" | "warning" | "error";
	if (percent > 85) color = "error";
	else if (percent > 70) color = "warning";
	else color = "success";

	return theme.fg(color, filledStr) + theme.fg("dim", emptyStr);
}

/**
 * Format elapsed time since session start.
 */
function formatDuration(startTime: number): string {
	const elapsed = Math.floor((Date.now() - startTime) / 1000);
	if (elapsed < 60) return `${elapsed}s`;
	if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`;
	const h = Math.floor(elapsed / 3600);
	const m = Math.floor((elapsed % 3600) / 60);
	return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}

// ============================================================================
// Tool Activity Tracker
// ============================================================================

interface ToolActivity {
	name: string;
	target?: string;
	startedAt: number;
	done: boolean;
}

const recentTools: ToolActivity[] = [];
const MAX_RECENT_TOOLS = 5;
const TOOL_DISPLAY_DURATION_MS = 8000; // Show completed tools for 8s

export function notifyToolStart(name: string, target?: string): void {
	recentTools.push({ name, target, startedAt: Date.now(), done: false });
	if (recentTools.length > MAX_RECENT_TOOLS * 2) {
		// Prune old entries
		const cutoff = Date.now() - TOOL_DISPLAY_DURATION_MS;
		const kept = recentTools.filter((t) => !t.done || t.startedAt > cutoff);
		recentTools.length = 0;
		recentTools.push(...kept.slice(-MAX_RECENT_TOOLS));
	}
}

export function notifyToolEnd(name: string): void {
	// Mark the most recent matching tool as done
	for (let i = recentTools.length - 1; i >= 0; i--) {
		if (recentTools[i].name === name && !recentTools[i].done) {
			recentTools[i].done = true;
			break;
		}
	}
}

function getToolActivityLine(): string {
	const now = Date.now();
	// Filter: show running tools + recently completed
	const visible = recentTools.filter((t) => !t.done || now - t.startedAt < TOOL_DISPLAY_DURATION_MS);
	if (visible.length === 0) return "";

	// Count completed tools by name
	const completed = new Map<string, number>();
	let runningTool: ToolActivity | undefined;

	for (const t of visible) {
		if (!t.done) {
			runningTool = t; // Show the latest running tool
		} else {
			completed.set(t.name, (completed.get(t.name) ?? 0) + 1);
		}
	}

	const parts: string[] = [];
	if (runningTool) {
		const target = runningTool.target ? `: ${runningTool.target}` : "";
		parts.push(theme.fg("accent", `⚒ ${runningTool.name}${target}`));
	}
	for (const [name, count] of completed) {
		parts.push(theme.fg("success", `✓`) + theme.fg("dim", `${name}×${count}`));
	}

	return parts.join(theme.fg("dim", " │ "));
}

// ============================================================================
// Footer Component
// ============================================================================

export class FooterComponent implements Component {
	private autoCompactEnabled = true;
	private sessionStartTime = Date.now();

	constructor(
		private session: AgentSession,
		private footerData: ReadonlyFooterDataProvider,
	) {
		this.sessionStartTime = Date.now();
	}

	setSession(session: AgentSession): void {
		this.session = session;
		this.sessionStartTime = Date.now();
	}

	setAutoCompactEnabled(enabled: boolean): void {
		this.autoCompactEnabled = enabled;
	}

	invalidate(): void {}
	dispose(): void {}

	render(width: number): string[] {
		const state = this.session.state;

		// ─── Compute stats ───
		let totalInput = 0;
		let totalOutput = 0;
		let totalCacheRead = 0;
		let totalCost = 0;

		for (const entry of this.session.sessionManager.getEntries()) {
			if (entry.type === "message" && entry.message.role === "assistant") {
				totalInput += entry.message.usage.input;
				totalOutput += entry.message.usage.output;
				totalCacheRead += entry.message.usage.cacheRead;
				totalCost += entry.message.usage.cost.total;
			}
		}

		const contextUsage = this.session.getContextUsage();
		const contextWindow = contextUsage?.contextWindow ?? state.model?.contextWindow ?? 0;
		const contextPercentValue = contextUsage?.percent ?? 0;
		const contextTokens = contextUsage?.tokens ?? 0;

		// ─── Line 1: [Model] │ project git:(branch*)   thinking ───
		const modelName = state.model?.name || state.model?.id || "未选择模型";
		const modelBadge = theme.fg("accent", `[${modelName}]`);

		let projectPath = this.session.sessionManager.getCwd();
		const home = process.env.HOME || process.env.USERPROFILE;
		if (home && projectPath.startsWith(home)) {
			projectPath = `~${projectPath.slice(home.length)}`;
		}
		// Shorten to last 2 segments
		const segments = projectPath.replace(/\\/g, "/").split("/");
		if (segments.length > 2) {
			projectPath = segments.slice(-2).join("/");
		}

		const branch = this.footerData.getGitBranch();
		const gitStr = branch ? theme.fg("dim", ` git:(`) + theme.fg("accent", branch) + theme.fg("dim", `)`) : "";

		const thinkingLevel = state.model?.reasoning ? state.thinkingLevel || "off" : "";
		const thinkingStr = thinkingLevel ? theme.fg("dim", thinkingLevel) : "";

		const line1Left = `${modelBadge} ${theme.fg("muted", projectPath)}${gitStr}`;
		const line1LeftWidth = visibleWidth(line1Left);
		const thinkingWidth = visibleWidth(thinkingStr);
		const line1Padding = Math.max(1, width - line1LeftWidth - thinkingWidth);
		const line1 = truncateToWidth(line1Left + " ".repeat(line1Padding) + thinkingStr, width, "");

		// ─── Line 2: Context bar │ token stats │ cost │ duration ───
		const bar = renderContextBar(contextPercentValue, 10);
		let contextStr: string;
		if (contextUsage?.percent !== null) {
			const pctDisplay = `${contextPercentValue.toFixed(0)}%`;
			const tokensDisplay = contextTokens ? `(${formatTokens(contextTokens)}/${formatTokens(contextWindow)})` : "";
			contextStr = `${bar} ${pctDisplay} ${tokensDisplay}`;
		} else {
			contextStr = `${bar} ?/${formatTokens(contextWindow)}`;
		}
		if (this.autoCompactEnabled) {
			contextStr += theme.fg("dim", " auto");
		}

		const tokenParts: string[] = [];
		if (totalInput) tokenParts.push(`↑${formatTokens(totalInput)}`);
		if (totalOutput) tokenParts.push(`↓${formatTokens(totalOutput)}`);
		if (totalCacheRead) tokenParts.push(`R${formatTokens(totalCacheRead)}`);

		const usingSubscription = state.model ? this.session.modelRegistry.isUsingOAuth(state.model) : false;
		if (totalCost || usingSubscription) {
			tokenParts.push(`$${totalCost.toFixed(3)}${usingSubscription ? "(sub)" : ""}`);
		}

		const duration = formatDuration(this.sessionStartTime);
		tokenParts.push(duration);

		const line2Left = contextStr;
		const line2Right = tokenParts.join(" ");
		const line2LeftWidth = visibleWidth(line2Left);
		const line2RightWidth = visibleWidth(line2Right);
		const line2Padding = Math.max(2, width - line2LeftWidth - line2RightWidth);
		const line2 = truncateToWidth(
			theme.fg("dim", line2Left) + " ".repeat(line2Padding) + theme.fg("dim", line2Right),
			width,
			"",
		);

		// ─── Line 3: Tool activity │ extension statuses ───
		const toolActivity = getToolActivityLine();
		const extensionStatuses = this.footerData.getExtensionStatuses();
		const line3Parts: string[] = [];
		if (toolActivity) line3Parts.push(toolActivity);
		if (extensionStatuses.size > 0) {
			const sorted = Array.from(extensionStatuses.entries())
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([, text]) => sanitizeStatusText(text));
			line3Parts.push(...sorted);
		}

		const lines = [line1, line2];
		if (line3Parts.length > 0) {
			const line3 = truncateToWidth(line3Parts.join(theme.fg("dim", " │ ")), width, theme.fg("dim", "…"));
			lines.push(line3);
		}

		return lines;
	}
}
