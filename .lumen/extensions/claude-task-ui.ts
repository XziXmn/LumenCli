/**
 * Unified Claude-style task / todo / queued UI.
 *
 * Phase 2:
 * - task / queued / working UI is unified here instead of being scattered in core
 * - queued stays above the input area and never enters transcript
 * - working line uses current/next/tip structure inspired by Claude spinner region
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

type TaskGroup = {
	name?: string;
	tasks: TaskUiItem[];
};

function taskRank(task: TaskUiItem, currentId: string | undefined): number {
	if (task.id === currentId) return 0;
	if (task.status === "running" || task.status === "in_progress") return 1;
	if (task.status === "pending") return 2;
	if (task.status === "completed") return 3;
	if (task.status === "failed" || task.status === "aborted") return 4;
	return 5;
}

function groupTasksForDetails(snapshot: Snapshot): TaskGroup[] {
	const currentId = snapshot.summary?.current?.id;
	const sorted = [...snapshot.tasks].sort((a, b) => {
		const rankDiff = taskRank(a, currentId) - taskRank(b, currentId);
		if (rankDiff !== 0) return rankDiff;
		const groupA = a.group ?? "";
		const groupB = b.group ?? "";
		if (groupA !== groupB) return groupA.localeCompare(groupB);
		return a.id.localeCompare(b.id);
	});

	const groups: TaskGroup[] = [];
	for (const task of sorted) {
		const last = groups[groups.length - 1];
		if (!last || last.name !== task.group) {
			groups.push({ name: task.group, tasks: [task] });
		} else {
			last.tasks.push(task);
		}
	}
	return groups;
}

function formatHiddenTaskSummary(tasks: TaskUiItem[]): string | undefined {
	if (tasks.length === 0) return undefined;
	const completed = tasks.filter((task) => task.status === "completed").length;
	const inProgress = tasks.filter((task) => task.status === "running" || task.status === "in_progress").length;
	const pending = tasks.filter((task) => task.status === "pending").length;
	const failed = tasks.filter((task) => task.status === "failed" || task.status === "aborted").length;
	const abandoned = tasks.filter((task) => task.status === "abandoned").length;
	const parts: string[] = [];
	if (inProgress > 0) parts.push(`${inProgress} in progress`);
	if (pending > 0) parts.push(`${pending} pending`);
	if (completed > 0) parts.push(`${completed} completed`);
	if (failed > 0) parts.push(`${failed} failed`);
	if (abandoned > 0) parts.push(`${abandoned} abandoned`);
	return parts.length > 0 ? parts.join(" · ") : undefined;
}

class ClaudeTaskDetailsComponent extends Container {
	constructor(snapshot: Snapshot, theme: ExtensionContext["ui"]["theme"]) {
		super();
		const currentId = snapshot.summary?.current?.id;
		const groups = groupTasksForDetails(snapshot);
		const visibleTasks = groups.flatMap((group) => group.tasks).slice(0, MAX_TASK_ITEMS_SOLO);
		const visibleIds = new Set(visibleTasks.map((task) => task.id));
		const visibleGroups: TaskGroup[] = [];
		for (const group of groups) {
			const tasks = group.tasks.filter((task) => visibleIds.has(task.id));
			if (tasks.length > 0) {
				visibleGroups.push({ name: group.name, tasks });
			}
		}

		if (snapshot.summary) {
			const open = snapshot.summary.total - snapshot.summary.completed;
			const parts = [`${snapshot.summary.total} tasks`, `${snapshot.summary.completed} done`];
			if (snapshot.summary.inProgress > 0) {
				parts.push(`${snapshot.summary.inProgress} in progress`);
			}
			if (open - snapshot.summary.inProgress > 0) {
				parts.push(`${open - snapshot.summary.inProgress} open`);
			}
			this.addChild(new Text(theme.fg("dim", parts.join(" · ")), 0, 0));
		}

		for (const group of visibleGroups) {
			if (group.name) {
				this.addChild(new Text(`${theme.fg("dim", "  ⎿ ")}${theme.fg("muted", group.name)}`, 0, 0));
			}
			for (const task of group.tasks) {
			const isCompleted = task.status === "completed";
			const isCurrent = task.id === currentId || task.status === "running" || task.status === "in_progress";
			const isFailed = task.status === "failed" || task.status === "aborted";
			const subject = task.subject ?? task.content;
			const displaySubject = inlineText(subject, MAX_TASK_PREVIEW_CHARS);
			const mark = isCompleted ? "☒" : isCurrent ? "☐" : isFailed ? "✕" : "☐";
			const styledSubject = isCompleted
				? theme.fg("dim", theme.strikethrough(displaySubject))
				: isCurrent
					? theme.bold(displaySubject)
					: isFailed
						? theme.fg("error", displaySubject)
						: displaySubject;
			this.addChild(new Text(`${theme.fg("dim", "  ⎿ ")}${mark} ${styledSubject}`, 0, 0));

			const metaParts = [task.group, task.meta, isCurrent ? task.activeForm : undefined].filter(
				(part): part is string => Boolean(part?.trim()),
			);
			if (metaParts.length > 0) {
				this.addChild(
					new Text(
						`${theme.fg("dim", "    ")}${theme.fg("muted", inlineText(metaParts.join(" · "), MAX_TASK_PREVIEW_CHARS))}`,
						0,
						0,
					),
				);
			}
		}
		}

		if (snapshot.tasks.length > visibleTasks.length) {
			const hidden = snapshot.tasks.filter((task) => !visibleIds.has(task.id));
			const hiddenSummary = formatHiddenTaskSummary(hidden);
			const suffix = hiddenSummary ? ` · ${hiddenSummary}` : "";
			this.addChild(
				new Text(theme.fg("dim", `  ⎿ +${snapshot.tasks.length - visibleTasks.length} more tasks${suffix}`), 0, 0),
			);
		}
	}
}

class ClaudeQueuedWidgetComponent extends Container {
	constructor(queued: QueuedUiState, theme: ExtensionContext["ui"]["theme"]) {
		super();
		const items = [...queued.steering, ...queued.followUp].filter((item) => !item.isMeta);
		const total = items.length;
		if (total === 0) return;
		this.addChild(new Text(theme.fg("dim", total === 1 ? "1 queued command" : `${total} queued commands`), 0, 0));

		for (const item of items.slice(0, MAX_QUEUED_ITEMS)) {
			const label = item.kind === "steer" ? "Steer" : "Follow-up";
			const baseText = item.preExpansionText && item.preExpansionText !== item.text ? item.preExpansionText : item.text;
			this.addChild(
				new Text(
					`${theme.fg("dim", "  ⎿ ")}${theme.fg("muted", `${label}: `)}${inlineText(baseText, MAX_QUEUED_PREVIEW_CHARS)}`,
					0,
					0,
				),
			);
		}

		if (total > MAX_QUEUED_ITEMS) {
			this.addChild(new Text(theme.fg("dim", `  ⎿ +${total - MAX_QUEUED_ITEMS} more queued commands`), 0, 0));
		}
	}
}

const SHOW_TIP_AFTER_MS = 30_000;
const MAX_QUEUED_PREVIEW_CHARS = 96;
const MAX_TASK_PREVIEW_CHARS = 88;
const MAX_WORKING_PREVIEW_CHARS = 96;
const MAX_QUEUED_ITEMS = 4;
const MAX_TASK_ITEMS_SOLO = 6;
const SPINNER_REFRESH_MS = 250;
function inlineText(text: string, maxChars: number): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
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
	const chars =
		process.platform === "darwin"
			? ["·", "✢", "✳", "✶", "✻", "✽"]
			: ["·", "✢", "*", "✶", "✻", "✽"];
	const bounce = [...chars, ...[...chars].reverse()];
	return {
		frames: bounce.map((ch) => theme.fg(color, ch)),
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

function formatFooterSummary(snapshot: Snapshot): string | undefined {
	const summary = snapshot.summary;
	if (!summary || summary.total === 0) return undefined;
	const toggle = snapshot.expanded ? "hide tasks" : "show tasks";
	return `${summary.completed}/${summary.total} tasks · ${toggle}`;
}

function createWorkingDetailsFactory(snapshot: Snapshot) {
	if (!(snapshot.expanded && snapshot.tasks.length > 0)) return undefined;
	return (_tui: TUI, theme: ExtensionContext["ui"]["theme"]) => {
		return new ClaudeTaskDetailsComponent(snapshot, theme);
	};
}

function createPromptWidgetFactory(snapshot: Snapshot) {
	if (!snapshot.queued) return undefined;
	const items = [...snapshot.queued.steering, ...snapshot.queued.followUp].filter((item) => !item.isMeta);
	if (items.length === 0) return undefined;
	return (_tui: TUI, theme: ExtensionContext["ui"]["theme"]) => new ClaudeQueuedWidgetComponent(snapshot.queued!, theme);
}

function formatCurrentHeadline(
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
	return working.randomVerb;
}

interface TipCandidate {
	id: string;
	text: string;
	priority: number; // lower = higher priority
	condition: (elapsed: number, snapshot: Snapshot, tipState: TipState) => boolean;
	once?: boolean; // show only once per session
}

type TipState = {
	shownIds: Set<string>;
	lastTipId: string | undefined;
	lastTipCycleStart: number;
};

const TIP_ROTATION_MS = 60_000;

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
		text: "用 tasks-ui 命令可以展开/折叠任务列表",
		priority: 3,
		condition: (elapsed, snapshot, tipState) =>
			elapsed >= 60_000 && snapshot.tasks.length > 0 && !tipState.shownIds.has("tasks-hint"),
		once: true,
	},
];

function selectTip(elapsed: number, snapshot: Snapshot, tipState: TipState): string | undefined {
	const now = Date.now();
	// Rotate tip after TIP_ROTATION_MS
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

const IDLE_CYCLES_THRESHOLD = 2;
const STALL_CYCLES_THRESHOLD = 12; // 3 seconds at 250ms refresh
const TOKEN_ANIMATION_STEP = 0.3; // lerp factor per cycle

function formatWorkingMessage(
	snapshot: Snapshot,
	working: WorkingState,
	theme: ExtensionContext["ui"]["theme"],
): string | undefined {
	const summary = snapshot.summary;
	const current = summary?.current;
	const next = summary?.next;
	const spinner = snapshot.spinner;
	const elapsed = spinner?.elapsedMs ?? 0;
	const outputTokens = spinner?.outputTokens ?? 0;
	const parts: string[] = [];
	const showExpandedTasksInSpinnerRegion = snapshot.expanded && snapshot.tasks.length > 0;

	// Idle/stall detection: track cycles without token growth
	if (outputTokens === working.lastOutputTokens) {
		working.idleCycles++;
	} else {
		working.idleCycles = 0;
		working.lastOutputTokens = outputTokens;
	}

	// Smooth token animation: lerp toward actual value
	if (working.displayedTokens < outputTokens) {
		const delta = outputTokens - working.displayedTokens;
		const step = Math.max(1, Math.ceil(delta * TOKEN_ANIMATION_STEP));
		working.displayedTokens = Math.min(outputTokens, working.displayedTokens + step);
	} else {
		working.displayedTokens = outputTokens;
	}

	const hasRunningTasks = snapshot.tasks.some(
		(t) => t.status === "running" || t.status === "in_progress",
	);
	const leaderIsIdle =
		hasRunningTasks && !spinner?.isThinking && working.idleCycles >= IDLE_CYCLES_THRESHOLD;

	if (leaderIsIdle) {
		working.isIdle = true;
		working.isStalled = false;
		const runningCount = snapshot.tasks.filter(
			(t) => t.status === "running" || t.status === "in_progress",
		).length;
		const suffix = runningCount > 1 ? `${runningCount} tasks running` : "tasks running";
		return theme.fg("dim", `✽ Idle · ${suffix}`);
	}
	working.isIdle = false;

	// Stall detection: no token growth for 3s, not thinking, not idle
	working.isStalled =
		!spinner?.isThinking && working.idleCycles >= STALL_CYCLES_THRESHOLD && outputTokens > 0;

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

	const headline = formatCurrentHeadline(current, spinner, working);
	const headlineColor = working.isStalled ? "error" : "accent";
	const mode = spinner?.mode;
	const shimmerStep = mode === "requesting" ? 3 : mode === "tool-use" ? 0 : 1;
	working.shimmerOffset += shimmerStep;
	const headlineText = `${headline}…`;
	let coloredHeadline: string;
	if (mode === "tool-use") {
		const pulse = Math.sin((working.shimmerOffset * 0.15)) > 0;
		working.shimmerOffset++;
		coloredHeadline = pulse
			? theme.bold(theme.fg(headlineColor, headlineText))
			: theme.fg(headlineColor, headlineText);
	} else if (shimmerStep > 0) {
		coloredHeadline = shimmerText(headlineText, working.shimmerOffset, theme, headlineColor);
	} else {
		coloredHeadline = theme.bold(theme.fg(headlineColor, headlineText));
	}
	const coloredMeta = parts.length > 0 ? theme.fg("muted", ` (${parts.join(" · ")})`) : "";
	const firstLine = `${coloredHeadline}${coloredMeta}`;
	if (showExpandedTasksInSpinnerRegion) return firstLine;
	const responseLines: string[] = [];

	// Teammate tree: show running sub-agents with their current activity
	const runningTasks = snapshot.tasks.filter(
		(t) => t.status === "running" || t.status === "in_progress",
	);
	if (runningTasks.length > 0) {
		for (let i = 0; i < runningTasks.length; i++) {
			const t = runningTasks[i]!;
			const prefix = i === runningTasks.length - 1 ? "└─" : "├─";
			const agent = t.group ? `@${t.group}` : t.id;
			const activity = t.meta ? inlineText(t.meta, 40) : t.activeForm ?? "working";
			const stats: string[] = [];
			if (t.toolCount) stats.push(`${t.toolCount} uses`);
			if (t.tokens) stats.push(`${formatTokens(t.tokens)} tokens`);
			const statsSuffix = stats.length > 0 ? ` · ${stats.join(" · ")}` : "";
			responseLines.push(
				theme.fg("dim", `  ${prefix} `) +
					theme.fg("accent", agent) +
					theme.fg("dim", `: ${activity}${statsSuffix}`),
			);
		}
	}

	// budgetText 暂时隐藏；core producer 保留，未来按需重新启用
	// const budgetText = spinner?.budgetText;
	// if (budgetText) {
	// 	responseLines.push(theme.fg("dim", `  ⎿ `) + theme.fg("muted", budgetText));
	// }
	if (next) {
		const nextText = `Next: ${inlineText(next.subject ?? next.content, MAX_WORKING_PREVIEW_CHARS)}`;
		responseLines.push(theme.fg("dim", "  ⎿ ") + nextText);
	} else if (elapsed >= SHOW_TIP_AFTER_MS) {
		const tip = selectTip(elapsed, snapshot, working.tipState) ?? spinner?.tip;
		if (tip) {
			responseLines.push(theme.fg("dim", "  ⎿ ") + theme.fg("muted", `Tip: ${tip}`));
		}
	}

	return responseLines.length > 0 ? `${firstLine}\n${responseLines.join("\n")}` : firstLine;
}

function renderUi(ctx: ExtensionContext, working: WorkingState) {
	const snapshot = readSnapshot(ctx);
	const footerSummary = formatFooterSummary(snapshot);

	if (footerSummary) {
		ctx.ui.setStatus("task", undefined);
		ctx.ui.setStatus("todo", undefined);
		ctx.ui.setStatus("queue", undefined);
	}
	ctx.ui.setStatus("task-ui", footerSummary);

	ctx.ui.setQueuedVisible(false);
	ctx.ui.setWidget("claude-task-ui:queued", undefined);
	ctx.ui.setWidget("claude-task-ui:tasks", undefined);
	const promptWidgetFactory = createPromptWidgetFactory(snapshot);
	if (promptWidgetFactory) {
		ctx.ui.setWidget("claude-task-ui:prompt", promptWidgetFactory, {
			placement: "aboveEditor",
		});
	} else {
		ctx.ui.setWidget("claude-task-ui:prompt", undefined);
	}

	const workingMessage = formatWorkingMessage(snapshot, working, ctx.ui.theme);
	ctx.ui.setWorkingIndicator(workingMessage && !working.isIdle ? createWorkingIndicator(ctx.ui.theme, working.isStalled, snapshot.spinner?.mode) : undefined);
	ctx.ui.setWorkingMessage(workingMessage);
	const workingDetailsFactory = createWorkingDetailsFactory(snapshot);
	ctx.ui.setWorkingDetails(workingDetailsFactory);
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

	pi.registerCommand("tasks-ui", {
		description: "Toggle Claude-style task widget above the editor.",
		handler: async (_args, ctx) => {
			ctx.ui.toggleTasksExpanded();
			rerender(ctx);
		},
	});
}
