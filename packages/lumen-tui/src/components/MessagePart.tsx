import { Match, Show, Switch } from "solid-js";
import type { TuiPart, TuiRuntime } from "../runtime/types.js";
import { getSubtleSyntax, getSyntax } from "./syntax.js";
import { ToolBlock } from "./ToolBlock.js";
import { palette, type TuiTheme } from "./theme.js";

/**
 * 单条 message part 渲染器。
 *
 * 文本/思考块统一用 OpenTUI 0.2.12 的 `<markdown streaming>`：
 *   - 流式期间 `streaming=true`：尾部尚未完成的 markdown block 保持低成本纯文本，
 *     一旦块边界（段落/代码块/列表/表格）闭合，native 立即应用高亮。表现就是
 *     "颜色随段落出现"，不会因高频 setContent 引发整段重渲染。
 *   - 完成时 `streaming=false`：触发末尾 token 的最终化 parse。
 *
 * 排查开关：`LUMEN_TUI_TEXT_RENDER=plain` 强制使用纯 `<text>`，跳过 markdown 渲染，
 * 用于在终端有兼容问题时彻底关闭高亮。
 */
const RENDER_MODE = (process.env.LUMEN_TUI_TEXT_RENDER ?? "markdown").toLowerCase();
const FORCE_PLAIN = RENDER_MODE === "plain" || RENDER_MODE === "text";

export function MessagePart(props: { runtime: TuiRuntime; part: TuiPart; streaming?: boolean }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	return (
		<Switch>
			<Match when={props.part.type === "text"}>
				{props.part.type === "text" ? (
					<TextPart runtime={props.runtime} text={props.part.text} streaming={props.streaming === true} />
				) : null}
			</Match>
			<Match when={props.part.type === "thinking"}>
				<Show when={props.part.type === "thinking" && props.runtime.state.ui.thinkingVisible && props.part.visible}>
					{props.part.type === "thinking" ? (
						<ThinkingPart runtime={props.runtime} text={props.part.text} streaming={props.streaming === true} />
					) : null}
				</Show>
			</Match>
			<Match when={props.part.type === "tool"}>
				{props.part.type === "tool" ? <ToolBlock runtime={props.runtime} tool={props.part} /> : null}
			</Match>
			<Match when={props.part.type === "status"}>
				<text fg={props.part.type === "status" ? variantColor(theme(), props.part.variant) : theme().textMuted}>
					{props.part.type === "status" ? props.part.text : ""}
				</text>
			</Match>
			<Match when={props.part.type === "error"}>
				<text fg={theme().error}>{props.part.type === "error" ? props.part.text : ""}</text>
			</Match>
		</Switch>
	);
}

function TextPart(props: { runtime: TuiRuntime; text: string; streaming: boolean }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	return (
		<Show when={props.text.trim()}>
			<Show
				when={!FORCE_PLAIN}
				fallback={
					<text fg={theme().text} wrapMode="word">
						{props.text}
					</text>
				}
			>
				<markdown
					content={props.text}
					streaming={props.streaming}
					syntaxStyle={getSyntax(theme())}
					fg={theme().text}
				/>
			</Show>
		</Show>
	);
}

function ThinkingPart(props: { runtime: TuiRuntime; text: string; streaming: boolean }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	return (
		<box marginTop={1} paddingLeft={2} border={["left"]} borderColor={theme().textMuted}>
			<Show
				when={!FORCE_PLAIN}
				fallback={
					<text fg={theme().textMuted} wrapMode="word">
						{`_思考:_ ${props.text}`}
					</text>
				}
			>
				<markdown
					content={`_思考:_ ${props.text}`}
					streaming={props.streaming}
					syntaxStyle={getSubtleSyntax(theme())}
					fg={theme().textMuted}
				/>
			</Show>
		</box>
	);
}

function variantColor(theme: TuiTheme, variant: "info" | "success" | "warning") {
	if (variant === "success") return theme.success;
	if (variant === "warning") return theme.warning;
	return theme.info;
}
