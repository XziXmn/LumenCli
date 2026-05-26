/**
 * Shared TUI utilities for Lumen's enhanced rendering.
 *
 * [Provenance] 来源: oh-my-pi/packages/coding-agent/src/tui/utils.ts + types.ts
 * [Provenance] 移植方式: 重写 (用我们的 API，Hasher 加 Bun/Node 兼容层)
 */

import { visibleWidth } from "@earendil-works/pi-tui";
import type { ThemeBg } from "../theme/theme.ts";

// ============================================================================
// Types
// ============================================================================

export type State = "pending" | "running" | "success" | "error" | "warning";

export type ToolUIStatus = "success" | "error" | "warning" | "info" | "pending" | "running" | "aborted";

// ============================================================================
// Hasher — Bun/Node compatible cache key builder
// ============================================================================

/**
 * Incremental hash key builder.
 *
 * In Bun runtime (binary builds): uses Bun.hash.xxHash64 for fast native hashing.
 * In Node.js/tsx (dev mode): uses a simple FNV-1a-like string accumulator as fallback.
 * The hash is only used for render cache invalidation — collisions are acceptable.
 */
export class Hasher {
	#h: bigint = 0n;
	#useBun: boolean;

	constructor() {
		this.#useBun = typeof (globalThis as Record<string, unknown>).Bun !== "undefined";
	}

	/** Feed a string. */
	str(s: string): this {
		if (this.#useBun) {
			// Bun path: chain xxHash64 with seeding
			const hashBuf = new ArrayBuffer(4);
			const view = new DataView(hashBuf);
			view.setUint32(0, s.length);
			this.#h = (globalThis as any).Bun.hash.xxHash64(new Uint8Array(hashBuf), this.#h);
			this.#h = (globalThis as any).Bun.hash.xxHash64(s, this.#h);
		} else {
			// Node fallback: FNV-1a inspired mixing
			this.#h = this.#mixString(s);
		}
		return this;
	}

	/** Feed an unsigned 32-bit integer. */
	u32(n: number): this {
		if (this.#useBun) {
			const hashBuf = new ArrayBuffer(4);
			const view = new DataView(hashBuf);
			view.setUint32(0, n);
			this.#h = (globalThis as any).Bun.hash.xxHash64(new Uint8Array(hashBuf), this.#h);
		} else {
			this.#h = (this.#h * 1099511628211n) ^ BigInt(n);
		}
		return this;
	}

	/** Feed a boolean. */
	bool(b: boolean): this {
		if (this.#useBun) {
			const hashBuf = new ArrayBuffer(1);
			const view = new DataView(hashBuf);
			view.setUint8(0, b ? 1 : 0);
			this.#h = (globalThis as any).Bun.hash.xxHash64(new Uint8Array(hashBuf), this.#h);
		} else {
			this.#h = (this.#h * 1099511628211n) ^ BigInt(b ? 1 : 0);
		}
		return this;
	}

	/** Feed a value that may be undefined/null. */
	optional(v: string | undefined | null): this {
		if (v == null) {
			if (this.#useBun) {
				const hashBuf = new ArrayBuffer(1);
				const view = new DataView(hashBuf);
				view.setUint8(0, 0xff);
				this.#h = (globalThis as any).Bun.hash.xxHash64(new Uint8Array(hashBuf), this.#h);
			} else {
				this.#h = (this.#h * 1099511628211n) ^ 0xffn;
			}
		} else {
			this.str(v);
		}
		return this;
	}

	/** Return the final hash digest. */
	digest(): bigint {
		return this.#h;
	}

	#mixString(s: string): bigint {
		let h = this.#h ^ BigInt(s.length);
		for (let i = 0; i < s.length; i++) {
			h = (h * 1099511628211n) ^ BigInt(s.charCodeAt(i));
		}
		return h;
	}
}

/** Render-cache entry used by output block and tool renderers. */
export interface RenderCache {
	key: bigint;
	lines: string[];
}

// ============================================================================
// Padding & Width Utilities
// ============================================================================

/** Create a padding string of N spaces. */
export function padding(n: number): string {
	return n > 0 ? " ".repeat(n) : "";
}

/** Pad a rendered line to a target width, optionally applying a background function. */
export function padToWidth(text: string, width: number, bgFn?: (s: string) => string): string {
	if (width <= 0) return bgFn ? bgFn(text) : text;
	const paddingNeeded = Math.max(0, width - visibleWidth(text));
	const padded = paddingNeeded > 0 ? text + padding(paddingNeeded) : text;
	return bgFn ? bgFn(padded) : padded;
}

/** Truncate a string to fit within maxWidth visible characters, adding ellipsis if needed. */
export function truncateToVisibleWidth(text: string, maxWidth: number): string {
	if (visibleWidth(text) <= maxWidth) return text;
	// Simple approach: strip from end until it fits
	let result = text;
	while (visibleWidth(result) > maxWidth - 1 && result.length > 0) {
		result = result.slice(0, -1);
	}
	return `${result}\u2026`; // …
}

// ============================================================================
// State → Background Color Mapping
// ============================================================================

export function getStateBgColor(state: State): ThemeBg {
	if (state === "success") return "toolSuccessBg";
	if (state === "error") return "toolErrorBg";
	return "toolPendingBg";
}

// ============================================================================
// Tree Prefix Utilities
// ============================================================================

export interface TreeSymbols {
	vertical: string;
	branch: string;
	last: string;
	horizontal: string;
}

export const TREE_SYMBOLS: TreeSymbols = {
	vertical: "\u2502", // │
	branch: "\u251C\u2500", // ├─
	last: "\u2514\u2500", // └─
	horizontal: "\u2500", // ─
};

export function buildTreePrefix(ancestors: boolean[]): string {
	return ancestors.map((hasNext) => (hasNext ? `${TREE_SYMBOLS.vertical}  ` : "   ")).join("");
}

export function getTreeBranch(isLast: boolean): string {
	return isLast ? TREE_SYMBOLS.last : TREE_SYMBOLS.branch;
}

// ============================================================================
// Box Drawing Characters
// ============================================================================

export const BOX_SHARP = {
	topLeft: "\u250C", // ┌
	topRight: "\u2510", // ┐
	bottomLeft: "\u2514", // └
	bottomRight: "\u2518", // ┘
	horizontal: "\u2500", // ─
	vertical: "\u2502", // │
	teeRight: "\u251C", // ├
	teeLeft: "\u2524", // ┤
	teeDown: "\u252C", // ┬
	teeUp: "\u2534", // ┴
	cross: "\u253C", // ┼
} as const;

// ============================================================================
// Spinner Frames
// ============================================================================

/** Braille spinner frames (80ms per frame recommended). */
export const SPINNER_FRAMES = ["\u28FB", "\u28FD", "\u28FE", "\u28F7", "\u28EF", "\u28DF", "\u28BF", "\u287F"];
// ⣻ ⣽ ⣾ ⣷ ⣯ ⣟ ⢿ ⡿

/** Status symbols for completed states. */
export const STATUS_SYMBOLS = {
	success: "\u2713", // ✓
	error: "\u2717", // ✗
	warning: "\u26A0", // ⚠
	info: "\u25CF", // ●
	pending: "\u25CB", // ○
} as const;
