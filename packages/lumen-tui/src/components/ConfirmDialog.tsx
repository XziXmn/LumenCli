import { useKeyboard } from "@opentui/solid";
import { createSignal } from "solid-js";
import { DialogLayer } from "./DialogLayer.js";
import { DEFAULT_DIALOG_KEYBINDINGS, matchesKey } from "./keybindings.js";
import { palette } from "./theme.js";

export function ConfirmDialog(props: {
	open: boolean;
	title: string;
	message: string;
	themeId?: keyof typeof palette;
	fullscreen?: boolean;
	confirmLabel?: string;
	cancelLabel?: string;
	onClose: () => void;
	onConfirm: () => void | Promise<void>;
}) {
	const [selected, setSelected] = createSignal<"confirm" | "cancel">("confirm");
	const theme = () => palette[props.themeId ?? "dark"];
	const confirmLabel = () => props.confirmLabel ?? "Confirm";
	const cancelLabel = () => props.cancelLabel ?? "Cancel";

	async function submit() {
		if (selected() === "cancel") {
			props.onClose();
			return;
		}
		await props.onConfirm();
	}

	useKeyboard((event) => {
		if (!props.open) return;
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.left)) {
			setSelected("confirm");
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.right)) {
			setSelected("cancel");
			return;
		}
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.submit)) {
			void submit();
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
				<box border={["left"]} borderColor={theme().warning} paddingLeft={1}>
					<text fg={theme().text}>{props.message}</text>
				</box>
				<box flexDirection="row" justifyContent="space-between" gap={2} paddingTop={1}>
					<box flexDirection="row" gap={1}>
						<box
							paddingLeft={1}
							paddingRight={1}
							backgroundColor={selected() === "confirm" ? theme().warning : theme().element}
						>
							<text fg={selected() === "confirm" ? theme().background : theme().text}>{confirmLabel()}</text>
						</box>
						<box
							paddingLeft={1}
							paddingRight={1}
							backgroundColor={selected() === "cancel" ? theme().elementHover : theme().element}
						>
							<text fg={selected() === "cancel" ? theme().text : theme().textMuted}>{cancelLabel()}</text>
						</box>
					</box>
					<text fg={theme().textMuted}>Left/Right select · Enter confirm</text>
				</box>
			</box>
		</DialogLayer>
	);
}
