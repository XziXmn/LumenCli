import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PasteEvent, TextareaAction, KeyBinding as TextareaKeyBinding, TextareaRenderable } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/solid";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { TuiPromptInput, TuiRuntime } from "../runtime/types.js";
import { DEFAULT_PROMPT_KEYBINDINGS, matchesKey } from "./keybindings.js";
import { palette } from "./theme.js";

export function PromptBox(props: {
	runtime: TuiRuntime;
	initialMessage?: string;
	placeholders?: { normal?: string[]; shell?: string[] };
	onOpenCommands: () => void;
	onCommand?: (commandId: string) => void | Promise<void>;
	onExit?: () => void;
	disabled?: boolean;
}) {
	const renderer = useRenderer();
	const [mode, setMode] = createSignal<TuiPromptInput["mode"]>("normal");
	const [draft, setDraft] = createSignal("");
	const [history, setHistory] = createSignal<string[]>([]);
	const [historyIndex, setHistoryIndex] = createSignal(-1);
	const [autocompleteIndex, setAutocompleteIndex] = createSignal(0);
	const [pastes, setPastes] = createSignal<Array<{ marker: string; content: string }>>([]);
	let input: TextareaRenderable | undefined;
	let sentInitial = false;
	let lastSubmitAt = 0;
	let lastPrefillId: string | undefined;
	let lastEditorRequestId: string | undefined;

	const state = createMemo(() => props.runtime.state);
	const theme = createMemo(() => palette[state().ui.theme]);
	const busy = createMemo(() => state().session.status === "working" || state().session.status === "compacting");
	const placeholder = createMemo(() => {
		const list = mode() === "shell" ? props.placeholders?.shell : props.placeholders?.normal;
		const sample = list?.[0];
		if (busy()) return "Working... Esc interrupts";
		if (mode() === "shell") return sample ? `Run a command... "${sample}"` : "Run a command...";
		return sample ? `Ask anything... "${sample}"` : "Ask Lumen...";
	});
	const agent = createMemo(() => state().session.agent?.displayName ?? "Build");
	const model = createMemo(() => state().session.model?.displayName ?? "No model");
	const tokenUsage = createMemo(() => state().session.tokenUsage);
	const autocomplete = createMemo(() => {
		if (mode() !== "normal") return [];
		const value = draft().trimStart();
		const token = currentToken(value);
		if (token.startsWith("/")) {
			const query = token.slice(1).toLowerCase();
			return SLASH_COMMANDS.filter((command) => {
				return command.name.includes(query) || command.aliases.some((alias) => alias.includes(query));
			})
				.slice(0, 8)
				.map((command) => {
					const runtimeCommand = runtimeCommandFor(command.commandId);
					const enabled = runtimeCommand?.enabled ?? true;
					return {
						type: "command" as const,
						label: `/${command.name}`,
						description: enabled
							? command.description
							: (runtimeCommand?.description ?? `Disabled: ${command.description}`),
						category: enabled ? command.category : "disabled",
						replacement: `/${command.name} `,
						commandId: command.commandId,
						enabled,
					};
				});
		}
		if (token.startsWith("@")) return fileSuggestions(token, state().ui.cwd);
		return [];
	});

	function runtimeCommandFor(commandId: string) {
		return state().ui.commands.find((command) => command.id === commandId);
	}

	function setInputText(value: string) {
		input?.setText(value);
		setDraft(value);
	}

	async function submit() {
		if (props.disabled) return;
		const submittedAt = Date.now();
		if (submittedAt - lastSubmitAt < 100) return;
		lastSubmitAt = submittedAt;
		const visibleText = (draft() || input?.plainText || "").trim();
		const text = expandPastes(visibleText).trim();
		if (!text || busy()) return;
		if (text === "exit" || text === "quit" || text === ":q") {
			props.onExit?.();
			return;
		}
		const slashCommand = slashCommandForText(text, runtimeCommandFor);
		if (slashCommand) {
			if (!slashCommand.enabled) return;
			clearPrompt();
			runCommandAfterInput(slashCommand.commandId);
			return;
		}
		setHistory((items) => [text, ...items.filter((item) => item !== text)].slice(0, 50));
		setHistoryIndex(-1);
		clearPrompt();
		if (mode() === "shell") {
			setMode("normal");
			await props.runtime.runShell(text);
			return;
		}
		await props.runtime.sendPrompt({ text, mode: "normal" });
	}

	function handlePaste(event: PasteEvent) {
		if (props.disabled) return;
		const text = new TextDecoder().decode(event.bytes).replace(/\r(?!\n)/g, "\n");
		const pastedContent = text.trim();
		if (!pastedContent) return;
		event.preventDefault();
		event.stopPropagation();
		const lineCount = (pastedContent.match(/\n/g)?.length ?? 0) + 1;
		if (lineCount < 3 && pastedContent.length <= 150) {
			setInputText(appendToDraft(pastedContent));
			return;
		}
		const marker = `[Pasted ~${lineCount} lines]`;
		const uniqueMarker = uniquePasteMarker(marker);
		setPastes((items) => [...items, { marker: uniqueMarker, content: pastedContent }]);
		setInputText(appendToDraft(uniqueMarker));
	}

	useKeyboard((event) => {
		if (props.disabled) return;
		if (matchesKey(event, DEFAULT_PROMPT_KEYBINDINGS.commandPalette)) {
			props.onOpenCommands();
			return;
		}
		if (autocomplete().length > 0) {
			if (
				matchesKey(event, DEFAULT_PROMPT_KEYBINDINGS.autocompleteUp) ||
				matchesKey(event, DEFAULT_PROMPT_KEYBINDINGS.autocompleteUpCtrl)
			) {
				setAutocompleteIndex((value) => Math.max(0, value - 1));
				return;
			}
			if (
				matchesKey(event, DEFAULT_PROMPT_KEYBINDINGS.autocompleteDown) ||
				matchesKey(event, DEFAULT_PROMPT_KEYBINDINGS.autocompleteDownCtrl)
			) {
				setAutocompleteIndex((value) => Math.min(Math.max(0, autocomplete().length - 1), value + 1));
				return;
			}
			if (matchesKey(event, DEFAULT_PROMPT_KEYBINDINGS.autocompleteApply)) {
				completeAutocomplete();
				return;
			}
			if (matchesKey(event, DEFAULT_PROMPT_KEYBINDINGS.submit)) {
				const suggestion = autocomplete()[autocompleteIndex()];
				if (suggestion?.type === "command") {
					if (!suggestion.enabled) return;
					clearPrompt();
					runCommandAfterInput(suggestion.commandId);
					return;
				}
				if (suggestion) completeAutocomplete();
				return;
			}
		}
		if (
			matchesKey(event, DEFAULT_PROMPT_KEYBINDINGS.submit) ||
			matchesKey(event, DEFAULT_PROMPT_KEYBINDINGS.submitLinefeed)
		) {
			void submit();
			return;
		}
		if (matchesKey(event, DEFAULT_PROMPT_KEYBINDINGS.shellToggle)) {
			setMode((current) => (current === "normal" ? "shell" : "normal"));
			renderer.requestRender();
			return;
		}
		if (matchesKey(event, DEFAULT_PROMPT_KEYBINDINGS.interrupt)) {
			if (mode() === "shell") {
				setMode("normal");
				return;
			}
			if (busy()) void props.runtime.abort();
			return;
		}
		if (matchesKey(event, DEFAULT_PROMPT_KEYBINDINGS.historyPrevious) && (input?.plainText ?? "") === "") {
			const items = history();
			if (items.length === 0) return;
			const next = Math.min(historyIndex() + 1, items.length - 1);
			setHistoryIndex(next);
			setInputText(items[next] ?? "");
			return;
		}
		if (matchesKey(event, DEFAULT_PROMPT_KEYBINDINGS.historyNext) && historyIndex() >= 0) {
			const next = historyIndex() - 1;
			setHistoryIndex(next);
			setInputText(next >= 0 ? (history()[next] ?? "") : "");
		}
	});

	onMount(() => {
		input?.focus();
		if (!props.initialMessage || sentInitial) return;
		sentInitial = true;
		setInputText(props.initialMessage);
		setTimeout(() => void submit(), 0);
	});

	createEffect(() => {
		if (props.disabled) {
			input?.blur();
			return;
		}
		input?.focus();
	});

	createEffect(() => {
		const prefill = state().ui.prefillPrompt;
		if (!prefill || prefill.id === lastPrefillId) return;
		lastPrefillId = prefill.id;
		setInputText(prefill.text);
		input?.focus();
	});

	createEffect(() => {
		const request = state().ui.editorRequest;
		if (!request || request.id === lastEditorRequestId) return;
		lastEditorRequestId = request.id;
		void openExternalEditor();
	});

	onCleanup(() => {
		input = undefined;
	});

	return (
		<box flexDirection="column">
			<box
				border={["left"]}
				borderColor={mode() === "shell" ? theme().primary : (state().session.agent?.color ?? theme().border)}
				customBorderChars={{
					topLeft: "",
					bottomLeft: "",
					vertical: "┃",
					topRight: "",
					bottomRight: "",
					horizontal: " ",
					bottomT: "",
					topT: "",
					cross: "",
					leftT: "",
					rightT: "",
				}}
			>
				<box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} backgroundColor={theme().element}>
					<textarea
						ref={(value: TextareaRenderable) => {
							input = value;
						}}
						minHeight={1}
						maxHeight={6}
						placeholder={placeholder()}
						placeholderColor={theme().textMuted}
						textColor={theme().text}
						focusedTextColor={theme().text}
						focusedBackgroundColor={theme().element}
						cursorColor={busy() ? theme().textMuted : theme().text}
						keyBindings={promptTextareaKeyBindings()}
						onContentChange={() => {
							if (props.disabled) {
								input?.setText(draft());
								return;
							}
							setDraft(input?.plainText ?? "");
						}}
						onPaste={handlePaste}
						onSubmit={() => {
							if (!props.disabled) void submit();
						}}
					/>
					<Show when={autocomplete().length > 0}>
						<box
							marginTop={1}
							border={["left"]}
							borderColor={theme().border}
							backgroundColor={theme().panelRaised}
							paddingLeft={1}
							paddingRight={1}
						>
							<For each={autocomplete()}>
								{(suggestion, index) => (
									<box backgroundColor={index() === autocompleteIndex() ? theme().elementHover : undefined}>
										<box flexDirection="row" justifyContent="space-between" gap={2}>
											<text
												fg={
													suggestion.type === "command" && !suggestion.enabled
														? theme().border
														: index() === autocompleteIndex()
															? theme().text
															: theme().textMuted
												}
											>
												{suggestion.label}
											</text>
											<text fg={suggestion.category === "disabled" ? theme().warning : theme().textMuted}>
												{suggestion.category}
											</text>
										</box>
										<text fg={theme().textMuted}>{suggestion.description}</text>
									</box>
								)}
							</For>
						</box>
					</Show>
					<box flexDirection="row" justifyContent="space-between" paddingTop={1} gap={2}>
						<box flexDirection="row" gap={1}>
							<text fg={mode() === "shell" ? theme().primary : theme().secondary}>
								{mode() === "shell" ? "Shell" : agent()}
							</text>
							<Show when={mode() === "normal"}>
								<text fg={theme().textMuted}>·</text>
								<text fg={theme().text}>{model()}</text>
							</Show>
							<Show when={state().ui.permission}>
								<text fg={theme().textMuted}>·</text>
								<text fg={theme().warning}>waiting</text>
							</Show>
							<Show when={state().ui.queued.length > 0}>
								<text fg={theme().textMuted}>·</text>
								<text fg={theme().textMuted}>{state().ui.queued.length} queued</text>
							</Show>
						</box>
					</box>
				</box>
			</box>
			<box width="100%" flexDirection="row" justifyContent="space-between">
				<Show when={busy()}>
					<box flexDirection="row" gap={1} flexShrink={0}>
						<box marginLeft={1}>
							<text fg={state().session.agent?.color ?? theme().primary}>■</text>
						</box>
						<text fg={theme().text}>
							esc <span style={{ fg: theme().textMuted }}>interrupt</span>
						</text>
					</box>
				</Show>
				<Show when={!busy()}>
					<text />
				</Show>
				<box flexDirection="row" gap={2} flexShrink={0}>
					<Show when={tokenUsage().input + tokenUsage().output > 0}>
						<text fg={theme().textMuted} wrapMode="none">
							{formatTokenUsage(tokenUsage())}
						</text>
					</Show>
					<text fg={theme().text}>
						ctrl+p <span style={{ fg: theme().textMuted }}>commands</span>
					</text>
				</box>
			</box>
		</box>
	);

	function clearPrompt() {
		input?.clear();
		setDraft("");
		setPastes([]);
	}

	async function openExternalEditor() {
		const editorCommand = process.env.VISUAL || process.env.EDITOR;
		if (!editorCommand) {
			await props.runtime.executeCommand("prompt.editor.missing");
			return;
		}
		const currentText = input?.plainText ?? draft();
		const tmpFile = path.join(os.tmpdir(), `lumen-tui-editor-${Date.now()}.md`);
		try {
			writeFileSync(tmpFile, currentText, "utf-8");
			renderer.suspend();
			const [editor, ...editorArgs] = editorCommand.split(" ");
			const result = spawnSync(editor, [...editorArgs, tmpFile], {
				stdio: "inherit",
				shell: process.platform === "win32",
			});
			if (result.status === 0) {
				setInputText(readFileSync(tmpFile, "utf-8").replace(/\n$/, ""));
			}
		} finally {
			try {
				unlinkSync(tmpFile);
			} catch {
				// Ignore cleanup errors for temporary editor files.
			}
			renderer.resume();
			renderer.requestRender();
			input?.focus();
		}
	}

	function completeAutocomplete() {
		const suggestion = autocomplete()[autocompleteIndex()];
		if (!suggestion) return;
		if (suggestion.type === "command") {
			if (!suggestion.enabled) return;
			clearPrompt();
			runCommandAfterInput(suggestion.commandId);
			return;
		}
		setInputText(replaceCurrentToken(draft(), suggestion.replacement));
	}

	function runCommandAfterInput(commandId: string) {
		setTimeout(() => {
			void (props.onCommand?.(commandId) ?? props.runtime.executeCommand(commandId));
			renderer.requestRender();
		}, 0);
	}

	function appendToDraft(value: string) {
		const current = input?.plainText ?? draft();
		return current ? `${current}\n${value}` : value;
	}

	function uniquePasteMarker(base: string) {
		const existing = pastes().filter((item) => item.marker.startsWith(base)).length;
		return existing === 0 ? base : `${base} #${existing + 1}`;
	}

	function expandPastes(value: string) {
		return pastes().reduce((text, item) => text.replaceAll(item.marker, item.content), value);
	}
}

