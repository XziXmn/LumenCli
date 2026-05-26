/**
 * Lumen Web Tools
 *
 * Web 搜索和网页抓取工具。
 * - /web <query> — Exa 语义搜索（免费，无需 API key）
 * - /fetch <url> — Jina Reader 抓取网页（返回干净 Markdown）
 *
 * [Provenance] 来源: opencode websearch.ts (Exa MCP) + Jina Reader (r.jina.ai)
 * [Provenance] 移植方式: 参考重写
 * [Provenance] 后续计划: 移植 oh-my-pi src/web/scrapers/ 的 70+ 专用 scraper
 */

import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext, ToolRenderResultOptions } from "./extensions/types.ts";

const MAX_FETCH_SIZE = 80000; // 80KB max content
const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
const JINA_READER_PREFIX = "https://r.jina.ai/";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Simple in-memory cache for web fetches */
const fetchCache = new Map<string, { content: string; timestamp: number }>();

function getCached(key: string): string | undefined {
	const entry = fetchCache.get(key);
	if (!entry) return undefined;
	if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
		fetchCache.delete(key);
		return undefined;
	}
	return entry.content;
}

function setCache(key: string, content: string): void {
	fetchCache.set(key, { content, timestamp: Date.now() });
	// Evict old entries if cache grows too large
	if (fetchCache.size > 50) {
		const now = Date.now();
		for (const [k, v] of fetchCache) {
			if (now - v.timestamp > CACHE_TTL_MS) fetchCache.delete(k);
		}
	}
}

/** Truncate text to max length with indicator */
function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	return `${text.slice(0, maxLen)}\n\n[... 内容已截断，共 ${text.length} 字符]`;
}

/** Call Exa MCP for web search (free, no API key needed) */
async function exaSearch(query: string, numResults = 8): Promise<string | undefined> {
	try {
		const response = await fetch(EXA_MCP_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "web_search_exa",
					arguments: {
						query,
						type: "auto",
						numResults,
						livecrawl: "fallback",
					},
				},
			}),
			signal: AbortSignal.timeout(25000),
		});

		if (!response.ok) return undefined;

		const body = await response.text();
		// Parse MCP response (can be JSON or SSE)
		const trimmed = body.trim();

		// Try direct JSON parse
		if (trimmed.startsWith("{")) {
			try {
				const data = JSON.parse(trimmed);
				const text = data?.result?.content?.find((item: { text?: string }) => item.text)?.text;
				if (text) return text;
			} catch {
				// Not valid JSON, try SSE
			}
		}

		// Try SSE format (data: lines)
		for (const line of body.split("\n")) {
			if (!line.startsWith("data: ")) continue;
			try {
				const data = JSON.parse(line.substring(6));
				const text = data?.result?.content?.find((item: { text?: string }) => item.text)?.text;
				if (text) return text;
			} catch {}
		}

		return undefined;
	} catch {
		return undefined;
	}
}

/** Fetch URL via Jina Reader (returns clean Markdown) */
async function jinaFetch(url: string): Promise<{ ok: boolean; content: string; status?: number }> {
	try {
		const response = await fetch(`${JINA_READER_PREFIX}${url}`, {
			headers: {
				Accept: "text/markdown",
				"X-Return-Format": "markdown",
			},
			signal: AbortSignal.timeout(20000),
		});

		if (!response.ok) {
			return { ok: false, content: `HTTP ${response.status} ${response.statusText}`, status: response.status };
		}

		const text = await response.text();
		return { ok: true, content: text };
	} catch (error) {
		const msg = error instanceof Error ? error.message : "未知错误";
		return { ok: false, content: msg };
	}
}

/** Fallback: direct fetch with basic HTML→text conversion */
async function directFetch(url: string): Promise<{ ok: boolean; content: string }> {
	try {
		const response = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; LumenCli/1.0)",
				Accept: "text/html,text/plain,application/json",
			},
			signal: AbortSignal.timeout(15000),
		});

		if (!response.ok) {
			return { ok: false, content: `HTTP ${response.status} ${response.statusText}` };
		}

		const text = await response.text();
		const contentType = response.headers.get("content-type") ?? "";

		if (contentType.includes("json") || contentType.includes("text/plain")) {
			return { ok: true, content: text };
		}

		// Basic HTML stripping as last resort
		const cleaned = text
			.replace(/<script[\s\S]*?<\/script>/gi, "")
			.replace(/<style[\s\S]*?<\/style>/gi, "")
			.replace(/<[^>]+>/g, "")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&nbsp;/g, " ")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
		return { ok: true, content: cleaned };
	} catch (error) {
		const msg = error instanceof Error ? error.message : "未知错误";
		return { ok: false, content: msg };
	}
}

