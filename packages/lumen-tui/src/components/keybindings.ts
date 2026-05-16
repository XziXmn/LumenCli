/**
 * Lumen TUI 键位绑定 —— 基于 @opentui/keymap 重构。
 *
 * 设计要点：
 * - 单一 Keymap 实例（由 app.tsx 创建），通过 KeymapProvider 注入。
 * - 命令 (Command) 集中定义在 `LUMEN_COMMANDS`，bindings 引用命令名。
 * - 4 个键位 group 分布在不同的 priority 分层：
 *     app(100) / leader(200) / dialog(300) / prompt(400)
 * - 用户可通过 `.lumen/tui-keybindings.json` 覆盖 key 绑定。
 *
 * 兼容外部 API：仍导出 DEFAULT_*_KEYBINDINGS / matchesKey / loadKeybindingOverrides /
 * configureKeybindings 占位符（函数无副作用），避免一次性把所有调用方都改掉。
 * 真正的键位匹配由 Keymap 的 dispatch 完成。
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CliRenderer, KeyEvent, Renderable } from "@opentui/core";
import type { Keymap } from "@opentui/keymap";
import {
	registerDefaultKeys,
	registerEnabledFields,
	registerEscapeClearsPendingSequence,
	registerMetadataFields,
	registerModBindings,
	registerNeovimDisambiguation,
	registerTimedLeader,
} from "@opentui/keymap/addons";
import { createOpenTuiKeymap } from "@opentui/keymap/opentui";

/** Lumen TUI 内键位类型，OpenTUI 的 KeyEvent 已满足 KeymapEvent。 */
export type LumenKeymap = Keymap<Renderable, KeyEvent>;

/**
 * 默认键位覆盖表 —— 以命令 ID 为 key，值为 KeyLike（字符串）。
 * 所有键位最终通过 binding overrides 应用。
 */
const DEFAULT_BINDINGS: Record<string, string> = {
	// app
	"app.commandPalette": "ctrl+p",
	"app.modelCycle": "f2",
	"app.modelCycleReverse": "shift+f2",
	"app.interrupt": "escape",
	"app.exit": "ctrl+c",
	"app.scrollPageUp": "pageup",
	"app.scrollPageDown": "pagedown",
	"app.scrollHalfPageUp": "ctrl+u",
	"app.scrollHalfPageDown": "ctrl+d",
	"app.scrollLineUp": "ctrl+k",
	"app.scrollLineDown": "ctrl+j",
	"app.scrollTop": "ctrl+home",
	"app.scrollBottom": "ctrl+end",
	// leader（leader 触发键 + 二级键）
	"leader.trigger": "ctrl+x",
	"leader.agent.list": "<leader>a",
	"leader.session.sidebar.toggle": "<leader>b",
	"leader.session.compact": "<leader>c",
	"leader.prompt.editor": "<leader>e",
	"leader.session.tree": "<leader>g",
	"leader.session.timeline": "<leader>j",
	"leader.model.list": "<leader>m",
	"leader.session.new": "<leader>n",
	"leader.session.redo": "<leader>r",
	"leader.opencode.status": "<leader>s",
	"leader.theme.switch": "<leader>t",
	"leader.session.undo": "<leader>u",
	"leader.session.export.html": "<leader>x",
	"leader.session.copy": "<leader>y",
	// dialog
	"dialog.close": "escape",
	"dialog.up": "up",
	"dialog.upCtrl": "ctrl+p",
	"dialog.down": "down",
	"dialog.downCtrl": "ctrl+n",
	"dialog.pageUp": "pageup",
	"dialog.pageDown": "pagedown",
	"dialog.home": "home",
	"dialog.end": "end",
	"dialog.left": "left",
	"dialog.right": "right",
	"dialog.backspace": "backspace",
	"dialog.submit": "return",
	// prompt
	"prompt.commandPalette": "ctrl+p",
	"prompt.autocompleteUp": "up",
	"prompt.autocompleteUpCtrl": "ctrl+p",
	"prompt.autocompleteDown": "down",
	"prompt.autocompleteDownCtrl": "ctrl+n",
	"prompt.autocompleteApply": "tab",
	"prompt.submit": "return",
	"prompt.submitLinefeed": "linefeed",
	"prompt.shellToggle": "tab",
	"prompt.interrupt": "escape",
	"prompt.historyPrevious": "up",
	"prompt.historyNext": "down",
};

