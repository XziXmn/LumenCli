/**
 * Collapsed Tool Group — Claude Code style collapseReadSearch.
 *
 * Merges ALL consecutive collapsible tool calls (read, grep, find, ls, bash-search)
 * into a single summary line, regardless of tool type.
 *
 * Active (in-progress):
 *   ● Reading 3 files, searching 2 patterns…
 *     ⎿  src/config.ts
 *
 * Completed:
 *   ✓ Read 3 files, searched 2 patterns
 *
 * Expanded (ctrl+o):
 *   ✓ Read 3 files, searched 2 patterns
 *   ├─ ✓ read: src/config.ts
 *   ├─ ✓ grep: "pattern"
 *   └─ ✓ read: src/main.ts
 *
 * [Provenance] 来源: Claude Code collapseReadSearch.ts + CollapsedReadSearchContent.tsx
 * [Provenance] 移植方式: 自研 (用我们的 TUI 组件 API)
 */

import { Container, Text, type TUI } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.js";
import { SPINNER_FRAMES, STATUS_SYMBOLS, TREE_SYMBOLS } from "./lumen-tui-utils.js";
import type { ToolExecutionComponent } from "./tool-execution.js";

// ============================================================================
// Collapsible Tool Configuration
// ============================================================================

/** Tools that are collapsible (merged into a single summary line). */
const COLLAPSIBLE_TOOLS: Record<
	string,
	{ activeVerb: string; doneVerb: string; noun: string; pluralNoun: string; argKey: string }
> = {
	read: { activeVerb: "Reading", doneVerb: "Read", noun: "file", pluralNoun: "files", argKey: "file_path" },
	grep: { activeVerb: "Searching", doneVerb: "Searched", noun: "pattern", pluralNoun: "patterns", argKey: "pattern" },
	find: { activeVerb: "Finding", doneVerb: "Found", noun: "glob", pluralNoun: "globs", argKey: "glob" },
	ls: { activeVerb: "Listing", doneVerb: "Listed", noun: "directory", pluralNoun: "directories", argKey: "path" },
};

// ============================================================================
// Collapsed Tool Group Component
// ============================================================================

export class ToolGroupComponent extends Container {
	private members: CollapsedMember[] = [];
	private expanded = false;
	private headerText: Text;
	private hintText: Text;
	private detailContainer: Container;
	private ui: TUI;
	private spinnerInterval: ReturnType<typeof setInterval> | undefined;

	constructor(_toolName: string, ui?: TUI) {
		super();
		this.ui = ui as TUI;
		this.headerText = new Text("", 0, 0);
		this.hintText = new Text("", 0, 0);
		this.detailContainer = new Container();
		this.addChild(this.headerText);
		this.addChild(this.hintText);
		this.addChild(this.detailContainer);
		this.updateDisplay();
	}

	/** Add a tool execution to this group. */
	addMember(component: ToolExecutionComponent, args: Record<string, unknown>): void {
		const toolName = component.getToolName();
		this.members.push({ component, args, toolName, completed: false, isError: false });
		this.ensureSpinner();
		this.updateDisplay();
	}

	/** Mark a member as completed. */
	markMemberCompleted(toolCallId: string, isError: boolean): void {
		const member = this.members.find((m) => m.component.getToolCallId() === toolCallId);
		if (member) {
			member.completed = true;
			member.isError = isError;
			if (this.isAllCompleted()) {
				this.stopSpinner();
			}
			this.updateDisplay();
		}
	}