/** DuckDuckGo HTML search as fallback when Exa is unavailable */
async function duckduckgoSearch(query: string): Promise<string | undefined> {
	try {
		const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
		const response = await fetch(searchUrl, {
			headers: { "User-Agent": "Mozilla/5.0 (compatible; LumenCli/1.0)" },
			signal: AbortSignal.timeout(10000),
		});

		if (!response.ok) return undefined;
		const html = await response.text();

		const results: string[] = [];
		const resultRegex =
			/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

		for (const match of html.matchAll(resultRegex)) {
			if (results.length >= 8) break;
			const url = decodeURIComponent(match[1].replace(/.*uddg=/, "").replace(/&.*/, ""));
			const title = match[2].replace(/<[^>]+>/g, "").trim();
			const snippet = match[3].replace(/<[^>]+>/g, "").trim();
			if (url && title) {
				results.push(`- **${title}**\n  ${url}\n  ${snippet}`);
			}
		}

		return results.length > 0 ? results.join("\n\n") : undefined;
	} catch {
		return undefined;
	}
}

// ============================================================================
// Tool Schemas
// ============================================================================

const WebSearchParams = Type.Object(
	{
		query: Type.String({ description: "Search query" }),
		numResults: Type.Optional(Type.Number({ description: "Number of results (default 8, max 20)" })),
	},
	{ description: "Search the web for information" },
);

const WebFetchParams = Type.Object(
	{
		url: Type.String({ description: "URL to fetch (must start with http:// or https://)" }),
	},
	{ description: "Fetch and extract content from a web page" },
);

interface WebSearchDetails {
	query: string;
	provider: "exa" | "duckduckgo" | "failed";
	resultCount: number;
}

interface WebFetchDetails {
	url: string;
	provider: "jina" | "direct" | "failed";
	contentLength: number;
}

// ============================================================================
// Extension
// ============================================================================