/**
 * 通过 layer priority 区分作用域，priority 越大优先级越高。
 * - app: 100
 * - leader (二级键): 200
 * - dialog: 300（dialog 打开时，会在 app 之上）
 * - prompt: 400
 */
export const LAYER_PRIORITY = {
	app: 100,
	leader: 200,
	dialog: 300,
	prompt: 400,
} as const;

/** 当前生效的键位（合并默认 + 用户覆盖）。 */
const activeBindings: Record<string, string> = { ...DEFAULT_BINDINGS };

/** 读取键位字符串。Layer/binding 注册时使用。 */
export function getKey(commandId: string): string {
	return activeBindings[commandId] ?? "";
}

export interface TuiKeybindingOverrides {
	[commandId: string]: string;
}

/**
 * 从 `.lumen/tui-keybindings.json` 加载用户键位覆盖。
 * 兼容老格式（嵌套 app/leader/dialog/prompt）。
 */
export function loadKeybindingOverrides(cwd: string): TuiKeybindingOverrides | undefined {
	const candidates = [
		process.env.LUMEN_TUI_KEYBINDINGS ? resolve(process.env.LUMEN_TUI_KEYBINDINGS) : undefined,
		join(cwd, ".lumen", "tui-keybindings.json"),
		join(cwd, "lumen-tui-keybindings.json"),
	].filter((item): item is string => Boolean(item));
	for (const file of candidates) {
		if (!existsSync(file)) continue;
		return parseOverrides(readFileSync(file, "utf-8"));
	}
	return undefined;
}

/** 将用户覆盖合并到 active bindings 表（原地修改）。 */
export function configureKeybindings(overrides: TuiKeybindingOverrides | undefined): void {
	if (!overrides) return;
	for (const [commandId, key] of Object.entries(overrides)) {
		if (typeof key === "string") activeBindings[commandId] = key;
	}
}

/** 创建 Lumen 主 Keymap：注册所有插件，并应用 leader / 默认绑定。 */
export function createLumenKeymap(renderer: CliRenderer): { keymap: LumenKeymap; dispose: () => void } {
	const keymap = createOpenTuiKeymap(renderer);
	const cleanups = [
		registerDefaultKeys(keymap),
		registerModBindings(keymap),
		registerEnabledFields(keymap),
		registerMetadataFields(keymap),
		registerEscapeClearsPendingSequence(keymap),
		registerNeovimDisambiguation(keymap),
		registerTimedLeader(keymap, {
			trigger: getKey("leader.trigger") || "ctrl+x",
			timeoutMs: 1500,
		}),
	];
	return {
		keymap,
		dispose: () => {
			for (const cleanup of cleanups) cleanup();
		},
	};
}

function parseOverrides(text: string): TuiKeybindingOverrides | undefined {
	try {
		const parsed = JSON.parse(text) as unknown;
		if (!parsed || typeof parsed !== "object") return undefined;
		// 扁平格式：{ "app.commandPalette": "ctrl+space", ... }
		if (Object.values(parsed as Record<string, unknown>).every((value) => typeof value === "string")) {
			return parsed as TuiKeybindingOverrides;
		}
		// 兼容旧格式：{ app: { commandPalette: "..." }, leader: { theme: "..." }, ... }
		const result: TuiKeybindingOverrides = {};
		for (const [group, entries] of Object.entries(parsed as Record<string, unknown>)) {
			if (!entries || typeof entries !== "object") continue;
			for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
				if (typeof value === "string") result[`${group}.${key}`] = value;
			}
		}
		return Object.keys(result).length > 0 ? result : undefined;
	} catch {
		return undefined;
	}
}

// ────────────────────────────────────────────────────────────────────────────
// 兼容层：保留旧的 DEFAULT_*_KEYBINDINGS / matchesKey 导出，
// 让仍在使用旧接口的组件在迁移期间不报错。新代码应使用 useBindings()。
// ────────────────────────────────────────────────────────────────────────────

export interface TuiKeyBinding {
	name?: string;
	sequence?: string;
	ctrl?: boolean;
	shift?: boolean;
	meta?: boolean;
	disabled?: boolean;
}

