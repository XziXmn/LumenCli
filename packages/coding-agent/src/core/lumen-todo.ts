/**
 * Lumen Todo Tool (Session-Level)
 *
 * 结构化任务跟踪。LLM 可通过 todo tool 管理分阶段任务列表。
 * 支持 init/start/done/drop/rm/append/note 操作。
 *
 * 状态仅存内存，session 结束即清空。
 * 用户可通过 /todo-export 导出为 markdown，/todo-import 从文件导入。
 *
 * 设计对齐：Claude Code / opencode 均为会话级 todo。
 *
 * [Provenance] 来源: oh-my-pi src/tools/todo-write.ts + pi examples/extensions/todo.ts
 * [Provenance] 移植方式: 参考重写，适配 extension API
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type {
	ExtensionAPI,
	ExtensionContext,
	TaskUiItem,
	TaskUiSummary,
	ToolRenderResultOptions,
} from "./extensions/types.js";

// ============================================================================
// Types
// ============================================================================

export type TodoStatus = "pending" | "in_progress" | "completed" | "abandoned";

export interface TodoItem {
	content: string;
	status: TodoStatus;
	notes?: string[];
}

export interface TodoPhase {
	name: string;
	tasks: TodoItem[];
}

interface TodoToolDetails {
	phases: TodoPhase[];
	errors: string[];
}

type TodoOp = "init" | "start" | "done" | "rm" | "drop" | "append" | "note";

interface TodoOpEntry {
	op: TodoOp;
	list?: Array<{ phase: string; items: string[] }>;
	task?: string;
	phase?: string;
	items?: string[];
	text?: string;
}

// ============================================================================
// Schema
// ============================================================================

const InitListEntry = Type.Object({
	phase: Type.String({ description: "phase name (short noun phrase)" }),
	items: Type.Array(Type.String({ description: "task content (5-10 words)" }), {
		minItems: 1,
		description: "tasks for this phase, in execution order",
	}),
});

const TodoOpEntrySchema = Type.Object({
	op: Type.Union(
		[
			Type.Literal("init"),
			Type.Literal("start"),
			Type.Literal("done"),
			Type.Literal("rm"),
			Type.Literal("drop"),
			Type.Literal("append"),
			Type.Literal("note"),
		],
		{ description: "operation to apply" },
	),
	list: Type.Optional(Type.Array(InitListEntry, { description: "phased task list for op=init" })),
	task: Type.Optional(Type.String({ description: "task content for start/done/rm/drop/note" })),
	phase: Type.Optional(Type.String({ description: "phase name for done/rm/drop/append" })),
	items: Type.Optional(
		Type.Array(Type.String({ description: "task content (5-10 words)" }), {
			minItems: 1,
			description: "tasks to append to phase for op=append",
		}),
	),
	text: Type.Optional(Type.String({ description: "note text for op=note" })),
});

const TodoParams = Type.Object(
	{
		ops: Type.Array(TodoOpEntrySchema, {
			minItems: 1,
			description: "ordered todo operations",
		}),
	},
	{ description: "Apply ordered todo operations to the task list" },
);

// ============================================================================
// Session-Level State
// ============================================================================

/** In-memory state — cleared when session ends. */
let sessionPhases: TodoPhase[] = [];

// ============================================================================
// State Helpers
// ============================================================================

function clonePhases(phases: TodoPhase[]): TodoPhase[] {
	return phases.map((phase) => ({
		name: phase.name,
		tasks: phase.tasks.map((t) => ({
			content: t.content,
			status: t.status,
			...(t.notes && t.notes.length > 0 ? { notes: [...t.notes] } : {}),
		})),
	}));
}

function findTaskByContent(phases: TodoPhase[], content: string): { task: TodoItem; phase: TodoPhase } | undefined {
	for (const phase of phases) {
		const task = phase.tasks.find((t) => t.content === content);
		if (task) return { task, phase };
	}
	return undefined;
}

function findPhaseByName(phases: TodoPhase[], name: string): TodoPhase | undefined {
	return phases.find((p) => p.name === name);
}

