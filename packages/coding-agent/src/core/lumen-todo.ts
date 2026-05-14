/**
 * Lumen Todo Tool
 *
 * 结构化任务跟踪。LLM 可通过 todo tool 管理分阶段任务列表。
 * 支持 init/start/done/drop/rm/append/note 操作。
 * 状态持久化到 `.lumen/todo.json`，session 内通过 tool result details 追踪。
 *
 * [Provenance] 来源: oh-my-pi src/tools/todo-write.ts + pi examples/extensions/todo.ts
 * [Provenance] 移植方式: 参考重写，适配 extension API
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { CONFIG_DIR_NAME } from "../config.js";
import type { ExtensionAPI, ExtensionContext, ToolRenderResultOptions } from "./extensions/types.js";

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
// Persistence
// ============================================================================

function getTodoPath(cwd: string): string {
	return join(cwd, CONFIG_DIR_NAME, "todo.json");
}

function loadTodoPhases(cwd: string): TodoPhase[] {
	const todoPath = getTodoPath(cwd);
	if (!existsSync(todoPath)) return [];
	try {
		const content = readFileSync(todoPath, "utf8");
		const data = JSON.parse(content);
		if (Array.isArray(data.phases)) return data.phases as TodoPhase[];
	} catch {}
	return [];
}

function saveTodoPhases(cwd: string, phases: TodoPhase[]): void {
	const todoPath = getTodoPath(cwd);
	const dir = dirname(todoPath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(todoPath, JSON.stringify({ phases }, null, 2), "utf8");
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

// ============================================================================
// Extension
// ============================================================================

export default function lumenTodoExtension(pi: ExtensionAPI): void {
	// Register the todo tool for LLM
	pi.registerTool({
		name: "todo",
		label: "Todo",
		description:
			"Manage a structured, phased task list. Use to track progress on multi-step work. " +
			"Operations: init (create phased list), start (mark task in_progress), done (mark completed), " +
			"drop (mark abandoned), rm (remove task/phase), append (add tasks to phase), note (attach note to task).",
		promptSnippet: "todo — structured task tracking with phases and progress",
		promptGuidelines: [
			"Use todo tool to track multi-step plans. Init with phases, start tasks as you work on them, mark done when complete.",
			"Only one task can be in_progress at a time. Starting a new task demotes the current one to pending.",
			"Task content must be unique across all phases (used as identifier).",
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
			const cwd = ctx.cwd;
			const currentPhases = clonePhases(loadTodoPhases(cwd));
			const { phases: updated, errors } = applyOps(currentPhases, params.ops);

			// Persist
			saveTodoPhases(cwd, updated);

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
			if (!details || details.phases.length === 0) {
				const fallback = result.content?.[0]?.text ?? "No todos";
				return new Text(theme.fg("dim", fallback), 0, 0);
			}

			const allTasks = details.phases.flatMap((p) => p.tasks);
			const completed = allTasks.filter((t) => t.status === "completed").length;
			const header = theme.fg("success", `[${completed}/${allTasks.length}] `);

			const lines: string[] = [];
			for (const phase of details.phases) {
				if (phase.tasks.length === 0) continue;
				lines.push(theme.fg("accent", `  ${phase.name}:`));
				for (const task of phase.tasks) {
					const sym =
						task.status === "completed"
							? theme.fg("success", "x")
							: task.status === "in_progress"
								? theme.fg("accent", ">")
								: task.status === "abandoned"
									? theme.fg("error", "-")
									: theme.fg("dim", " ");
					const content =
						task.status === "completed" || task.status === "abandoned"
							? theme.fg("dim", task.content)
							: task.status === "in_progress"
								? theme.fg("accent", task.content)
								: theme.fg("muted", task.content);
					lines.push(`    [${sym}] ${content}`);
				}
			}

			const text = `${header}${theme.fg("muted", "todo")}\n${lines.join("\n")}`;
			return new Text(text, 0, 0);
		},
	});

	// Register /todo command for user viewing
	pi.registerCommand("todo", {
		description: "查看当前任务列表",
		handler: async (_args, ctx) => {
			const cwd = ctx.cwd;
			const phases = loadTodoPhases(cwd);

			if (phases.length === 0) {
				pi.sendUserMessage("当前没有任务。LLM 可通过 todo tool 创建任务列表。");
				return;
			}

			const allTasks = phases.flatMap((p) => p.tasks);
			const completed = allTasks.filter((t) => t.status === "completed").length;
			const inProgress = allTasks.find((t) => t.status === "in_progress");

			const lines: string[] = [];
			lines.push(`任务进度: ${completed}/${allTasks.length} 完成`);
			if (inProgress) lines.push(`当前: ${inProgress.content}`);
			lines.push("");

			for (const phase of phases) {
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
}
