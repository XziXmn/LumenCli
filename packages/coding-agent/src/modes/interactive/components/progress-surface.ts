import type { Component } from "@earendil-works/pi-tui";
import type { QueuedUiState, SpinnerUiState, TaskUiItem } from "../../../core/extensions/types.js";
import { CLAUDE_SPINNER_VERBS } from "../spinner-verbs.js";
import type { Theme } from "../theme/theme.js";

export interface ProgressSurfaceSnapshot {
	tasks: TaskUiItem[];
	queued: QueuedUiState | undefined;
	spinner: SpinnerUiState | undefined;
	expanded: boolean;
}

export interface ProgressSurfaceWorkingState {
	randomVerb: string;
	lastOutputTokens: number;
	idleCycles: number;
	isIdle: boolean;
	isStalled: boolean;
	displayedTokens: number;
	tipState: TipState;
	shimmerOffset: number;
}

type TipState = {
	shownIds: Set<string>;
	lastTipId: string | undefined;
	lastTipCycleStart: number;
};

type TaskBucket = {
	execution: TaskUiItem[];
	plan: TaskUiItem[];
};

interface TipCandidate {
	id: string;
	text: string;
	priority: number;
	condition: (elapsed: number, snapshot: ProgressSurfaceSnapshot, tipState: TipState) => boolean;
	once?: boolean;
}

const SHOW_TIP_AFTER_MS = 30_000;
const TIP_ROTATION_MS = 60_000;
const MAX_TASK_PREVIEW_CHARS = 88;
const MAX_WORKING_PREVIEW_CHARS = 96;
const MAX_EXECUTION_ITEMS = 3;
const MAX_PLAN_ITEMS = 5;
const IDLE_CYCLES_THRESHOLD = 2;
const STALL_CYCLES_THRESHOLD = 12;
const TOKEN_ANIMATION_STEP = 0.3;
const BRAILLE_SPINNER_FRAMES = ["⣻", "⣽", "⣾", "⣷", "⣯", "⣟", "⢿", "⡿"] as const;

const TIP_POOL: TipCandidate[] = [
	{
		id: "clear-context",
		text: "切换话题时可以用 /clear 重开会话，释放上下文",
		priority: 1,
		condition: (elapsed) => elapsed >= 1_800_000,
	},
	{
		id: "queue-hint",
		text: "Enter 立即插入（工具间隙就发出），Alt+Enter 排队等本轮结束再发",
		priority: 2,
		condition: (elapsed, _snapshot, tipState) => elapsed >= 30_000 && !tipState.shownIds.has("queue-hint"),
		once: true,
	},
	{
		id: "tasks-hint",
		text: "任务栏展开/折叠能力会迁移到 core，当前先保持折叠视图",
		priority: 3,
		condition: (elapsed, snapshot, tipState) =>
			elapsed >= 60_000 && snapshot.tasks.length > 0 && !tipState.shownIds.has("tasks-hint"),
		once: true,
	},
];

export function createProgressSurfaceWorkingState(seed = Date.now()): ProgressSurfaceWorkingState {
	return {
		randomVerb: sample(CLAUDE_SPINNER_VERBS, seed),
		lastOutputTokens: 0,
		idleCycles: 0,
		isIdle: false,
		isStalled: false,
		displayedTokens: 0,
		tipState: { shownIds: new Set(), lastTipId: undefined, lastTipCycleStart: 0 },
		shimmerOffset: 0,
	};
}

function inlineText(text: string, maxChars: number): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function formatTokens(n: number): string {
	if (n < 1000) return String(n);
	if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
	return `${Math.round(n / 1000)}k`;
}

function formatElapsed(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	if (totalSec < 60) return `${totalSec}s`;
	const m = Math.floor(totalSec / 60);
	const s = totalSec % 60;
	return `${m}m ${s}s`;
}