export interface TuiKeyEvent {
	name: string;
	sequence?: string;
	ctrl?: boolean;
	shift?: boolean;
	meta?: boolean;
}

/** 把 KeyLike 字符串解析成结构化绑定（用于 matchesKey 兼容）。 */
function parseKeyLike(key: string): TuiKeyBinding {
	const text = key.trim().toLowerCase();
	if (!text || text === "none") return { disabled: true };
	const parts = text.split("+").map((part) => part.trim());
	const name = parts.at(-1);
	if (!name) return { disabled: true };
	return {
		name,
		ctrl: parts.includes("ctrl") || parts.includes("control"),
		shift: parts.includes("shift"),
		meta: parts.includes("meta") || parts.includes("cmd") || parts.includes("super"),
	};
}

function buildLegacy(map: Record<string, string>): Record<string, TuiKeyBinding> {
	const result: Record<string, TuiKeyBinding> = {};
	for (const [name, key] of Object.entries(map)) result[name] = parseKeyLike(key);
	return result;
}

export const DEFAULT_APP_KEYBINDINGS: Record<string, TuiKeyBinding> = buildLegacy({
	leader: getKey("leader.trigger"),
	commandPalette: getKey("app.commandPalette"),
	modelCycle: getKey("app.modelCycle"),
	modelCycleReverse: getKey("app.modelCycleReverse"),
	interrupt: getKey("app.interrupt"),
	exit: getKey("app.exit"),
	scrollPageUp: getKey("app.scrollPageUp"),
	scrollPageDown: getKey("app.scrollPageDown"),
	scrollHalfPageUp: getKey("app.scrollHalfPageUp"),
	scrollHalfPageDown: getKey("app.scrollHalfPageDown"),
	scrollLineUp: getKey("app.scrollLineUp"),
	scrollLineDown: getKey("app.scrollLineDown"),
	scrollTop: getKey("app.scrollTop"),
	scrollBottom: getKey("app.scrollBottom"),
});

export const DEFAULT_LEADER_KEYBINDINGS: Record<string, TuiKeyBinding & { command: string }> = {
	agentList: { ...parseKeyLike("a"), command: "agent.list" },
	sidebarToggle: { ...parseKeyLike("b"), command: "session.sidebar.toggle" },
	compact: { ...parseKeyLike("c"), command: "session.compact" },
	editor: { ...parseKeyLike("e"), command: "prompt.editor" },
	tree: { ...parseKeyLike("g"), command: "session.tree" },
	timeline: { ...parseKeyLike("j"), command: "session.timeline" },
	modelList: { ...parseKeyLike("m"), command: "model.list" },
	newSession: { ...parseKeyLike("n"), command: "session.new" },
	redo: { ...parseKeyLike("r"), command: "session.redo" },
	status: { ...parseKeyLike("s"), command: "opencode.status" },
	theme: { ...parseKeyLike("t"), command: "theme.switch" },
	undo: { ...parseKeyLike("u"), command: "session.undo" },
	exportHtml: { ...parseKeyLike("x"), command: "session.export.html" },
	copy: { ...parseKeyLike("y"), command: "session.copy" },
};

export const DEFAULT_DIALOG_KEYBINDINGS: Record<string, TuiKeyBinding> = buildLegacy({
	close: getKey("dialog.close"),
	up: getKey("dialog.up"),
	upCtrl: getKey("dialog.upCtrl"),
	down: getKey("dialog.down"),
	downCtrl: getKey("dialog.downCtrl"),
	pageUp: getKey("dialog.pageUp"),
	pageDown: getKey("dialog.pageDown"),
	home: getKey("dialog.home"),
	end: getKey("dialog.end"),
	left: getKey("dialog.left"),
	right: getKey("dialog.right"),
	backspace: getKey("dialog.backspace"),
	submit: getKey("dialog.submit"),
});