function normalizeInProgress(phases: TodoPhase[]): void {
	const allTasks = phases.flatMap((p) => p.tasks);
	const inProgress = allTasks.filter((t) => t.status === "in_progress");

	// Only one task can be in_progress at a time
	if (inProgress.length > 1) {
		for (const task of inProgress.slice(1)) {
			task.status = "pending";
		}
	}

	// If none in progress, promote first pending
	if (inProgress.length === 0) {
		const firstPending = allTasks.find((t) => t.status === "pending");
		if (firstPending) firstPending.status = "in_progress";
	}
}

function applyOp(phases: TodoPhase[], entry: TodoOpEntry, errors: string[]): TodoPhase[] {
	switch (entry.op) {
		case "init": {
			if (!entry.list || entry.list.length === 0) {
				errors.push("Missing list for init operation");
				return phases;
			}
			return entry.list.map((item) => ({
				name: item.phase,
				tasks: item.items.map((content) => ({ content, status: "pending" as TodoStatus })),
			}));
		}

		case "start": {
			if (!entry.task) {
				errors.push("Missing task content for start");
				return phases;
			}
			const hit = findTaskByContent(phases, entry.task);
			if (!hit) {
				errors.push(`Task "${entry.task}" not found`);
				return phases;
			}
			// Demote current in_progress
			for (const phase of phases) {
				for (const t of phase.tasks) {
					if (t.status === "in_progress" && t !== hit.task) {
						t.status = "pending";
					}
				}
			}
			hit.task.status = "in_progress";
			return phases;
		}

		case "done": {
			const targets = getTargets(phases, entry, errors);
			for (const t of targets) t.status = "completed";
			return phases;
		}

		case "drop": {
			const targets = getTargets(phases, entry, errors);
			for (const t of targets) t.status = "abandoned";
			return phases;
		}

		case "rm": {
			if (entry.task) {
				const hit = findTaskByContent(phases, entry.task);
				if (!hit) {
					errors.push(`Task "${entry.task}" not found`);
					return phases;
				}
				hit.phase.tasks = hit.phase.tasks.filter((t) => t !== hit.task);
			} else if (entry.phase) {
				const phase = findPhaseByName(phases, entry.phase);
				if (!phase) {
					errors.push(`Phase "${entry.phase}" not found`);
					return phases;
				}
				phase.tasks = [];
			} else {
				for (const phase of phases) phase.tasks = [];
			}
			return phases;
		}

		case "append": {
			if (!entry.phase) {
				errors.push("Missing phase name for append");
				return phases;
			}
			if (!entry.items || entry.items.length === 0) {
				errors.push("Missing items for append");
				return phases;
			}
			let phase = findPhaseByName(phases, entry.phase);
			if (!phase) {
				phase = { name: entry.phase, tasks: [] };
				phases.push(phase);
			}
			for (const content of entry.items) {
				if (findTaskByContent(phases, content)) {
					errors.push(`Task "${content}" already exists`);
					continue;
				}
				phase.tasks.push({ content, status: "pending" });
			}
			return phases;
		}

		case "note": {
			if (!entry.task) {
				errors.push("Missing task content for note");
				return phases;
			}
			const hit = findTaskByContent(phases, entry.task);
			if (!hit) {
				errors.push(`Task "${entry.task}" not found`);
				return phases;
			}
			const text = (entry.text ?? "").trimEnd();
			if (!text) {
				errors.push("Missing text for note");
				return phases;
			}
			hit.task.notes = hit.task.notes ? [...hit.task.notes, text] : [text];
			return phases;
		}
	}
}

function getTargets(phases: TodoPhase[], entry: TodoOpEntry, errors: string[]): TodoItem[] {
	if (entry.task) {
		const hit = findTaskByContent(phases, entry.task);
		if (!hit) {
			errors.push(`Task "${entry.task}" not found`);
			return [];
		}
		return [hit.task];
	}
	if (entry.phase) {
		const phase = findPhaseByName(phases, entry.phase);
		if (!phase) {
			errors.push(`Phase "${entry.phase}" not found`);
			return [];
		}
		return [...phase.tasks];
	}
	return phases.flatMap((p) => p.tasks);
}

function applyOps(phases: TodoPhase[], ops: TodoOpEntry[]): { phases: TodoPhase[]; errors: string[] } {
	const errors: string[] = [];
	let current = phases;
	for (const op of ops) {
		current = applyOp(current, op, errors);
	}
	normalizeInProgress(current);
	return { phases: current, errors };
}