function shimmerText(text: string, offset: number, theme: Theme, baseColor: "accent" | "error"): string {
	const len = text.length;
	if (len === 0) return "";
	const cycleLen = len + 6;
	const pos = offset % cycleLen;
	const shimStart = pos - 1;
	const shimEnd = pos + 1;
	if (shimStart >= len || shimEnd < 0) {
		return theme.bold(theme.fg(baseColor, text));
	}
	const cStart = Math.max(0, shimStart);
	const cEnd = Math.min(len, shimEnd + 1);
	const before = text.slice(0, cStart);
	const shim = text.slice(cStart, cEnd);
	const after = text.slice(cEnd);
	const dimPart = (s: string) => (s ? theme.fg(baseColor, s) : "");
	const brightPart = (s: string) => (s ? theme.bold(theme.fg(baseColor, s)) : "");
	return dimPart(before) + brightPart(shim) + dimPart(after);
}

function createWorkingIndicator(theme: Theme, stalled: boolean, mode?: SpinnerUiState["mode"]) {
	const color = stalled ? "error" : "accent";
	const intervalMs = stalled ? 80 : mode === "requesting" ? 80 : mode === "tool-use" ? 160 : 120;
	return {
		frames: BRAILLE_SPINNER_FRAMES.map((frame) => theme.fg(color, frame)),
		intervalMs,
	};
}

function formatHeadlinePrefix(
	theme: Theme,
	working: ProgressSurfaceWorkingState,
	mode?: SpinnerUiState["mode"],
	stalled = false,
): string {
	if (working.isIdle) {
		return theme.fg("dim", "✽");
	}
	const color = stalled ? "error" : "accent";
	const frames = createWorkingIndicator(theme, stalled, mode).frames ?? [theme.fg(color, "●")];
	return frames[Math.abs(working.shimmerOffset) % frames.length] ?? theme.fg(color, "●");
}

function sample<T>(items: readonly T[], seed: number): T {
	return items[Math.abs(seed) % items.length] ?? items[0]!;
}

function selectTip(elapsed: number, snapshot: ProgressSurfaceSnapshot, tipState: TipState): string | undefined {
	const now = Date.now();
	if (tipState.lastTipId && now - tipState.lastTipCycleStart < TIP_ROTATION_MS) {
		const current = TIP_POOL.find((tip) => tip.id === tipState.lastTipId);
		if (current?.condition(elapsed, snapshot, tipState)) {
			return current.text;
		}
	}

	const candidates = TIP_POOL.filter((tip) => tip.condition(elapsed, snapshot, tipState)).sort(
		(left, right) => left.priority - right.priority,
	);

	if (candidates.length === 0) return undefined;

	const selected = candidates[0]!;
	if (selected.id !== tipState.lastTipId) {
		tipState.lastTipId = selected.id;
		tipState.lastTipCycleStart = now;
		if (selected.once) {
			tipState.shownIds.add(selected.id);
		}
	}
	return selected.text;
}

function splitTasks(snapshot: ProgressSurfaceSnapshot): TaskBucket {
	return {
		execution: snapshot.tasks.filter((task) => task.id.startsWith("task:")),
		plan: snapshot.tasks.filter((task) => task.id.startsWith("todo:")),
	};
}

function firstTask(items: TaskUiItem[], statuses: Array<TaskUiItem["status"]>): TaskUiItem | undefined {
	return items.find((item) => statuses.includes(item.status));
}

function buildHeadlineText(
	currentPlan: TaskUiItem | undefined,
	executionItems: TaskUiItem[],
	spinner: SpinnerUiState | undefined,
	working: ProgressSurfaceWorkingState,
): string {
	if (spinner?.overrideMessage) {
		return inlineText(spinner.overrideMessage, MAX_WORKING_PREVIEW_CHARS);
	}

	if (spinner?.banner?.title) {
		return inlineText(spinner.banner.title, MAX_WORKING_PREVIEW_CHARS);
	}

	if (currentPlan?.activeForm) {
		return inlineText(currentPlan.activeForm, MAX_WORKING_PREVIEW_CHARS);
	}

	if (currentPlan?.subject ?? currentPlan?.content) {
		return inlineText(currentPlan.subject ?? currentPlan.content, MAX_WORKING_PREVIEW_CHARS);
	}

	if (spinner?.currentToolLabel) {
		return inlineText(spinner.currentToolLabel, MAX_WORKING_PREVIEW_CHARS);
	}

	if (spinner?.mode === "requesting" || spinner?.mode === "responding" || spinner?.isThinking) {
		return working.randomVerb;
	}

	const runningExecution = executionItems.filter((item) => item.status === "running" || item.status === "in_progress");

	if (runningExecution.length > 1) {
		return `${runningExecution.length} running tasks`;
	}

	if (runningExecution.length === 1) {
		const current = runningExecution[0]!;
		const label = current.activeForm ?? current.subject ?? current.content;
		if (label) {
			const agentPrefix = current.group ? `@${current.group} ` : "";
			return inlineText(`${agentPrefix}${label}`, MAX_WORKING_PREVIEW_CHARS);
		}
	}
	return working.randomVerb;
}

