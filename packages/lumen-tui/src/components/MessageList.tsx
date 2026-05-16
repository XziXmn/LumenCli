import type { ScrollBoxRenderable } from "@opentui/core";
import { MacOSScrollAccel } from "@opentui/core";
import { useKeyboard } from "@opentui/solid";
import { createEffect, For, onCleanup, Show } from "solid-js";
import type { TuiMessage, TuiRuntime } from "../runtime/types.js";
import { DEFAULT_APP_KEYBINDINGS, matchesKey } from "./keybindings.js";
import { locale } from "./locale.js";
import { MessagePart } from "./MessagePart.js";
import { palette } from "./theme.js";

/**
 * 消息列表 —— 使用 OpenTUI 原生 `<scrollbox>`。
 *
 * 渲染原则：
 *   - `<For each={messages}>` 直接迭代 store 数组，SolidJS 用引用相等保证 stable 节点。
 *   - 每条 message 内部 `<For each={parts}>` 直接迭代，**不在 reactive 渲染路径里
 *     调用 `groupMessageParts` 这种返回新对象的函数**——之前的实现每次 text_delta
 *     都返回全新的数组，导致 `<For>` 把整段 message 全部重新挂载，产生闪动。
 *
 * 滚动键位由 useKeyboard 主动派发到 ScrollBoxRenderable.scrollBy()，
 * 因为 prompt 输入框需要独占键盘焦点（focused={true} 会冲突）。
 *
 * 跳转到指定消息使用原生 `scrollChildIntoView(id)` 而非手算偏移。
 */
export function MessageList(props: { runtime: TuiRuntime }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	let scroll: ScrollBoxRenderable | undefined;

	createEffect(() => {
		const messageId = props.runtime.state.ui.focusMessageId;
		if (!messageId || !scroll) return;
		scroll.scrollChildIntoView(messageId);
	});

	useKeyboard((event) => {
		if (!scroll) return;
		if (matchesKey(event, DEFAULT_APP_KEYBINDINGS.scrollPageUp)) {
			scroll.scrollBy({ x: 0, y: -scroll.height });
			return;
		}
		if (matchesKey(event, DEFAULT_APP_KEYBINDINGS.scrollPageDown)) {
			scroll.scrollBy({ x: 0, y: scroll.height });
			return;
		}
		if (matchesKey(event, DEFAULT_APP_KEYBINDINGS.scrollHalfPageUp)) {
			scroll.scrollBy({ x: 0, y: -Math.floor(scroll.height / 2) });
			return;
		}
		if (matchesKey(event, DEFAULT_APP_KEYBINDINGS.scrollHalfPageDown)) {
			scroll.scrollBy({ x: 0, y: Math.floor(scroll.height / 2) });
			return;
		}
		if (matchesKey(event, DEFAULT_APP_KEYBINDINGS.scrollLineUp)) {
			scroll.scrollBy({ x: 0, y: -3 });
			return;
		}
		if (matchesKey(event, DEFAULT_APP_KEYBINDINGS.scrollLineDown)) {
			scroll.scrollBy({ x: 0, y: 3 });
			return;
		}
		if (matchesKey(event, DEFAULT_APP_KEYBINDINGS.scrollTop)) {
			scroll.scrollTo({ x: 0, y: 0 });
			return;
		}
		if (matchesKey(event, DEFAULT_APP_KEYBINDINGS.scrollBottom)) {
			scroll.scrollTo({ x: 0, y: scroll.scrollHeight });
		}
	});

	onCleanup(() => {
		scroll = undefined;
	});

	return (
		<scrollbox
			ref={(next: ScrollBoxRenderable) => {
				scroll = next;
			}}
			flexGrow={1}
			stickyScroll={true}
			stickyStart="bottom"
			scrollAcceleration={new MacOSScrollAccel()}
			viewportOptions={{ paddingRight: props.runtime.state.ui.showScrollbar ? 1 : 0 }}
			verticalScrollbarOptions={{ paddingLeft: 1, visible: props.runtime.state.ui.showScrollbar }}
		>
			<For each={props.runtime.state.session.messages}>
				{(message) => <MessageBlock runtime={props.runtime} message={message} />}
			</For>
			<Show when={props.runtime.state.ui.navigation.canRedo}>
				<RedoBlock runtime={props.runtime} />
			</Show>
			<Show when={props.runtime.state.session.error}>
				<box marginTop={1} paddingLeft={2} border={["left"]} borderColor={theme().error}>
					<text fg={theme().error}>{props.runtime.state.session.error}</text>
				</box>
			</Show>
		</scrollbox>
	);
}

