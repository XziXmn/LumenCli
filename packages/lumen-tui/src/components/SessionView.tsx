import { useTerminalDimensions } from "@opentui/solid";
import { createMemo, Show } from "solid-js";
import type { TuiRuntime } from "../runtime/types.js";
import { MessageList } from "./MessageList.js";
import { ProcessPanel } from "./ProcessPanel.js";
import { PromptBox } from "./PromptBox.js";
import { Sidebar } from "./Sidebar.js";
import { palette } from "./theme.js";

const SIDEBAR_WIDTH = 36;

export function SessionView(props: {
	runtime: TuiRuntime;
	onOpenCommands: () => void;
	onCommand?: (commandId: string) => void | Promise<void>;
	onExit?: () => void;
	inputDisabled?: boolean;
}) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const dimensions = useTerminalDimensions();
	const wide = createMemo(() => dimensions().width > 120);
	const sidebarVisible = createMemo(() => {
		const mode = props.runtime.state.ui.sidebar;
		if (mode === "show") return true;
		if (mode === "hide") return false;
		return wide();
	});
	return (
		<box flexGrow={1} minHeight={0} flexDirection="row">
			<box flexGrow={1} minWidth={0} flexDirection="column" paddingLeft={2} paddingRight={2}>
				<box flexGrow={1} minHeight={0}>
					<MessageList runtime={props.runtime} />
				</box>
				<box paddingTop={1} paddingBottom={1} flexShrink={0}>
					<ProcessPanel runtime={props.runtime} />
					<PromptBox
						runtime={props.runtime}
						onOpenCommands={props.onOpenCommands}
						onCommand={props.onCommand}
						onExit={props.onExit}
						disabled={props.inputDisabled}
					/>
				</box>
			</box>
			<Show when={sidebarVisible()}>
				<box
					width={SIDEBAR_WIDTH}
					flexShrink={0}
					backgroundColor={theme().panel}
					paddingTop={1}
					paddingBottom={1}
					paddingLeft={2}
					paddingRight={2}
				>
					<Sidebar runtime={props.runtime} />
				</box>
			</Show>
		</box>
	);
}
