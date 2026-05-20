/**
 * Unified taskbar plugin above the input area.
 *
 * Layout:
 * - Banner
 * - Queue
 * - Headline
 * - Execution
 * - Plan
 */

import type {
	ExtensionAPI,
	ExtensionContext,
	QueuedUiState,
	SpinnerUiState,
	TaskUiItem,
	TaskUiSummary,
	WorkingIndicatorOptions,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { Container, Text } from "@earendil-works/pi-tui";
import { CLAUDE_SPINNER_VERBS } from "./claude-spinner-verbs.js";

type Snapshot = {
	tasks: TaskUiItem[];
	summary: TaskUiSummary | undefined;
	queued: QueuedUiState | undefined;
	spinner: SpinnerUiState | undefined;
	expanded: boolean;
};

type WorkingState = {
	randomVerb: string;
	lastOutputTokens: number;
	idleCycles: number;
	isIdle: boolean;
	isStalled: boolean;
	displayedTokens: number;
	tipState: TipState;
	shimmerOffset: number;
};

type TipState = {
	shownIds: Set<string>;
	lastTipId: string | undefined;
	lastTipCycleStart: number;
};

type TaskBucket = {
	execution: TaskUiItem[];
	plan: TaskUiItem[];
};

const SHOW_TIP_AFTER_MS = 30_000;
const TIP_ROTATION_MS = 60_000;
const MAX_QUEUED_PREVIEW_CHARS = 96;
const MAX_TASK_PREVIEW_CHARS = 88;
const MAX_WORKING_PREVIEW_CHARS = 96;
const MAX_QUEUED_ITEMS = 2;
const MAX_EXECUTION_ITEMS = 3;
const MAX_PLAN_ITEMS = 5;
const SPINNER_REFRESH_MS = 250;
const IDLE_CYCLES_THRESHOLD = 2;
const STALL_CYCLES_THRESHOLD = 12;
const TOKEN_ANIMATION_STEP = 0.3;

interface TipCandidate {
	id: string;
	text: string;
	priority: number;
	condition: (elapsed: number, snapshot: Snapshot, tipState: TipState) => boolean;
	once?: boolean;
}

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
		text: "用 tasks-ui 命令可以展开/折叠任务栏视图",
		priority: 3,
		condition: (elapsed, snapshot, tipState) =>
			elapsed >= 60_000 && snapshot.tasks.length > 0 && !tipState.shownIds.has("tasks-hint"),
		once: true,
	},
];

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

