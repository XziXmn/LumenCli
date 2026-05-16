import { type ColorInput, SyntaxStyle, type ThemeTokenStyle } from "@opentui/core";
import type { TuiTheme } from "./theme.js";

/**
 * 主题级语法样式：根据 Lumen 主题派生 OpenTUI 的 SyntaxStyle 单例。
 * 同一主题对象复用同一份样式，避免每次渲染都重建 native 资源。
 *
 * 用法：
 *   <code filetype="markdown" streaming={true} syntaxStyle={getSyntax(theme())} ... />
 */
const cache = new WeakMap<TuiTheme, SyntaxStyle>();
const subtleCache = new WeakMap<TuiTheme, SyntaxStyle>();

export function getSyntax(theme: TuiTheme): SyntaxStyle {
	let style = cache.get(theme);
	if (!style) {
		style = SyntaxStyle.fromTheme(buildRules(theme));
		cache.set(theme, style);
	}
	return style;
}

export function getSubtleSyntax(theme: TuiTheme): SyntaxStyle {
	let style = subtleCache.get(theme);
	if (!style) {
		// thinking 块用 textMuted 整体覆盖前景色，模拟 OpenCode 的低透明度变体。
		const muted = theme.textMuted;
		const rules = buildRules(theme).map((rule) => ({
			...rule,
			style: {
				...rule.style,
				foreground: rule.style.foreground ? muted : undefined,
			},
		}));
		style = SyntaxStyle.fromTheme(rules);
		subtleCache.set(theme, style);
	}
	return style;
}

function buildRules(theme: TuiTheme): ThemeTokenStyle[] {
	return [
		// 默认前景
		{ scope: ["default"], style: { foreground: theme.text } },
		// Markdown 块级
		{
			scope: ["markup.heading", "markup.heading.1", "markup.heading.2"],
			style: { foreground: theme.primary, bold: true },
		},
		{
			scope: ["markup.heading.3", "markup.heading.4", "markup.heading.5", "markup.heading.6"],
			style: { foreground: theme.secondary, bold: true },
		},
		{ scope: ["markup.bold"], style: { foreground: theme.text, bold: true } },
		{ scope: ["markup.italic"], style: { foreground: theme.text, italic: true } },
		{ scope: ["markup.strikethrough"], style: { foreground: theme.textMuted } },
		{
			scope: ["markup.list", "markup.list.unnumbered", "markup.list.numbered"],
			style: { foreground: theme.warning },
		},
		{
			scope: ["markup.link", "markup.link.label", "markup.link.url"],
			style: { foreground: theme.info, underline: true },
		},
		{ scope: ["markup.raw", "markup.raw.inline"], style: { foreground: theme.success } },
		{ scope: ["markup.raw.block"], style: { foreground: theme.success } },
		{ scope: ["markup.quote"], style: { foreground: theme.textMuted, italic: true } },
		// 通用代码语法（用于 fenced block 内带语言标记时的着色）
		{ scope: ["comment", "comment.documentation"], style: { foreground: theme.textMuted, italic: true } },
		{ scope: ["string", "symbol", "character.special"], style: { foreground: theme.success } },
		{ scope: ["number", "boolean", "constant"], style: { foreground: theme.warning } },
		{
			scope: [
				"keyword",
				"keyword.return",
				"keyword.conditional",
				"keyword.repeat",
				"keyword.coroutine",
				"keyword.import",
			],
			style: { foreground: theme.primary, italic: true },
		},
		{ scope: ["keyword.type", "type", "module", "class"], style: { foreground: theme.secondary, bold: true } },
		{
			scope: [
				"keyword.function",
				"function",
				"function.method",
				"function.method.call",
				"function.call",
				"constructor",
			],
			style: { foreground: theme.info },
		},
		{ scope: ["operator", "keyword.operator", "punctuation.delimiter"], style: { foreground: theme.textMuted } },
		{ scope: ["punctuation", "punctuation.bracket"], style: { foreground: theme.textMuted } },
		{
			scope: ["variable", "variable.parameter", "variable.member", "property", "parameter"],
			style: { foreground: theme.text },
		},
		{
			scope: [
				"variable.builtin",
				"type.builtin",
				"function.builtin",
				"module.builtin",
				"constant.builtin",
				"variable.super",
			],
			style: { foreground: theme.error },
		},
		{ scope: ["string.escape", "string.regexp"], style: { foreground: theme.warning } },
	];
}

// 让 TS 在禁用 unused 时也通过：导出未直接使用的类型别名以备将来扩展。
export type { ColorInput };
