/**
 * Lumen 增强记忆模块 (2-phase pipeline)
 *
 * JSONL 持久化 store，跨 session 记忆检索。
 *
 * **2-phase pipeline**（参考 Codex 架构）：
 * - Phase 1 (session_shutdown hook)：从 session 提取结构化记忆
 *     - raw_memory: 用户明确 /remember 的条目（已持久化）
 *     - rollout_summary: session 启发式摘要（命令使用、工具调用频率、编辑过的文件）
 * - Phase 2 (后台异步)：全局合并整理
 *     - 合并相同 cwd 的 summary 条目
 *     - 清理 30 天前的低优先级条目
 *     - 去重高相似度条目
 *
 * 提供命令：
 * - /remember <content> 或 /remember <kind>:<content>
 * - /memory [kind] [query]
 * - /memory consolidate — 手动触发合并
 *
 * [Provenance] 来源: Codex rs/memories/ + 自研
 * [Provenance] 移植方式: 参考重写（TypeScript, JSONL store）
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "./extensions/types.js";

// ============================================================================
// Types
// ============================================================================

export type MemoryKind = "fact" | "preference" | "context" | "summary" | "lesson";

export interface MemoryEntry {
	id: string;
	kind: MemoryKind;
	content: string;
	source: string;
	createdAt: string;
	cwd?: string;
}

const VALID_KINDS: MemoryKind[] = ["fact", "preference", "context", "summary", "lesson"];
const MAX_ENTRIES_BEFORE_CONSOLIDATION = 500;
const CONSOLIDATION_AGE_DAYS = 30;

// ============================================================================
// Persistence
// ============================================================================

function getMemoryPath(): string {
	const envPath = process.env.LUMEN_MEMORY_PATH;
	if (envPath?.trim()) return envPath.trim();
	return join(homedir(), ".lumen", "agent", "memory.jsonl");
}

function readMemoryEntries(): MemoryEntry[] {
	const memoryPath = getMemoryPath();
	if (!existsSync(memoryPath)) return [];

	try {
		const content = readFileSync(memoryPath, "utf8");
		return content
			.split(/\r?\n/)
			.filter((line) => line.trim().length > 0)
			.map((line) => {
				try {
					return JSON.parse(line) as MemoryEntry;
				} catch {
					return undefined;
				}
			})
			.filter((entry): entry is MemoryEntry => entry !== undefined && typeof entry.content === "string");
	} catch {
		return [];
	}
}

function writeAllEntries(entries: MemoryEntry[]): void {
	const memoryPath = getMemoryPath();
	const dir = dirname(memoryPath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	const content = `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`;
	writeFileSync(memoryPath, content, "utf8");
}

function appendMemoryEntry(entry: MemoryEntry): void {
	const memoryPath = getMemoryPath();
	const dir = dirname(memoryPath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	appendFileSync(memoryPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function makeEntryId(): string {
	return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// Search
// ============================================================================

/** Search memory with optional kind filter */
function searchMemory(query: string, kindFilter?: MemoryKind): MemoryEntry[] {
	let entries = readMemoryEntries();

	if (kindFilter) {
		entries = entries.filter((e) => e.kind === kindFilter);
	}

	if (!query.trim() || query === kindFilter) {
		return entries.slice(-20);
	}

	const lowerQuery = query.toLowerCase();
	return entries.filter((entry) => entry.content.toLowerCase().includes(lowerQuery)).slice(-20);
}

/** Get relevant entries based on cwd proximity, recency, and minimum score threshold */
function getRelevantEntries(cwd: string, maxEntries: number): MemoryEntry[] {
	const entries = readMemoryEntries();
	if (entries.length === 0) return [];

	const MIN_SCORE = 3;

	const scored = entries.map((entry) => {
		let score = 0;

		if (entry.cwd === cwd) {
			score += 10;
		} else if (entry.cwd && cwd.startsWith(entry.cwd)) {
			score += 6;
		} else if (entry.cwd?.startsWith(cwd)) {
			score += 4;
		}

		if (entry.kind === "lesson") score += 5;
		else if (entry.kind === "preference") score += 3;
		else if (entry.kind === "context") score += 2;

		const ageMs = Date.now() - new Date(entry.createdAt).getTime();
		const ageDays = ageMs / (1000 * 60 * 60 * 24);
		if (ageDays < 1) score += 6;
		else if (ageDays < 7) score += 4;
		else if (ageDays < 30) score += 2;
		else if (ageDays > 180) score -= 2;

		return { entry, score };
	});

	return scored
		.filter((s) => s.score >= MIN_SCORE)
		.sort((a, b) => b.score - a.score)
		.slice(0, maxEntries)
		.map((s) => s.entry);
}

