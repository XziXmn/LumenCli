import { type CliRendererConfig, createCliRenderer, type TextareaRenderable } from "@opentui/core";
import { render, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

export interface LumenTuiMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	completed: boolean;
}

export interface LumenTuiToolCall {
	id: string;
	messageId: string;
	name: string;
	args: Record<string, unknown>;
	status: "pending" | "running" | "success" | "error";
	result?: string;
}

export interface LumenTuiStore {
	store: {
		session: {
			id: string;
			status: "idle" | "working" | "compacting" | "error";
			messages: LumenTuiMessage[];
			toolCalls: LumenTuiToolCall[];
			model: { displayName: string } | null;
			thinking: { content: string; visible: boolean };
			tokenUsage: { input: number; output: number };
			error: string | null;
		};
		cwd: string;
	};
	sendMessage(text: string): Promise<void>;
	cancel(): void;
	dispose(): void;
	setError(message: string): void;
}

export interface LumenTuiInput {
	store: LumenTuiStore;
	initialMessage?: string;
}

const colors = {
	bg: "#0b0f14",
	panel: "#111821",
	panelAlt: "#17202b",
	text: "#d7dde5",
	muted: "#7f8b99",
	accent: "#7cc4ff",
	success: "#8bd17c",
	error: "#ff7b72",
	border: "#2a3542",
	user: "#b9e887",
	assistant: "#d7dde5",
};

function rendererConfig(): CliRendererConfig {
	return {
		externalOutputMode: "passthrough",
		targetFps: 30,
		gatherStats: false,
		exitOnCtrlC: false,
		useKittyKeyboard: {},
		autoFocus: false,
		openConsoleOnError: false,
		useMouse: true,
	};
}

export async function runLumenTui(input: LumenTuiInput): Promise<void> {
	const renderer = await createCliRenderer(rendererConfig());

	return new Promise<void>((resolve, reject) => {
		let resolved = false;
		const exit = () => {
			if (resolved) return;
			resolved = true;
			input.store.dispose();
			renderer.destroy();
			resolve();
		};

		void render(() => <LumenTui store={input.store} initialMessage={input.initialMessage} onExit={exit} />, renderer)
			.then(() => {
				renderer.start();
				renderer.requestRender();
			})
			.catch((error: unknown) => {
				input.store.dispose();
				renderer.destroy();
				reject(error);
			});
	});
}

function LumenTui(props: { store: LumenTuiStore; initialMessage?: string; onExit: () => void }) {
	const renderer = useRenderer();
	const dimensions = useTerminalDimensions();
	const [draft, setDraft] = createSignal("");
	let input: TextareaRenderable | undefined;
	let sentInitial = false;

	const size = createMemo(() => ({
		width: Math.max(dimensions().width || process.stdout.columns || 80, 1),
		height: Math.max(dimensions().height || process.stdout.rows || 24, 1),
	}));
	const session = createMemo(() => props.store.store.session);
	const working = createMemo(() => session().status === "working" || session().status === "compacting");

	const submit = () => {
		const text = (input?.plainText ?? draft()).trim();
		if (!text) return;
		input?.clear();
		setDraft("");
		void props.store.sendMessage(text).catch((error: unknown) => {
			props.store.setError(error instanceof Error ? error.message : String(error));
		});
	};

	useKeyboard((event) => {
		if (!event.ctrl || event.name !== "c") return;
		if (working()) {
			props.store.cancel();
			return;
		}
		props.onExit();
	});

	onMount(() => {
		input?.focus();
		if (!props.initialMessage || sentInitial) return;
		sentInitial = true;
		input?.setText?.(props.initialMessage);
		setDraft(props.initialMessage);
		setTimeout(submit, 0);
	});

	createEffect(() => {
		renderer.requestRender();
	});

	onCleanup(() => props.store.dispose());

	return (
		<box width={size().width} height={size().height} backgroundColor={colors.bg} flexDirection="column">
			<Header store={props.store} />
			<box flexGrow={1} minHeight={0} paddingLeft={2} paddingRight={2}>
				<scrollbox flexGrow={1} stickyScroll={true} stickyStart="bottom">
					<Show
						when={session().messages.length > 0 || session().toolCalls.length > 0}
						fallback={
							<box flexDirection="column" paddingTop={2} gap={1}>
								<text fg={colors.text}>Lumen</text>
								<text fg={colors.muted}>Ready for your next prompt.</text>
							</box>
						}
					>
						<For each={session().messages}>
							{(message) => <MessageBlock message={message} store={props.store} />}
						</For>
						<For each={session().toolCalls.filter((tool) => !tool.messageId)}>
							{(tool) => <ToolBlock tool={tool} />}
						</For>
					</Show>
				</scrollbox>
			</box>
			<Show when={session().thinking.visible}>
				<box paddingLeft={2} paddingRight={2} paddingTop={1}>
					<text fg={colors.muted}>Thinking: {trimForLine(session().thinking.content, size().width - 14)}</text>
				</box>
			</Show>
			<Show when={session().error}>
				<box paddingLeft={2} paddingRight={2} paddingTop={1}>
					<text fg={colors.error}>{session().error}</text>
				</box>
			</Show>
			<box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} flexShrink={0}>
				<box
					border={["left"]}
					borderColor={working() ? colors.accent : colors.border}
					backgroundColor={colors.panel}
				>
					<box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
						<textarea
							ref={(value: TextareaRenderable) => {
								input = value;
							}}
							minHeight={1}
							maxHeight={5}
							placeholder={working() ? "Working... Ctrl+C cancels" : "Ask Lumen..."}
							placeholderColor={colors.muted}
							textColor={colors.text}
							focusedTextColor={colors.text}
							onContentChange={() => setDraft(input?.plainText ?? "")}
							onSubmit={submit}
						/>
					</box>
				</box>
			</box>
			<Footer store={props.store} />
		</box>
	);
}

