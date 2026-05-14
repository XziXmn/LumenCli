/**
 * Lumen AskUser Tool
 *
 * 结构化提问工具。LLM 可通过此 tool 向用户提出选择题或确认。
 * 支持单选、多选、文本输入、确认等模式。
 * 非交互模式下自动选择默认值或跳过。
 *
 * [Provenance] 来源: Claude Code src/tools/AskUserQuestionTool/ + pi examples/extensions/question.ts
 * [Provenance] 移植方式: 参考重写，适配 extension API
 */

import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext, ToolRenderResultOptions } from "./extensions/types.js";

// ============================================================================
// Types
// ============================================================================

interface AskUserDetails {
	question: string;
	mode: "select" | "confirm" | "text";
	options?: string[];
	answer: string | null;
	cancelled: boolean;
}

// ============================================================================
// Schema
// ============================================================================

const AskUserParams = Type.Object(
	{
		question: Type.String({ description: "The question to ask the user" }),
		mode: Type.Union([Type.Literal("select"), Type.Literal("confirm"), Type.Literal("text")], {
			description: "Interaction mode: select (pick from options), confirm (yes/no), text (free input)",
		}),
		options: Type.Optional(
			Type.Array(Type.String({ description: "option label" }), {
				description: "Options for select mode (required when mode=select)",
			}),
		),
		default: Type.Optional(Type.String({ description: "Default value for non-interactive mode" })),
	},
	{ description: "Ask the user a question and wait for their response" },
);

// ============================================================================
// Extension
// ============================================================================