	/** Get the tool name of the first member (for backward compat). */
	getToolName(): string {
		return this.members[0]?.toolName ?? "read";
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

	/** Dispose of resources. */
	dispose(): void {
		this.stopSpinner();
	}

	private ensureSpinner(): void {
		if (this.spinnerInterval) return;
		this.spinnerInterval = setInterval(() => {
			this.updateDisplay();
			this.ui?.requestRender();
		}, 500);
	}

	private stopSpinner(): void {
		if (this.spinnerInterval) {
			clearInterval(this.spinnerInterval);
			this.spinnerInterval = undefined;
		}
	}

	private updateDisplay(): void {
		this.detailContainer.clear();

		const allCompleted = this.isAllCompleted();
		const hasError = this.members.some((m) => m.isError);

		// Count by tool type
		const counts = new Map<string, number>();
		for (const m of this.members) {
			counts.set(m.toolName, (counts.get(m.toolName) ?? 0) + 1);
		}

		// Status icon
		let icon: string;
		if (hasError) {
			icon = theme.fg("error", STATUS_SYMBOLS.error);
		} else if (allCompleted) {
			icon = theme.fg("success", STATUS_SYMBOLS.success);
		} else {
			// Animated spinner
			const frameIdx = Math.floor(Date.now() / 500) % SPINNER_FRAMES.length;
			icon = theme.fg("accent", SPINNER_FRAMES[frameIdx]);
		}

		// Build summary text: "Reading 3 files, searching 2 patterns…" or "Read 3 files, searched 2 patterns"
		const parts: string[] = [];
		for (const [toolName, count] of counts) {
			const config = COLLAPSIBLE_TOOLS[toolName];
			if (!config) {
				// Unknown collapsible tool — use generic
				const verb = allCompleted ? toolName : `${toolName}ing`;
				parts.push(`${verb} ${count}`);
				continue;
			}
			const verb = allCompleted ? config.doneVerb : config.activeVerb;
			const noun = count === 1 ? config.noun : config.pluralNoun;
			parts.push(`${verb} ${count} ${noun}`);
		}

		const summaryText = parts.join(", ");
		const suffix = allCompleted ? "" : "\u2026"; // …
		const headerLine = `${icon} ${theme.fg("toolTitle", theme.bold(summaryText))}${suffix}`;
		this.headerText.setText(headerLine);

		// Hint line: show the latest file/pattern being processed (only when active)
		if (!allCompleted && !this.expanded) {
			const lastActive = this.members.filter((m) => !m.completed).at(-1) ?? this.members.at(-1);
			if (lastActive) {
				const config = COLLAPSIBLE_TOOLS[lastActive.toolName];
				const argKey = config?.argKey ?? "path";
				const hint = extractArgValue(lastActive.args, argKey);
				if (hint) {
					this.hintText.setText(theme.fg("dim", `  \u239C  ${shortenPath(hint)}`)); // ⎜
				} else {
					this.hintText.setText("");
				}
			}
		} else {
			this.hintText.setText("");
		}

		// Expanded: show tree list of all members
		if (this.expanded) {
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

				const config = COLLAPSIBLE_TOOLS[member.toolName];
				const argKey = config?.argKey ?? "path";
				const argValue = extractArgValue(member.args, argKey) ?? "?";
				const toolLabel = theme.fg("dim", `${member.toolName}:`);
				const memberLine = ` ${branchStr} ${memberIcon} ${toolLabel} ${theme.fg("muted", String(argValue))}`;
				this.detailContainer.addChild(new Text(memberLine, 0, 0));
			}
		}
	}
}

// ============================================================================
// Types
// ============================================================================

interface CollapsedMember {
	component: ToolExecutionComponent;
	args: Record<string, unknown>;
	toolName: string;
	completed: boolean;
	isError: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function extractArgValue(args: Record<string, unknown>, key: string): string | undefined {
	const value = args[key] ?? args.path ?? args.file_path ?? args.file ?? args.pattern ?? args.glob;
	if (typeof value === "string") return value;
	return undefined;
}

function shortenPath(path: string): string {
	// Show last 2 segments for readability
	const parts = path.replace(/\\/g, "/").split("/");
	if (parts.length <= 2) return path;
	return parts.slice(-2).join("/");
}

/**
 * Check if a tool name is collapsible (can be merged into a collapsed group).
 */
export function isGroupableTool(toolName: string): boolean {
	return toolName in COLLAPSIBLE_TOOLS;
}