export default function lumenWebExtension(pi: ExtensionAPI): void {
	// Register web_search as LLM-callable tool
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web for current information. Uses Exa semantic search with DuckDuckGo fallback. " +
			"Use when you need up-to-date information not available in the codebase.",
		promptSnippet: "web_search — search the internet for current information",
		parameters: WebSearchParams,

		async execute(
			_toolCallId: string,
			params: { query: string; numResults?: number },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			_ctx: ExtensionContext,
		) {
			const numResults = Math.min(params.numResults ?? 8, 20);

			// Try Exa first
			const exaResult = await exaSearch(params.query, numResults);
			if (exaResult) {
				return {
					content: [{ type: "text" as const, text: truncate(exaResult, MAX_FETCH_SIZE) }],
					details: { query: params.query, provider: "exa", resultCount: numResults } as WebSearchDetails,
				};
			}

			// Fallback to DuckDuckGo
			const ddgResult = await duckduckgoSearch(params.query);
			if (ddgResult) {
				return {
					content: [{ type: "text" as const, text: ddgResult }],
					details: { query: params.query, provider: "duckduckgo", resultCount: 8 } as WebSearchDetails,
				};
			}

			return {
				content: [{ type: "text" as const, text: "Search failed: both Exa and DuckDuckGo unavailable." }],
				details: { query: params.query, provider: "failed", resultCount: 0 } as WebSearchDetails,
			};
		},

		renderCall(args: { query?: string }, theme, _context) {
			const text = theme.fg("toolTitle", theme.bold("web_search ")) + theme.fg("muted", args.query ?? "");
			return new Text(text, 0, 0);
		},

		renderResult(result, _options: ToolRenderResultOptions, theme, _context) {
			const details = result.details as WebSearchDetails | undefined;
			const provider = details?.provider ?? "unknown";
			const icon = provider === "failed" ? theme.fg("error", "\u2717 ") : theme.fg("success", "\u2713 ");
			return new Text(icon + theme.fg("muted", `[${provider}] ${details?.query ?? ""}`), 0, 0);
		},
	});

	// Register web_fetch as LLM-callable tool
	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description:
			"Fetch and extract content from a web page as clean Markdown. " +
			"Uses Jina Reader for high-quality extraction with direct fetch fallback.",
		promptSnippet: "web_fetch — fetch a web page as clean markdown",
		parameters: WebFetchParams,

		async execute(
			_toolCallId: string,
			params: { url: string },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			_ctx: ExtensionContext,
		) {
			const fullUrl = params.url.startsWith("http") ? params.url : `https://${params.url}`;

			// Check cache first
			const cached = getCached(`fetch:${fullUrl}`);
			if (cached) {
				return {
					content: [{ type: "text" as const, text: cached }],
					details: { url: fullUrl, provider: "jina", contentLength: cached.length } as WebFetchDetails,
				};
			}

			// Try Jina Reader first
			const jina = await jinaFetch(fullUrl);
			if (jina.ok) {
				const content = truncate(jina.content, MAX_FETCH_SIZE);
				setCache(`fetch:${fullUrl}`, content);
				return {
					content: [{ type: "text" as const, text: content }],
					details: { url: fullUrl, provider: "jina", contentLength: jina.content.length } as WebFetchDetails,
				};
			}

			// Fallback to direct fetch
			const direct = await directFetch(fullUrl);
			if (direct.ok) {
				const content = truncate(direct.content, MAX_FETCH_SIZE);
				setCache(`fetch:${fullUrl}`, content);
				return {
					content: [{ type: "text" as const, text: content }],
					details: {
						url: fullUrl,
						provider: "direct",
						contentLength: direct.content.length,
					} as WebFetchDetails,
				};
			}

			return {
				content: [{ type: "text" as const, text: `Fetch failed: ${direct.content}` }],
				details: { url: fullUrl, provider: "failed", contentLength: 0 } as WebFetchDetails,
			};
		},

		renderCall(args: { url?: string }, theme, _context) {
			const text = theme.fg("toolTitle", theme.bold("web_fetch ")) + theme.fg("muted", args.url ?? "");
			return new Text(text, 0, 0);
		},

		renderResult(result, _options: ToolRenderResultOptions, theme, _context) {
			const details = result.details as WebFetchDetails | undefined;
			const provider = details?.provider ?? "unknown";
			const size = details?.contentLength ? `${(details.contentLength / 1024).toFixed(1)}KB` : "";
			const icon = provider === "failed" ? theme.fg("error", "\u2717 ") : theme.fg("success", "\u2713 ");
			return new Text(icon + theme.fg("muted", `[${provider}] ${size}`), 0, 0);
		},
	});

	// /fetch command (manual use)
	pi.registerCommand("fetch", {
		description: "抓取网页内容（Jina Reader → Markdown）",
		handler: async (args) => {
			const url = args.trim();
			if (!url) {
				pi.sendUserMessage("用法：/fetch <url>\n\n示例：/fetch https://docs.python.org/3/tutorial/");
				return;
			}

			const fullUrl = url.startsWith("http") ? url : `https://${url}`;

			// Try Jina Reader first (best quality)
			const jina = await jinaFetch(fullUrl);
			if (jina.ok) {
				const content = truncate(jina.content, MAX_FETCH_SIZE);
				pi.sendUserMessage(`**${fullUrl}** (via Jina Reader)\n\n${content}`);
				return;
			}

			// Fallback to direct fetch
			const direct = await directFetch(fullUrl);
			if (direct.ok) {
				const content = truncate(direct.content, MAX_FETCH_SIZE);
				pi.sendUserMessage(`**${fullUrl}** (direct fetch)\n\n${content}`);
				return;
			}

			pi.sendUserMessage(`抓取失败: ${direct.content}`);
		},
	});

	pi.registerCommand("web", {
		description: "搜索互联网（Exa 语义搜索，免费）",
		handler: async (args) => {
			const query = args.trim();
			if (!query) {
				pi.sendUserMessage("用法：/web <搜索词>\n\n示例：/web typescript generics tutorial");
				return;
			}

			// Try Exa first (best quality, semantic search)
			const exaResult = await exaSearch(query);
			if (exaResult) {
				pi.sendUserMessage(`搜索 "${query}" (Exa):\n\n${truncate(exaResult, MAX_FETCH_SIZE)}`);
				return;
			}

			// Fallback to DuckDuckGo
			const ddgResult = await duckduckgoSearch(query);
			if (ddgResult) {
				pi.sendUserMessage(`搜索 "${query}" (DuckDuckGo fallback):\n\n${ddgResult}`);
				return;
			}

			pi.sendUserMessage(`搜索 "${query}" 失败。Exa 和 DuckDuckGo 均无法连接。`);
		},
	});
}