function updateWorkingMetrics(snapshot: ProgressSurfaceSnapshot, working: ProgressSurfaceWorkingState) {
	const spinner = snapshot.spinner;
	const elapsed = spinner?.elapsedMs ?? 0;
	const outputTokens = spinner?.outputTokens ?? 0;
	const parts: string[] = [];

	if (outputTokens === working.lastOutputTokens) {
		working.idleCycles++;
	} else {
		working.idleCycles = 0;
		working.lastOutputTokens = outputTokens;
	}

	if (working.displayedTokens < outputTokens) {
		const delta = outputTokens - working.displayedTokens;
		const step = Math.max(1, Math.ceil(delta * TOKEN_ANIMATION_STEP));
		working.displayedTokens = Math.min(outputTokens, working.displayedTokens + step);
	} else {
		working.displayedTokens = outputTokens;
	}

	if (elapsed >= 3_000) {
		parts.push(formatElapsed(elapsed));
		if (working.displayedTokens > 0) {
			parts.push(`↓ ${formatTokens(working.displayedTokens)} tokens`);
		}
	}

	if (spinner?.isThinking) {
		parts.push("thinking");
	} else if (spinner?.lastThinkingDurationMs !== undefined) {
		const seconds = Math.max(1, Math.round(spinner.lastThinkingDurationMs / 1000));
		parts.push(`thought for ${seconds}s`);
	}

	return { elapsed, outputTokens, parts };
}

function renderBannerLines(snapshot: ProgressSurfaceSnapshot, theme: Theme): string[] {
	const banner = snapshot.spinner?.banner;
	if (!banner) return [];

	const style = (() => {
		switch (banner.kind) {
			case "success":
				return { icon: "✓", color: "success" as const };
			case "error":
				return { icon: "!", color: "error" as const };
			case "input":
				return { icon: "?", color: "warning" as const };
			case "approval":
				return { icon: "!", color: "warning" as const };
			case "warning":
				return { icon: "~", color: "warning" as const };
			default:
				return { icon: "~", color: "accent" as const };
		}
	})();

	const lines = [theme.bold(theme.fg(style.color, `${style.icon} ${banner.title}`))];
	if (banner.detail) {
		lines.push(`${theme.fg("dim", "└─ ")}${theme.fg("muted", inlineText(banner.detail, 120))}`);
	}
	return lines;
}

function renderExecutionLines(items: TaskUiItem[], expanded: boolean, theme: Theme): string[] {
	const liveItems = items.filter(
		(item) => item.status === "running" || item.status === "in_progress" || item.status === "pending",
	);
	if (liveItems.length === 0) return [];

	const runningCount = liveItems.filter((item) => item.status === "running" || item.status === "in_progress").length;
	const header = runningCount <= 1 ? `${runningCount} running task` : `${runningCount} running tasks`;

	const lines: string[] = [theme.fg("dim", `  ⎿ ${header}`)];
	const capped = expanded ? liveItems : liveItems.slice(0, MAX_EXECUTION_ITEMS);
	for (const item of capped) {
		const prefix = item.status === "pending" && capped.length === 1 ? "└─" : item.status === "pending" ? "├─" : "├─";
		const agent = item.group ? `@${item.group}` : item.id;
		const activity =
			item.meta ??
			item.activeForm ??
			item.subject ??
			item.content ??
			(item.status === "pending" ? "pending" : "working");
		const stats: string[] = [];
		if (item.toolCount) stats.push(`${item.toolCount} uses`);
		if (item.tokens) stats.push(`${formatTokens(item.tokens)} tokens`);
		if (item.durationMs) stats.push(formatElapsed(item.durationMs));
		if (item.status === "failed" || item.status === "aborted") stats.push("failed");
		if (item.status === "pending") stats.push("pending");
		const statsSuffix = stats.length > 0 ? ` · ${stats.join(" · ")}` : "";
		lines.push(
			`${theme.fg("dim", `    ${prefix} `)}${theme.fg("accent", agent)}${theme.fg("dim", `: ${inlineText(activity, 72)}${statsSuffix}`)}`,
		);
	}

	if (!expanded && liveItems.length > capped.length) {
		lines.push(theme.fg("dim", `    ⎿ +${liveItems.length - capped.length} more execution items`));
	}

	return lines;
}

