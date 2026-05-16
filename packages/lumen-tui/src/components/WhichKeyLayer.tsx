import { For, Show } from "solid-js";
import type { TuiRuntime } from "../runtime/types.js";
import { DEFAULT_LEADER_KEYBINDINGS, keyBindingDisplay } from "./keybindings.js";
import { palette } from "./theme.js";

export function WhichKeyLayer(props: { runtime: TuiRuntime; open: boolean }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const commandById = () => new Map(props.runtime.state.ui.commands.map((command) => [command.id, command]));
	const items = () =>
		Object.entries(DEFAULT_LEADER_KEYBINDINGS)
			.map(([id, binding]) => {
				const command = commandById().get(binding.command);
				return {
					id,
					key: keyBindingDisplay(binding),
					title: command?.title ?? binding.command,
					category: command?.category ?? "Command",
					enabled: command?.enabled !== false && !binding.disabled,
				};
			})
			.filter((item) => item.key !== "disabled")
			.sort((left, right) => left.key.localeCompare(right.key));
	return (
		<Show when={props.open}>
			<box position="absolute" left={2} right={2} bottom={2}>
				<box
					border={["left"]}
					borderColor={theme().primary}
					backgroundColor={theme().panel}
					paddingLeft={2}
					paddingRight={2}
					paddingTop={1}
					paddingBottom={1}
					flexDirection="column"
				>
					<box flexDirection="row" justifyContent="space-between" gap={2}>
						<text fg={theme().primary}>Leader</text>
						<text fg={theme().textMuted}>next key selects a command</text>
					</box>
					<box marginTop={1} flexDirection="row" flexWrap="wrap" gap={2}>
						<For each={items()}>
							{(item) => (
								<box flexDirection="row" gap={1}>
									<text fg={item.enabled ? theme().text : theme().border}>{item.key}</text>
									<text fg={item.enabled ? theme().textMuted : theme().border}>{item.title}</text>
								</box>
							)}
						</For>
					</box>
				</box>
			</box>
		</Show>
	);
}
