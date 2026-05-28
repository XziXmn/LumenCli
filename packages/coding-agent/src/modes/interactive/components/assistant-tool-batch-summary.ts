import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { type Component, Container, Spacer, Text } from "@earendil-works/pi-tui";
import { createAllToolDefinitions, type ToolName } from "../../../core/tools/index.ts";
import { getTextOutput } from "../../../core/tools/render-utils.ts";
import { formatPathRelativeToCwdOrAbsolute } from "../../../utils/paths.ts";
import { theme } from "../theme/theme.ts";
import { renderToolResponseLine, renderToolStatusDot, titleForTool } from "./assistant-tool-summary.ts";
import { TUI_COPY } from "./interactive-strings.ts";

type ToolResultMessage = Extract<AgentMessage, { role: "toolResult" }>;

interface BatchItem {
	toolCallId?: string;
	toolName: string;
	args: Record<string, unknown>;
	result?: ToolResultMessage;
}

class ToolResponseContainer extends Container {
	private readonly content: Component;

	constructor(content: Component) {
		super();
		this.content = content;
	}

	override invalidate(): void {
		this.content.invalidate?.();
	}

	override render(width: number): string[] {
		const gutter = theme.fg("dim", "  ⎿ ");
		const gutterWidth = 4;
		const contentWidth = Math.max(1, width - gutterWidth);
		const rawContentLines = this.content.render(contentWidth);
		const firstVisibleIndex = rawContentLines.findIndex((line) => line.trim().length > 0);
		const contentLines = firstVisibleIndex === -1 ? [] : rawContentLines.slice(firstVisibleIndex);
		if (contentLines.length === 0) {
			return [];
		}
		return contentLines.map((line, index) => `${index === 0 ? gutter : " ".repeat(gutterWidth)}${line}`);
	}
}

function formatBatchSummary(items: BatchItem[]): string {
	const completedCount = items.filter((item) => item.result).length;
	const total = items.length;
	const label = `${total} tool use${total === 1 ? "" : "s"}`;
	return completedCount === items.length
		? TUI_COPY.toolSummary.completed(label)
		: TUI_COPY.toolSummary.runningBatch(label);
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
	private readonly addLeadingMargin: boolean;
	private readonly builtInDefinitions: ReturnType<typeof createAllToolDefinitions>;
	private wrappedResultRendererComponents = new Map<string, Component>();

	constructor(items: BatchItem[], cwd: string, options?: { addLeadingMargin?: boolean }) {
		super();
		this.items = items;
		this.cwd = cwd;
		this.addLeadingMargin = options?.addLeadingMargin ?? true;
		this.builtInDefinitions = createAllToolDefinitions(cwd);
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

	private createWrappedResultComponent(key: string, component: Component): Component {
		const existing = this.wrappedResultRendererComponents.get(key);
		if (existing === component) {
			return component;
		}
		const wrapped = new ToolResponseContainer(component);
		this.wrappedResultRendererComponents.set(key, wrapped);
		return wrapped;
	}

	private updateDisplay(): void {
		this.clear();
		if (this.items.length === 0) return;
		const allCompleted = this.items.every((item) => item.result);
		const hasError = this.items.some((item) => item.result?.isError);
		const status = !allCompleted ? "pending" : hasError ? "error" : "success";

		if (this.addLeadingMargin) {
			this.addChild(new Spacer(1));
		}
		this.addChild(new Text(`${renderToolStatusDot(status)} ${theme.bold(formatBatchSummary(this.items))}`, 1, 0));
		const hint = latestHint(this.items, this.cwd);
		if (hint && !this.expanded) {
			this.addChild(new Text(renderToolResponseLine(hint), 0, 0));
		}

		if (!this.expanded) return;

		for (const item of this.items) {
			// Expanded batch items are subordinate to the batch heading.
			// Keep the title bold for readability, but indent it and avoid
			// repeating the top-level response gutter.
			const title = titleForTool(item.toolName, item.args, this.cwd);
			this.addChild(new Text(theme.fg("muted", `    ${theme.bold(title)}`), 0, 0));

			if (!item.result) {
				this.addChild(new Text(renderToolResponseLine(TUI_COPY.toolSummary.running, "muted"), 0, 0));
				continue;
			}

			// Use built-in tool renderer for richer highlighting when available.
			const definition = this.builtInDefinitions[item.toolName as ToolName];
			if (definition?.renderResult) {
				const rawComponent = definition.renderResult(
					{ content: item.result.content as any, details: item.result.details },
					{ expanded: true, isPartial: false },
					theme,
					{
						args: item.args,
						toolCallId: item.result.toolCallId,
						invalidate: () => {},
						lastComponent: undefined,
						state: {},
						cwd: this.cwd,
						executionStarted: true,
						argsComplete: true,
						isPartial: false,
						expanded: true,
						showImages: true,
						isError: item.result.isError ?? false,
					},
				);
				const component = this.createWrappedResultComponent(item.toolCallId ?? item.toolName, rawComponent);
				this.addChild(component);
				continue;
			}

			// Fallback: plain output text.
			const output = getTextOutput(item.result, false).trim();
			if (output) {
				this.addChild(
					this.createWrappedResultComponent(
						item.toolCallId ?? item.toolName,
						new Text(theme.fg("toolOutput", output), 0, 0),
					),
				);
			}
		}
	}
}
