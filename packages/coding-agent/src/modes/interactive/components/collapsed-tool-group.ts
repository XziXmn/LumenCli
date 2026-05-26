import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { formatPathRelativeToCwdOrAbsolute } from "../../../utils/paths.ts";
import type { RenderableCollapsedToolGroup } from "../output-flow/types.ts";
import { theme } from "../theme/theme.ts";
import { renderToolHintLine, renderToolResponseLine, renderToolStatusDot } from "./assistant-tool-summary.ts";
import { TUI_COPY } from "./tui-copy.ts";

type CollapsedKind = "read" | "search" | "list";

interface CollapsedRuntimeItem {
	id: string;
	name: string;
	kind: CollapsedKind;
	arguments: Record<string, unknown>;
	completed: boolean;
}

function classifyToolName(toolName: string): CollapsedKind {
	if (toolName === "read") return "read";
	if (toolName === "ls") return "list";
	return "search";
}

function buildSummary(items: CollapsedRuntimeItem[]): string {
	const readCount = items.filter((item) => item.kind === "read").length;
	const searchCount = items.filter((item) => item.kind === "search").length;
	const listCount = items.filter((item) => item.kind === "list").length;
	const allCompleted = items.length > 0 && items.every((item) => item.completed);
	const parts: string[] = [];

	if (readCount > 0) {
		parts.push(
			allCompleted
				? TUI_COPY.collapsedToolGroup.readCompleted(readCount)
				: TUI_COPY.collapsedToolGroup.reading(readCount),
		);
	}
	if (searchCount > 0)
		parts.push(
			allCompleted
				? TUI_COPY.collapsedToolGroup.searchCompleted(searchCount)
				: TUI_COPY.collapsedToolGroup.searching(searchCount),
		);
	if (listCount > 0) {
		parts.push(
			allCompleted
				? TUI_COPY.collapsedToolGroup.listCompleted(listCount)
				: TUI_COPY.collapsedToolGroup.listing(listCount),
		);
	}

	return parts.join(", ") + (allCompleted ? "" : "…");
}

function latestHint(items: CollapsedRuntimeItem[], cwd: string): string | undefined {
	const latest = [...items].reverse().find((item) => !item.completed) ?? items.at(-1);
	if (!latest) return undefined;
	const args = latest.arguments;
	if (typeof args.path === "string" && args.path.length > 0) {
		return formatPathRelativeToCwdOrAbsolute(args.path, cwd);
	}
	if (typeof args.file_path === "string" && args.file_path.length > 0) {
		return formatPathRelativeToCwdOrAbsolute(args.file_path, cwd);
	}
	if (typeof args.pattern === "string" && args.pattern.length > 0) {
		return `"${args.pattern}"`;
	}
	return undefined;
}

function describeToolCallName(toolName: string): string {
	if (toolName === "read") return TUI_COPY.collapsedToolGroup.readLabel;
	if (toolName === "grep" || toolName === "find") return TUI_COPY.collapsedToolGroup.searchLabel;
	if (toolName === "ls") return TUI_COPY.collapsedToolGroup.listLabel;
	return toolName;
}

function describeToolCallTarget(argumentsValue: Record<string, unknown>, cwd: string): string | undefined {
	if (typeof argumentsValue.path === "string" && argumentsValue.path.length > 0) {
		return formatPathRelativeToCwdOrAbsolute(argumentsValue.path, cwd);
	}
	if (typeof argumentsValue.file_path === "string" && argumentsValue.file_path.length > 0) {
		return formatPathRelativeToCwdOrAbsolute(argumentsValue.file_path, cwd);
	}
	if (typeof argumentsValue.pattern === "string" && argumentsValue.pattern.length > 0) {
		return argumentsValue.pattern;
	}
	return undefined;
}

export class CollapsedToolGroupComponent extends Container {
	private expanded = false;
	private items: CollapsedRuntimeItem[] = [];
	private readonly cwd: string;

	constructor(cwd: string, group?: RenderableCollapsedToolGroup) {
		super();
		this.cwd = cwd;
		if (group) {
			this.items = group.items.map((item) => ({
				id: item.toolCall.id,
				name: item.toolCall.name,
				kind: classifyToolName(item.toolCall.name),
				arguments: item.toolCall.arguments,
				completed: true,
			}));
		}
		this.updateDisplay();
	}

	setExpanded(expanded: boolean): void {
		this.expanded = expanded;
		this.updateDisplay();
	}

	addOrUpdateToolCall(id: string, name: string, argumentsValue: Record<string, unknown>): void {
		const existing = this.items.find((item) => item.id === id);
		if (existing) {
			existing.arguments = argumentsValue;
			this.updateDisplay();
			return;
		}
		this.items.push({
			id,
			name,
			kind: classifyToolName(name),
			arguments: argumentsValue,
			completed: false,
		});
		this.updateDisplay();
	}

	markCompleted(id: string): void {
		const item = this.items.find((entry) => entry.id === id);
		if (!item) return;
		item.completed = true;
		this.updateDisplay();
	}

	markAllCompleted(): void {
		for (const item of this.items) {
			item.completed = true;
		}
		this.updateDisplay();
	}

	hasToolCall(id: string): boolean {
		return this.items.some((item) => item.id === id);
	}

	isComplete(): boolean {
		return this.items.length > 0 && this.items.every((item) => item.completed);
	}

	override invalidate(): void {
		super.invalidate();
		this.updateDisplay();
	}

	private updateDisplay(): void {
		this.clear();
		if (this.items.length === 0) return;

		const summary = buildSummary(this.items);
		const hint = latestHint(this.items, this.cwd);
		const status = this.isComplete() ? "success" : "pending";

		this.addChild(new Spacer(1));
		this.addChild(new Text(`${renderToolStatusDot(status)} ${theme.bold(summary)}`, 1, 0));

		if (!this.expanded && hint) {
			this.addChild(new Text(renderToolHintLine(hint), 0, 0));
			return;
		}

		if (!this.expanded) {
			return;
		}

		for (const item of this.items) {
			const label = describeToolCallName(item.name);
			const target = describeToolCallTarget(item.arguments, this.cwd);
			const stateDot = item.completed ? theme.fg("success", "✓") : theme.fg("dim", "●");
			const body = `${stateDot} ${label}${target ? ` ${target}` : ""}`;
			this.addChild(new Text(renderToolResponseLine(body), 0, 0));
		}
	}
}
