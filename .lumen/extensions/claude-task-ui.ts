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
		const items = [...queued.steering, ...queued.followUp];
		const total = items.length;
		this.addChild(new Text(theme.fg("dim", total === 1 ? "1 queued command" : `${total} queued commands`), 0, 0));

		for (const item of items.slice(0, MAX_QUEUED_ITEMS)) {
			const deliveryLabel = item.delivery === "nextTurn"
				? "Next turn"
				: item.delivery === "steer"
					? "Steer"
					: "Follow-up";
			const label = item.mode === "custom"
				? item.customType
					? `${deliveryLabel} ${item.customType}`
					: `${deliveryLabel} custom`
				: item.kind === "steer"
					? "Steer"
					: "Follow-up";
			const tags = [
				item.priority ? `[${item.priority}]` : undefined,
				item.hasImages ? "[image]" : undefined,
				item.isMeta ? "[meta]" : undefined,
				item.origin ? `[${item.origin}]` : undefined,
				item.source ? `[${item.source}]` : undefined,
				item.skipSlashCommands ? "[raw]" : undefined,
			].filter((part): part is string => Boolean(part));
			const baseText = item.preExpansionText && item.preExpansionText !== item.text ? item.preExpansionText : item.text;
			const suffix = tags.length > 0 ? ` ${tags.join(" ")}` : "";
			this.addChild(
				new Text(
					`${theme.fg("dim", "  ⎿ ")}${theme.fg("muted", `${label}: `)}${inlineText(`${baseText}${suffix}`, MAX_QUEUED_PREVIEW_CHARS)}`,
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

const SHOW_TIP_AFTER_MS = 5_000;
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

function createWorkingIndicator(theme: ExtensionContext["ui"]["theme"]): WorkingIndicatorOptions {
	return {
		frames: [
			theme.fg("accent", "⠋"),
			theme.fg("accent", "⠙"),
			theme.fg("accent", "⠹"),
			theme.fg("accent", "⠸"),
			theme.fg("accent", "⠼"),
			theme.fg("accent", "⠴"),
			theme.fg("accent", "⠦"),
			theme.fg("accent", "⠧"),
			theme.fg("accent", "⠇"),
			theme.fg("accent", "⠏"),
		],
		intervalMs: 80,
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
	const total = snapshot.queued.steering.length + snapshot.queued.followUp.length;
	if (total === 0) return undefined;
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
	if (current) {
		return inlineText(current.activeForm ?? current.subject ?? current.content, MAX_WORKING_PREVIEW_CHARS);
	}
	return working.randomVerb;
}

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

	if (elapsed >= 3_000) {
		parts.push(formatElapsed(elapsed));
		if (outputTokens > 0) {
			parts.push(`↓ ${formatTokens(outputTokens)} tokens`);
		}
	}

	if (spinner?.isThinking) {
		parts.push("thinking");
	} else if (spinner?.lastThinkingDurationMs !== undefined) {
			const seconds = Math.max(1, Math.round(spinner.lastThinkingDurationMs / 1000));
			parts.push(`thought for ${seconds}s`);
	}

	const headline = formatCurrentHeadline(current, spinner, working);
	const coloredHeadline = theme.bold(theme.fg("accent", `${headline}…`));
	const coloredMeta = parts.length > 0 ? theme.fg("muted", ` (${parts.join(" · ")})`) : "";
	const firstLine = `${coloredHeadline}${coloredMeta}`;
	if (showExpandedTasksInSpinnerRegion) return firstLine;
	const responseLines: string[] = [];
	// budgetText 暂时隐藏；core producer 保留，未来按需重新启用
	// const budgetText = spinner?.budgetText;
	// if (budgetText) {
	// 	responseLines.push(theme.fg("dim", `  ⎿ `) + theme.fg("muted", budgetText));
	// }
	if (next) {
		const nextText = `Next: ${inlineText(next.subject ?? next.content, MAX_WORKING_PREVIEW_CHARS)}`;
		responseLines.push(theme.fg("dim", "  ⎿ ") + nextText);
	} else if (spinner?.tip && elapsed >= SHOW_TIP_AFTER_MS) {
		responseLines.push(theme.fg("dim", "  ⎿ ") + theme.fg("muted", `Tip: ${spinner.tip}`));
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
	ctx.ui.setWorkingIndicator(workingMessage ? createWorkingIndicator(ctx.ui.theme) : undefined);
	ctx.ui.setWorkingMessage(workingMessage);
	const workingDetailsFactory = createWorkingDetailsFactory(snapshot);
	ctx.ui.setWorkingDetails(workingDetailsFactory);
}

export default function (pi: ExtensionAPI) {
	const working: WorkingState = {
		randomVerb: sample(CLAUDE_SPINNER_VERBS, Date.now()),
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
