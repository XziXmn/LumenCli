/**
 * Lumen Apply Patch Tool
 *
 * 多文件批量编辑工具。使用简化的 patch 格式，一次 tool call 可以：
 * - 创建新文件（Add File）
 * - 删除文件（Delete File）
 * - 修改文件（Update File，支持上下文匹配）
 * - 重命名文件（Update File + Move to）
 *
 * [Provenance] 来源: opencode/packages/opencode/src/patch/ + src/tool/apply_patch.ts
 * [Provenance] 移植方式: 参考重写（简化版，不依赖 effect/diff 库）
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext, ToolRenderResultOptions } from "./extensions/types.ts";

// ============================================================================
// Patch Parser
// ============================================================================

export type HunkType = "add" | "delete" | "update";

export interface Hunk {
	type: HunkType;
	path: string;
	moveTo?: string;
	contents: string;
	chunks?: UpdateChunk[];
}

export interface UpdateChunk {
	context: string; // Lines starting with space (context to match)
	removals: string[]; // Lines starting with -
	additions: string[]; // Lines starting with +
}

const BEGIN_MARKER = "*** Begin Patch";
const END_MARKER = "*** End Patch";
const ADD_FILE = "*** Add File: ";
const DELETE_FILE = "*** Delete File: ";
const UPDATE_FILE = "*** Update File: ";
const MOVE_TO = "*** Move to: ";

export function parsePatch(patchText: string): Hunk[] {
	const lines = patchText.split("\n");
	const hunks: Hunk[] = [];

	const beginIdx = lines.findIndex((l) => l.trim() === BEGIN_MARKER);
	const endIdx =
		lines
			.map((l, i) => (l.trim() === END_MARKER ? i : -1))
			.filter((i) => i >= 0)
			.pop() ?? -1;

	if (beginIdx === -1 || endIdx === -1 || beginIdx >= endIdx) {
		throw new Error("Invalid patch: missing *** Begin Patch / *** End Patch markers");
	}

	let i = beginIdx + 1;

	while (i < endIdx) {
		const line = lines[i];

		if (line.startsWith(ADD_FILE)) {
			const path = line.slice(ADD_FILE.length).trim();
			i++;
			const contentLines: string[] = [];
			while (i < endIdx && !lines[i].startsWith("*** ")) {
				const l = lines[i];
				contentLines.push(l.startsWith("+") ? l.slice(1) : l);
				i++;
			}
			hunks.push({ type: "add", path, contents: contentLines.join("\n") });
		} else if (line.startsWith(DELETE_FILE)) {
			const path = line.slice(DELETE_FILE.length).trim();
			hunks.push({ type: "delete", path, contents: "" });
			i++;
		} else if (line.startsWith(UPDATE_FILE)) {
			const path = line.slice(UPDATE_FILE.length).trim();
			i++;
			let moveTo: string | undefined;
			if (i < endIdx && lines[i].startsWith(MOVE_TO)) {
				moveTo = lines[i].slice(MOVE_TO.length).trim();
				i++;
			}
			// Parse update chunks
			const chunks: UpdateChunk[] = [];
			let currentChunk: UpdateChunk | undefined;

			while (i < endIdx && !lines[i].startsWith("*** ")) {
				const l = lines[i];
				if (
					l.startsWith("@@") ||
					l.startsWith(" ") ||
					(!l.startsWith("+") && !l.startsWith("-") && l.trim().length > 0)
				) {
					// Context line or @@ anchor — start new chunk
					if (currentChunk && (currentChunk.removals.length > 0 || currentChunk.additions.length > 0)) {
						chunks.push(currentChunk);
					}
					const contextLine = l.startsWith("@@") ? l : l;
					currentChunk = { context: contextLine, removals: [], additions: [] };
				} else if (l.startsWith("-")) {
					if (!currentChunk) currentChunk = { context: "", removals: [], additions: [] };
					currentChunk.removals.push(l.slice(1));
				} else if (l.startsWith("+")) {
					if (!currentChunk) currentChunk = { context: "", removals: [], additions: [] };
					currentChunk.additions.push(l.slice(1));
				}
				i++;
			}
			if (currentChunk && (currentChunk.removals.length > 0 || currentChunk.additions.length > 0)) {
				chunks.push(currentChunk);
			}
			hunks.push({ type: "update", path, moveTo, contents: "", chunks });
		} else {
			i++;
		}
	}

	return hunks;
}

// ============================================================================
// Patch Applier
// ============================================================================

export interface ApplyResult {
	success: boolean;
	filesAdded: string[];
	filesDeleted: string[];
	filesUpdated: string[];
	filesMoved: string[];
	errors: string[];
}

function findContextLine(fileLines: string[], context: string, startFrom: number): number {
	// @@ anchor: match function/class definition
	const anchor = context.startsWith("@@") ? context.slice(3).trim() : context.trimStart();
	if (!anchor) return startFrom;

	for (let i = startFrom; i < fileLines.length; i++) {
		if (fileLines[i].includes(anchor) || fileLines[i].trimStart() === anchor) {
			return i;
		}
	}
	// Fallback: search from beginning
	for (let i = 0; i < startFrom; i++) {
		if (fileLines[i].includes(anchor) || fileLines[i].trimStart() === anchor) {
			return i;
		}
	}
	return -1;
}

function applyChunks(content: string, chunks: UpdateChunk[]): string {
	const lines = content.split("\n");
	let offset = 0;

	for (const chunk of chunks) {
		// Find where this chunk applies
		let pos = findContextLine(lines, chunk.context, offset);
		if (pos === -1) pos = offset;

		// Find the removal lines starting after context
		let removeStart = pos + 1;
		if (chunk.context.startsWith("@@") || chunk.context === "") {
			removeStart = pos;
		}

		// Try to match removal lines
		if (chunk.removals.length > 0) {
			let matchPos = -1;
			for (let i = removeStart; i <= lines.length - chunk.removals.length; i++) {
				let matches = true;
				for (let j = 0; j < chunk.removals.length; j++) {
					if (lines[i + j].trimEnd() !== chunk.removals[j].trimEnd()) {
						matches = false;
						break;
					}
				}
				if (matches) {
					matchPos = i;
					break;
				}
			}

			if (matchPos >= 0) {
				// Replace removals with additions
				lines.splice(matchPos, chunk.removals.length, ...chunk.additions);
				offset = matchPos + chunk.additions.length;
			} else {
				// Can't find removals, insert additions after context
				lines.splice(removeStart, 0, ...chunk.additions);
				offset = removeStart + chunk.additions.length;
			}
		} else if (chunk.additions.length > 0) {
			// Pure insertion after context
			const insertPos = pos + 1;
			lines.splice(insertPos, 0, ...chunk.additions);
			offset = insertPos + chunk.additions.length;
		}
	}

	return lines.join("\n");
}

export function applyPatch(patchText: string, cwd: string): ApplyResult {
	const result: ApplyResult = {
		success: true,
		filesAdded: [],
		filesDeleted: [],
		filesUpdated: [],
		filesMoved: [],
		errors: [],
	};

	let hunks: Hunk[];
	try {
		hunks = parsePatch(patchText);
	} catch (error) {
		result.success = false;
		result.errors.push(error instanceof Error ? error.message : "Parse error");
		return result;
	}

	if (hunks.length === 0) {
		result.success = false;
		result.errors.push("Empty patch: no file operations found");
		return result;
	}

	// Pre-flight: snapshot every file the patch will touch so we can rollback on partial failure.
	// For "add" ops, record that the file did not exist (so rollback deletes it).
	interface Snapshot {
		path: string;
		existed: boolean;
		content?: string;
	}
	const snapshots: Snapshot[] = [];
	const snap = (filePath: string): void => {
		if (snapshots.some((s) => s.path === filePath)) return;
		try {
			if (existsSync(filePath)) {
				snapshots.push({ path: filePath, existed: true, content: readFileSync(filePath, "utf8") });
			} else {
				snapshots.push({ path: filePath, existed: false });
			}
		} catch {
			// If we cannot snapshot, push an "existed: true" with empty content to at least track.
			snapshots.push({ path: filePath, existed: true, content: "" });
		}
	};

	for (const hunk of hunks) {
		const filePath = resolve(cwd, hunk.path);
		snap(filePath);
		if (hunk.type === "update" && hunk.moveTo) {
			snap(resolve(cwd, hunk.moveTo));
		}
	}

	const rollback = (): string[] => {
		const rollbackErrors: string[] = [];
		for (const s of snapshots) {
			try {
				if (s.existed && s.content !== undefined) {
					// Restore the original content
					const dir = dirname(s.path);
					if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
					writeFileSync(s.path, s.content, "utf8");
				} else if (!s.existed && existsSync(s.path)) {
					// File was created during the failed apply; remove it
					rmSync(s.path);
				}
			} catch (err) {
				rollbackErrors.push(`Rollback failed for ${s.path}: ${err instanceof Error ? err.message : "unknown"}`);
			}
		}
		return rollbackErrors;
	};

	for (const hunk of hunks) {
		const filePath = resolve(cwd, hunk.path);

		try {
			switch (hunk.type) {
				case "add": {
					const dir = dirname(filePath);
					if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
					const content = hunk.contents.endsWith("\n") ? hunk.contents : `${hunk.contents}\n`;
					writeFileSync(filePath, content, "utf8");
					result.filesAdded.push(hunk.path);
					break;
				}
				case "delete": {
					if (existsSync(filePath)) {
						rmSync(filePath);
						result.filesDeleted.push(hunk.path);
					} else {
						throw new Error(`File not found for deletion: ${hunk.path}`);
					}
					break;
				}
				case "update": {
					if (!existsSync(filePath)) {
						throw new Error(`File not found for update: ${hunk.path}`);
					}
					const content = readFileSync(filePath, "utf8");
					const newContent = hunk.chunks ? applyChunks(content, hunk.chunks) : content;
					const targetPath = hunk.moveTo ? resolve(cwd, hunk.moveTo) : filePath;

					if (hunk.moveTo) {
						const targetDir = dirname(targetPath);
						if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
						rmSync(filePath);
						result.filesMoved.push(`${hunk.path} → ${hunk.moveTo}`);
					} else {
						result.filesUpdated.push(hunk.path);
					}
					writeFileSync(targetPath, newContent, "utf8");
					break;
				}
			}
		} catch (error) {
			result.success = false;
			const msg = error instanceof Error ? error.message : "unknown error";
			result.errors.push(`${hunk.type} ${hunk.path}: ${msg}`);

			// Partial failure: rollback all changes to preserve atomicity
			const rollbackErrors = rollback();
			if (rollbackErrors.length > 0) {
				result.errors.push(...rollbackErrors);
				result.errors.push("WARNING: rollback was incomplete — some files may be in an inconsistent state.");
			} else {
				result.errors.push("All changes rolled back to pre-patch state.");
			}
			// Clear the successful-operation lists since we rolled back
			result.filesAdded = [];
			result.filesDeleted = [];
			result.filesUpdated = [];
			result.filesMoved = [];
			return result;
		}
	}

	return result;
}

// ============================================================================
// Schema
// ============================================================================

const ApplyPatchParams = Type.Object(
	{
		patch: Type.String({
			description:
				"The patch text in the supported format. Must be wrapped in *** Begin Patch / *** End Patch markers.",
		}),
	},
	{ description: "Apply a multi-file patch to create, update, delete, or rename files" },
);

interface ApplyPatchDetails {
	filesAdded: string[];
	filesUpdated: string[];
	filesDeleted: string[];
	filesMoved: string[];
	errors: string[];
	success: boolean;
}

// ============================================================================
// Extension Registration
// ============================================================================

export default function lumenPatchExtension(pi: ExtensionAPI): void {
	// Register as LLM-callable tool
	pi.registerTool({
		name: "apply_patch",
		label: "Apply Patch",
		description:
			"Apply a multi-file patch to create, update, delete, or rename files in a single operation. " +
			"Format: wrap in *** Begin Patch / *** End Patch. " +
			"Use *** Add File: <path> for new files (prefix lines with +). " +
			"Use *** Update File: <path> for edits (context lines with space, removals with -, additions with +). " +
			"Use *** Delete File: <path> to remove files. " +
			"Use *** Move to: <new-path> after Update File to rename.",
		promptSnippet: "apply_patch — multi-file batch edit (add/update/delete/rename)",
		promptGuidelines: [
			"Use apply_patch for multi-file changes that are logically atomic (e.g., rename + update references).",
			"For single-file edits, prefer the edit tool. Use apply_patch when touching 3+ files or creating new files.",
			"Always include enough context lines (space-prefixed) for unambiguous matching in Update File sections.",
		],
		parameters: ApplyPatchParams,

		async execute(
			_toolCallId: string,
			params: { patch: string },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			ctx: ExtensionContext,
		) {
			const result = applyPatch(params.patch, ctx.cwd);

			const lines: string[] = [];
			if (result.filesAdded.length) lines.push(`Added: ${result.filesAdded.join(", ")}`);
			if (result.filesUpdated.length) lines.push(`Updated: ${result.filesUpdated.join(", ")}`);
			if (result.filesDeleted.length) lines.push(`Deleted: ${result.filesDeleted.join(", ")}`);
			if (result.filesMoved.length) lines.push(`Moved: ${result.filesMoved.join(", ")}`);
			if (result.errors.length) lines.push(`Errors: ${result.errors.join("; ")}`);
			if (lines.length === 0) lines.push("Patch applied (no changes).");

			return {
				content: [{ type: "text" as const, text: lines.join("\n") }],
				details: {
					filesAdded: result.filesAdded,
					filesUpdated: result.filesUpdated,
					filesDeleted: result.filesDeleted,
					filesMoved: result.filesMoved,
					errors: result.errors,
					success: result.success,
				} as ApplyPatchDetails,
			};
		},

		renderCall(args: { patch?: string }, theme, _context) {
			const patch = args.patch ?? "";
			// Count operations from patch text
			const addCount = (patch.match(/\*\*\* Add File:/g) ?? []).length;
			const updateCount = (patch.match(/\*\*\* Update File:/g) ?? []).length;
			const deleteCount = (patch.match(/\*\*\* Delete File:/g) ?? []).length;
			const parts: string[] = [];
			if (addCount) parts.push(`+${addCount}`);
			if (updateCount) parts.push(`~${updateCount}`);
			if (deleteCount) parts.push(`-${deleteCount}`);
			const meta = parts.length > 0 ? parts.join(" ") : "patch";
			const text = theme.fg("toolTitle", theme.bold("apply_patch ")) + theme.fg("muted", meta);
			return new Text(text, 0, 0);
		},

		renderResult(
			result: { content: Array<{ type: string; text?: string }>; details?: ApplyPatchDetails },
			_options: ToolRenderResultOptions,
			theme,
			_context,
		) {
			const details = result.details;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? (text.text ?? "") : "", 0, 0);
			}

			const parts: string[] = [];
			if (details.filesAdded.length) parts.push(theme.fg("success", `+${details.filesAdded.length} added`));
			if (details.filesUpdated.length) parts.push(theme.fg("accent", `~${details.filesUpdated.length} updated`));
			if (details.filesDeleted.length) parts.push(theme.fg("error", `-${details.filesDeleted.length} deleted`));
			if (details.filesMoved.length) parts.push(theme.fg("muted", `${details.filesMoved.length} moved`));
			if (details.errors.length) parts.push(theme.fg("error", `${details.errors.length} errors`));

			const icon = details.success ? theme.fg("success", "\u2713 ") : theme.fg("error", "\u2717 ");
			return new Text(icon + parts.join(", "), 0, 0);
		},
	});

	// /patch command for manual use
	pi.registerCommand("patch", {
		description: "应用 patch 格式的多文件编辑",
		handler: async (args) => {
			if (!args.trim()) {
				pi.sendUserMessage(
					[
						"用法：/patch <patch-text>",
						"",
						"或者让 AI 使用 apply_patch tool 自动应用。",
						"",
						"Patch 格式示例：",
						"```",
						"*** Begin Patch",
						"*** Add File: hello.txt",
						"+Hello world",
						"*** Update File: src/app.ts",
						"@@ function greet()",
						'-console.log("Hi")',
						'+console.log("Hello!")',
						"*** Delete File: old.txt",
						"*** End Patch",
						"```",
					].join("\n"),
				);
				return;
			}
			const result = applyPatch(args, process.cwd());
			const lines: string[] = [];
			if (result.filesAdded.length) lines.push(`新增: ${result.filesAdded.join(", ")}`);
			if (result.filesUpdated.length) lines.push(`修改: ${result.filesUpdated.join(", ")}`);
			if (result.filesDeleted.length) lines.push(`删除: ${result.filesDeleted.join(", ")}`);
			if (result.filesMoved.length) lines.push(`移动: ${result.filesMoved.join(", ")}`);
			if (result.errors.length) lines.push(`错误: ${result.errors.join("; ")}`);
			pi.sendUserMessage(lines.join("\n") || "Patch 应用完成（无变更）。");
		},
	});
}
