import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { getTextOutput } from "../../../core/tools/render-utils.ts";
import { formatPathRelativeToCwdOrAbsolute } from "../../../utils/paths.ts";
import { theme } from "../theme/theme.ts";
import { renderToolResponseLine, renderToolStatusDot, summaryForTool, titleForTool } from "./assistant-tool-summary.ts";
import { TUI_COPY } from "./tui-copy.ts";

type ToolResultMessage = Extract<AgentMessage, { role: "toolResult" }>;

interface BatchItem {
	toolCallId?: string;
	toolName: string;
	args: Record<string, unknown>;
	result?: ToolResultMessage;
}

function formatBatchSummary(items: BatchItem[]): string {
	const completedCount = items.filter((item) => item.result).length;
	const counts = new Map<string, number>();
	for (const item of items) {
		const name = item.toolName;
		counts.set(name, (counts.get(name) ?? 0) + 1);
	}
	const parts: string[] = [];
	for (const [name, count] of counts) {
		parts.push(`${count} ${name}`);
	}
	return completedCount === items.length
		? TUI_COPY.toolSummary.completed(parts.join(", "))
		: TUI_COPY.toolSummary.runningBatch(parts.join(", "));
}

function latestHint(items: BatchItem[], cwd: string): string | undefined {
	const latest = items.at(-1);
	if (!latest) return undefined;
	const args = latest.args;
	if (typeof args.path === "string" && args.path.length > 0) {
		return formatPathRelativeToCwdOrAbsolute(args.path, cwd);
	}
	if (typeof args.file_path === "string" && args.file_path.length > 0) {
		return formatPathRelativeToCwdOrAbsolute(args.file_path, cwd);
	}
	if (typeof args.pattern === "string" && args.pattern.length > 0) {
		return `"${args.pattern}"`;
	}
	if (typeof args.command === "string" && args.command.length > 0) {
		return args.command;
	}
	return undefined;
}

export class AssistantToolBatchSummaryComponent extends Container {
	private expanded = false;
	private readonly items: BatchItem[];
	private readonly cwd: string;

	constructor(items: BatchItem[], cwd: string) {
		super();
		this.items = items;
		this.cwd = cwd;
		this.updateDisplay();
	}

	setExpanded(expanded: boolean): void {
		this.expanded = expanded;
		this.updateDisplay();
	}

	addOrUpdateToolCall(toolName: string, args: Record<string, unknown>, toolCallId: string): void {
		const existing = this.items.find((item) => item.toolCallId === toolCallId);
		if (existing) {
			existing.toolCallId = toolCallId;
			existing.args = args;
			existing.toolName = toolName;
			this.updateDisplay();
			return;
		}

		this.items.push({ toolCallId, toolName, args });
		this.updateDisplay();
	}

	updateResult(
		toolCallId: string,
		result: ToolResultMessage,
		toolName?: string,
		args?: Record<string, unknown>,
	): void {
		const byResultId = this.items.find((item) => item.toolCallId === toolCallId);
		if (byResultId) {
			byResultId.toolCallId = toolCallId;
			if (toolName) byResultId.toolName = toolName;
			if (args) byResultId.args = args;
			byResultId.result = result;
			this.updateDisplay();
			return;
		}

		const pending = toolName ? this.items.find((item) => !item.result && item.toolName === toolName) : undefined;
		if (pending) {
			pending.toolCallId = toolCallId;
			if (args) pending.args = args;
			pending.result = result;
			this.updateDisplay();
			return;
		}

		this.items.push({ toolCallId, toolName: toolName ?? result.toolName, args: args ?? {}, result });
		this.updateDisplay();
	}

	hasPendingToolCall(toolCallId: string): boolean {
		return this.items.some((item) => item.toolCallId === toolCallId);
	}

	override invalidate(): void {
		super.invalidate();
		this.updateDisplay();
	}

	private updateDisplay(): void {
		this.clear();
		if (this.items.length === 0) return;
		const allCompleted = this.items.every((item) => item.result);
		const hasError = this.items.some((item) => item.result?.isError);
		const status = !allCompleted ? "pending" : hasError ? "error" : "success";

		this.addChild(new Spacer(1));
		this.addChild(new Text(`${renderToolStatusDot(status)} ${theme.bold(formatBatchSummary(this.items))}`, 1, 0));
		const hint = latestHint(this.items, this.cwd);
		if (hint) {
			this.addChild(new Text(renderToolResponseLine(hint), 0, 0));
		}

		if (!this.expanded) return;

		for (const item of this.items) {
			this.addChild(new Text(renderToolResponseLine(titleForTool(item.toolName, item.args, this.cwd)), 0, 0));
			if (!item.result) {
				this.addChild(new Text(renderToolResponseLine(TUI_COPY.toolSummary.running, "muted"), 0, 0));
				continue;
			}
			this.addChild(new Text(renderToolResponseLine(summaryForTool(item.toolName, item.args, item.result)), 0, 0));
			const output = getTextOutput(item.result, false).trim();
			if (output) {
				this.addChild(new Text(theme.fg("toolOutput", output), 4, 0));
			}
		}
	}
}
