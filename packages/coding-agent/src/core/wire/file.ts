/**
 * Wire Protocol Layer — JSONL 文件持久化（带异步写入和 buffer 批量 flush）
 *
 * 写入策略：
 * - 同步累积到内存 buffer
 * - 每 100ms 或 buffer 达到 64 条时异步 flush 到磁盘
 * - 进程退出时同步 flush 残余内容（避免数据丢失）
 *
 * 这样 streaming 高频事件（每秒数十次）不会被磁盘 IO 阻塞主线程。
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { WireEvent } from "./types.js";

/** Trace 文件名 */
const TRACE_FILENAME = "wire-trace.jsonl";
/** 批量 flush 阈值（条数） */
const FLUSH_BATCH_SIZE = 64;
/** 批量 flush 时间间隔（毫秒） */
const FLUSH_INTERVAL_MS = 100;

/**
 * 创建一个 Wire trace 写入器。
 * 事件累积在 buffer 中，定时异步刷盘，避免阻塞主线程。
 *
 * 返回的函数有一个 `.flushSync()` 方法可用于测试场景或确保数据落盘。
 */
export interface WireTraceWriter {
	(event: WireEvent): void;
	flushSync(): void;
}

export function createWireTraceWriter(sessionDir: string): WireTraceWriter {
	const tracePath = join(sessionDir, TRACE_FILENAME);
	let initialized = false;
	const buffer: string[] = [];
	let flushTimer: ReturnType<typeof setTimeout> | undefined;
	let flushing = false;

	function ensureInit() {
		if (initialized) return;
		const dir = dirname(tracePath);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		initialized = true;
	}

	async function flushAsync() {
		if (flushing || buffer.length === 0) return;
		flushing = true;
		const lines = buffer.splice(0, buffer.length).join("");
		try {
			ensureInit();
			await appendFile(tracePath, lines, "utf-8");
		} catch {
			// 磁盘写入失败不影响主流程
		} finally {
			flushing = false;
			if (buffer.length >= FLUSH_BATCH_SIZE) {
				void flushAsync();
			} else if (buffer.length > 0) {
				scheduleFlush();
			}
		}
	}

	function scheduleFlush() {
		if (flushTimer) return;
		flushTimer = setTimeout(() => {
			flushTimer = undefined;
			void flushAsync();
		}, FLUSH_INTERVAL_MS);
	}

	function flushSync(): void {
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = undefined;
		}
		if (buffer.length === 0) return;
		try {
			ensureInit();
			appendFileSync(tracePath, buffer.join(""), "utf-8");
			buffer.length = 0;
		} catch {
			// best-effort
		}
	}

	process.once("beforeExit", flushSync);
	process.once("SIGINT", () => {
		flushSync();
		process.exit(130);
	});
	process.once("SIGTERM", () => {
		flushSync();
		process.exit(143);
	});

	const writer = ((event: WireEvent) => {
		buffer.push(`${JSON.stringify(event)}\n`);
		if (buffer.length >= FLUSH_BATCH_SIZE) {
			void flushAsync();
		} else {
			scheduleFlush();
		}
	}) as WireTraceWriter;
	writer.flushSync = flushSync;
	return writer;
}

/**
 * 从 JSONL 文件中读取 Wire trace。
 * 解析失败的行会被跳过。
 */
export function readWireTrace(sessionDir: string): WireEvent[] {
	const tracePath = join(sessionDir, TRACE_FILENAME);
	if (!existsSync(tracePath)) return [];

	const content = readFileSync(tracePath, "utf-8");
	const events: WireEvent[] = [];

	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed) as WireEvent;
			if (parsed && typeof parsed.type === "string" && typeof parsed.seq === "number") {
				events.push(parsed);
			}
		} catch {
			// 解析失败的行跳过，继续后续行
		}
	}

	return events;
}

/**
 * 获取 trace 文件路径。
 */
export function getWireTracePath(sessionDir: string): string {
	return join(sessionDir, TRACE_FILENAME);
}