function renderPlanLines(items: TaskUiItem[], expanded: boolean, theme: Theme): string[] {
	if (items.length === 0) return [];

	const completed = items.filter((item) => item.status === "completed").length;
	const inProgress = items.filter((item) => item.status === "in_progress").length;
	const pending = items.filter((item) => item.status === "pending").length;
	const open = pending + inProgress;
	const current = firstTask(items, ["in_progress"]);
	const next = firstTask(items, ["pending"]);
	if (!expanded && !current && !next) return [];
	const currentGroup = current?.group;
	const focusItems = currentGroup ? items.filter((item) => item.group === currentGroup) : items;
	const visible = expanded ? items : focusItems.slice(0, MAX_PLAN_ITEMS);

	const lines: string[] = [
		`${theme.fg("dim", "  ⎿ Plan")} ${theme.fg("muted", `${items.length} tasks · ${completed} done · ${inProgress} in progress · ${open} open`)}`,
	];

	let lastGroup: string | undefined;
	for (const item of visible) {
		if (expanded && item.group && item.group !== lastGroup) {
			lines.push(`${theme.fg("dim", "    ")}${theme.fg("muted", item.group)}`);
			lastGroup = item.group;
		}
		const mark =
			item.status === "completed"
				? "☒"
				: item.status === "in_progress"
					? "◐"
					: item.status === "abandoned"
						? "✕"
						: "☐";
		const text = inlineText(item.subject ?? item.content, MAX_TASK_PREVIEW_CHARS);
		const styled =
			item.status === "completed"
				? theme.fg("dim", theme.strikethrough(text))
				: item.status === "in_progress"
					? theme.bold(theme.fg("accent", text))
					: item.status === "abandoned"
						? theme.fg("error", text)
						: text;
		lines.push(`${theme.fg("dim", "    ")}${mark} ${styled}`);
	}

	if (!expanded && items.length > visible.length) {
		lines.push(theme.fg("dim", `    ⎿ +${items.length - visible.length} more tasks`));
	}

	return lines;
}

export function shouldRenderProgressSurface(snapshot: ProgressSurfaceSnapshot): boolean {
	const { execution, plan } = splitTasks(snapshot);
	const executionHasLive = execution.some(
		(item) => item.status === "running" || item.status === "in_progress" || item.status === "pending",
	);
	const planHasLive = plan.some((item) => item.status === "in_progress" || item.status === "pending");
	const hasSpinnerSurface =
		snapshot.spinner?.banner !== undefined ||
		snapshot.spinner?.overrideMessage !== undefined ||
		snapshot.spinner?.currentToolLabel !== undefined ||
		snapshot.spinner?.isThinking === true ||
		snapshot.spinner?.lastThinkingDurationMs !== undefined ||
		snapshot.spinner?.elapsedMs !== undefined ||
		snapshot.spinner?.outputTokens !== undefined ||
		snapshot.spinner?.budgetText !== undefined ||
		snapshot.spinner?.tip !== undefined;
	return hasSpinnerSurface || executionHasLive || planHasLive;
}

