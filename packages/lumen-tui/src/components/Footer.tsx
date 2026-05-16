import { useTerminalDimensions } from "@opentui/solid";
import { createMemo, Show } from "solid-js";
import type { TuiRuntime } from "../runtime/types.js";
import { formatDirectory } from "./directory.js";
import { palette, type TuiTheme } from "./theme.js";

export function Footer(props: { runtime: TuiRuntime; leader: boolean; onOpenCommands: () => void }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const dimensions = useTerminalDimensions();
	const compact = createMemo(() => dimensions().width < 100);

	const directory = createMemo(() => formatDirectory(props.runtime.state.ui.cwd));

	const mcp = createMemo(() => props.runtime.state.ui.capabilities.find((c) => c.id === "mcp"));
	const mcpCount = createMemo(() => extractCount(mcp()?.detail, /(\d+)\s+server\(s\)/));

	const permissionCount = createMemo(() => (props.runtime.state.ui.permission ? 1 : 0));

	return (
		<box
			width="100%"
			paddingTop={1}
			paddingBottom={1}
			paddingLeft={2}
			paddingRight={2}
			flexDirection="row"
			flexShrink={0}
			gap={2}
		>
			<text fg={theme().textMuted}>{directory()}</text>
			<Show when={permissionCount() > 0}>
				<text fg={theme().warning}>
					<span style={{ fg: theme().warning }}>△</span> {permissionCount()} 审批
				</text>
			</Show>
			<text fg={theme().text}>
				<span style={{ fg: capDotColor(theme(), mcp()?.status, mcpCount()) }}>⊙</span> {mcpCount()} MCP
			</text>
			<box flexGrow={1} />
			<Show when={!compact()}>
				<text fg={theme().textMuted}>{props.runtime.state.ui.version}</text>
			</Show>
		</box>
	);
}

function extractCount(detail: string | undefined, pattern: RegExp): number {
	if (!detail) return 0;
	const match = detail.match(pattern);
	return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function capDotColor(theme: TuiTheme, status: string | undefined, count: number): string {
	if (count > 0 && status === "ready") return theme.success;
	if (status === "ready") return theme.success;
	if (status === "partial") return theme.warning;
	if (count > 0) return theme.success;
	return theme.textMuted;
}