function Header(props: { store: LumenTuiStore }) {
	return (
		<box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} backgroundColor={colors.panel}>
			<text fg={colors.accent}>Lumen</text>
			<text fg={colors.muted}> {props.store.store.session.model?.displayName ?? "No model"} </text>
			<text fg={colors.muted}>{props.store.store.cwd}</text>
		</box>
	);
}

function MessageBlock(props: { message: LumenTuiMessage; store: LumenTuiStore }) {
	const tools = createMemo(() =>
		props.store.store.session.toolCalls.filter((tool) => tool.messageId === props.message.id),
	);
	const color = createMemo(() => (props.message.role === "user" ? colors.user : colors.assistant));
	const label = createMemo(() => (props.message.role === "user" ? "You" : "Lumen"));
	return (
		<box flexDirection="column" marginTop={1} border={["left"]} borderColor={color()} paddingLeft={2}>
			<text fg={color()}>{label()}</text>
			<Show when={props.message.content.trim()} fallback={<text fg={colors.muted}>...</text>}>
				<text fg={colors.text}>{props.message.content.trim()}</text>
			</Show>
			<For each={tools()}>{(tool) => <ToolBlock tool={tool} />}</For>
		</box>
	);
}

function ToolBlock(props: { tool: LumenTuiToolCall }) {
	const color = createMemo(() => {
		if (props.tool.status === "running" || props.tool.status === "pending") return colors.accent;
		if (props.tool.status === "error") return colors.error;
		return colors.success;
	});
	const icon = createMemo(() => {
		if (props.tool.status === "running" || props.tool.status === "pending") return ">";
		if (props.tool.status === "error") return "x";
		return "ok";
	});
	return (
		<box marginTop={1} paddingLeft={2} border={["left"]} borderColor={color()} backgroundColor={colors.panelAlt}>
			<text fg={color()}>
				{icon()} {props.tool.name} <span style={{ fg: colors.muted }}>{formatArgs(props.tool.args)}</span>
			</text>
			<Show when={props.tool.result}>
				<text fg={colors.muted}>{trimForLine(props.tool.result ?? "", 140)}</text>
			</Show>
		</box>
	);
}

function Footer(props: { store: LumenTuiStore }) {
	const state = createMemo(() => props.store.store.session);
	return (
		<box paddingLeft={2} paddingRight={2} paddingBottom={1} backgroundColor={colors.panel}>
			<text fg={state().status === "error" ? colors.error : colors.muted}>
				{state().status} session {state().id} tokens {state().tokenUsage.input}/{state().tokenUsage.output} Ctrl+C{" "}
				{state().status === "working" ? "cancel" : "exit"}
			</text>
		</box>
	);
}

function formatArgs(args: Record<string, unknown>): string {
	const entries = Object.entries(args).slice(0, 3);
	if (entries.length === 0) return "";
	return entries.map(([key, value]) => `${key}=${formatValue(value)}`).join(" ");
}

function formatValue(value: unknown): string {
	if (typeof value === "string") return trimForLine(value.replace(/\s+/g, " "), 48);
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (value === null || value === undefined) return "";
	return trimForLine(JSON.stringify(value), 48);
}

function trimForLine(value: string, max: number): string {
	if (value.length <= max) return value;
	return `${value.slice(0, Math.max(0, max - 1))}...`;
}
