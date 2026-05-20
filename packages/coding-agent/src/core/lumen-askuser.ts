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

export function formatAskUserFooterStatus(question: string): string {
	return `awaiting input · ${question}`;
}

export function formatAskUserResultSummary(details: AskUserDetails): string {
	if (details.cancelled) {
		return "Input cancelled";
	}
	return details.answer ? `Input received · ${details.answer}` : "Input received";
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

			ctx.ui.setSpinnerState({
				banner: {
					kind: "input",
					title: "等待你的输入",
					detail: question,
				},
			});
			try {
				const answer =
					mode === "text"
						? await ctx.ui.input(question, params.default, { signal: _signal })
						: await ctx.ui.select("Ask User", buildOptions(mode, options), { signal: _signal });

				if (!answer) {
					return {
						content: [{ type: "text" as const, text: "User cancelled the selection." }],
						details: { question, mode, options, answer: null, cancelled: true } as AskUserDetails,
					};
				}

				return {
					content: [{ type: "text" as const, text: `User answered: ${answer}` }],
					details: { question, mode, options, answer, cancelled: false } as AskUserDetails,
				};
			} finally {
				ctx.ui.setSpinnerState(undefined);
			}
		},

		renderCall(args: { question?: string; mode?: string; options?: string[] }, theme, _context) {
			const modeLabel = args.mode ?? "select";
			const text =
				theme.fg("toolTitle", theme.bold("ask_user ")) + theme.fg("muted", `[${modeLabel}] ${args.question ?? ""}`);
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

			const prefix = theme.fg("dim", "⎿ ");
			const color = details.cancelled ? "warning" : "dim";
			return new Text(prefix + theme.fg(color, formatAskUserResultSummary(details)), 0, 0);
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
