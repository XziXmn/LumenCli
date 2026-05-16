import { useBindings, useKeymap } from "@opentui/keymap/solid";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import type { TuiInteractionRequest, TuiRuntime } from "../runtime/types.js";
import { ActivityDialog } from "./ActivityDialog.js";
import { CommandPalette } from "./CommandPalette.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { DialogLayer } from "./DialogLayer.js";
import { Footer } from "./Footer.js";
import { HomeView } from "./HomeView.js";
import { InputDialog } from "./InputDialog.js";
import { DEFAULT_APP_KEYBINDINGS, DEFAULT_LEADER_KEYBINDINGS, LAYER_PRIORITY, matchesKey } from "./keybindings.js";
import { SelectDialog } from "./SelectDialog.js";
import { SessionView } from "./SessionView.js";
import { ToastLayer } from "./ToastLayer.js";
import { palette } from "./theme.js";
import { WhichKeyLayer } from "./WhichKeyLayer.js";

type OpenDialog =
	| "help"
	| "status"
	| "sessions"
	| "sessionInfo"
	| "deleteSession"
	| "timeline"
	| "tree"
	| "treeSummary"
	| "fork"
	| "models"
	| "agents"
	| "activity"
	| "permission"
	| "tools"
	| "themes"
	| "import"
	| "rename"
	| undefined;