export default function lumenAskUserExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ask_user",
		label: "Ask User",
		description:
			"Ask the user a question when you need clarification or a decision. " +
			"Modes: select (pick from options), confirm (yes/no), text (free-form input). " +
			"Use sparingly — only when the answer genuinely cannot be inferred from context.",
		promptSnippet: "ask_user — ask the user a question (select/confirm/text)",
		promptGuidelines: [
			"Use ask_user only when you genuinely need user input to proceed. Do not ask obvious questions.",
			"For select mode, provide 2-5 clear, distinct options. Include a sensible default.",
			"For confirm mode, phrase the question so yes/no is unambiguous.",
		],
		parameters: AskUserParams,

		async execute(
			_toolCallId: string,
			params: { question: string; mode: "select" | "confirm" | "text"; options?: string[]; default?: string },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			ctx: ExtensionContext,
		) {
			const { question, mode, options } = params;

			// Non-interactive mode: use default or skip
			if (!ctx.hasUI) {
				const defaultVal = params.default ?? (mode === "confirm" ? "yes" : null);
				if (defaultVal) {
					return {
						content: [{ type: "text" as const, text: `[non-interactive] Auto-selected: ${defaultVal}` }],
						details: { question, mode, options, answer: defaultVal, cancelled: false } as AskUserDetails,
					};
				}
				return {
					content: [{ type: "text" as const, text: "[non-interactive] Skipped (no default available)" }],
					details: { question, mode, options, answer: null, cancelled: true } as AskUserDetails,
				};
			}

			// Interactive mode: use ctx.ui.custom for selection
			const result = await ctx.ui.custom<{ answer: string } | null>((tui, theme, _kb, done) => {
				let selectedIndex = 0;
				let textBuffer = "";
				let cachedLines: string[] | undefined;

				const allOptions = buildOptions(mode, options);

				function refresh() {
					cachedLines = undefined;
					tui.requestRender();
				}

				function handleInput(data: string) {
					if (mode === "text") {
						// Simple text input handling
						if (data === "\r" || data === "\n") {
							const trimmed = textBuffer.trim();
							if (trimmed) {
								done({ answer: trimmed });
							}
							return;
						}
						if (data === "\x1b" || data === "\x03") {
							done(null);
							return;
						}
						if (data === "\x7f" || data === "\b") {
							textBuffer = textBuffer.slice(0, -1);
							refresh();
							return;
						}
						if (data.length === 1 && data.charCodeAt(0) >= 32) {
							textBuffer += data;
							refresh();
							return;
						}
						return;
					}

					// Select/confirm mode
					if (data === "\x1b[A" || data === "k") {
						// Up
						selectedIndex = Math.max(0, selectedIndex - 1);
						refresh();
					} else if (data === "\x1b[B" || data === "j") {
						// Down
						selectedIndex = Math.min(allOptions.length - 1, selectedIndex + 1);
						refresh();
					} else if (data === "\r" || data === "\n") {
						done({ answer: allOptions[selectedIndex] });
					} else if (data === "\x1b" || data === "\x03") {
						done(null);
					} else if (data.length === 1) {
						// Number key selection
						const num = Number.parseInt(data, 10);
						if (num >= 1 && num <= allOptions.length) {
							done({ answer: allOptions[num - 1] });
						}
					}
				}

				function render(width: number): string[] {
					if (cachedLines) return cachedLines;

					const lines: string[] = [];
					lines.push(theme.fg("accent", "\u2500".repeat(Math.min(width, 60))));
					lines.push(theme.fg("text", ` ${question}`));
					lines.push("");

					if (mode === "text") {
						lines.push(`  ${theme.fg("muted", "Your answer:")}`);
						lines.push(`  ${theme.fg("accent", "> ")}${textBuffer}\u2588`);
						lines.push("");
						lines.push(theme.fg("dim", "  Enter to submit, Esc to cancel"));
					} else {
						for (let i = 0; i < allOptions.length; i++) {
							const selected = i === selectedIndex;
							const prefix = selected ? theme.fg("accent", "> ") : "  ";
							const label = selected
								? theme.fg("accent", `${i + 1}. ${allOptions[i]}`)
								: theme.fg("text", `${i + 1}. ${allOptions[i]}`);
							lines.push(`${prefix}${label}`);
						}
						lines.push("");
						lines.push(theme.fg("dim", "  Up/Down or number to select, Enter to confirm, Esc to cancel"));
					}

					lines.push(theme.fg("accent", "\u2500".repeat(Math.min(width, 60))));
					cachedLines = lines;
					return lines;
				}

				return {
					render,
					invalidate: () => {
						cachedLines = undefined;
					},
					handleInput,
				};
			});

			if (!result) {
				return {
					content: [{ type: "text" as const, text: "User cancelled the selection." }],
					details: { question, mode, options, answer: null, cancelled: true } as AskUserDetails,
				};
			}

			return {
				content: [{ type: "text" as const, text: `User answered: ${result.answer}` }],
				details: { question, mode, options, answer: result.answer, cancelled: false } as AskUserDetails,
			};
		},

		renderCall(args: { question?: string; mode?: string; options?: string[] }, theme, _context) {
			const modeLabel = args.mode ?? "select";
			let text =
				theme.fg("toolTitle", theme.bold("ask_user ")) + theme.fg("muted", `[${modeLabel}] ${args.question ?? ""}`);
			if (args.options && args.options.length > 0) {
				text += `\n${theme.fg("dim", `  Options: ${args.options.join(", ")}`)}`;
			}
			return new Text(text, 0, 0);
		},

		renderResult(
			result: { content: Array<{ type: string; text?: string }>; details?: AskUserDetails },
			_options: ToolRenderResultOptions,
			theme,
			_context,
		) {
			const details = result.details;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? (text.text ?? "") : "", 0, 0);
			}

			if (details.cancelled) {
				return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			}

			return new Text(theme.fg("success", "\u2713 ") + theme.fg("accent", details.answer ?? ""), 0, 0);
		},
	});
}

// ============================================================================
// Helpers
// ============================================================================

function buildOptions(mode: "select" | "confirm" | "text", options?: string[]): string[] {
	if (mode === "confirm") return ["Yes", "No"];
	if (mode === "select" && options && options.length > 0) return options;
	return ["Option 1", "Option 2"];
}