type PromptSuggestion =
	| {
			type: "command";
			label: string;
			description: string;
			category: string;
			replacement: string;
			commandId: string;
			enabled: boolean;
	  }
	| {
			type: "file";
			label: string;
			description: string;
			category: string;
			replacement: string;
	  };

function currentToken(value: string): string {
	return value.split(/\s+/).at(-1) ?? "";
}

function replaceCurrentToken(value: string, replacement: string): string {
	const match = value.match(/\S+$/);
	if (!match?.index && match?.index !== 0) return replacement;
	return `${value.slice(0, match.index)}${replacement}`;
}

function fileSuggestions(token: string, cwd: string): PromptSuggestion[] {
	const raw = token.slice(1).replaceAll("\\", "/");
	const directoryPart = raw.endsWith("/") ? raw : path.posix.dirname(raw);
	const prefix = raw.endsWith("/") ? "" : path.posix.basename(raw).toLowerCase();
	const relativeDirectory = directoryPart === "." ? "" : directoryPart;
	const absoluteDirectory = path.resolve(cwd, relativeDirectory);
	if (!existsSync(absoluteDirectory)) return [];
	try {
		return readdirSync(absoluteDirectory)
			.slice(0, 200)
			.map((entry) => {
				const relativePath = [relativeDirectory, entry].filter(Boolean).join("/");
				const absolutePath = path.join(absoluteDirectory, entry);
				const directory = statSync(absolutePath).isDirectory();
				return {
					type: "file" as const,
					label: `@${relativePath}${directory ? "/" : ""}`,
					description: directory ? "Directory" : "File",
					category: "File",
					replacement: `@${relativePath}${directory ? "/" : " "}`,
				};
			})
			.filter((item) =>
				item.label.toLowerCase().startsWith(`@${relativeDirectory ? `${relativeDirectory}/` : ""}${prefix}`),
			)
			.slice(0, 8);
	} catch {
		return [];
	}
}

