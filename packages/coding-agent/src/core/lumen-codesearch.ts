/**
 * Lumen CodeSearch Tool
 *
 * 编程专用搜索。优先用 GitHub code search API（免费、公开），
 * fallback 到 web_search。
 *
 * 与 web_search 的区别：
 * - 结果限定为代码文件（带上下文的代码片段）
 * - 支持语言过滤（language:typescript, language:rust）
 * - 支持 repo 过滤（repo:owner/name）
 *
 * [Provenance] 来源: Claude Code `CodeSearchTool` + opencode `codesearch.ts`
 * [Provenance] 移植方式: 自研（使用 GitHub 公开 API 替代 Exa Code）
 */

import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext, ToolRenderResultOptions } from "./extensions/types.js";

// ============================================================================
// Types
// ============================================================================

interface CodeSearchDetails {
	query: string;
	provider: "github" | "failed";
	resultCount: number;
}

interface GithubCodeResult {
	name: string;
	path: string;
	repository: {
		full_name: string;
		html_url: string;
	};
	html_url: string;
	text_matches?: Array<{
		fragment: string;
		matches: Array<{ text: string; indices: number[] }>;
	}>;
}

// ============================================================================
// GitHub Code Search
// ============================================================================

async function githubCodeSearch(query: string, perPage = 10): Promise<GithubCodeResult[]> {
	// Build URL with proper encoding
	const url = `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=${perPage}`;

	// GitHub code search requires authentication; without a token we use unauthenticated
	// requests which are rate-limited to 10 req/min and may hit 403s for code search.
	// Users can set GITHUB_TOKEN or GH_TOKEN for better results.
	const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	const headers: Record<string, string> = {
		Accept: "application/vnd.github.v3.text-match+json",
		"User-Agent": "lumen-agent/0.1",
	};
	if (token) headers.Authorization = `Bearer ${token}`;

	try {
		const response = await fetch(url, {
			headers,
			signal: AbortSignal.timeout(15_000),
		});

		if (!response.ok) {
			if (response.status === 403 && !token) {
				throw new Error(
					"GitHub code search requires authentication. Set GITHUB_TOKEN or GH_TOKEN environment variable (needs public_repo scope).",
				);
			}
			throw new Error(`GitHub API returned ${response.status}: ${await response.text().catch(() => "")}`);
		}

		const data = (await response.json()) as { items?: GithubCodeResult[] };
		return data.items ?? [];
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			throw new Error("GitHub code search timed out after 15s");
		}
		throw err;
	}
}

function formatGithubResults(results: GithubCodeResult[]): string {
	if (results.length === 0) return "No results.";

	const lines: string[] = [];
	for (const r of results) {
		lines.push(`### ${r.repository.full_name}/${r.path}`);
		lines.push(r.html_url);
		if (r.text_matches && r.text_matches.length > 0) {
			const fragment = r.text_matches[0].fragment.slice(0, 400);
			lines.push("```");
			lines.push(fragment);
			lines.push("```");
		}
		lines.push("");
	}
	return lines.join("\n");
}

// ============================================================================
// Schema
// ============================================================================

const CodeSearchParams = Type.Object(
	{
		query: Type.String({
			description:
				"Search query. Use GitHub's code search syntax: 'language:typescript repo:owner/name', " +
				"'extension:ts path:src', etc.",
		}),
		num_results: Type.Optional(Type.Number({ description: "Number of results (default 10, max 30)" })),
	},
	{ description: "Search public GitHub code for examples and implementations" },
);

// ============================================================================
// Extension
// ============================================================================

export default function lumenCodeSearchExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "code_search",
		label: "Code Search",
		description:
			"Search public GitHub code for examples and implementations. " +
			"Supports GitHub's advanced syntax: language:, repo:, path:, extension:. " +
			"Requires GITHUB_TOKEN or GH_TOKEN env var for best results.",
		promptSnippet: "code_search — search public GitHub code",
		promptGuidelines: [
			"Use code_search when you need concrete implementation examples from real projects.",
			"Refine queries with language:/repo:/path: filters to reduce noise.",
			"For API documentation or tutorials, use web_search instead.",
		],
		parameters: CodeSearchParams,

		async execute(
			_toolCallId: string,
			params: { query: string; num_results?: number },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			_ctx: ExtensionContext,
		) {
			const perPage = Math.min(params.num_results ?? 10, 30);

			try {
				const results = await githubCodeSearch(params.query, perPage);
				if (results.length === 0) {
					return {
						content: [{ type: "text" as const, text: `No results for "${params.query}".` }],
						details: { query: params.query, provider: "github", resultCount: 0 } as CodeSearchDetails,
					};
				}
				return {
					content: [{ type: "text" as const, text: formatGithubResults(results) }],
					details: {
						query: params.query,
						provider: "github",
						resultCount: results.length,
					} as CodeSearchDetails,
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text" as const, text: `Code search failed: ${msg}` }],
					details: { query: params.query, provider: "failed", resultCount: 0 } as CodeSearchDetails,
				};
			}
		},

		renderCall(args: { query?: string }, theme, _context) {
			const text = theme.fg("toolTitle", theme.bold("code_search ")) + theme.fg("muted", args.query ?? "");
			return new Text(text, 0, 0);
		},

		renderResult(result, _options: ToolRenderResultOptions, theme, _context) {
			const details = result.details as CodeSearchDetails | undefined;
			if (!details) return new Text(theme.fg("dim", "—"), 0, 0);
			const icon = details.provider === "failed" ? theme.fg("error", "\u2717 ") : theme.fg("success", "\u2713 ");
			return new Text(icon + theme.fg("muted", `${details.resultCount} results [${details.provider}]`), 0, 0);
		},
	});
}