export function AppShell(props: { runtime: TuiRuntime; initialMessage?: string; onExit: () => void }) {
	const renderer = useRenderer();
	const dimensions = useTerminalDimensions();
	const keymap = useKeymap();
	const [commandOpen, setCommandOpen] = createSignal(false);
	const [openDialog, setOpenDialog] = createSignal<OpenDialog>();
	const [leader, setLeader] = createSignal(false);

	// 监听 keymap pending sequence —— leader 键被按下后，pendingSequence 非空，
	// 直到二级键到达或超时。这样 leader UI 状态直接由 keymap 推动，无需手写定时器。
	const unsubscribePending = keymap.on("pendingSequence", () => {
		setLeader(keymap.hasPendingSequence());
		renderer.requestRender();
	});

	const state = createMemo(() => props.runtime.state);
	const theme = createMemo(() => palette[state().ui.theme]);
	const hasMessages = createMemo(() => state().session.messages.length > 0);
	const busy = createMemo(() => state().session.status === "working" || state().session.status === "compacting");
	const interaction = createMemo(() => state().ui.interaction);
	const inputDisabled = createMemo(() => commandOpen() || Boolean(openDialog()) || Boolean(interaction()));
	const selectInteraction = createMemo(() => {
		const request = interaction();
		return request?.kind === "select" ? request : undefined;
	});
	const inputInteraction = createMemo(() => {
		const request = interaction();
		return request?.kind === "input" ? request : undefined;
	});
	const confirmInteraction = createMemo(() => {
		const request = interaction();
		return request?.kind === "confirm" ? request : undefined;
	});
	const size = createMemo(() => ({
		width: Math.max(dimensions().width || process.stdout.columns || 80, 1),
		height: Math.max(dimensions().height || process.stdout.rows || 24, 1),
	}));

	// 注册 leader 二级键（<leader>a 等）—— 通过 keymap 派发命令，
	// 替换原先的 setTimeout + leaderCommand 表查找。
	useBindings(() => ({
		priority: LAYER_PRIORITY.leader,
		bindings: Object.entries(DEFAULT_LEADER_KEYBINDINGS).map(([key, binding]) => ({
			key: `<leader>${binding.name ?? key.slice(0, 1)}`,
			cmd: () => {
				if (commandOpen() || openDialog() || interaction()) return false;
				void handleCommand(binding.command);
				return true;
			},
		})),
	}));

	useKeyboard((event) => {
		if (commandOpen() || openDialog() || interaction()) return;
		// leader 序列由 keymap 派发，这里只处理非 leader 的全局快捷键。
		if (keymap.hasPendingSequence()) return;
		if (matchesKey(event, DEFAULT_APP_KEYBINDINGS.commandPalette)) {
			setCommandOpen(true);
			return;
		}
		if (matchesKey(event, DEFAULT_APP_KEYBINDINGS.modelCycleReverse)) {
			void props.runtime.executeCommand("model.cycle_recent_reverse");
			return;
		}
		if (matchesKey(event, DEFAULT_APP_KEYBINDINGS.modelCycle)) {
			void props.runtime.executeCommand("model.cycle_recent");
			return;
		}
		if (matchesKey(event, DEFAULT_APP_KEYBINDINGS.interrupt) && busy()) {
			void props.runtime.abort();
			return;
		}
		if (matchesKey(event, DEFAULT_APP_KEYBINDINGS.exit)) {
			if (busy()) {
				void props.runtime.abort();
				return;
			}
			props.onExit();
		}
	});

	const unsubscribe = props.runtime.subscribe(() => renderer.requestRender());
	onCleanup(() => {
		unsubscribe();
		unsubscribePending();
	});

	async function handleCommand(commandId: string) {
		if (commandId === "app.exit") {
			props.onExit();
			return;
		}
		if (commandId === "help.show") {
			showDialog("help");
			return;
		}
		if (commandId === "opencode.status") {
			showDialog("status");
			return;
		}
		if (commandId === "session.rename") {
			showDialog("rename");
			return;
		}
		if (commandId === "session.fork") {
			showDialog("fork");
			return;
		}
		if (commandId === "session.list") {
			showDialog("sessions");
			return;
		}
		if (commandId === "session.info") {
			showDialog("sessionInfo");
			return;
		}
		if (commandId === "session.import") {
			showDialog("import");
			return;
		}
		if (commandId === "session.delete") {
			showDialog("deleteSession");
			return;
		}
		if (commandId === "session.timeline") {
			showDialog("timeline");
			return;
		}
		if (commandId === "session.tree") {
			showDialog("tree");
			return;
		}
		if (commandId === "session.tree.summary") {
			showDialog("treeSummary");
			return;
		}
		if (commandId === "model.list") {
			showDialog("models");
			return;
		}
		if (commandId === "agent.list") {
			showDialog("agents");
			return;
		}
		if (commandId === "agent.activity") {
			showDialog("activity");
			return;
		}
		if (commandId === "permission.status") {
			showDialog("permission");
			return;
		}
		if (commandId === "tools.list") {
			showDialog("tools");
			return;
		}
		if (commandId === "theme.switch" || commandId === "theme.list") {
			showDialog("themes");
			return;
		}
		await props.runtime.executeCommand(commandId);
	}

	function showDialog(dialog: Exclude<OpenDialog, undefined>) {
		setOpenDialog(dialog);
		renderer.requestRender();
		setTimeout(() => renderer.requestRender(), 0);
	}

	return (
		<box width={size().width} height={size().height} backgroundColor={theme().background} flexDirection="column">
			<box flexGrow={1} minHeight={0} flexDirection="column">
				<Show
					when={hasMessages()}
					fallback={
						<HomeView
							runtime={props.runtime}
							initialMessage={props.initialMessage}
							onOpenCommands={() => setCommandOpen(true)}
							onCommand={handleCommand}
							onExit={props.onExit}
							inputDisabled={inputDisabled()}
						/>
					}
				>
					<SessionView
						runtime={props.runtime}
						onOpenCommands={() => setCommandOpen(true)}
						onCommand={handleCommand}
						onExit={props.onExit}
						inputDisabled={inputDisabled()}
					/>
				</Show>
			</box>
			<Show when={!hasMessages()}>
				<Footer runtime={props.runtime} leader={leader()} onOpenCommands={() => setCommandOpen(true)} />
			</Show>
			<WhichKeyLayer runtime={props.runtime} open={leader()} />
			<ToastLayer runtime={props.runtime} />
			<CommandPalette
				runtime={props.runtime}
				open={commandOpen()}
				onClose={() => setCommandOpen(false)}
				onCommand={handleCommand}
			/>
			<DialogLayer
				open={openDialog() === "help"}
				title="Help"
				themeId={state().ui.theme}
				onClose={() => setOpenDialog(undefined)}
			>
				<box flexDirection="column" gap={1}>
					<text fg={theme().text}>Enter submit · Ctrl+P commands · Esc interrupt · Ctrl+C exit/cancel</text>
					<text fg={theme().textMuted}>Tab shell · PgUp/PgDn scroll · Ctrl+X leader · F2 model cycle</text>
					<text fg={theme().textMuted}>
						Slash commands include /model, /sessions, /fork, /share, /activity, /theme, /tools.
					</text>
					<text fg={theme().warning}>
						Partial features are visible in /status and disabled entries stay disabled.
					</text>
				</box>
			</DialogLayer>
			<DialogLayer
				open={openDialog() === "status"}
				title="Status"
				themeId={state().ui.theme}
				onClose={() => setOpenDialog(undefined)}
			>
				<box flexDirection="column" gap={1}>
					<text fg={theme().text}>Session {state().session.id}</text>
					<text fg={theme().textMuted}>Status {state().session.status}</text>
					<text fg={theme().textMuted}>Messages {state().session.messages.length}</text>
					<text fg={theme().textMuted}>
						Tokens {state().session.tokenUsage.input}/{state().session.tokenUsage.output}
					</text>
					<text fg={theme().textMuted}>Model {state().session.model?.displayName ?? "No model"}</text>
					<text fg={theme().text}>Capabilities</text>
					{state().ui.capabilities.map((capability) => (
						<text fg={capabilityColor(state().ui.theme, capability.status)}>
							{capability.status} {capability.label}
							{capability.detail ? ` · ${capability.detail}` : ""}
						</text>
					))}
				</box>
			</DialogLayer>
			<InputDialog
				open={openDialog() === "rename"}
				title="Rename Session"
				themeId={state().ui.theme}
				placeholder="Session title"
				initialValue={state().session.title}
				onClose={() => setOpenDialog(undefined)}
				onSubmit={(value) => props.runtime.executeCommand(`session.rename:${value}`)}
			/>
			<InputDialog
				open={openDialog() === "import"}
				title="Import Session"
				themeId={state().ui.theme}
				placeholder="path/to/session.jsonl"
				onClose={() => setOpenDialog(undefined)}
				onSubmit={(value) => props.runtime.executeCommand(`session.import:${value}`)}
			/>
			<SelectDialog
				open={openDialog() === "sessions"}
				title="Switch Session"
				themeId={state().ui.theme}
				items={state().ui.sessions.map((session) => ({
					id: session.path,
					title: session.title,
					description: session.description,
					right: session.current ? "current" : new Date(session.modified).toLocaleDateString(),
					enabled: true,
				}))}
				emptyText="No saved sessions"
				onClose={() => setOpenDialog(undefined)}
				onSelect={(id) => props.runtime.executeCommand(`session.switch:${id}`)}
			/>
			<DialogLayer
				open={openDialog() === "sessionInfo"}
				title="Session Info"
				themeId={state().ui.theme}
				onClose={() => setOpenDialog(undefined)}
			>
				<box flexDirection="column" gap={1}>
					<text fg={theme().text}>Session {state().session.title ?? state().session.id}</text>
					<text fg={theme().textMuted}>ID {state().session.id}</text>
					<text fg={theme().textMuted}>Status {state().session.status}</text>
					<text fg={theme().textMuted}>CWD {currentSessionOption(state())?.cwd ?? state().ui.cwd}</text>
					<Show when={currentSessionOption(state())?.path}>
						<text fg={theme().textMuted}>File {currentSessionOption(state())?.path}</text>
					</Show>
					<text fg={theme().textMuted}>Messages {state().session.messages.length}</text>
					<text fg={theme().textMuted}>
						Tokens {state().session.tokenUsage.input}/{state().session.tokenUsage.output}
					</text>
					<text fg={theme().textMuted}>Model {state().session.model?.displayName ?? "No model"}</text>
					<text fg={theme().textMuted}>Agent {state().session.agent?.displayName ?? "No agent"}</text>
					<text fg={theme().textMuted}>
						Tree {state().ui.treeItems.length} entries · {leafCount(state())} leaves
					</text>
					<text fg={theme().text}>Runtime</text>
					{state()
						.ui.capabilities.slice(0, 6)
						.map((capability) => (
							<text fg={capabilityColor(state().ui.theme, capability.status)}>
								{capability.status} {capability.label}
								{capability.detail ? ` · ${capability.detail}` : ""}
							</text>
						))}
				</box>
			</DialogLayer>
			<SelectDialog
				open={openDialog() === "deleteSession"}
				title="Delete Session"
				themeId={state().ui.theme}
				items={state().ui.sessions.map((session) => ({
					id: session.path,
					title: session.title,
					description: session.description,
					right: session.current ? "current" : new Date(session.modified).toLocaleDateString(),
					enabled: !session.current,
				}))}
				emptyText="No deletable sessions"
				onClose={() => setOpenDialog(undefined)}
				onSelect={(id) => props.runtime.executeCommand(`session.delete:${id}`)}
			/>
			<SelectDialog
				open={openDialog() === "timeline"}
				title="Jump to Message"
				themeId={state().ui.theme}
				items={state().session.messages.map((message, index) => ({
					id: message.id,
					title: `${index + 1}. ${message.role}`,
					description: messageSummary(message),
					right: new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
					enabled: true,
				}))}
				emptyText="No messages"
				onClose={() => setOpenDialog(undefined)}
				onSelect={(id) => props.runtime.executeCommand(`session.focus:${id}`)}
			/>
			<SelectDialog
				open={openDialog() === "tree"}
				title="Navigate Session Tree"
				themeId={state().ui.theme}
				items={state().ui.treeItems}
				emptyText="No persisted messages"
				onClose={() => setOpenDialog(undefined)}
				onSelect={(id) => props.runtime.executeCommand(`session.navigate:${id}`)}
			/>
			<SelectDialog
				open={openDialog() === "treeSummary"}
				title="Navigate Tree With Summary"
				themeId={state().ui.theme}
				items={state().ui.treeItems}
				emptyText="No persisted messages"
				onClose={() => setOpenDialog(undefined)}
				onSelect={(id) => props.runtime.executeCommand(`session.navigate_summary:${id}`)}
			/>
			<SelectDialog
				open={openDialog() === "fork"}
				title="Fork From Message"
				themeId={state().ui.theme}
				items={state().ui.treeItems}
				emptyText="No persisted messages"
				onClose={() => setOpenDialog(undefined)}
				onSelect={(id) => props.runtime.executeCommand(`session.fork:${id}`)}
			/>
			<SelectDialog
				open={openDialog() === "models"}
				title="Switch Model"
				themeId={state().ui.theme}
				items={state().ui.models.map((model) => ({
					id: model.key,
					title: model.displayName,
					description: `${model.provider}/${model.id}`,
					right: model.available ? (model.reasoning ? "reasoning" : "ready") : "no auth",
					enabled: model.available,
				}))}
				emptyText="No configured models"
				onClose={() => setOpenDialog(undefined)}
				onSelect={(id) => props.runtime.setModel(id)}
			/>
			<SelectDialog
				open={openDialog() === "agents"}
				title="Switch Agent"
				themeId={state().ui.theme}
				items={state().ui.agents.map((agent) => ({
					id: agent.id,
					title: agent.displayName,
					description: agent.description,
					enabled: agent.enabled,
				}))}
				emptyText="No agents"
				onClose={() => setOpenDialog(undefined)}
				onSelect={(id) => props.runtime.setAgent(id)}
			/>
			<ActivityDialog
				open={openDialog() === "activity"}
				runtime={props.runtime}
				onClose={() => setOpenDialog(undefined)}
			/>
			<DialogLayer
				open={openDialog() === "permission"}
				title="Permission Status"
				themeId={state().ui.theme}
				onClose={() => setOpenDialog(undefined)}
			>
				<box flexDirection="column" gap={1}>
					<Show
						when={state().ui.permission}
						fallback={
							<text fg={theme().textMuted}>
								No pending permission request. ask_user/select/input/confirm are wired through Lumen's extension
								UI.
							</text>
						}
					>
						<box flexDirection="column" border={["left"]} borderColor={theme().warning} paddingLeft={1}>
							<text fg={theme().warning}>Waiting for input</text>
							<text fg={theme().text}>{state().ui.permission?.title ?? ""}</text>
							<Show when={state().ui.permission?.detail}>
								<text fg={theme().textMuted}>{state().ui.permission?.detail}</text>
							</Show>
						</box>
					</Show>
					<text fg={theme().text}>Approval Actions</text>
					{permissionActionRows(state().ui.permission).map((action) => (
						<text fg={permissionActionColor(state().ui.theme, action.status)}>
							{action.status} {action.label}
							{action.detail ? ` · ${action.detail}` : ""}
						</text>
					))}
				</box>
			</DialogLayer>
			<SelectDialog
				open={openDialog() === "tools"}
				title="Toggle Tools"
				themeId={state().ui.theme}
				items={state().ui.tools.map((tool) => ({
					id: tool.id,
					title: tool.displayName,
					description: tool.description,
					right: tool.enabled ? "on" : "off",
					enabled: true,
				}))}
				emptyText="No tools"
				onClose={() => setOpenDialog(undefined)}
				onSelect={(id) => props.runtime.executeCommand(`tool.toggle.${id}`)}
			/>
			<SelectDialog
				open={openDialog() === "themes"}
				title="Switch Theme"
				themeId={state().ui.theme}
				items={themeItems(state().ui.theme)}
				emptyText="No themes"
				onClose={() => setOpenDialog(undefined)}
				onSelect={(id) => props.runtime.setTheme(id)}
			/>
			<SelectDialog
				open={Boolean(selectInteraction())}
				title={interactionTitle(selectInteraction())}
				themeId={state().ui.theme}
				fullscreen
				items={
					selectInteraction()
						? selectInteraction()!.options.map((option) => ({
								id: option,
								title: option,
								description: selectInteraction()?.message,
								enabled: true,
							}))
						: []
				}
				emptyText="No options"
				onClose={() => {
					const request = interaction();
					if (request) props.runtime.respondInteraction(request.id, undefined);
				}}
				onSelect={(value) => {
					const request = interaction();
					if (request) props.runtime.respondInteraction(request.id, value);
				}}
			/>
			<InputDialog
				open={Boolean(inputInteraction())}
				title={interactionTitle(inputInteraction())}
				themeId={state().ui.theme}
				fullscreen
				placeholder={inputInteraction()?.placeholder ?? "Type a response"}
				onClose={() => {
					const request = interaction();
					if (request) props.runtime.respondInteraction(request.id, undefined);
				}}
				onSubmit={(value) => {
					const request = interaction();
					if (request) props.runtime.respondInteraction(request.id, value);
				}}
			/>
			<ConfirmDialog
				open={Boolean(confirmInteraction())}
				title={interactionTitle(confirmInteraction())}
				message={confirmInteraction()?.message ?? ""}
				themeId={state().ui.theme}
				fullscreen
				confirmLabel={confirmInteraction()?.confirmLabel}
				cancelLabel={confirmInteraction()?.cancelLabel}
				onClose={() => {
					const request = interaction();
					if (request) props.runtime.respondInteraction(request.id, undefined);
				}}
				onConfirm={() => {
					const request = interaction();
					if (request) props.runtime.respondInteraction(request.id, "confirm");
				}}
			/>
		</box>
	);
}

