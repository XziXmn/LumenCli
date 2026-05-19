import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { getTextOutput } from "../../../core/tools/render-utils.js";
import { formatPathRelativeToCwdOrAbsolute } from "../../../utils/paths.js";
import { theme } from "../theme/theme.js";

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
		case "read":
			if (hasImage) return "Read image";
			return `Read ${lineCount(output)} ${lineCount(output) === 1 ? "line" : "lines"}`;
		case "write": {
			const content = typeof args.content === "string" ? args.content : "";
			const count = lineCount(content);
			return `Wrote ${count} ${count === 1 ? "line" : "lines"}`;
		}
		case "edit":
			return "Updated file";
		case "grep": {
			const matches = output ? output.split("\n").filter(Boolean) : [];
			const fileCount = new Set(matches.map((line) => line.split(":")[0]).filter(Boolean)).size;
			return `Found ${matches.length} ${matches.length === 1 ? "match" : "matches"} across ${fileCount} ${fileCount === 1 ? "file" : "files"}`;
		}
		case "find": {
			const count = output ? output.split("\n").filter(Boolean).length : 0;
			return `Found ${count} ${count === 1 ? "file" : "files"}`;
		}
		case "ls": {
			const count = output ? output.split("\n").filter(Boolean).length : 0;
			return `Listed ${count} ${count === 1 ? "item" : "items"}`;
		}
		case "bash": {
			const count = output ? output.split("\n").filter(Boolean).length : 0;
			return `Ran command · ${count} ${count === 1 ? "line" : "lines"} of output`;
		}
		default:
			return output.split("\n")[0] ?? "Done";
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
			this.addChild(new Text(renderToolResponseLine("Running…", "muted"), 0, 0));
			return;
		}

		const summary = summaryForTool(this.toolName, this.args, this.result);
		this.addChild(new Text(renderToolResponseLine(summary), 0, 0));

		if (!this.expanded) return;

		const output = getTextOutput(this.result, false).trim();
		if (output) {
			this.addChild(new Text(theme.fg("toolOutput", output), 2, 0));
		}
	}
}
