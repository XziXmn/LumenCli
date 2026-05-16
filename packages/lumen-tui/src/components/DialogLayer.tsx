import { RGBA } from "@opentui/core";
import { Portal, useKeyboard } from "@opentui/solid";
import { type JSX, Show } from "solid-js";
import { DEFAULT_DIALOG_KEYBINDINGS, matchesKey } from "./keybindings.js";
import { locale } from "./locale.js";
import { palette } from "./theme.js";

/**
 * 对话框遮罩层 —— 通过 OpenTUI 的 <Portal> 直接挂到根渲染器上，
 * 这样 dialog 不会受滚动容器/裁剪盒影响，z-index 行为也由 OpenTUI 保证。
 */
export function DialogLayer(props: {
	open: boolean;
	title: string;
	themeId?: keyof typeof palette;
	fullscreen?: boolean;
	onClose: () => void;
	children: JSX.Element;
}) {
	const theme = () => palette[props.themeId ?? "dark"];
	useKeyboard((event) => {
		if (!props.open) return;
		if (matchesKey(event, DEFAULT_DIALOG_KEYBINDINGS.close)) props.onClose();
	});
	return (
		<Show when={props.open}>
			<Portal>
				<box
					position="absolute"
					top={0}
					left={0}
					width="100%"
					height="100%"
					zIndex={3000}
					alignItems="center"
					paddingTop={props.fullscreen ? 1 : 0}
					paddingBottom={props.fullscreen ? 1 : 0}
					paddingLeft={props.fullscreen ? 2 : 0}
					paddingRight={props.fullscreen ? 2 : 0}
					backgroundColor={props.fullscreen ? undefined : RGBA.fromInts(0, 0, 0, 150)}
				>
					<box
						width={props.fullscreen ? "100%" : 60}
						height={props.fullscreen ? "100%" : undefined}
						maxWidth={props.fullscreen ? undefined : "90%"}
						backgroundColor={theme().panel}
						paddingTop={1}
					>
						<box paddingLeft={4} paddingRight={4}>
							<box flexDirection="row" justifyContent="space-between">
								<text fg={theme().text}>
									<b>{props.title}</b>
								</text>
								<text fg={theme().textMuted}>{locale.dialogClose}</text>
							</box>
						</box>
						<box height={1} />
						{props.children}
					</box>
				</box>
			</Portal>
		</Show>
	);
}
