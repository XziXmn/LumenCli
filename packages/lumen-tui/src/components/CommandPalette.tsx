import { useKeyboard } from "@opentui/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { TuiCommand, TuiRuntime } from "../runtime/types.js";
import { DialogLayer } from "./DialogLayer.js";
import { DEFAULT_DIALOG_KEYBINDINGS, matchesKey } from "./keybindings.js";
import { locale } from "./locale.js";
import { palette } from "./theme.js";

/** Maximum visible items in the command palette list (excluding header/footer). */
const MAX_VISIBLE_ITEMS = 16;

interface GroupedItem {
	type: "header" | "command";
	category?: string;
	command?: TuiCommand;
}

export function CommandPalette(props: {
	runtime: TuiRuntime;
	open: boolean;
	onClose: () => void;
	onCommand: (commandId: string) => void | Promise<void>;
}) {
	const [selected, setSelected] = createSignal(0);
	const [query, setQuery] = createSignal("");
	const theme = () => palette[props.runtime.state.ui.theme];
	const commands = createMemo(() => props.runtime.state.ui.commands);
	const filtered = createMemo(() => {
		const normalized = query().trim().toLowerCase();
		if (!normalized) return commands();
		return commands()
			.map((command, index) => ({ command, index, score: commandMatchScore(command, normalized) }))
			.filter((item) => item.score !== undefined)
			.sort((left, right) => left.score! - right.score! || left.index - right.index)
			.map((item) => item.command);
	});

	// Group commands by category for display
	const grouped = createMemo((): GroupedItem[] => {
		const items = filtered();
		const result: GroupedItem[] = [];
		let lastCategory = "";
		for (const command of items) {
			if (command.category !== lastCategory) {
				lastCategory = command.category;
				result.push({ type: "header", category: command.category });
			}
			result.push({ type: "command", command });
		}
		return result;
	});

	// Flat list of selectable commands (for navigation)
	const selectableCommands = createMemo(() => filtered());

	const windowSlice = createMemo(() => {
		const items = grouped();
		if (items.length <= MAX_VISIBLE_ITEMS) return { start: 0, end: items.length };
		// Find the position of the selected command in grouped list
		const sel = selected();
		const selectedCmd = selectableCommands()[sel];
		const groupedIndex = selectedCmd
			? items.findIndex((item) => item.type === "command" && item.command === selectedCmd)
			: 0;
		let start = Math.max(0, groupedIndex - Math.floor(MAX_VISIBLE_ITEMS / 2));
		const end = Math.min(items.length, start + MAX_VISIBLE_ITEMS);
		start = end - MAX_VISIBLE_ITEMS;
		return { start: Math.max(0, start), end };
	});

	const windowItems = createMemo(() => {
		const { start, end } = windowSlice();
		return grouped().slice(start, end);
	});

	async function run(command: TuiCommand) {
		if (!command.enabled) return;
		await props.onCommand(command.id);
		props.onClose();
	}

	useKeyboard((event) => {
		if (!props.open) return;
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.close)) {
			props.onClose();
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.up) || matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.upCtrl)) {
			setSelected((value) => Math.max(0, value - 1));
			return;
		}
		if (
			matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.down) ||
			matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.downCtrl)
		) {
			setSelected((value) => Math.min(Math.max(0, selectableCommands().length - 1), value + 1));
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.pageUp)) {
			setSelected((value) => Math.max(0, value - MAX_VISIBLE_ITEMS));
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.pageDown)) {
			setSelected((value) => Math.min(Math.max(0, selectableCommands().length - 1), value + MAX_VISIBLE_ITEMS));
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.home)) {
			setSelected(0);
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.end)) {
			setSelected(Math.max(0, selectableCommands().length - 1));
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.backspace)) {
			setQuery((value) => value.slice(0, -1));
			setSelected(0);
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.submit)) {
			const command = selectableCommands()[selected()];
			if (command) void run(command);
			return;
		}
		if (event.sequence && event.sequence.length === 1 && !event.ctrl && !event.meta) {
			setQuery((value) => value + event.sequence);
			setSelected(0);
		}
	});

	return (
		<DialogLayer
			open={props.open}
			title={locale.commandPaletteTitle}
			themeId={props.runtime.state.ui.theme}
			onClose={props.onClose}
		>
			<box flexDirection="column" gap={0}>
				<box paddingBottom={1}>
					<text fg={query() ? theme().text : theme().textMuted}>
						{query() || "Search"}
						{query() ? "" : "_"}
					</text>
				</box>
				<Show when={windowSlice().start > 0}>
					<text fg={theme().textMuted}>{locale.commandPaletteMoreAbove(windowSlice().start)}</text>
				</Show>
				<For each={windowItems()}>
					{(item) => {
						if (item.type === "header") {
							return (
								<box paddingTop={1}>
									<text fg={theme().warning}>{item.category}</text>
								</box>
							);
						}
						const command = item.command!;
						const isSelected = () => selectableCommands()[selected()] === command;
						return (
							<box paddingLeft={3} paddingRight={3} backgroundColor={isSelected() ? theme().primary : undefined}>
								<box flexDirection="row" justifyContent="space-between" gap={2}>
									<text fg={command.enabled ? (isSelected() ? theme().panel : theme().text) : theme().border}>
										{command.title}
									</text>
									<Show when={command.shortcut || !command.enabled}>
										<text
											fg={
												command.enabled
													? isSelected()
														? theme().panel
														: theme().textMuted
													: theme().warning
											}
										>
											{command.enabled ? formatShortcut(command.shortcut) : locale.commandPaletteDisabled}
										</text>
									</Show>
								</box>
							</box>
						);
					}}
				</For>
				<Show when={windowSlice().end < grouped().length}>
					<text fg={theme().textMuted}>
						{locale.commandPaletteMoreBelow(grouped().length - windowSlice().end)}
					</text>
				</Show>
			</box>
		</DialogLayer>
	);
}

function formatShortcut(shortcut: string | undefined): string {
	if (!shortcut) return "";
	return shortcut.replace(/<leader>/g, "ctrl+x ");
}

function commandMatchScore(command: TuiCommand, query: string): number | undefined {
	const title = command.title.toLowerCase();
	const id = command.id.toLowerCase();
	const category = command.category.toLowerCase();
	const description = command.description?.toLowerCase();
	const shortcut = command.shortcut?.toLowerCase();
	if (title === query) return 0;
	if (title.startsWith(query)) return 1;
	if (title.includes(query)) return 2;
	if (id === query) return 3;
	if (id.includes(query)) return 4;
	if (category.includes(query)) return 5;
	if (shortcut?.includes(query)) return 6;
	if (description?.includes(query)) return 7;
	return undefined;
}
