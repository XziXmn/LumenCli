/**
 * Tool Group Component — merges consecutive same-type tool calls into a single display.
 *
 * When collapsed:
 *   ✓ Read 4 files: src/config.ts, src/main.ts, src/cli.ts (+1 more)
 *
 * When expanded:
 *   ✓ Read 4 files
 *   ├─ ✓ src/config.ts (45 lines)
 *   ├─ ✓ src/main.ts (120 lines)
 *   ├─ ✓ src/cli.ts (80 lines)
 *   └─ ✓ src/utils.ts (30 lines)
 *
 * [Provenance] 来源: Claude Code GroupedToolUseContent + oh-my-pi tree-list 概念
 * [Provenance] 移植方式: 自研
 */

import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.js";
import { SPINNER_FRAMES, STATUS_SYMBOLS, TREE_SYMBOLS } from "./lumen-tui-utils.js";
import type { ToolExecutionComponent } from "./tool-execution.js";

// ============================================================================
// Tool Group Configuration
// ============================================================================

/** Tools that can be grouped when called consecutively. */
const GROUPABLE_TOOLS: Record<string, { label: string; argKey: string }> = {
	read: { label: "Read", argKey: "file_path" },
	grep: { label: "Searched", argKey: "pattern" },
	find: { label: "Find", argKey: "glob" },
	ls: { label: "Listed", argKey: "path" },
};

/** Maximum items to show in collapsed inline preview. */
const MAX_INLINE_ITEMS = 3;

// ============================================================================
// Tool Group Component
// ============================================================================

export class ToolGroupComponent extends Container {
	private toolName: string;
	private members: ToolGroupMember[] = [];
	private expanded = false;
	private headerText: Text;
	private detailContainer: Container;
	private spacer: Spacer;

	constructor(toolName: string) {
		super();
		this.toolName = toolName;
		this.spacer = new Spacer(1);
		this.headerText = new Text("", 0, 0);
		this.detailContainer = new Container();
		this.addChild(this.spacer);
		this.addChild(this.headerText);
		this.addChild(this.detailContainer);
		this.updateDisplay();
	}

	/** Add a tool execution to this group. */
	addMember(component: ToolExecutionComponent, args: Record<string, unknown>): void {
		this.members.push({ component, args, completed: false, isError: false });
		this.updateDisplay();
	}

	/** Mark a member as completed. */
	markMemberCompleted(toolCallId: string, isError: boolean): void {
		const member = this.members.find((m) => m.component.getToolCallId() === toolCallId);
		if (member) {
			member.completed = true;
			member.isError = isError;
			this.updateDisplay();
		}
	}

	/** Get the tool name this group handles. */
	getToolName(): string {
		return this.toolName;
	}

	/** Get the number of members in this group. */
	getMemberCount(): number {
		return this.members.length;
	}

	/** Check if all members are completed. */
	isAllCompleted(): boolean {
		return this.members.length > 0 && this.members.every((m) => m.completed);
	}

	/** Set expanded state. */
	setExpanded(expanded: boolean): void {
		this.expanded = expanded;
		for (const member of this.members) {
			member.component.setExpanded(expanded);
		}
		this.updateDisplay();
	}

	private updateDisplay(): void {
		this.detailContainer.clear();

		const config = GROUPABLE_TOOLS[this.toolName];
		const label = config?.label ?? this.toolName;
		const argKey = config?.argKey ?? "path";

		// Determine overall status
		const allCompleted = this.isAllCompleted();
		const hasError = this.members.some((m) => m.isError);
		const allRunning = !allCompleted && this.members.length > 0;

		// Status icon
		let icon: string;
		if (hasError) {
			icon = theme.fg("error", STATUS_SYMBOLS.error);
		} else if (allCompleted) {
			icon = theme.fg("success", STATUS_SYMBOLS.success);
		} else if (allRunning) {
			icon = theme.fg("accent", SPINNER_FRAMES[0]);
		} else {
			icon = theme.fg("muted", STATUS_SYMBOLS.pending);
		}

		// Build header
		const count = this.members.length;
		const noun = count === 1 ? "file" : "files";
		const headerTitle = `${icon} ${theme.fg("toolTitle", theme.bold(`${label} ${count} ${noun}`))}`;

		if (!this.expanded) {
			// Collapsed: show inline preview of file paths
			const paths = this.members
				.map((m) => extractArgValue(m.args, argKey))
				.filter(Boolean)
				.map((p) => shortenForInline(p as string));

			const shown = paths.slice(0, MAX_INLINE_ITEMS);
			const remaining = paths.length - shown.length;
			let inline = shown.join(", ");
			if (remaining > 0) {
				inline += theme.fg("dim", ` (+${remaining} more)`);
			}

			this.headerText.setText(`${headerTitle}: ${theme.fg("muted", inline)}`);
		} else {
			// Expanded: show tree list
			this.headerText.setText(headerTitle);

			for (let i = 0; i < this.members.length; i++) {
				const member = this.members[i];
				const isLast = i === this.members.length - 1;
				const branch = isLast ? TREE_SYMBOLS.last : TREE_SYMBOLS.branch;
				const branchStr = theme.fg("dim", branch);

				// Member status icon
				let memberIcon: string;
				if (member.isError) {
					memberIcon = theme.fg("error", STATUS_SYMBOLS.error);
				} else if (member.completed) {
					memberIcon = theme.fg("success", STATUS_SYMBOLS.success);
				} else {
					memberIcon = theme.fg("accent", SPINNER_FRAMES[0]);
				}

				const argValue = extractArgValue(member.args, argKey) ?? "?";
				const memberLine = ` ${branchStr} ${memberIcon} ${theme.fg("muted", String(argValue))}`;
				this.detailContainer.addChild(new Text(memberLine, 0, 0));
			}
		}
	}
}

// ============================================================================
// Types
// ============================================================================

interface ToolGroupMember {
	component: ToolExecutionComponent;
	args: Record<string, unknown>;
	completed: boolean;
	isError: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function extractArgValue(args: Record<string, unknown>, key: string): string | undefined {
	// Try the specified key, then common fallbacks
	const value = args[key] ?? args.path ?? args.file_path ?? args.file;
	if (typeof value === "string") return value;
	return undefined;
}

function shortenForInline(path: string): string {
	// Show just the filename or last path segment
	const parts = path.replace(/\\/g, "/").split("/");
	return parts[parts.length - 1] ?? path;
}

/**
 * Check if a tool name is groupable.
 */
export function isGroupableTool(toolName: string): boolean {
	return toolName in GROUPABLE_TOOLS;
}
