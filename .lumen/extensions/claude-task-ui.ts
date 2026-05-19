/**
 * Unified Claude-style task / todo / queued UI.
 *
 * Phase 1 responsibilities:
 * - consume getTasks()/getTaskSummary()/getQueuedMessages()
 * - own dynamic-status (current/next/tip)
 * - hide the built-in queued block and replace it with a prompt-side widget
 * - render an expanded task widget above the editor
 * - keep all of this out of the main transcript flow
 */

import type { ExtensionAPI, ExtensionContext, WorkingIndicatorOptions } from "@earendil-works/pi-coding-agent";
import type { QueuedUiState, TaskUiItem, TaskUiSummary } from "../../packages/coding-agent/src/core/extensions/types.js";

type Snapshot = {
	tasks: TaskUiItem[];
	summary: TaskUiSummary | undefined;
	queued: QueuedUiState | undefined;
	expanded: boolean;
};

const GLYPHS = process.platform === "darwin" ? ["·", "✢", "✳", "✶", "✻", "✽"] : ["·", "✢", "*", "✶", "✻", "✽"];
const WORKING_INDICATOR: WorkingIndicatorOptions = { frames: GLYPHS, intervalMs: 120 };
const TIPS = [
	'可以直接说“并行开几个 agent”，把可拆分的工作同时推进。',
	'想只看任务概况时，看状态行；想看完整列表时，展开 task widget。',
	'queued 消息区保留在输入框上方，不再混进 transcript。',
	'想对照 Claude 的做法时，可以直接说“看 references/ClaudeCodeRev 里的源码”。',
	'如果这层 UI 不想继续污染 core，可以继续走插件接管。',
];

function readSnapshot(ctx: ExtensionContext): Snapshot {
	return {
		tasks: ctx.getTasks() ?? [],
		summary: ctx.getTaskSummary(),
		queued: ctx.getQueuedMessages(),
		expanded: ctx.ui.getTasksExpanded(),
	};
}

function formatFooterSummary(summary: TaskUiSummary | undefined): string | undefined {
	if (!summary || summary.total === 0) return undefined;
	const parts = [`${summary.completed}/${summary.total}`];
	if (summary.current) parts.push(summary.current.content);
	return `tasks ${parts.join(" · ")}`;
}

function formatQueuedWidgetLines(queued: QueuedUiState | undefined, theme: ExtensionContext["ui"]["theme"]): string[] | undefined {
	if (!queued) return undefined;
	const total = queued.steering.length + queued.followUp.length;
	if (total === 0) return undefined;
	const latest = [...queued.steering, ...queued.followUp].at(-1);
	const parts: string[] = [];
	if (queued.steering.length > 0) parts.push(`${queued.steering.length} steer`);
	if (queued.followUp.length > 0) parts.push(`${queued.followUp.length} follow-up`);
	const lines = [theme.fg("dim", `Queued ${total} · ${parts.join(" · ")}`)];
	if (latest) {
		const label = latest.kind === "steer" ? "Steer" : "Follow-up";
		lines.push(theme.fg("dim", `  ⎿ ${label}: ${latest.text}`));
	}
	lines.push(theme.fg("dim", "  ⎿ Alt+Up to edit all queued messages"));
	return lines;
}

function formatTaskWidgetLines(snapshot: Snapshot, theme: ExtensionContext["ui"]["theme"]): string[] | undefined {
	if (!snapshot.expanded || snapshot.tasks.length === 0) return undefined;
	const lines: string[] = [];
	if (snapshot.summary) {
		lines.push(theme.fg("dim", `Tasks ${snapshot.summary.completed}/${snapshot.summary.total} completed`));
		if (snapshot.summary.current) lines.push(theme.fg("dim", `  ⎿ Current: ${snapshot.summary.current.content}`));
		if (snapshot.summary.next) lines.push(theme.fg("dim", `  ⎿ Next: ${snapshot.summary.next.content}`));
	}
	for (const task of snapshot.tasks.slice(0, 8)) {
		const mark = task.status === "completed"
			? "[x]"
			: task.status === "in_progress" || task.status === "running"
				? "[>]"
				: task.status === "failed" || task.status === "aborted"
					? "[!]"
					: task.status === "abandoned"
						? "[-]"
						: "[ ]";
		const group = task.group ? `${task.group}: ` : "";
		lines.push(theme.fg("dim", `  ${mark} ${group}${task.content}`));
	}
	if (snapshot.tasks.length > 8) lines.push(theme.fg("dim", `  … +${snapshot.tasks.length - 8} more`));
	return lines;
}

function formatWorkingMessage(snapshot: Snapshot, tipIndex: number): string | undefined {
	const summary = snapshot.summary;
	if (!summary || summary.total === 0) return undefined;
	const header = summary.current
		? `Working… (${summary.current.content})`
		: summary.next
			? `Ready… (Next: ${summary.next.content})`
			: `Working… (${summary.completed}/${summary.total})`;
	const secondLine = summary.next
		? `  ⎿ Next: ${summary.next.content}`
		: `  ⎿ Tip: ${TIPS[tipIndex % TIPS.length]}`;
	return `${header}\n${secondLine}`;
}

function renderUi(ctx: ExtensionContext, tipIndex: number) {
	const snapshot = readSnapshot(ctx);

	ctx.ui.setStatus("task-ui", formatFooterSummary(snapshot.summary));
	ctx.ui.setQueuedVisible(false);
	ctx.ui.setWidget("claude-task-ui:queued", formatQueuedWidgetLines(snapshot.queued, ctx.ui.theme), {
		placement: "aboveEditor",
	});
	ctx.ui.setWidget("claude-task-ui:tasks", formatTaskWidgetLines(snapshot, ctx.ui.theme), {
		placement: "aboveEditor",
	});

	const workingMessage = formatWorkingMessage(snapshot, tipIndex);
	ctx.ui.setWorkingIndicator(workingMessage ? WORKING_INDICATOR : undefined);
	ctx.ui.setWorkingMessage(workingMessage);
}

export default function (pi: ExtensionAPI) {
	let tipIndex = 0;

	const rerender = (ctx: ExtensionContext) => {
		renderUi(ctx, tipIndex);
	};

	pi.on("session_start", async (_event, ctx) => {
		renderUi(ctx, tipIndex);
	});

	pi.on("queue_update", async (_event, ctx) => {
		rerender(ctx);
	});

	pi.on("turn_start", async (_event, ctx) => {
		tipIndex++;
		rerender(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
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
