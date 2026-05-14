/**
 * Lumen Snip/Brief Tools
 *
 * 两个文本处理工具：
 * - `snip`: 智能截断长文本（保留头尾 + 中间摘要），避免 context 爆炸
 * - `brief`: 对长文本生成结构化摘要（按段落聚合）
 *
 * [Provenance] 来源: Claude Code `SnipTool` + `BriefTool` 概念
 * [Provenance] 移植方式: 自研（无 LLM 依赖，纯启发式算法）
 */

import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext, ToolRenderResultOptions } from "./extensions/types.js";

// ============================================================================
// Algorithms
// ============================================================================

/**
 * Smart truncation: keep first/last N lines, skip middle with a summary.
 */
export function snipText(text: string, maxLines: number, headRatio = 0.6): string {
	const lines = text.split("\n");
	if (lines.length <= maxLines) return text;

	const headLines = Math.floor(maxLines * headRatio);
	const tailLines = maxLines - headLines - 1; // -1 for separator
	const head = lines.slice(0, headLines);
	const tail = lines.slice(lines.length - tailLines);
	const skipped = lines.length - headLines - tailLines;

	return [...head, `... [${skipped} lines skipped]`, ...tail].join("\n");
}

/**
 * Generate a brief summary of text by extracting paragraph lead lines.
 */
export function briefText(text: string, maxItems = 10): string {
	// Split by blank lines into paragraphs
	const paragraphs = text
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter(Boolean);

	if (paragraphs.length === 0) return text.slice(0, 500);

	const items: string[] = [];
	for (const p of paragraphs) {
		if (items.length >= maxItems) break;
		const firstLine = p.split("\n")[0]?.trim() ?? "";
		if (!firstLine) continue;

		// Take first sentence (up to ~120 chars)
		const sentence = firstLine.match(/^[^.!?]*[.!?]?/)?.[0]?.trim() ?? firstLine;
		const preview = sentence.length > 120 ? `${sentence.slice(0, 120).trimEnd()}…` : sentence;
		items.push(`- ${preview}`);
	}

	const stats = `[${paragraphs.length} paragraph${paragraphs.length === 1 ? "" : "s"}, ${text.length} chars]`;
	return `${stats}\n\n${items.join("\n")}`;
}

/**
 * Extract file headings from a text (lines that look like markdown headers or code declarations).
 */
export function extractHeadings(text: string, maxItems = 30): string[] {
	const headings: string[] = [];
	const lines = text.split("\n");
	for (const line of lines) {
		if (headings.length >= maxItems) break;
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Markdown heading
		if (/^#{1,6}\s+/.test(trimmed)) {
			headings.push(trimmed);
			continue;
		}
		// Function/class declaration (JS/TS/Python/Go/Rust)
		if (
			/^(export\s+)?(async\s+)?(function|class|interface|type|enum)\s+\w+/.test(trimmed) ||
			/^(def|class)\s+\w+/.test(trimmed) ||
			/^(func|type|struct)\s+\w+/.test(trimmed) ||
			/^(pub\s+)?(fn|struct|enum|trait|impl)\s+\w+/.test(trimmed)
		) {
			headings.push(trimmed);
		}
	}
	return headings;
}

// ============================================================================
// Schema
// ============================================================================

const SnipParams = Type.Object(
	{
		text: Type.String({ description: "Text to snip" }),
		max_lines: Type.Optional(Type.Number({ description: "Maximum lines to keep (default 40)" })),
	},
	{ description: "Truncate long text smartly (keep head + tail with skip marker)" },
);

const BriefParams = Type.Object(
	{
		text: Type.String({ description: "Text to summarize" }),
		max_items: Type.Optional(Type.Number({ description: "Maximum bullet items (default 10)" })),
	},
	{ description: "Generate a structured summary of long text by extracting paragraph leads" },
);

interface SnipDetails {
	originalLines: number;
	resultLines: number;
}

interface BriefDetails {
	originalLength: number;
	itemCount: number;
}

// ============================================================================
// Extension
// ============================================================================

export default function lumenSnipExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "snip",
		label: "Snip",
		description:
			"Smart truncate a long text, keeping head and tail lines with a skip marker in the middle. " +
			"Use when a previous tool result is too long to fit in context.",
		promptSnippet: "snip — smart-truncate long text",
		parameters: SnipParams,

		async execute(
			_toolCallId: string,
			params: { text: string; max_lines?: number },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			_ctx: ExtensionContext,
		) {
			const maxLines = params.max_lines ?? 40;
			const snipped = snipText(params.text, maxLines);
			const originalLines = params.text.split("\n").length;
			const resultLines = snipped.split("\n").length;
			return {
				content: [{ type: "text" as const, text: snipped }],
				details: { originalLines, resultLines } as SnipDetails,
			};
		},

		renderCall(args: { max_lines?: number }, theme, _context) {
			const text = theme.fg("toolTitle", theme.bold("snip ")) + theme.fg("muted", `max=${args.max_lines ?? 40}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options: ToolRenderResultOptions, theme, _context) {
			const details = result.details as SnipDetails | undefined;
			if (!details) return new Text(theme.fg("dim", "—"), 0, 0);
			return new Text(
				theme.fg("success", "\u2713 ") +
					theme.fg("muted", `${details.originalLines} → ${details.resultLines} lines`),
				0,
				0,
			);
		},
	});

	pi.registerTool({
		name: "brief",
		label: "Brief",
		description:
			"Generate a structured summary of long text by extracting the first sentence of each paragraph. " +
			"Useful for getting an overview of documents or long tool outputs.",
		promptSnippet: "brief — summarize long text by paragraph leads",
		parameters: BriefParams,

		async execute(
			_toolCallId: string,
			params: { text: string; max_items?: number },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			_ctx: ExtensionContext,
		) {
			const maxItems = params.max_items ?? 10;
			const summary = briefText(params.text, maxItems);
			const originalLength = params.text.length;
			const itemCount = summary.split("\n").filter((l) => l.startsWith("- ")).length;
			return {
				content: [{ type: "text" as const, text: summary }],
				details: { originalLength, itemCount } as BriefDetails,
			};
		},

		renderCall(args: { max_items?: number }, theme, _context) {
			const text = theme.fg("toolTitle", theme.bold("brief ")) + theme.fg("muted", `max=${args.max_items ?? 10}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options: ToolRenderResultOptions, theme, _context) {
			const details = result.details as BriefDetails | undefined;
			if (!details) return new Text(theme.fg("dim", "—"), 0, 0);
			return new Text(
				theme.fg("success", "\u2713 ") +
					theme.fg("muted", `${details.itemCount} items from ${details.originalLength} chars`),
				0,
				0,
			);
		},
	});
}
