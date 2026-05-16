import { useKeyboard } from "@opentui/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { DialogLayer } from "./DialogLayer.js";
import { DEFAULT_DIALOG_KEYBINDINGS, matchesKey } from "./keybindings.js";
import { locale } from "./locale.js";
import { palette } from "./theme.js";

/** Maximum visible items in the select dialog list. */
const MAX_VISIBLE_ITEMS = 16;

export interface SelectDialogItem {
	id: string;
	title: string;
	description?: string;
	right?: string;
	enabled?: boolean;
	depth?: number;
	current?: boolean;
	leaf?: boolean;
	entryType?: string;
}

export function SelectDialog(props: {
	open: boolean;
	title: string;
	themeId?: keyof typeof palette;
	fullscreen?: boolean;
	items: SelectDialogItem[];
	emptyText: string;
	onClose: () => void;
	onSelect: (id: string) => void | Promise<void>;
}) {
	const [query, setQuery] = createSignal("");
	const [selected, setSelected] = createSignal(0);
	const theme = () => palette[props.themeId ?? "dark"];
	const visible = createMemo(() => {
		const normalized = query().trim().toLowerCase();
		if (!normalized) return props.items;
		return props.items.filter((item) => {
			return [item.title, item.description, item.right].some((value) => value?.toLowerCase().includes(normalized));
		});
	});

	const windowSlice = createMemo(() => {
		const items = visible();
		if (items.length <= MAX_VISIBLE_ITEMS) return { start: 0, end: items.length };
		const sel = selected();
		let start = Math.max(0, sel - Math.floor(MAX_VISIBLE_ITEMS / 2));
		const end = Math.min(items.length, start + MAX_VISIBLE_ITEMS);
		start = end - MAX_VISIBLE_ITEMS;
		return { start, end };
	});

	const windowItems = createMemo(() => {
		const { start, end } = windowSlice();
		return visible().slice(start, end);
	});

	async function choose() {
		const item = visible()[selected()];
		if (!item) return;
		if (item.enabled === false) return;
		await props.onSelect(item.id);
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
			setSelected((value) => Math.min(Math.max(0, visible().length - 1), value + 1));
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.pageUp)) {
			setSelected((value) => Math.max(0, value - MAX_VISIBLE_ITEMS));
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.pageDown)) {
			setSelected((value) => Math.min(Math.max(0, visible().length - 1), value + MAX_VISIBLE_ITEMS));
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.home)) {
			setSelected(0);
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.end)) {
			setSelected(Math.max(0, visible().length - 1));
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.backspace)) {
			setQuery((value) => value.slice(0, -1));
			setSelected(0);
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.submit)) {
			void choose();
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
			title={props.title}
			themeId={props.themeId}
			fullscreen={props.fullscreen}
			onClose={props.onClose}
		>
			<box flexDirection="column" gap={1}>
				<box border={["left"]} borderColor={theme().primary} paddingLeft={1}>
					<text fg={query() ? theme().text : theme().textMuted}>{query() || locale.selectDialogFilter}</text>
				</box>
				<Show when={visible().length > 0} fallback={<text fg={theme().textMuted}>{props.emptyText}</text>}>
					<Show when={windowSlice().start > 0}>
						<text fg={theme().textMuted}>{locale.selectDialogMoreAbove(windowSlice().start)}</text>
					</Show>
					<For each={windowItems()}>
						{(item) => {
							const globalIndex = () => visible().indexOf(item);
							return (
								<box
									paddingLeft={1 + (item.depth ?? 0) * 2}
									paddingRight={1}
									backgroundColor={globalIndex() === selected() ? theme().primary : undefined}
								>
									<box flexDirection="row" justifyContent="space-between" gap={2}>
										<text fg={itemTitleColor(props.themeId ?? "dark", item, globalIndex() === selected())}>
											{itemPrefix(item)}
											{itemPrefix(item) ? " " : ""}
											{item.title}
										</text>
										<Show when={item.right}>
											<text
												fg={
													globalIndex() === selected()
														? theme().panel
														: item.leaf
															? theme().primary
															: item.current
																? theme().secondary
																: theme().textMuted
												}
											>
												{item.right}
											</text>
										</Show>
									</box>
									<Show when={item.description}>
										<text fg={globalIndex() === selected() ? theme().panel : theme().textMuted}>
											{item.description}
										</text>
									</Show>
								</box>
							);
						}}
					</For>
					<Show when={windowSlice().end < visible().length}>
						<text fg={theme().textMuted}>
							{locale.selectDialogMoreBelow(visible().length - windowSlice().end)}
						</text>
					</Show>
				</Show>
				<Show when={visible().length > MAX_VISIBLE_ITEMS}>
					<text fg={theme().textMuted}>{locale.selectDialogStatus(visible().length, selected() + 1)}</text>
				</Show>
			</box>
		</DialogLayer>
	);
}

function itemPrefix(item: SelectDialogItem): string {
	if (item.depth === undefined) return "";
	if (item.leaf) return ">";
	if (item.current) return "*";
	if (item.entryType === "branch_summary" || item.entryType === "compaction") return "=";
	if (item.entryType === "custom" || item.entryType === "custom_message") return "#";
	return "-";
}

function itemTitleColor(themeId: keyof typeof palette, item: SelectDialogItem, selected: boolean): string {
	const theme = palette[themeId];
	if (selected) return theme.panel;
	if (item.enabled === false) return theme.border;
	if (item.leaf) return theme.primary;
	if (item.current) return theme.secondary;
	return theme.text;
}