function slashCommandForText(
	text: string,
	lookup: (commandId: string) => { enabled: boolean } | undefined,
): { commandId: string; enabled: boolean } | undefined {
	if (!text.startsWith("/")) return undefined;
	const name = text.split(/\s+/)[0]?.slice(1);
	if (!name) return undefined;
	const command = SLASH_COMMANDS.find((item) => item.name === name || item.aliases.some((alias) => alias === name));
	if (!command) return undefined;
	const enabled = lookup(command.commandId)?.enabled ?? true;
	if (command.name === "import") {
		const argument = commandArgument(text);
		return { commandId: argument ? `session.import:${argument}` : command.commandId, enabled };
	}
	return { commandId: command.commandId, enabled };
}

function commandArgument(text: string): string | undefined {
	const space = text.indexOf(" ");
	if (space < 0) return undefined;
	const raw = text.slice(space + 1).trim();
	if (!raw) return undefined;
	const quote = raw[0];
	if (quote === '"' || quote === "'") {
		const closing = raw.indexOf(quote, 1);
		return closing > 0 ? raw.slice(1, closing) : undefined;
	}
	const whitespace = raw.search(/\s/);
	return whitespace === -1 ? raw : raw.slice(0, whitespace);
}

function promptTextareaKeyBindings(): TextareaKeyBinding[] {
	return [
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.submit, "submit"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.submitLinefeed, "submit"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.newline, "newline"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.newlineAlt, "newline"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.newlineCtrl, "newline"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.newlineCtrlJ, "newline"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.lineHome, "line-home"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.lineEnd, "line-end"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectLineHome, "select-line-home"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectLineEnd, "select-line-end"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.visualLineHome, "visual-line-home"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.visualLineEnd, "visual-line-end"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectVisualLineHome, "select-visual-line-home"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectVisualLineEnd, "select-visual-line-end"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.bufferHome, "buffer-home"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.bufferEnd, "buffer-end"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectBufferHome, "select-buffer-home"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectBufferEnd, "select-buffer-end"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.deleteLine, "delete-line"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.deleteToLineEnd, "delete-to-line-end"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.deleteToLineStart, "delete-to-line-start"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.deleteForward, "delete"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.deleteForwardKey, "delete"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.deleteForwardShift, "delete"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.backspace, "backspace"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.backspaceKey, "backspace"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.backspaceShift, "backspace"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.deleteWordBackward, "delete-word-backward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.deleteWordBackwardCtrlBackspace, "delete-word-backward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.deleteWordBackwardMetaBackspace, "delete-word-backward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.deleteWordForwardMetaD, "delete-word-forward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.deleteWordForwardMetaDelete, "delete-word-forward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.deleteWordForwardCtrlDelete, "delete-word-forward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.moveLeft, "move-left"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.moveRight, "move-right"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.moveUp, "move-up"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.moveDown, "move-down"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.charBackward, "move-left"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.charForward, "move-right"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectCharBackward, "select-left"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectCharForward, "select-right"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectLineUp, "select-up"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectLineDown, "select-down"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.wordBackward, "word-backward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.wordBackwardLeft, "word-backward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.wordBackwardCtrlLeft, "word-backward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.wordForward, "word-forward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.wordForwardRight, "word-forward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.wordForwardCtrlRight, "word-forward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectWordBackward, "select-word-backward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectWordBackwardLeft, "select-word-backward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectWordForward, "select-word-forward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectWordForwardRight, "select-word-forward"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.selectAll, "select-all"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.undo, "undo"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.undoAlt, "undo"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.redo, "redo"),
		toTextareaKeyBinding(DEFAULT_PROMPT_KEYBINDINGS.redoAlt, "redo"),
	].filter((binding): binding is TextareaKeyBinding => binding !== undefined);
}

