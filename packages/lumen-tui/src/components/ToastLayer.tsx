import { For } from "solid-js";
import type { TuiRuntime, TuiToast } from "../runtime/types.js";
import { palette, type TuiTheme } from "./theme.js";

export function ToastLayer(props: { runtime: TuiRuntime }) {
	return (
		<box position="absolute" top={1} right={2} width={54} flexDirection="column" gap={1}>
			<For each={props.runtime.state.ui.toasts.slice(-4)}>
				{(toast) => <Toast runtime={props.runtime} toast={toast} />}
			</For>
		</box>
	);
}

function Toast(props: { runtime: TuiRuntime; toast: TuiToast }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	return (
		<box
			border={["left"]}
			borderColor={variantColor(theme(), props.toast.variant)}
			backgroundColor={theme().panel}
			paddingLeft={1}
			paddingRight={1}
		>
			<text fg={variantColor(theme(), props.toast.variant)}>
				{props.toast.title ? `${props.toast.title}: ` : ""}
				{props.toast.message}
			</text>
		</box>
	);
}

function variantColor(theme: TuiTheme, variant: TuiToast["variant"]) {
	if (variant === "success") return theme.success;
	if (variant === "warning") return theme.warning;
	if (variant === "error") return theme.error;
	return theme.info;
}