// ============================================================================
// Export / Import (Markdown format)
// ============================================================================

function phasesToMarkdown(phases: TodoPhase[]): string {
	const lines: string[] = ["# Todo"];
	lines.push("");

	for (const phase of phases) {
		lines.push(`## ${phase.name}`);
		lines.push("");
		for (const task of phase.tasks) {
			const checked = task.status === "completed" ? "x" : " ";
			const prefix = task.status === "abandoned" ? "~~" : task.status === "in_progress" ? "**" : "";
			const suffix = task.status === "abandoned" ? "~~" : task.status === "in_progress" ? "** (in progress)" : "";
			lines.push(`- [${checked}] ${prefix}${task.content}${suffix}`);
			if (task.notes && task.notes.length > 0) {
				for (const note of task.notes) {
					lines.push(`  - ${note}`);
				}
			}
		}
		lines.push("");
	}

	return lines.join("\n");
}

function markdownToPhases(content: string): TodoPhase[] {
	const phases: TodoPhase[] = [];
	let currentPhase: TodoPhase | undefined;

	for (const line of content.split(/\r?\n/)) {
		const h2Match = line.match(/^##\s+(.+)/);
		if (h2Match) {
			currentPhase = { name: h2Match[1].trim(), tasks: [] };
			phases.push(currentPhase);
			continue;
		}

		if (!currentPhase) continue;

		const taskMatch = line.match(/^-\s+\[([ xX])\]\s+(.+)/);
		if (taskMatch) {
			const isCompleted = taskMatch[1].toLowerCase() === "x";
			let taskContent = taskMatch[2].trim();
			let status: TodoStatus = isCompleted ? "completed" : "pending";

			// Detect abandoned (strikethrough)
			if (taskContent.startsWith("~~") && taskContent.endsWith("~~")) {
				taskContent = taskContent.slice(2, -2);
				status = "abandoned";
			}
			// Detect in_progress (bold + suffix)
			if (taskContent.startsWith("**")) {
				taskContent = taskContent
					.replace(/^\*\*/, "")
					.replace(/\*\*\s*\(in progress\)$/, "")
					.trim();
				if (!isCompleted) status = "in_progress";
			}

			currentPhase.tasks.push({ content: taskContent, status });
			continue;
		}

		// Sub-bullet = note on last task
		const noteMatch = line.match(/^\s+-\s+(.+)/);
		if (noteMatch && currentPhase.tasks.length > 0) {
			const lastTask = currentPhase.tasks[currentPhase.tasks.length - 1];
			lastTask.notes = lastTask.notes ?? [];
			lastTask.notes.push(noteMatch[1].trim());
		}
	}

	return phases;
}

// ============================================================================
// Formatting
// ============================================================================

function formatSummary(phases: TodoPhase[], errors: string[]): string {
	const allTasks = phases.flatMap((p) => p.tasks);
	if (allTasks.length === 0) {
		return errors.length > 0 ? `Errors: ${errors.join("; ")}` : "Todo list cleared.";
	}

	const lines: string[] = [];
	if (errors.length > 0) lines.push(`Errors: ${errors.join("; ")}`);

	const remaining = allTasks.filter((t) => t.status === "pending" || t.status === "in_progress");
	const completed = allTasks.filter((t) => t.status === "completed");

	lines.push(`Progress: ${completed.length}/${allTasks.length} completed, ${remaining.length} remaining`);
	lines.push("");

	for (const phase of phases) {
		lines.push(`${phase.name}:`);
		for (const task of phase.tasks) {
			const sym =
				task.status === "completed"
					? "[x]"
					: task.status === "in_progress"
						? "[>]"
						: task.status === "abandoned"
							? "[-]"
							: "[ ]";
			const noteCount = task.notes?.length ?? 0;
			const noteMarker = noteCount > 0 ? ` (+${noteCount} note${noteCount === 1 ? "" : "s"})` : "";
			lines.push(`  ${sym} ${task.content}${noteMarker}`);
		}
	}

	return lines.join("\n");
}

function formatFooterStatus(phases: TodoPhase[]): string | undefined {
	const allTasks = phases.flatMap((phase) => phase.tasks);
	if (allTasks.length === 0) return undefined;
	const completed = allTasks.filter((task) => task.status === "completed").length;
	const inProgress = allTasks.find((task) => task.status === "in_progress");
	const suffix = inProgress ? ` · ${inProgress.content}` : "";
	return `todo ${completed}/${allTasks.length}${suffix}`;
}

function formatCompactResult(phases: TodoPhase[], errors: string[]): string {
	const allTasks = phases.flatMap((phase) => phase.tasks);
	if (allTasks.length === 0) {
		return errors.length > 0 ? `Errors: ${errors.join("; ")}` : "Todo list cleared.";
	}
	const remaining = allTasks.filter((task) => task.status === "pending" || task.status === "in_progress").length;
	const completed = allTasks.filter((task) => task.status === "completed").length;
	const inProgress = allTasks.find((task) => task.status === "in_progress");
	let summary = `Todo ${completed}/${allTasks.length} completed · ${remaining} remaining`;
	if (inProgress) summary += ` · Current ${inProgress.content}`;
	if (errors.length > 0) summary += ` · Errors: ${errors.join("; ")}`;
	return summary;
}

export function getSessionTodoUiItems(): TaskUiItem[] | undefined {
	if (sessionPhases.length === 0) return undefined;
	return sessionPhases.flatMap((phase, phaseIndex) =>
		phase.tasks.map((task, taskIndex) => ({
			id: `todo:${phaseIndex}:${taskIndex}:${task.content}`,
			content: task.content,
			status: task.status,
			group: phase.name,
			meta:
				task.notes && task.notes.length > 0
					? `${task.notes.length} note${task.notes.length === 1 ? "" : "s"}`
					: undefined,
		})),
	);
}

export function getSessionTodoUiSummary(): TaskUiSummary | undefined {
	const items = getSessionTodoUiItems();
	if (!items || items.length === 0) return undefined;
	const completed = items.filter((item) => item.status === "completed").length;
	const inProgressItems = items.filter((item) => item.status === "in_progress");
	const pendingItems = items.filter((item) => item.status === "pending").length;
	const abandoned = items.filter((item) => item.status === "abandoned").length;
	const current = inProgressItems[0];
	const next = items.find((item) => item.status === "pending");
	return {
		total: items.length,
		completed,
		inProgress: inProgressItems.length,
		pending: pendingItems,
		failed: 0,
		abandoned,
		current,
		next,
	};
}

// ============================================================================
// Extension
// ============================================================================

export default function lumenTodoExtension(pi: ExtensionAPI): void {
	// Reset state on session start
	pi.on("session_start", (_event, ctx) => {
		sessionPhases = [];
		ctx.ui.setStatus("todo", undefined);
	});

	// Register the todo tool for LLM
	pi.registerTool({
		name: "todo",
		label: "Todo",
		description:
			"Manage a structured, phased task list. Use to track progress on multi-step work. " +
			"Operations: init (create phased list), start (mark task in_progress), done (mark completed), " +
			"drop (mark abandoned), rm (remove task/phase), append (add tasks to phase), note (attach note to task). " +
			"State is session-level only (cleared on exit). Use /todo-export to save.",
		promptSnippet: "todo — structured task tracking with phases and progress",
		promptGuidelines: [
			"Use todo tool to track multi-step plans. Init with phases, start tasks as you work on them, mark done when complete.",
			"Only one task can be in_progress at a time. Starting a new task demotes the current one to pending.",
			"Task content must be unique across all phases (used as identifier).",
			"State is session-level. If you need to persist across sessions, tell the user to /todo-export.",
		],
		parameters: TodoParams,

		// MiMo and some models serialize ops as a JSON string instead of an array.
		// This shim auto-parses it before schema validation.
		prepareArguments(args: unknown): any {
			const raw = args as Record<string, unknown>;
			if (typeof raw?.ops === "string") {
				try {
					return { ...raw, ops: JSON.parse(raw.ops as string) };
				} catch {
					return raw;
				}
			}
			return raw;
		},

		async execute(
			_toolCallId: string,
			params: { ops: TodoOpEntry[] },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			ctx: ExtensionContext,
		) {
			const currentPhases = clonePhases(sessionPhases);
			const { phases: updated, errors } = applyOps(currentPhases, params.ops);

			// Store in memory only
			sessionPhases = updated;
			ctx.ui.setStatus("todo", formatFooterStatus(updated));

			const summary = formatSummary(updated, errors);
			return {
				content: [{ type: "text" as const, text: summary }],
				details: { phases: updated, errors } as TodoToolDetails,
			};
		},

		renderCall(args: { ops?: Array<{ op?: string; task?: string; phase?: string }> }, theme, _context) {
			const ops = args?.ops?.map((entry) => {
				const parts = [entry.op ?? "update"];
				if (entry.task) parts.push(`"${entry.task}"`);
				if (entry.phase) parts.push(`(${entry.phase})`);
				return parts.join(" ");
			}) ?? ["update"];
			const text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", ops.join(", "));
			return new Text(text, 0, 0);
		},

		renderResult(
			result: { content: Array<{ type: string; text?: string }>; details?: TodoToolDetails },
			_options: ToolRenderResultOptions,
			theme,
			_context,
		) {
			const details = result.details;
			if (!details) {
				const fallback = result.content?.[0]?.text ?? "No todos";
				return new Text(theme.fg("dim", fallback), 0, 0);
			}
			const summary = formatCompactResult(details.phases, details.errors);
			return new Text(theme.fg("dim", summary), 0, 0);
		},
	});

	// Register /todo command for user viewing
	pi.registerCommand("todo", {
		description: "查看当前任务列表（会话级）",
		handler: async () => {
			if (sessionPhases.length === 0) {
				pi.sendUserMessage("当前没有任务。LLM 可通过 todo tool 创建任务列表。");
				return;
			}

			const allTasks = sessionPhases.flatMap((p) => p.tasks);
			const completed = allTasks.filter((t) => t.status === "completed").length;
			const inProgress = allTasks.find((t) => t.status === "in_progress");

			const lines: string[] = [];
			lines.push(`任务进度: ${completed}/${allTasks.length} 完成`);
			if (inProgress) lines.push(`当前: ${inProgress.content}`);
			lines.push("");

			for (const phase of sessionPhases) {
				lines.push(`## ${phase.name}`);
				for (const task of phase.tasks) {
					const sym =
						task.status === "completed"
							? "[x]"
							: task.status === "in_progress"
								? "[>]"
								: task.status === "abandoned"
									? "[-]"
									: "[ ]";
					lines.push(`  ${sym} ${task.content}`);
					if (task.notes && task.notes.length > 0) {
						for (const note of task.notes) {
							lines.push(`      > ${note}`);
						}
					}
				}
			}

			pi.sendUserMessage(lines.join("\n"));
		},
	});

	// /todo-export: save current todo to markdown file
	pi.registerCommand("todo-export", {
		description: "导出当前 todo 为 markdown 文件（默认 ./TODO.md）",
		handler: async (args, ctx) => {
			if (sessionPhases.length === 0) {
				pi.sendUserMessage("当前没有任务可导出。");
				return;
			}

			const targetPath = resolve(ctx.cwd, args.trim() || "TODO.md");
			const dir = dirname(targetPath);
			if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

			const markdown = phasesToMarkdown(sessionPhases);
			writeFileSync(targetPath, markdown, "utf8");
			pi.sendUserMessage(`已导出 ${sessionPhases.flatMap((p) => p.tasks).length} 个任务到 ${targetPath}`);
		},
	});

	// /todo-import: load todo from markdown file
	pi.registerCommand("todo-import", {
		description: "从 markdown 文件导入 todo（默认 ./TODO.md）",
		handler: async (args, ctx) => {
			const targetPath = resolve(ctx.cwd, args.trim() || "TODO.md");
			if (!existsSync(targetPath)) {
				pi.sendUserMessage(`文件不存在: ${targetPath}`);
				return;
			}

			const content = readFileSync(targetPath, "utf8");
			const imported = markdownToPhases(content);

			if (imported.length === 0) {
				pi.sendUserMessage("未能从文件中解析出任务。确保文件包含 ## 标题和 - [x]/- [ ] 格式的任务。");
				return;
			}

			sessionPhases = imported;
			const allTasks = imported.flatMap((p) => p.tasks);
			pi.sendUserMessage(`已导入 ${allTasks.length} 个任务（${imported.length} 个阶段）从 ${targetPath}`);
		},
	});
}
