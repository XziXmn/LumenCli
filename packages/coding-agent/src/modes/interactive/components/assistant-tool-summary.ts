import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { type Component, Container, Spacer, Text } from "@earendil-works/pi-tui";
import { createAllToolDefinitions, type ToolName } from "../../../core/tools/index.ts";
import { getTextOutput } from "../../../core/tools/render-utils.ts";
import { formatPathRelativeToCwdOrAbsolute } from "../../../utils/paths.ts";
import { theme } from "../theme/theme.ts";
import { TUI_COPY } from "./interactive-strings.ts";

type ToolResultMessage = Extract<AgentMessage, { role: "toolResult" }>;
type ToolRowStatus = "pending" | "success" | "error";

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

export function renderToolStatusDot(status: ToolRowStatus): string {
	switch (status) {
		case "success":
			return theme.fg("success", "●");
		case "error":
			return theme.fg("error", "●");
		default:
			return theme.fg("dim", "●");
	}
}

export function renderToolResponseLine(text: string, tone: "default" | "muted" = "default"): string {
	const gutter = theme.fg("dim", "  ⎿ ");
	const body = tone === "muted" ? theme.fg("muted", text) : text;
	return `${gutter}${body}`;
}

export function renderToolHintLine(text: string, tone: "default" | "muted" = "default"): string {
	const gutter = theme.fg("dim", "  ⎿  ");
	const body = tone === "muted" ? theme.fg("muted", text) : text;
	return `${gutter}${body}`;
}

export function renderToolResponseParts(label: string, value?: string, tone: "default" | "muted" = "default"): string {
	const gutter = theme.fg("dim", "  ⎿ ");
	const labelText = tone === "muted" ? theme.fg("muted", label) : label;
	const valueText = value ? (tone === "muted" ? theme.fg("muted", value) : value) : "";
	return `${gutter}${labelText}${valueText}`;
}

function lineCount(text: string): number {
	const normalized = text.replace(/(?:\r?\n)+$/, "");
	return normalized ? normalized.split(/\r?\n/).length : 0;
}

export function titleForTool(toolName: string, args: Record<string, unknown>, cwd: string): string {
	const path =
		typeof args.path === "string" && args.path.length > 0
			? formatPathRelativeToCwdOrAbsolute(args.path, cwd)
			: typeof args.file_path === "string" && args.file_path.length > 0
				? formatPathRelativeToCwdOrAbsolute(args.file_path, cwd)
				: undefined;

	switch (toolName) {
		case "read":
			return `Read(${path ?? "file"})`;
		case "write":
			return `Write(${path ?? "file"})`;
		case "edit": {
			const oldText = typeof args.oldText === "string" ? args.oldText : undefined;
			const oldString = typeof args.old_string === "string" ? args.old_string : undefined;
			const edits = Array.isArray(args.edits) ? args.edits : undefined;
			const createFromEdits =
				edits !== undefined &&
				edits.length > 0 &&
				edits.every(
					(entry) =>
						typeof entry === "object" &&
						entry !== null &&
						typeof (entry as { oldText?: unknown }).oldText === "string" &&
						(entry as { oldText: string }).oldText.length === 0,
				);
			const isCreate =
				(typeof oldText === "string" && oldText.length === 0) ||
				(typeof oldString === "string" && oldString.length === 0) ||
				createFromEdits;
			return `${isCreate ? "Create" : "Update"}(${path ?? "file"})`;
		}
		case "grep":
		case "find": {
			const pattern = typeof args.pattern === "string" ? args.pattern : "";
			const pathText = path ?? ".";
			return `Search(pattern: "${pattern}", path: "${pathText}")`;
		}
		case "ls":
			return `List(${path ?? "."})`;
		case "bash": {
			const command = typeof args.command === "string" ? args.command : "...";
			return `Bash(${command})`;
		}
		default:
			return toolName;
	}
}