function interactionTitle(request: TuiInteractionRequest | undefined | null): string {
	if (!request) return "Input";
	if (request.kind === "select" && request.message) return `${request.title}: ${request.message}`;
	return request.title;
}

function themeItems(current: "dark" | "light") {
	return [
		{
			id: "dark",
			title: "Dark",
			description: "Low-contrast OpenCode-like dark terminal theme",
			right: current === "dark" ? "current" : undefined,
			enabled: true,
		},
		{
			id: "light",
			title: "Light",
			description: "Light terminal theme",
			right: current === "light" ? "current" : undefined,
			enabled: true,
		},
	];
}

function currentSessionOption(state: TuiRuntime["state"]) {
	return state.ui.sessions.find((session) => session.current);
}

function leafCount(state: TuiRuntime["state"]): number {
	return state.ui.treeItems.filter((item) => item.leaf).length;
}

function capabilityColor(themeId: "dark" | "light", status: string): string {
	const theme = palette[themeId];
	if (status === "ready") return theme.success;
	if (status === "partial") return theme.warning;
	if (status === "disabled") return theme.textMuted;
	return theme.border;
}

function permissionActionRows(permission: TuiRuntime["state"]["ui"]["permission"]) {
	return (
		permission?.actions ?? [
			{
				id: "extension-ui",
				label: "ask_user/select/input/confirm",
				status: "ready" as const,
				detail: "Handled through Lumen ExtensionUIContext",
			},
			{
				id: "allow-once",
				label: "Allow once",
				status: "unimplemented" as const,
				detail: "No generic tool approval backend yet",
			},
			{
				id: "allow-always",
				label: "Allow always",
				status: "unimplemented" as const,
				detail: "No persisted approval policy backend yet",
			},
			{
				id: "reject-with-message",
				label: "Reject with message",
				status: "unimplemented" as const,
				detail: "No rejection-reason contract is wired to tool execution yet",
			},
		]
	);
}

function permissionActionColor(themeId: "dark" | "light", status: string): string {
	const theme = palette[themeId];
	if (status === "ready") return theme.success;
	if (status === "disabled") return theme.textMuted;
	return theme.warning;
}

function messageSummary(message: { parts: Array<{ type: string; text?: string; title?: string; name?: string }> }) {
	const text = message.parts
		.map((part) => {
			if (typeof part.text === "string") return part.text;
			if (typeof part.title === "string") return part.title;
			if (typeof part.name === "string") return part.name;
			return "";
		})
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
	if (!text) return "(no text)";
	return text.length > 96 ? `${text.slice(0, 93)}...` : text;
}