export const DEFAULT_PROMPT_KEYBINDINGS: Record<string, TuiKeyBinding> = buildLegacy({
	commandPalette: getKey("prompt.commandPalette"),
	autocompleteUp: getKey("prompt.autocompleteUp"),
	autocompleteUpCtrl: getKey("prompt.autocompleteUpCtrl"),
	autocompleteDown: getKey("prompt.autocompleteDown"),
	autocompleteDownCtrl: getKey("prompt.autocompleteDownCtrl"),
	autocompleteApply: getKey("prompt.autocompleteApply"),
	submit: getKey("prompt.submit"),
	submitLinefeed: getKey("prompt.submitLinefeed"),
	newline: "shift+return", // shift+return for newline (textarea)
	newlineAlt: "meta+return",
	newlineCtrl: "ctrl+return",
	newlineCtrlJ: "ctrl+j",
	shellToggle: getKey("prompt.shellToggle"),
	interrupt: getKey("prompt.interrupt"),
	historyPrevious: getKey("prompt.historyPrevious"),
	historyNext: getKey("prompt.historyNext"),
	lineHome: "ctrl+a",
	lineEnd: "ctrl+e",
	selectLineHome: "ctrl+shift+a",
	selectLineEnd: "ctrl+shift+e",
	visualLineHome: "meta+a",
	visualLineEnd: "meta+e",
	selectVisualLineHome: "meta+shift+a",
	selectVisualLineEnd: "meta+shift+e",
	bufferHome: "home",
	bufferEnd: "end",
	selectBufferHome: "shift+home",
	selectBufferEnd: "shift+end",
	deleteLine: "ctrl+shift+d",
	deleteToLineEnd: "ctrl+k",
	deleteToLineStart: "ctrl+u",
	deleteForward: "ctrl+d",
	deleteForwardKey: "delete",
	deleteForwardShift: "shift+delete",
	backspace: "ctrl+h",
	backspaceKey: "backspace",
	backspaceShift: "shift+backspace",
	deleteWordBackward: "ctrl+w",
	deleteWordBackwardCtrlBackspace: "ctrl+backspace",
	deleteWordBackwardMetaBackspace: "meta+backspace",
	deleteWordForwardMetaD: "meta+d",
	deleteWordForwardMetaDelete: "meta+delete",
	deleteWordForwardCtrlDelete: "ctrl+delete",
	moveLeft: "left",
	moveRight: "right",
	moveUp: "up",
	moveDown: "down",
	charBackward: "ctrl+b",
	charForward: "ctrl+f",
	selectCharBackward: "shift+left",
	selectCharForward: "shift+right",
	selectLineUp: "shift+up",
	selectLineDown: "shift+down",
	wordBackward: "meta+b",
	wordBackwardLeft: "meta+left",
	wordBackwardCtrlLeft: "ctrl+left",
	wordForward: "meta+f",
	wordForwardRight: "meta+right",
	wordForwardCtrlRight: "ctrl+right",
	selectWordBackward: "meta+shift+b",
	selectWordBackwardLeft: "meta+shift+left",
	selectWordForward: "meta+shift+f",
	selectWordForwardRight: "meta+shift+right",
	selectAll: "meta+a",
	undo: "ctrl+z",
	undoAlt: "ctrl+-",
	redo: "ctrl+y",
	redoAlt: "ctrl+.",
});

/** 兼容老 matchesKey：基于解析后的结构匹配 KeyEvent。 */
export function matchesKey(event: TuiKeyEvent, binding: TuiKeyBinding): boolean {
	if (binding.disabled) return false;
	if (binding.name && event.name !== binding.name) return false;
	if (binding.sequence && event.sequence !== binding.sequence) return false;
	return (
		Boolean(event.ctrl) === Boolean(binding.ctrl) &&
		Boolean(event.shift) === Boolean(binding.shift) &&
		Boolean(event.meta) === Boolean(binding.meta)
	);
}

export function keyBindingDisplay(binding: TuiKeyBinding): string {
	if (binding.disabled) return "disabled";
	const parts: string[] = [];
	if (binding.ctrl) parts.push("Ctrl");
	if (binding.shift) parts.push("Shift");
	if (binding.meta) parts.push("Meta");
	parts.push(displayKeyName(binding.name ?? binding.sequence ?? "?"));
	return parts.join("+");
}

function displayKeyName(value: string): string {
	if (value.length === 1) return value.toUpperCase();
	if (value === "return") return "Enter";
	if (value === "escape") return "Esc";
	if (value === "pageup") return "PgUp";
	if (value === "pagedown") return "PgDn";
	return value
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
		.join("");
}
