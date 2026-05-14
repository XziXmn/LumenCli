/**
 * Lumen Hashline Editing
 *
 * 每行输出附带 2 字符 hash 锚点，LLM 可通过锚点精确定位编辑位置。
 * 解决行号漂移问题：即使文件被修改，hash 仍能唯一标识行内容。
 *
 * 格式: `42sr|function hello() {`
 * - 42 = 行号（1-indexed）
 * - sr = 2 字符 hash（基于行内容计算）
 * - | = 分隔符
 * - 后面是行内容
 *
 * [Provenance] 来源: oh-my-pi src/hashline/ (hash.ts, anchors.ts)
 * [Provenance] 移植方式: 参考重写（用 Node.js crypto 替代 Bun.hash.xxHash32）
 */

import { createHash } from "node:crypto";

// ============================================================================
// Bigrams (647 single-token 2-letter combinations)
// ============================================================================

// Generate the 647 bigrams that are single BPE tokens
// This is the same set as oh-my-pi, just generated inline
const BIGRAMS: string[] = (() => {
	const result: string[] = [];
	for (let i = 0; i < 26; i++) {
		for (let j = 0; j < 26; j++) {
			const bigram = String.fromCharCode(97 + i) + String.fromCharCode(97 + j);
			result.push(bigram);
		}
	}
	// 26*26 = 676, we use first 647 to match oh-my-pi
	return result.slice(0, 647);
})();

const BIGRAM_COUNT = BIGRAMS.length;

/** Separator between anchor and line content in display output */
export const HL_BODY_SEP = "|";

/** Regex for matching a hashline anchor: digits + 2 lowercase letters */
export const HL_ANCHOR_RE = /^(\d+)([a-z]{2})\|/;

/**
 * Hash algorithm selection. Defaults to "md5" (Node.js native).
 * Set LUMEN_HASHLINE_ALGO to a different algorithm name if needed.
 * Algorithm choice must stay consistent within a session — mixing algorithms
 * will cause hash mismatches even for unchanged lines.
 */
const HASH_ALGO = process.env.LUMEN_HASHLINE_ALGO?.trim() || "md5";

// ============================================================================
// Hash Computation
// ============================================================================

const RE_SIGNIFICANT = /[\p{L}\p{N}]/u;

/**
 * Compute a 2-character hash for a line.
 * Lines with no letter/digit mix the line number into the seed
 * so adjacent identical punctuation-only lines get distinct hashes.
 */
export function computeLineHash(lineNumber: number, line: string): string {
	const trimmed = line.replace(/\r/g, "").trimEnd();
	const seed = RE_SIGNIFICANT.test(trimmed) ? 0 : lineNumber;
	const input = seed === 0 ? trimmed : `${seed}:${trimmed}`;
	// Use the configured hash algorithm (md5 default, fast and available everywhere)
	const hash = createHash(HASH_ALGO).update(input).digest();
	// Use first 4 bytes as uint32, mod BIGRAM_COUNT
	const num = hash.readUInt32LE(0) % BIGRAM_COUNT;
	return BIGRAMS[num];
}

/**
 * Format a single line with hashline anchor.
 * Returns `LINE+HASH|TEXT` (e.g., `42sr|function hi() {`)
 */
export function formatHashLine(lineNumber: number, line: string): string {
	const hash = computeLineHash(lineNumber, line);
	return `${lineNumber}${hash}${HL_BODY_SEP}${line}`;
}

/**
 * Format file text with hashline prefixes.
 * Each line becomes `LINE+HASH|TEXT` where LINE is 1-indexed.
 */
export function formatHashLines(text: string, startLine = 1): string {
	const lines = text.split("\n");
	return lines.map((line, i) => formatHashLine(startLine + i, line)).join("\n");
}

// ============================================================================
// Anchor Resolution
// ============================================================================

export interface AnchorRef {
	line: number;
	hash: string;
}

export interface HashMismatch {
	line: number;
	expected: string;
	actual: string;
}

/**
 * Parse a hashline anchor reference (e.g., "42sr") into line number and hash.
 */
export function parseAnchor(ref: string): AnchorRef {
	const match = ref.match(/^(\d+)([a-z]{2})$/);
	if (!match) {
		throw new Error(`Invalid anchor reference "${ref}". Expected format: LINE+HASH (e.g., "42sr")`);
	}
	return { line: Number.parseInt(match[1], 10), hash: match[2] };
}

/**
 * Validate that an anchor matches the actual file content.
 * Returns the mismatch info if validation fails.
 */
export function validateAnchor(anchor: AnchorRef, fileLines: string[]): HashMismatch | null {
	if (anchor.line < 1 || anchor.line > fileLines.length) {
		return { line: anchor.line, expected: anchor.hash, actual: "??" };
	}
	const actual = computeLineHash(anchor.line, fileLines[anchor.line - 1]);
	if (actual !== anchor.hash) {
		return { line: anchor.line, expected: anchor.hash, actual };
	}
	return null;
}

/**
 * Resolve multiple anchors to line numbers, validating hashes.
 * Returns validated line numbers or throws with mismatch details.
 */
export function resolveAnchors(fileLines: string[], anchors: AnchorRef[]): number[] {
	const mismatches: HashMismatch[] = [];
	const resolvedLines: number[] = [];

	for (const anchor of anchors) {
		const mismatch = validateAnchor(anchor, fileLines);
		if (mismatch) {
			mismatches.push(mismatch);
		} else {
			resolvedLines.push(anchor.line);
		}
	}

	if (mismatches.length > 0) {
		const details = mismatches
			.map((m) => {
				const context = fileLines[m.line - 1] ?? "(out of range)";
				const actualHash = m.actual;
				return `  Line ${m.line}: expected hash "${m.expected}", actual "${actualHash}" | ${context}`;
			})
			.join("\n");
		throw new Error(
			`Hash mismatch on ${mismatches.length} line(s). File has changed since last read.\n${details}\n\nPlease re-read the file to get updated anchors.`,
		);
	}

	return resolvedLines;
}

// ============================================================================
// Export for use by read tool and extension
// ============================================================================

export default {
	computeLineHash,
	formatHashLine,
	formatHashLines,
	parseAnchor,
	validateAnchor,
	resolveAnchors,
	HL_BODY_SEP,
};