export function summaryForTool(toolName: string, args: Record<string, unknown>, result: ToolResultMessage): string {
	const output = getTextOutput(result, false).trim();
	const hasImage = result.content.some((item) => item.type === "image");

	switch (toolName) {
		case "todo":
			return output === "Todo list cleared." ? output : "Updated todo list";
		case "read":
			if (hasImage) return "Read image";
			return `Read ${lineCount(output)} line${lineCount(output) === 1 ? "" : "s"}`;
		case "write": {
			const content = typeof args.content === "string" ? args.content : "";
			const count = lineCount(content);
			return `Wrote ${count} line${count === 1 ? "" : "s"}`;
		}
		case "edit":
			return "Updated file";
		case "grep": {
			const matches = output ? output.split("\n").filter(Boolean) : [];
			const fileCount = new Set(matches.map((line) => line.split(":")[0]).filter(Boolean)).size;
			return `${matches.length} match${matches.length === 1 ? "" : "es"} in ${fileCount} file${fileCount === 1 ? "" : "s"}`;
		}
		case "find": {
			const count = output ? output.split("\n").filter(Boolean).length : 0;
			return `Found ${count} file${count === 1 ? "" : "s"}`;
		}
		case "ls": {
			const count = output ? output.split("\n").filter(Boolean).length : 0;
			return `Listed ${count} item${count === 1 ? "" : "s"}`;
		}
		case "bash": {
			const count = output ? output.split("\n").filter(Boolean).length : 0;
			return `Command completed · ${count} line${count === 1 ? "" : "s"} output`;
		}
		default:
			return output.split("\n")[0] ?? "Done";
	}
}

export class AssistantToolSummaryComponent extends Container {
	private expanded = false;
	private result: ToolResultMessage | undefined;
	private readonly toolName: string;
	private args: Record<string, unknown>;
	private readonly cwd: string;
	private readonly addLeadingMargin: boolean;
	private readonly builtInDefinitions: ReturnType<typeof createAllToolDefinitions>;
	private wrappedResultRendererComponent?: Component;

	constructor(
		toolName: string,
		args: Record<string, unknown>,
		result: ToolResultMessage | undefined,
		cwd: string,
		options?: { addLeadingMargin?: boolean },
	) {
		super();
		this.toolName = toolName;
		this.args = args;
		this.result = result;
		this.cwd = cwd;
		this.addLeadingMargin = options?.addLeadingMargin ?? true;
		this.builtInDefinitions = createAllToolDefinitions(cwd);
		this.updateDisplay();
	}

	setExpanded(expanded: boolean): void {
		this.expanded = expanded;
		this.updateDisplay();
	}

	updateArgs(args: Record<string, unknown>): void {
		this.args = args;
		this.updateDisplay();
	}

	updateResult(result: ToolResultMessage): void {
		this.result = result;
		this.updateDisplay();
	}

	override invalidate(): void {
		super.invalidate();
		this.updateDisplay();
	}

	private createWrappedResultComponent(component: Component): Component {
		if (component === this.wrappedResultRendererComponent) {
			return component;
		}
		const wrapped = new ToolResponseContainer(component);
		this.wrappedResultRendererComponent = wrapped;
		return wrapped;
	}

	private updateDisplay(): void {
		this.clear();
		const title = titleForTool(this.toolName, this.args, this.cwd);
		const status: ToolRowStatus = !this.result ? "pending" : this.result.isError ? "error" : "success";

		if (this.addLeadingMargin) {
			this.addChild(new Spacer(1));
		}
		this.addChild(new Text(`${renderToolStatusDot(status)} ${theme.bold(title)}`, 1, 0));

		if (!this.result) {
			this.addChild(new Text(renderToolResponseLine(TUI_COPY.toolSummary.running, "muted"), 0, 0));
			return;
		}

		const summary = summaryForTool(this.toolName, this.args, this.result);
		this.addChild(new Text(renderToolResponseLine(summary), 0, 0));

		if (this.expanded) {
			const definition = this.builtInDefinitions[this.toolName as ToolName];
			if (definition?.renderResult) {
				const rawComponent = definition.renderResult(
					{ content: this.result.content as any, details: this.result.details },
					{ expanded: true, isPartial: false },
					theme,
					{
						args: this.args,
						toolCallId: this.result.toolCallId,
						invalidate: () => {},
						lastComponent: undefined,
						state: {},
						cwd: this.cwd,
						executionStarted: true,
						argsComplete: true,
						isPartial: false,
						expanded: true,
						showImages: true,
						isError: this.result.isError ?? false,
					},
				);
				const component = this.createWrappedResultComponent(rawComponent);
				this.addChild(component);
				return;
			}

			const output = getTextOutput(this.result, false).trim();
			if (output) {
				this.addChild(this.createWrappedResultComponent(new Text(theme.fg("toolOutput", output), 0, 0)));
			}
		}
	}
}