// ============================================================================
// Phase 1: Session Extraction (on session_shutdown)
// ============================================================================

/**
 * Analyze session entries to extract a heuristic rollout summary.
 * Captures: number of tool calls per tool, files touched, commands run, duration.
 */
function extractRolloutSummary(ctx: ExtensionContext): string | undefined {
	const branch = ctx.sessionManager.getBranch();
	if (branch.length === 0) return undefined;

	const toolCallCounts = new Map<string, number>();
	const filesTouched = new Set<string>();
	const commandsRun: string[] = [];
	let userMessageCount = 0;
	let assistantMessageCount = 0;

	for (const entry of branch) {
		if (entry.type === "message") {
			const msg = entry.message as unknown as {
				role?: string;
				toolName?: string;
				timestamp?: number | string;
				content?: unknown;
				arguments?: unknown;
			};
			if (msg.role === "user") userMessageCount++;
			else if (msg.role === "assistant") assistantMessageCount++;
			else if (msg.role === "toolCall" && msg.toolName) {
				toolCallCounts.set(msg.toolName, (toolCallCounts.get(msg.toolName) ?? 0) + 1);

				// Capture files touched by write/edit/apply_patch
				const args = msg.arguments as { path?: string } | undefined;
				if (args?.path && ["write", "edit"].includes(msg.toolName)) {
					filesTouched.add(args.path);
				}

				// Capture bash commands
				if (msg.toolName === "bash") {
					const bashArgs = msg.arguments as { command?: string } | undefined;
					if (bashArgs?.command && commandsRun.length < 5) {
						commandsRun.push(bashArgs.command.slice(0, 100));
					}
				}
			}
			if (msg.timestamp !== undefined) {
				// Timestamps are parsed but not currently used in the summary
				// Reserved for future duration reporting
			}
		}
	}

	const totalToolCalls = Array.from(toolCallCounts.values()).reduce((a, b) => a + b, 0);
	if (totalToolCalls === 0 && userMessageCount === 0) return undefined; // Nothing happened

	const parts: string[] = [];
	if (userMessageCount > 0) parts.push(`${userMessageCount} user msgs`);
	if (assistantMessageCount > 0) parts.push(`${assistantMessageCount} assistant msgs`);
	if (totalToolCalls > 0) {
		const toolBreakdown = Array.from(toolCallCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([name, count]) => `${name}×${count}`)
			.join(", ");
		parts.push(`tools: ${toolBreakdown}`);
	}
	if (filesTouched.size > 0) {
		const filesList = Array.from(filesTouched).slice(0, 3).join(", ");
		const suffix = filesTouched.size > 3 ? ` (+${filesTouched.size - 3} more)` : "";
		parts.push(`touched: ${filesList}${suffix}`);
	}

	return parts.join("; ");
}

/**
 * Phase 1: called on session_shutdown.
 * Writes a structured rollout_summary entry if the session had meaningful activity.
 */
function extractPhase1(ctx: ExtensionContext, reason: string): void {
	const summary = extractRolloutSummary(ctx);
	if (!summary) return;

	const entry: MemoryEntry = {
		id: makeEntryId(),
		kind: "summary",
		content: `[${reason}] ${summary}`,
		source: "auto-phase1",
		createdAt: new Date().toISOString(),
		cwd: ctx.cwd,
	};
	appendMemoryEntry(entry);
}

// ============================================================================
// Phase 2: Global Consolidation (async, triggered after phase 1)
// ============================================================================

