import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { getTextOutput } from "../../../core/tools/render-utils.js";
import { formatPathRelativeToCwdOrAbsolute } from "../../../utils/paths.js";
import { isCollapsibleToolName } from "../output-flow/collapse.js";
import { theme } from "../theme/theme.js";
import { TUI_COPY } from "./tui-copy.js";

type ToolResultMessage = Extract<AgentMessage, { role: "toolResult" }>;
type ToolRowStatus = "pending" | "success" | "error";

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
			return `读取(${path ?? "文件"})`;
		case "write":
			return `写入(${path ?? "文件"})`;
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
			return `${isCreate ? "创建" : "更新"}(${path ?? "文件"})`;
		}
		case "grep":
		case "find": {
			const pattern = typeof args.pattern === "string" ? args.pattern : "";
			const pathText = path ?? ".";
			return `搜索(模式: "${pattern}", 路径: "${pathText}")`;
		}
		case "ls":
			return `列出(${path ?? "."})`;
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
			return output === "Todo list cleared." ? output : "已更新待办列表";
		case "read":
			if (hasImage) return "已读取图片";
			return `已读取 ${lineCount(output)} 行`;
		case "write": {
			const content = typeof args.content === "string" ? args.content : "";
			const count = lineCount(content);
			return `已写入 ${count} 行`;
		}
		case "edit":
			return "已更新文件";
		case "grep": {
			const matches = output ? output.split("\n").filter(Boolean) : [];
			const fileCount = new Set(matches.map((line) => line.split(":")[0]).filter(Boolean)).size;
			return `共找到 ${matches.length} 处匹配，涉及 ${fileCount} 个文件`;
		}
		case "find": {
			const count = output ? output.split("\n").filter(Boolean).length : 0;
			return `共找到 ${count} 个文件`;
		}
		case "ls": {
			const count = output ? output.split("\n").filter(Boolean).length : 0;
			return `共列出 ${count} 项`;
		}
		case "bash": {
			const count = output ? output.split("\n").filter(Boolean).length : 0;
			return `命令已执行 · 输出 ${count} 行`;
		}
		default:
			return output.split("\n")[0] ?? "已完成";
	}
}

export class AssistantToolSummaryComponent extends Container {
	private expanded = false;
	private result: ToolResultMessage | undefined;

	constructor(
		private readonly toolName: string,
		private args: Record<string, unknown>,
		result: ToolResultMessage | undefined,
		private readonly cwd: string,
	) {
		super();
		this.result = result;
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

	private updateDisplay(): void {
		this.clear();
		const title = titleForTool(this.toolName, this.args, this.cwd);
		const status: ToolRowStatus = !this.result ? "pending" : this.result.isError ? "error" : "success";

		this.addChild(new Spacer(1));
		this.addChild(new Text(`${renderToolStatusDot(status)} ${theme.bold(title)}`, 1, 0));

		if (!this.result) {
			this.addChild(new Text(renderToolResponseLine(TUI_COPY.toolSummary.running, "muted"), 0, 0));
			return;
		}

		const summary = summaryForTool(this.toolName, this.args, this.result);
		this.addChild(new Text(renderToolResponseLine(summary), 0, 0));

		const output = getTextOutput(this.result, false).trim();
		if (!output) return;

		if (this.expanded) {
			this.addChild(new Text(theme.fg("toolOutput", output), 2, 0));
		} else if (!isCollapsibleToolName(this.toolName)) {
			const lines = output.split("\n");
			const previewLines = lines.slice(0, 5);
			const preview = previewLines.join("\n");
			if (preview) {
				this.addChild(new Text(theme.fg("dim", preview), 2, 0));
			}
			if (lines.length > 5) {
				this.addChild(
					new Text(renderToolResponseLine(TUI_COPY.bashExecution.moreLines(lines.length - 5), "muted"), 0, 0),
				);
			}
		}
	}
}
