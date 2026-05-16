import type { TextareaRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/solid";
import { createSignal, onCleanup, onMount } from "solid-js";
import { DialogLayer } from "./DialogLayer.js";
import { DEFAULT_DIALOG_KEYBINDINGS, matchesKey } from "./keybindings.js";
import { palette } from "./theme.js";

export function InputDialog(props: {
	open: boolean;
	title: string;
	themeId?: keyof typeof palette;
	fullscreen?: boolean;
	placeholder: string;
	initialValue?: string;
	onClose: () => void;
	onSubmit: (value: string) => void | Promise<void>;
}) {
	const [value, setValue] = createSignal(props.initialValue ?? "");
	const theme = () => palette[props.themeId ?? "dark"];
	let input: TextareaRenderable | undefined;

	async function submit() {
		const next = (input?.plainText ?? value()).trim();
		if (!next) return;
		await props.onSubmit(next);
		props.onClose();
	}

	useKeyboard((event) => {
		if (!props.open) return;
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.close)) {
			props.onClose();
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.submit)) {
			void submit();
		}
	});

	onMount(() => {
		input?.focus();
		if (props.initialValue) input?.setText(props.initialValue);
	});

	onCleanup(() => {
		input = undefined;
	});

	return (
		<DialogLayer
			open={props.open}
			title={props.title}
			themeId={props.themeId}
			fullscreen={props.fullscreen}
			onClose={props.onClose}
		>
			<box
				border={["left"]}
				borderColor={theme().primary}
				backgroundColor={theme().element}
				paddingLeft={1}
				paddingRight={1}
			>
				<textarea
					ref={(next: TextareaRenderable) => {
						input = next;
					}}
					minHeight={1}
					maxHeight={1}
					placeholder={props.placeholder}
					placeholderColor={theme().textMuted}
					textColor={theme().text}
					focusedTextColor={theme().text}
					focusedBackgroundColor={theme().element}
					onContentChange={() => setValue(input?.plainText ?? "")}
					onSubmit={() => void submit()}
				/>
			</box>
		</DialogLayer>
	);
}