function shimmerText(
	text: string,
	offset: number,
	theme: ExtensionContext["ui"]["theme"],
	baseColor: "accent" | "error",
): string {
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

function createWorkingIndicator(
	theme: ExtensionContext["ui"]["theme"],
	stalled: boolean,
	mode?: "requesting" | "responding" | "tool-use" | "thinking",
): WorkingIndicatorOptions {
	const color = stalled ? "error" : "accent";
	const intervalMs = stalled ? 80 : mode === "requesting" ? 80 : mode === "tool-use" ? 160 : 120;
	return {
		frames: [
			theme.fg(color, "⠋"),
			theme.fg(color, "⠙"),
			theme.fg(color, "⠹"),
			theme.fg(color, "⠸"),
			theme.fg(color, "⠼"),
			theme.fg(color, "⠴"),
			theme.fg(color, "⠦"),
			theme.fg(color, "⠧"),
			theme.fg(color, "⠇"),
			theme.fg(color, "⠏"),
		],
		intervalMs,
	};
}

function sample<T>(items: readonly T[], seed: number): T {
	return items[Math.abs(seed) % items.length] ?? items[0]!;
}

function readSnapshot(ctx: ExtensionContext): Snapshot {
	return {
		tasks: ctx.getTasks() ?? [],
		summary: ctx.getTaskSummary(),
		queued: ctx.getQueuedMessages(),
		spinner: ctx.ui.getSpinnerState(),
		expanded: ctx.ui.getTasksExpanded(),
	};
}

function selectTip(elapsed: number, snapshot: Snapshot, tipState: TipState): string | undefined {
	const now = Date.now();
	if (tipState.lastTipId && now - tipState.lastTipCycleStart < TIP_ROTATION_MS) {
		const current = TIP_POOL.find((t) => t.id === tipState.lastTipId);
		if (current && current.condition(elapsed, snapshot, tipState)) {
			return current.text;
		}
	}

	const candidates = TIP_POOL
		.filter((t) => t.condition(elapsed, snapshot, tipState))
		.sort((a, b) => a.priority - b.priority);

	if (candidates.length === 0) return undefined;

	const selected = candidates[0];
	if (selected.id !== tipState.lastTipId) {
		tipState.lastTipId = selected.id;
		tipState.lastTipCycleStart = now;
		if (selected.once) {
			tipState.shownIds.add(selected.id);
		}
	}
	return selected.text;
}

function splitTasks(snapshot: Snapshot): TaskBucket {
	return {
		execution: snapshot.tasks.filter((task) => task.id.startsWith("task:")),
		plan: snapshot.tasks.filter((task) => task.id.startsWith("todo:")),
	};
}

function firstTask(
	items: TaskUiItem[],
	statuses: Array<TaskUiItem["status"]>,
): TaskUiItem | undefined {
	return items.find((item) => statuses.includes(item.status));
}

function buildHeadlineText(
	current: TaskUiItem | undefined,
	spinner: SpinnerUiState | undefined,
	working: WorkingState,
): string {
	if (spinner?.overrideMessage) {
		return inlineText(spinner.overrideMessage, MAX_WORKING_PREVIEW_CHARS);
	}
	if (current?.activeForm) {
		return inlineText(current.activeForm, MAX_WORKING_PREVIEW_CHARS);
	}
	if (current?.subject ?? current?.content) {
		return inlineText(current?.subject ?? current?.content ?? working.randomVerb, MAX_WORKING_PREVIEW_CHARS);
	}
	if (spinner?.currentToolLabel) {
		return inlineText(spinner.currentToolLabel, MAX_WORKING_PREVIEW_CHARS);
	}
	return working.randomVerb;
}

function updateWorkingMetrics(snapshot: Snapshot, working: WorkingState): {
	elapsed: number;
	parts: string[];
	outputTokens: number;
} {
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

	return { elapsed, parts, outputTokens };
}

function renderBannerLines(snapshot: Snapshot, theme: ExtensionContext["ui"]["theme"]): string[] {
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

function renderQueueLines(snapshot: Snapshot, theme: ExtensionContext["ui"]["theme"]): string[] {
	if (!snapshot.queued) return [];
	const items = [...snapshot.queued.steering, ...snapshot.queued.followUp].filter((item) => !item.isMeta);
	if (items.length === 0) return [];

	const lines = [
		theme.fg("dim", items.length === 1 ? "1 queued command" : `${items.length} queued commands`),
	];

	for (const item of items.slice(0, MAX_QUEUED_ITEMS)) {
		const label = item.kind === "steer" ? "Steer" : "Follow-up";
		const text =
			item.preExpansionText && item.preExpansionText !== item.text ? item.preExpansionText : item.text;
		lines.push(
			`${theme.fg("dim", "  ⎿ ")}${theme.fg("muted", `${label}: `)}${inlineText(text, MAX_QUEUED_PREVIEW_CHARS)}`,
		);
	}

	if (items.length > MAX_QUEUED_ITEMS) {
		lines.push(theme.fg("dim", `  ⎿ +${items.length - MAX_QUEUED_ITEMS} more queued commands`));
	}

	return lines;
}

function renderExecutionLines(
	items: TaskUiItem[],
	expanded: boolean,
	theme: ExtensionContext["ui"]["theme"],
): string[] {
	const visibleItems = items.filter((item) => item.status !== "completed");
	if (visibleItems.length === 0) return [];

	const lines: string[] = [];
	const capped = expanded ? visibleItems : visibleItems.slice(0, MAX_EXECUTION_ITEMS);
	for (const item of capped) {
		const prefix = item.status === "running" || item.status === "in_progress" ? "├─" : "└─";
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
			`${theme.fg("dim", `  ${prefix} `)}${theme.fg("accent", agent)}${theme.fg("dim", `: ${inlineText(activity, 72)}${statsSuffix}`)}`,
		);
	}

	if (!expanded && visibleItems.length > capped.length) {
		lines.push(theme.fg("dim", `  ⎿ +${visibleItems.length - capped.length} more running tasks`));
	}

	return lines;
}

function renderPlanLines(
	items: TaskUiItem[],
	expanded: boolean,
	theme: ExtensionContext["ui"]["theme"],
): string[] {
	if (items.length === 0) return [];

	const completed = items.filter((item) => item.status === "completed").length;
	const inProgress = items.filter((item) => item.status === "in_progress").length;
	const open = items.length - completed;
	const current = firstTask(items, ["in_progress"]);
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

class ClaudeTaskbarComponent extends Container {
	constructor(snapshot: Snapshot, theme: ExtensionContext["ui"]["theme"], working: WorkingState) {
		super();
		const { execution, plan } = splitTasks(snapshot);
		const executionCurrent = firstTask(execution, ["running", "in_progress"]);
		const executionNext = firstTask(execution, ["pending"]);
		const planCurrent = firstTask(plan, ["in_progress"]);
		const planNext = firstTask(plan, ["pending"]);
		const current = executionCurrent ?? planCurrent ?? snapshot.summary?.current;
		const next = executionCurrent ? planNext ?? executionNext : planNext ?? executionNext ?? snapshot.summary?.next;
		const { elapsed, parts, outputTokens } = updateWorkingMetrics(snapshot, working);

		const runningExecutionCount = execution.filter(
			(item) => item.status === "running" || item.status === "in_progress",
		).length;
		working.isIdle =
			runningExecutionCount > 0 &&
			!snapshot.spinner?.isThinking &&
			working.idleCycles >= IDLE_CYCLES_THRESHOLD;
		working.isStalled =
			!working.isIdle &&
			!snapshot.spinner?.isThinking &&
			working.idleCycles >= STALL_CYCLES_THRESHOLD &&
			outputTokens > 0;

		for (const line of renderBannerLines(snapshot, theme)) {
			this.addChild(new Text(line, 0, 0));
		}
		if (snapshot.spinner?.banner && (snapshot.queued || current || next || execution.length > 0 || plan.length > 0)) {
			this.addChild(new Text("", 0, 0));
		}

		for (const line of renderQueueLines(snapshot, theme)) {
			this.addChild(new Text(line, 0, 0));
		}
		if (snapshot.queued && renderQueueLines(snapshot, theme).length > 0 && (current || execution.length > 0 || plan.length > 0)) {
			this.addChild(new Text("", 0, 0));
		}

		if (current || snapshot.spinner) {
			if (working.isIdle) {
				const suffix =
					runningExecutionCount === 1 ? "1 running task" : `${runningExecutionCount} running tasks`;
				this.addChild(new Text(theme.fg("dim", `✽ Idle · ${suffix}`), 0, 0));
			} else {
				const headlineText = `${buildHeadlineText(current, snapshot.spinner, working)}...`;
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
				this.addChild(new Text(`${coloredHeadline}${meta}`, 0, 0));
			}
		}

		for (const line of renderExecutionLines(execution, snapshot.expanded, theme)) {
			this.addChild(new Text(line, 0, 0));
		}

		for (const line of renderPlanLines(plan, snapshot.expanded, theme)) {
			this.addChild(new Text(line, 0, 0));
		}

		if (next) {
			const nextText = inlineText(next.subject ?? next.content, MAX_WORKING_PREVIEW_CHARS);
			this.addChild(new Text(theme.fg("dim", "  ⎿ ") + theme.fg("muted", `Next: ${nextText}`), 0, 0));
		} else if (elapsed >= SHOW_TIP_AFTER_MS) {
			const tip = selectTip(elapsed, snapshot, working.tipState) ?? snapshot.spinner?.tip;
			if (tip) {
				this.addChild(new Text(theme.fg("dim", "  ⎿ ") + theme.fg("muted", `Tip: ${tip}`), 0, 0));
			}
		}
	}
}

function createTaskbarFactory(snapshot: Snapshot, working: WorkingState) {
	const { execution, plan } = splitTasks(snapshot);
	const hasContent =
		(snapshot.spinner?.banner !== undefined) ||
		(snapshot.queued !== undefined &&
			[...snapshot.queued.steering, ...snapshot.queued.followUp].some((item) => !item.isMeta)) ||
		execution.length > 0 ||
		plan.length > 0 ||
		snapshot.spinner !== undefined;

	if (!hasContent) return undefined;
	return (_tui: TUI, theme: ExtensionContext["ui"]["theme"]) => new ClaudeTaskbarComponent(snapshot, theme, working);
}

function renderUi(ctx: ExtensionContext, working: WorkingState) {
	const snapshot = readSnapshot(ctx);

	ctx.ui.setStatus("task", undefined);
	ctx.ui.setStatus("todo", undefined);
	ctx.ui.setStatus("queue", undefined);
	ctx.ui.setStatus("task-ui", undefined);
	ctx.ui.setStatus("ask_user", undefined);

	ctx.ui.setQueuedVisible(false);
	ctx.ui.setWorkingVisible(false);
	ctx.ui.setWorkingIndicator(undefined);
	ctx.ui.setWorkingMessage(undefined);
	ctx.ui.setWorkingDetails(undefined);
	ctx.ui.setWidget("claude-task-ui:queued", undefined);
	ctx.ui.setWidget("claude-task-ui:tasks", undefined);

	const taskbarFactory = createTaskbarFactory(snapshot, working);
	if (taskbarFactory) {
		ctx.ui.setWidget("claude-task-ui:taskbar", taskbarFactory, {
			placement: "aboveEditor",
		});
	} else {
		ctx.ui.setWidget("claude-task-ui:taskbar", undefined);
	}
}

export default function (pi: ExtensionAPI) {
	const working: WorkingState = {
		randomVerb: sample(CLAUDE_SPINNER_VERBS, Date.now()),
		lastOutputTokens: 0,
		idleCycles: 0,
		isIdle: false,
		isStalled: false,
		displayedTokens: 0,
		tipState: { shownIds: new Set(), lastTipId: undefined, lastTipCycleStart: 0 },
		shimmerOffset: 0,
	};

	let latestCtx: ExtensionContext | undefined;
	let refreshTimer: ReturnType<typeof setInterval> | undefined;

	const stopRefreshLoop = () => {
		if (refreshTimer) {
			clearInterval(refreshTimer);
			refreshTimer = undefined;
		}
	};

	const rerender = (ctx: ExtensionContext) => {
		latestCtx = ctx;
		renderUi(ctx, working);
	};

	const startRefreshLoop = () => {
		if (refreshTimer) return;
		refreshTimer = setInterval(() => {
			if (!latestCtx) return;
			renderUi(latestCtx, working);
		}, SPINNER_REFRESH_MS);
	};

	pi.on("session_start", async (_event, ctx) => {
		stopRefreshLoop();
		renderUi(ctx, working);
	});

	pi.on("session_shutdown", async () => {
		stopRefreshLoop();
	});

	pi.on("queue_update", async (_event, ctx) => {
		rerender(ctx);
	});

	pi.on("agent_start", async (_event, ctx) => {
		startRefreshLoop();
		rerender(ctx);
	});

	pi.on("turn_start", async (_event, ctx) => {
		rerender(ctx);
	});

	pi.on("message_update", async (_event, ctx) => {
		rerender(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		rerender(ctx);
	});

	pi.on("tool_result", async (_event, ctx) => {
		rerender(ctx);
	});

	pi.on("message_end", async (_event, ctx) => {
		rerender(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		stopRefreshLoop();
		rerender(ctx);
	});

	pi.on("compaction_start", async (_event, ctx) => {
		rerender(ctx);
	});

	pi.on("compaction_end", async (_event, ctx) => {
		rerender(ctx);
	});

	pi.on("session_compact", async (_event, ctx) => {
		rerender(ctx);
	});

	pi.on("auto_retry_start", async (_event, ctx) => {
		startRefreshLoop();
		rerender(ctx);
	});

	pi.on("auto_retry_end", async (_event, ctx) => {
		rerender(ctx);
	});

	pi.registerCommand("tasks-ui", {
		description: "Toggle unified taskbar plan / execution view above the editor.",
		handler: async (_args, ctx) => {
			ctx.ui.toggleTasksExpanded();
			rerender(ctx);
		},
	});
}
