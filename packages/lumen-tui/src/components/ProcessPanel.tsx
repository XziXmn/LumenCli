import { For, Show } from "solid-js";
import type { TuiRuntime } from "../runtime/types.js";
import { palette } from "./theme.js";

export function ProcessPanel(props: { runtime: TuiRuntime }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const hasContent = () =>
		Boolean(props.runtime.state.ui.permission) ||
		props.runtime.state.ui.backgroundTasks.length > 0 ||
		props.runtime.state.ui.queued.length > 0;
	return (
		<Show when={hasContent()}>
			<box
				marginTop={1}
				border={["left"]}
				borderColor={theme().border}
				backgroundColor={theme().panelRaised}
				paddingLeft={2}
				paddingRight={1}
				paddingTop={1}
				paddingBottom={1}
				flexDirection="column"
			>
				<Show when={props.runtime.state.ui.permission}>
					<box flexDirection="column">
						<text fg={theme().warning}>△ Waiting for input</text>
						<text fg={theme().text}>{props.runtime.state.ui.permission?.title ?? ""}</text>
						<Show when={props.runtime.state.ui.permission?.detail}>
							<text fg={theme().textMuted}>{props.runtime.state.ui.permission?.detail}</text>
						</Show>
					</box>
				</Show>
				<Show when={props.runtime.state.ui.backgroundTasks.length > 0}>
					<box flexDirection="column" marginTop={props.runtime.state.ui.permission ? 1 : 0}>
						<text fg={theme().primary}>Background agents</text>
						<For each={props.runtime.state.ui.backgroundTasks}>
							{(task) => (
								<box flexDirection="column">
									<text
										fg={
											task.status === "error"
												? theme().error
												: task.status === "aborted"
													? theme().warning
													: task.status === "running"
														? theme().primary
														: theme().textMuted
										}
									>
										{task.status === "running" || task.status === "pending"
											? "~"
											: task.status === "error"
												? "x"
												: task.status === "aborted"
													? "!"
													: "✓"}{" "}
										{task.name}: {trim(task.description, 96)}
										{task.queuedCount > 0 ? ` · ${task.queuedCount} queued` : ""}
									</text>
									<text fg={theme().textMuted}>read-only · steer disabled</text>
								</box>
							)}
						</For>
					</box>
				</Show>
				<Show when={props.runtime.state.ui.queued.length > 0}>
					<box flexDirection="column" marginTop={1}>
						<text fg={theme().secondary}>Queued</text>
						<For each={props.runtime.state.ui.queued.slice(0, 4)}>
							{(item) => (
								<text fg={theme().textMuted}>
									{item.kind === "command" ? "#" : ">"} {trim(item.text, 110)}
								</text>
							)}
						</For>
					</box>
				</Show>
			</box>
		</Show>
	);
}

function trim(value: string, max: number): string {
	if (value.length <= max) return value;
	return `${value.slice(0, Math.max(0, max - 3))}...`;
}