function renderProgressSurfaceLines(
	snapshot: ProgressSurfaceSnapshot,
	theme: Theme,
	working: ProgressSurfaceWorkingState,
): string[] {
	const { execution, plan } = splitTasks(snapshot);
	const executionNext = firstTask(execution, ["pending"]);
	const planCurrent = firstTask(plan, ["in_progress"]);
	const planNext = firstTask(plan, ["pending"]);
	const current = planCurrent ?? firstTask(execution, ["running", "in_progress"]);
	const next = planNext ?? executionNext;
	const { elapsed, outputTokens, parts } = updateWorkingMetrics(snapshot, working);
	const lines: string[] = [];

	const runningExecutionCount = execution.filter(
		(item) => item.status === "running" || item.status === "in_progress",
	).length;
	working.isIdle =
		!current &&
		runningExecutionCount > 0 &&
		!snapshot.spinner?.isThinking &&
		working.idleCycles >= IDLE_CYCLES_THRESHOLD;
	working.isStalled =
		!working.isIdle &&
		!snapshot.spinner?.isThinking &&
		working.idleCycles >= STALL_CYCLES_THRESHOLD &&
		outputTokens > 0;

	for (const line of renderBannerLines(snapshot, theme)) {
		lines.push(line);
	}
	if (snapshot.spinner?.banner && (snapshot.queued || current || next || execution.length > 0 || plan.length > 0)) {
		lines.push("");
	}

	if (current || snapshot.spinner) {
		if (working.isIdle) {
			const suffix = runningExecutionCount === 1 ? "1 running task" : `${runningExecutionCount} running tasks`;
			lines.push(theme.fg("dim", `✽ Idle · ${suffix}`));
		} else {
			const headlineText = `${buildHeadlineText(planCurrent, execution, snapshot.spinner, working)}...`;
			const headlineColor = working.isStalled ? "error" : "accent";
			const mode = snapshot.spinner?.mode;
			const shimmerStep = mode === "requesting" ? 3 : mode === "tool-use" ? 0 : 1;
			working.shimmerOffset += shimmerStep;
			let coloredHeadline: string;
			if (mode === "tool-use") {
				const pulse = Math.sin(working.shimmerOffset * 0.15) > 0;
				working.shimmerOffset++;
				coloredHeadline = pulse
					? theme.bold(theme.fg(headlineColor, headlineText))
					: theme.fg(headlineColor, headlineText);
			} else if (shimmerStep > 0) {
				coloredHeadline = shimmerText(headlineText, working.shimmerOffset, theme, headlineColor);
			} else {
				coloredHeadline = theme.bold(theme.fg(headlineColor, headlineText));
			}
			const meta = parts.length > 0 ? theme.fg("muted", ` (${parts.join(" · ")})`) : "";
			const prefix = formatHeadlinePrefix(theme, working, mode, working.isStalled);
			lines.push(`${prefix} ${coloredHeadline}${meta}`);
		}
	}

	for (const line of renderExecutionLines(execution, snapshot.expanded, theme)) {
		lines.push(line);
	}

	for (const line of renderPlanLines(plan, snapshot.expanded, theme)) {
		lines.push(line);
	}

	if (next) {
		const nextText = inlineText(next.subject ?? next.content, MAX_WORKING_PREVIEW_CHARS);
		lines.push(theme.fg("dim", "  ⎿ ") + theme.fg("muted", `Next: ${nextText}`));
	} else if (elapsed >= SHOW_TIP_AFTER_MS) {
		const tip = selectTip(elapsed, snapshot, working.tipState) ?? snapshot.spinner?.tip;
		if (tip) {
			lines.push(theme.fg("dim", "  ⎿ ") + theme.fg("muted", `Tip: ${tip}`));
		}
	}
	return lines;
}

export class ProgressSurfaceComponent implements Component {
	constructor(
		private readonly getSnapshot: () => ProgressSurfaceSnapshot,
		private readonly theme: Theme,
		private readonly working: ProgressSurfaceWorkingState,
	) {}

	render(_width: number): string[] {
		const snapshot = this.getSnapshot();
		if (!shouldRenderProgressSurface(snapshot)) {
			return [];
		}
		return renderProgressSurfaceLines(snapshot, this.theme, this.working);
	}

	invalidate(): void {}
}

export function __renderProgressSurfaceLinesForTest(snapshot: ProgressSurfaceSnapshot, theme: Theme): string[] {
	if (!shouldRenderProgressSurface(snapshot)) {
		return [];
	}
	return renderProgressSurfaceLines(snapshot, theme, createProgressSurfaceWorkingState(0));
}