function toTextareaKeyBinding(
	binding: (typeof DEFAULT_PROMPT_KEYBINDINGS)[string] | undefined,
	action: TextareaAction,
): TextareaKeyBinding | undefined {
	if (!binding || binding.disabled) return undefined;
	if (!binding.name) return undefined;
	return {
		action,
		name: binding.name,
		...(binding.ctrl ? { ctrl: true } : {}),
		...(binding.shift ? { shift: true } : {}),
		...(binding.meta ? { meta: true } : {}),
	};
}

function formatTokens(total: number): string {
	if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M`;
	if (total >= 1_000) return `${(total / 1_000).toFixed(1)}K`;
	return String(total);
}

/** 格式化 token 用量为 "94.7K (9%)" 形式（参考 OpenCode 上下文用量显示） */
function formatTokenUsage(usage: { input: number; output: number; cacheRead: number; cacheWrite: number }): string {
	const total = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
	if (total === 0) return "";
	const formatted = formatTokens(total);
	// Lumen 暂无 model context limit，用 200K 估算（与 sidebar Context section 一致）
	const percent = Math.round((total / 200_000) * 100);
	return `${formatted} (${percent}%)`;
}

const SLASH_COMMANDS = [
	{
		name: "agent",
		aliases: ["agents"],
		commandId: "agent.list",
		category: "Agent",
		description: "Switch the active Lumen agent persona",
	},
	{
		name: "activity",
		aliases: ["process", "tasks"],
		commandId: "agent.activity",
		category: "Agent",
		description: "Inspect running tools, background agents, and queued work",
	},
	{
		name: "permission",
		aliases: ["permissions", "approval", "approvals"],
		commandId: "permission.status",
		category: "Agent",
		description: "Show approval capability status and backend-limited actions",
	},
	{
		name: "mcp",
		aliases: ["mcps"],
		commandId: "mcp.list",
		category: "Agent",
		description: "List MCP servers when live MCP control is available",
	},
	{
		name: "provider",
		aliases: ["connect", "login"],
		commandId: "provider.connect",
		category: "Agent",
		description: "Connect a provider when TUI login is available",
	},
	{
		name: "clear",
		aliases: [],
		commandId: "session.new",
		category: "Session",
		description: "Start a fresh TUI conversation view",
	},
	{
		name: "compact",
		aliases: ["summarize"],
		commandId: "session.compact",
		category: "Session",
		description: "Compact the current session context",
	},
	{
		name: "copy",
		aliases: [],
		commandId: "session.copy",
		category: "Session",
		description: "Copy the last assistant message",
	},
	{
		name: "conceal",
		aliases: ["secrets"],
		commandId: "session.toggle.conceal",
		category: "Session",
		description: "Toggle concealed value rendering when available",
	},
	{
		name: "export",
		aliases: [],
		commandId: "session.export.html",
		category: "Session",
		description: "Export the current session as HTML",
	},
	{
		name: "editor",
		aliases: ["edit"],
		commandId: "prompt.editor",
		category: "Prompt",
		description: "Compose the prompt in an external editor",
	},
	{
		name: "fork",
		aliases: [],
		commandId: "session.fork",
		category: "Session",
		description: "Fork the current session",
	},
	{
		name: "exit",
		aliases: ["quit"],
		commandId: "app.exit",
		category: "System",
		description: "Exit the TUI",
	},
	{
		name: "help",
		aliases: [],
		commandId: "help.show",
		category: "System",
		description: "Show TUI help",
	},
	{
		name: "docs",
		aliases: ["documentation"],
		commandId: "docs.open",
		category: "System",
		description: "Open documentation when TUI browser integration is available",
	},
	{
		name: "import",
		aliases: [],
		commandId: "session.import",
		category: "Session",
		description: "Import a session JSONL file",
	},
	{
		name: "delete-session",
		aliases: ["delete"],
		commandId: "session.delete",
		category: "Session",
		description: "Delete a saved session",
	},
	{
		name: "jsonl",
		aliases: [],
		commandId: "session.export.jsonl",
		category: "Session",
		description: "Export the current session as JSONL",
	},
	{
		name: "model",
		aliases: ["models"],
		commandId: "model.list",
		category: "Agent",
		description: "Switch model",
	},
	{
		name: "model-next",
		aliases: ["next-model"],
		commandId: "model.cycle_recent",
		category: "Agent",
		description: "Cycle to the next recent model",
	},
	{
		name: "model-prev",
		aliases: ["previous-model", "prev-model"],
		commandId: "model.cycle_recent_reverse",
		category: "Agent",
		description: "Cycle to the previous recent model",
	},
	{
		name: "new",
		aliases: [],
		commandId: "session.new",
		category: "Session",
		description: "Create a new persisted session",
	},
	{
		name: "rename",
		aliases: [],
		commandId: "session.rename",
		category: "Session",
		description: "Rename the current session",
	},
	{
		name: "redo",
		aliases: [],
		commandId: "session.redo",
		category: "Session",
		description: "Restore previously undone messages",
	},
	{
		name: "sessions",
		aliases: ["resume", "continue"],
		commandId: "session.list",
		category: "Session",
		description: "Switch to a saved session",
	},
	{
		name: "session-info",
		aliases: ["metadata", "info"],
		commandId: "session.info",
		category: "Session",
		description: "Show current session metadata",
	},
	{
		name: "share",
		aliases: [],
		commandId: "session.share",
		category: "Session",
		description: "Share the current session through a private GitHub gist",
	},
	{
		name: "stash",
		aliases: ["stash-prompt"],
		commandId: "prompt.stash",
		category: "Prompt",
		description: "Stash the current prompt when prompt stash storage is available",
	},
	{
		name: "plugins",
		aliases: ["plugin"],
		commandId: "plugins.list",
		category: "System",
		description: "Open plugin manager when plugin UI is available",
	},
	{
		name: "sidebar",
		aliases: ["panel"],
		commandId: "session.sidebar.toggle",
		category: "Session",
		description: "Toggle the right sidebar",
	},
	{
		name: "timeline",
		aliases: ["jump"],
		commandId: "session.timeline",
		category: "Session",
		description: "Jump to a message",
	},
	{
		name: "tree",
		aliases: ["navigate"],
		commandId: "session.tree",
		category: "Session",
		description: "Navigate the current session tree",
	},
	{
		name: "tree-summary",
		aliases: ["navigate-summary"],
		commandId: "session.tree.summary",
		category: "Session",
		description: "Navigate the session tree and summarize the abandoned branch",
	},
	{
		name: "undo",
		aliases: [],
		commandId: "session.undo",
		category: "Session",
		description: "Revert the previous user message into the prompt",
	},
	{
		name: "unshare",
		aliases: [],
		commandId: "session.unshare",
		category: "Session",
		description: "Delete the tracked GitHub gist share for this session",
	},
	{
		name: "status",
		aliases: [],
		commandId: "opencode.status",
		category: "System",
		description: "Show session status",
	},
	{
		name: "thinking",
		aliases: [],
		commandId: "session.toggle.thinking",
		category: "Session",
		description: "Toggle reasoning visibility",
	},
	{
		name: "timestamps",
		aliases: ["time"],
		commandId: "session.toggle.timestamps",
		category: "Session",
		description: "Toggle message timestamps",
	},
	{
		name: "actions",
		aliases: ["details"],
		commandId: "session.toggle.actions",
		category: "Session",
		description: "Toggle tool details",
	},
	{
		name: "scrollbar",
		aliases: [],
		commandId: "session.toggle.scrollbar",
		category: "Session",
		description: "Toggle message scrollbar",
	},
	{
		name: "theme",
		aliases: [],
		commandId: "theme.switch",
		category: "System",
		description: "Toggle light or dark theme",
	},
	{
		name: "tools",
		aliases: [],
		commandId: "tools.list",
		category: "Agent",
		description: "Toggle active tools",
	},
] as const;
