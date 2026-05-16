import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import type { TuiRuntime, TuiToolPart } from "../runtime/types.js";
import { DialogLayer } from "./DialogLayer.js";
import { palette } from "./theme.js";

export function ActivityDialog(props: { open: boolean; runtime: TuiRuntime; onClose: () => void }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const [now, setNow] = createSignal(Date.now());
	const hasActivity = () =>
		Boolean(props.runtime.state.ui.permission) ||
		props.runtime.state.ui.activities.length > 0 ||
		props.runtime.state.ui.backgroundTasks.length > 0 ||
		props.runtime.state.ui.queued.length > 0;

	createEffect(() => {
		if (!props.open) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		onCleanup(() => clearInterval(timer));
	});

	return (
		<DialogLayer open={props.open} title="Activity" themeId={props.runtime.state.ui.theme} onClose={props.onClose}>
			<box flexDirection="column" gap={1}>
				<Show
					when={hasActivity()}
					fallback={<text fg={theme().textMuted}>No active tools, tasks, or queued work.</text>}
				>
					<Show when={props.runtime.state.ui.permission}>
						<box flexDirection="column" border={["left"]} borderColor={theme().warning} paddingLeft={1}>
							<text fg={theme().warning}>Waiting for input</text>
							<text fg={theme().text}>{props.runtime.state.ui.permission?.title ?? ""}</text>
							<Show when={props.runtime.state.ui.permission?.detail}>
								<text fg={theme().textMuted}>{props.runtime.state.ui.permission?.detail}</text>
							</Show>
							<For each={props.runtime.state.ui.permission?.actions ?? []}>
								{(action) => (
									<text fg={permissionActionColor(props.runtime, action.status)}>
										{action.status} {action.label}
									</text>
								)}
							</For>
						</box>
					</Show>
					<Show when={props.runtime.state.ui.activities.length > 0}>
						<box flexDirection="column">
							<text fg={theme().primary}>Tools</text>
							<For each={props.runtime.state.ui.activities}>
								{(activity) => (
									<text fg={statusColor(props.runtime, activity.status)}>
										{statusIcon(activity.status)} {activity.title}
										<span style={{ fg: theme().textMuted }}>
											{" "}
											{activity.summary ? `· ${trim(activity.summary, 74)}` : ""}
											{" · "}
											{formatElapsed((activity.endTime ?? now()) - activity.startTime)}
										</span>
									</text>
								)}
							</For>
						</box>
					</Show>
					<Show when={props.runtime.state.ui.backgroundTasks.length > 0}>
						<box flexDirection="column">
							<text fg={theme().secondary}>Background Agents</text>
							<For each={props.runtime.state.ui.backgroundTasks}>
								{(task) => (
									<box
										flexDirection="column"
										border={["left"]}
										borderColor={statusColor(props.runtime, task.status)}
										paddingLeft={1}
									>
										<text fg={statusColor(props.runtime, task.status)}>
											{statusIcon(task.status)} {task.title}
											<span style={{ fg: theme().textMuted }}>
												{" · "}
												{formatElapsed((task.endTime ?? now()) - task.startTime)}
											</span>
										</text>
										<text fg={theme().textMuted}>{trim(task.description, 110)}</text>
										<Show when={task.tokenCount !== undefined || task.queuedCount > 0}>
											<text fg={theme().textMuted}>
												{task.tokenCount !== undefined ? `${task.tokenCount} tokens` : ""}
												{task.tokenCount !== undefined && task.queuedCount > 0 ? " · " : ""}
												{task.queuedCount > 0 ? `${task.queuedCount} queued` : ""}
											</text>
										</Show>
										<text fg={theme().warning}>
											Details read-only · steer disabled · task-specific abort disabled
										</text>
									</box>
								)}
							</For>
						</box>
					</Show>
					<Show when={props.runtime.state.ui.queued.length > 0}>
						<box flexDirection="column">
							<text fg={theme().text}>Queued</text>
							<For each={props.runtime.state.ui.queued}>
								{(item) => (
									<text fg={theme().textMuted}>
										{item.kind === "command" ? "#" : ">"} {trim(item.text, 112)}
									</text>
								)}
							</For>
						</box>
					</Show>
				</Show>
			</box>
		</DialogLayer>
	);
}

function statusIcon(status: TuiToolPart["status"]): string {
	if (status === "running" || status === "pending") return "~";
	if (status === "error") return "x";
	if (status === "aborted") return "!";
	return "✓";
}

function statusColor(runtime: TuiRuntime, status: TuiToolPart["status"]): string {
	const theme = palette[runtime.state.ui.theme];
	if (status === "running" || status === "pending") return theme.primary;
	if (status === "error") return theme.error;
	if (status === "aborted") return theme.warning;
	return theme.textMuted;
}

function permissionActionColor(runtime: TuiRuntime, status: string): string {
	const theme = palette[runtime.state.ui.theme];
	if (status === "ready") return theme.success;
	if (status === "disabled") return theme.textMuted;
	return theme.warning;
}

function formatElapsed(milliseconds: number): string {
	const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes <= 0) return `${seconds}s`;
	return `${minutes}m ${seconds}s`;
}

function trim(value: string, max: number): string {
	if (value.length <= max) return value;
	return `${value.slice(0, Math.max(0, max - 3))}...`;
}
