import { MacOSScrollAccel } from "@opentui/core";
import { createMemo, For, Show } from "solid-js";
import type { TuiRuntime } from "../runtime/types.js";
import { formatDirectory } from "./directory.js";
import { palette, type TuiTheme } from "./theme.js";

export function Sidebar(props: { runtime: TuiRuntime }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const directory = createMemo(() => formatDirectory(props.runtime.state.ui.cwd));

	return (
		<box flexDirection="column" flexGrow={1}>
			<scrollbox flexGrow={1} scrollAcceleration={new MacOSScrollAccel()}>
				<box flexShrink={0} gap={1} paddingRight={1}>
					<TitleSection runtime={props.runtime} />
					<ContextSection runtime={props.runtime} />
					<McpSection runtime={props.runtime} />
					<LspSection runtime={props.runtime} />
					<TodoSection runtime={props.runtime} />
					<FilesSection runtime={props.runtime} />
				</box>
			</scrollbox>
			<box flexShrink={0} gap={1} paddingTop={1}>
				<text fg={theme().textMuted} wrapMode="word">
					{directory()}
				</text>
				<text fg={theme().textMuted}>
					<span style={{ fg: theme().success }}>•</span> <b>Lumen</b>
					<span> {props.runtime.state.ui.version}</span>
				</text>
			</box>
		</box>
	);
}

/** MCP section: 仅在发现 MCP 配置时显示 */
function McpSection(props: { runtime: TuiRuntime }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const mcp = createMemo(() => props.runtime.state.ui.capabilities.find((c) => c.id === "mcp"));
	// 只在有 MCP 配置（status 为 ready 或 partial）时显示
	const show = createMemo(() => {
		const cap = mcp();
		return cap && (cap.status === "ready" || cap.status === "partial");
	});

	return (
		<Show when={show()}>
			<box>
				<box flexDirection="row" gap={1}>
					<text fg={theme().text}>
						<b>MCP</b>
					</text>
				</box>
				<box flexDirection="row" gap={1}>
					<text flexShrink={0} fg={statusDotColor(theme(), mcp()!.status)}>
						•
					</text>
					<text fg={theme().textMuted} wrapMode="word">
						{mcp()!.detail ?? ""}
					</text>
				</box>
			</box>
		</Show>
	);
}

/** 顶部标题 section（对应 OpenCode sidebar_title slot） */
function TitleSection(props: { runtime: TuiRuntime }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const session = () => props.runtime.state.session;
	return (
		<box paddingRight={1}>
			<text fg={theme().text}>
				<b>{session().title ?? session().id}</b>
			</text>
			<Show when={session().model}>
				<text fg={theme().textMuted}>
					{session().model!.provider}/{session().model!.displayName}
				</text>
			</Show>
		</box>
	);
}

/** Context section: tokens / used / cost */
function ContextSection(props: { runtime: TuiRuntime }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const usage = createMemo(() => props.runtime.state.session.tokenUsage);
	const total = createMemo(() => usage().input + usage().output + usage().cacheRead + usage().cacheWrite);
	// Lumen 暂无 context limit 数据，用 200K 作为参考估算
	const percent = createMemo(() => {
		if (total() === 0) return 0;
		return Math.round((total() / 200_000) * 100);
	});

	return (
		<box>
			<text fg={theme().text}>
				<b>Context</b>
			</text>
			<text fg={theme().textMuted}>{total().toLocaleString()} tokens</text>
			<text fg={theme().textMuted}>{percent()}% used</text>
		</box>
	);
}

/** LSP section: 客户端列表 */
function LspSection(props: { runtime: TuiRuntime }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const lsp = createMemo(() => props.runtime.state.ui.capabilities.find((c) => c.id === "lsp"));

	return (
		<Show when={lsp()}>
			<box>
				<box flexDirection="row" gap={1}>
					<text fg={theme().text}>
						<b>LSP</b>
					</text>
				</box>
				<box flexDirection="row" gap={1}>
					<text flexShrink={0} fg={statusDotColor(theme(), lsp()!.status)}>
						•
					</text>
					<text fg={theme().textMuted} wrapMode="word">
						{lsp()!.detail ??
							(lsp()!.status === "disabled" ? "LSPs are disabled" : "LSPs will activate as files are read")}
					</text>
				</box>
			</box>
		</Show>
	);
}

/** Todo section: 任务列表（仅有未完成项时显示） */
function TodoSection(props: { runtime: TuiRuntime }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const queued = createMemo(() => props.runtime.state.ui.queued);
	return (
		<Show when={queued().length > 0}>
			<box>
				<text fg={theme().text}>
					<b>Queued</b>
				</text>
				<For each={queued().slice(0, 5)}>
					{(item) => (
						<text fg={theme().textMuted} wrapMode="word">
							{item.kind === "command" ? "/" : "•"} {trim(item.text, 36)}
						</text>
					)}
				</For>
			</box>
		</Show>
	);
}

/** Files section: 后台任务和活动作为修改文件类似的结构 */
function FilesSection(props: { runtime: TuiRuntime }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const activities = createMemo(() =>
		props.runtime.state.ui.activities.filter((a) => a.status === "running" || a.status === "pending"),
	);
	const tasks = createMemo(() =>
		props.runtime.state.ui.backgroundTasks.filter((t) => t.status === "running" || t.status === "pending"),
	);

	return (
		<>
			<Show when={activities().length > 0}>
				<box>
					<text fg={theme().text}>
						<b>Activity</b>
					</text>
					<For each={activities().slice(0, 4)}>
						{(activity) => (
							<text fg={theme().textMuted} wrapMode="word">
								<span style={{ fg: theme().primary }}>~</span> {activity.name}:{" "}
								{trim(activity.summary || activity.title, 32)}
							</text>
						)}
					</For>
				</box>
			</Show>
			<Show when={tasks().length > 0}>
				<box>
					<text fg={theme().text}>
						<b>Background</b>
					</text>
					<For each={tasks().slice(0, 3)}>
						{(task) => (
							<text fg={theme().textMuted} wrapMode="word">
								<span style={{ fg: theme().warning }}>•</span> {task.name}: {trim(task.description, 32)}
							</text>
						)}
					</For>
				</box>
			</Show>
		</>
	);
}

function statusDotColor(theme: TuiTheme, status: string): string {
	if (status === "ready") return theme.success;
	if (status === "partial") return theme.warning;
	if (status === "disabled") return theme.textMuted;
	return theme.error;
}

function trim(value: string, max: number): string {
	if (value.length <= max) return value;
	return `${value.slice(0, Math.max(0, max - 3))}...`;
}