/** String similarity via 3-gram overlap (Jaccard). */
function similarity(a: string, b: string): number {
	const grams = (s: string) => {
		const out = new Set<string>();
		const normalized = s.toLowerCase().replace(/\s+/g, " ").trim();
		for (let i = 0; i <= normalized.length - 3; i++) {
			out.add(normalized.slice(i, i + 3));
		}
		return out;
	};
	const ga = grams(a);
	const gb = grams(b);
	if (ga.size === 0 || gb.size === 0) return 0;
	let intersection = 0;
	for (const gram of ga) {
		if (gb.has(gram)) intersection++;
	}
	return intersection / (ga.size + gb.size - intersection);
}

/** Deduplicate entries with ≥ 0.85 similarity, keeping the newest. */
function deduplicateEntries(entries: MemoryEntry[], threshold = 0.85): MemoryEntry[] {
	// Sort newest first so we keep the newest duplicates
	const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	const kept: MemoryEntry[] = [];

	for (const entry of sorted) {
		// Only dedupe within same kind
		const duplicate = kept.find((k) => k.kind === entry.kind && similarity(k.content, entry.content) >= threshold);
		if (!duplicate) kept.push(entry);
	}

	// Restore chronological order
	return kept.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Phase 2: consolidate old summary/context entries grouped by cwd.
 */
function consolidatePhase2(): { before: number; after: number; consolidated: number } {
	const entries = readMemoryEntries();
	const before = entries.length;

	if (entries.length < MAX_ENTRIES_BEFORE_CONSOLIDATION) {
		// Only dedup near-duplicates, don't consolidate yet
		const deduped = deduplicateEntries(entries);
		if (deduped.length < before) {
			writeAllEntries(deduped);
			return { before, after: deduped.length, consolidated: 0 };
		}
		return { before, after: before, consolidated: 0 };
	}

	const cutoffDate = new Date(Date.now() - CONSOLIDATION_AGE_DAYS * 24 * 60 * 60 * 1000);
	const old: MemoryEntry[] = [];
	const recent: MemoryEntry[] = [];

	for (const entry of entries) {
		const isProtected = entry.kind === "lesson" || entry.kind === "preference";
		if (!isProtected && new Date(entry.createdAt) < cutoffDate) {
			old.push(entry);
		} else {
			recent.push(entry);
		}
	}

	if (old.length < 10) {
		const deduped = deduplicateEntries(entries);
		if (deduped.length < before) writeAllEntries(deduped);
		return { before, after: deduped.length, consolidated: 0 };
	}

	// Group old entries by (kind, cwd)
	const grouped = new Map<string, MemoryEntry[]>();
	for (const entry of old) {
		const key = `${entry.kind}:${entry.cwd ?? ""}`;
		const list = grouped.get(key) ?? [];
		list.push(entry);
		grouped.set(key, list);
	}

	const consolidated: MemoryEntry[] = [];
	for (const [key, groupEntries] of grouped) {
		if (groupEntries.length < 3) {
			// Too few to consolidate; keep as-is
			consolidated.push(...groupEntries);
			continue;
		}
		// Merge into one summary entry per group
		const [kind, cwd] = key.split(":");
		const merged: MemoryEntry = {
			id: makeEntryId(),
			kind: "summary",
			content: `[consolidated ${groupEntries.length} ${kind} entries] ${groupEntries
				.map((e) => e.content)
				.join(" | ")
				.slice(0, 2000)}`,
			source: "consolidation",
			createdAt: new Date().toISOString(),
			cwd: cwd || undefined,
		};
		consolidated.push(merged);
	}

	const finalEntries = deduplicateEntries([...consolidated, ...recent]);
	writeAllEntries(finalEntries);
	return { before, after: finalEntries.length, consolidated: old.length };
}

// ============================================================================
// Extension
// ============================================================================

export default function lumenMemoryExtension(pi: ExtensionAPI): void {
	pi.registerCommand("remember", {
		description: "记住一条信息（跨 session 持久化）",
		handler: async (args) => {
			const content = args.trim();
			if (!content) {
				pi.sendUserMessage("请提供要记住的内容。用法：/remember <内容> 或 /remember lesson:<内容>");
				return;
			}

			// Parse kind prefix: /remember lesson:xxx
			let kind: MemoryKind = "fact";
			let actualContent = content;
			const colonIdx = content.indexOf(":");
			if (colonIdx > 0 && colonIdx < 12) {
				const maybeKind = content.slice(0, colonIdx) as MemoryKind;
				if (VALID_KINDS.includes(maybeKind)) {
					kind = maybeKind;
					actualContent = content.slice(colonIdx + 1).trim();
				}
			}

			const entry: MemoryEntry = {
				id: makeEntryId(),
				kind,
				content: actualContent,
				source: "user",
				createdAt: new Date().toISOString(),
				cwd: process.cwd(),
			};
			appendMemoryEntry(entry);

			const total = readMemoryEntries().length;
			pi.sendUserMessage(`已记住 [${kind}]: "${actualContent}"\n\n（共 ${total} 条记忆）`);
		},
	});

	pi.registerCommand("memory", {
		description: "搜索/列出/合并记忆（/memory [kind] [query] | /memory consolidate）",
		handler: async (args) => {
			const query = args.trim();

			// Special: /memory consolidate — manually trigger phase 2
			if (query === "consolidate") {
				const result = consolidatePhase2();
				pi.sendUserMessage(
					`Consolidation complete: ${result.before} → ${result.after} entries (${result.consolidated} old entries merged).`,
				);
				return;
			}

			let kindFilter: MemoryKind | undefined;
			let searchQuery = query;
			const firstWord = query.split(/\s+/)[0];
			if (firstWord && VALID_KINDS.includes(firstWord as MemoryKind)) {
				kindFilter = firstWord as MemoryKind;
				searchQuery = query.slice(firstWord.length).trim();
			}

			const entries = searchMemory(searchQuery || (kindFilter ?? ""), kindFilter);

			if (entries.length === 0) {
				const msg = kindFilter
					? `没有 [${kindFilter}] 类型的记忆。`
					: query
						? `没有找到匹配 "${query}" 的记忆。`
						: "记忆为空。使用 /remember <内容> 添加记忆。";
				pi.sendUserMessage(msg);
				return;
			}

			const lines = entries.map((entry) => {
				const date = entry.createdAt.split("T")[0];
				return `- [${entry.kind}] ${entry.content} (${date})`;
			});

			const total = readMemoryEntries().length;
			const header = kindFilter
				? `[${kindFilter}] 记忆 (${entries.length}/${total} 条):`
				: searchQuery
					? `搜索 "${searchQuery}" 的结果 (${entries.length} 条):`
					: `最近记忆 (${entries.length}/${total} 条):`;
			pi.sendUserMessage(`${header}\n\n${lines.join("\n")}`);
		},
	});

	// Inject relevant memory into system prompt
	pi.on("before_agent_start", (event) => {
		const entries = readMemoryEntries();
		if (entries.length === 0) return;

		const cwd = process.cwd();
		const relevant = getRelevantEntries(cwd, 10);
		if (relevant.length === 0) return;

		const memoryContext = [
			"# Lumen Memory (跨 session 持久化记忆)",
			"",
			...relevant.map((entry) => `- [${entry.kind}] ${entry.content}`),
			"",
			`共 ${entries.length} 条记忆。用户可通过 /memory 搜索查看更多。`,
		].join("\n");

		return {
			systemPrompt: `${event.systemPrompt}\n\n${memoryContext}`,
		};
	});

	// 2-phase pipeline on session_shutdown
	pi.on("session_shutdown", (event, ctx) => {
		// Phase 1: extract rollout summary synchronously
		extractPhase1(ctx, event.reason);

		// Phase 2: consolidate in the background (non-blocking)
		// Use setImmediate so we don't delay shutdown
		setImmediate(() => {
			try {
				consolidatePhase2();
			} catch {
				// Silent; consolidation is best-effort
			}
		});
	});
}

// Testing exports
export {
	consolidatePhase2,
	deduplicateEntries,
	extractRolloutSummary,
	getRelevantEntries,
	readMemoryEntries,
	similarity,
	writeAllEntries,
};