function RedoBlock(props: { runtime: TuiRuntime }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI uses box renderables for clickable terminal rows.
		<box
			marginTop={1}
			paddingLeft={2}
			paddingTop={1}
			paddingBottom={1}
			border={["left"]}
			borderColor={theme().panel}
			backgroundColor={theme().panel}
			onMouseUp={() => props.runtime.executeCommand("session.redo")}
		>
			<text fg={theme().textMuted}>{locale.messageReverted}</text>
			<text fg={theme().textMuted}>
				<span style={{ fg: theme().text }}>{locale.messageRedoHint}</span>
			</text>
		</box>
	);
}

function MessageBlock(props: { runtime: TuiRuntime; message: TuiMessage }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const isUser = () => props.message.role === "user";
	const isSystem = () => props.message.role === "system";
	const userColor = () => (props.message.role === "user" ? theme().secondary : theme().primary);
	// 只有正在流式生成的 assistant 消息才需要"流式渲染"模式（避免 <code> 高频
	// content 更新引发的闪动）。user/system 消息一次性写入，直接走 <code> 高亮。
	const streaming = () => !props.message.completed && props.message.role === "assistant";

	return (
		<Show when={isUser() || isSystem()} fallback={<AssistantBlock runtime={props.runtime} message={props.message} />}>
			<box
				id={props.message.id}
				marginTop={1}
				border={["left"]}
				borderColor={isSystem() ? theme().warning : userColor()}
				customBorderChars={{
					topLeft: "",
					bottomLeft: "",
					vertical: "┃",
					topRight: "",
					bottomRight: "",
					horizontal: " ",
					bottomT: "",
					topT: "",
					cross: "",
					leftT: "",
					rightT: "",
				}}
			>
				<box paddingTop={1} paddingBottom={1} paddingLeft={2} backgroundColor={theme().panel} flexShrink={0}>
					<Show when={props.message.parts.length > 0} fallback={<text fg={theme().textMuted}>...</text>}>
						<For each={props.message.parts}>
							{(part) => <MessagePart runtime={props.runtime} part={part} streaming={streaming()} />}
						</For>
					</Show>
					<Show when={props.runtime.state.ui.showTimestamps}>
						<text fg={theme().textMuted}>{formatTime(props.message.timestamp)}</text>
					</Show>
				</box>
			</box>
		</Show>
	);
}

function AssistantBlock(props: { runtime: TuiRuntime; message: TuiMessage }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const session = () => props.runtime.state.session;
	const streaming = () => !props.message.completed;
	return (
		<box id={props.message.id} flexDirection="column" marginTop={1} flexShrink={0}>
			<For each={props.message.parts}>
				{(part) => (
					<box paddingLeft={part.type === "tool" ? 0 : 3}>
						<MessagePart runtime={props.runtime} part={part} streaming={streaming()} />
					</box>
				)}
			</For>
			<Show when={props.message.completed && session().model}>
				<box paddingLeft={3} marginTop={1}>
					<text fg={theme().text}>
						<span style={{ fg: session().agent?.color ?? theme().secondary }}>▣</span>{" "}
						{session().agent?.displayName ?? "Build"}
						<span style={{ fg: theme().textMuted }}>
							{" · "}
							{session().model?.displayName ?? ""}
						</span>
					</text>
				</box>
			</Show>
		</box>
	);
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
