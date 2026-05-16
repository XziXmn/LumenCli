import { createMemo } from "solid-js";
import type { TuiRuntime } from "../runtime/types.js";
import { Logo } from "./Logo.js";
import { PromptBox } from "./PromptBox.js";
import { palette } from "./theme.js";

const placeholders = {
	normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Find the root cause"],
	shell: ["git status", "pwd", "rg TODO"],
};

const TIPS = [
	"输入 @ 后接路径可附加当前工作目录的文件",
	"按 Ctrl+X 打开 leader 命令提示面板",
	"用 /sessions 切换会话，/tree 浏览分支",
	"按 Tab 在 prompt 内执行 shell 命令",
	"用 /share 创建 GitHub gist 私密分享链接",
	"设置 LUMEN_TUI_KEYBINDINGS 加载自定义按键映射",
	"在命令面板中切换思考、时间戳、工具详情、滚动条",
	"按 F2 在最近使用的模型之间切换",
	"按 Ctrl+P 查看所有可用命令",
	"按 Ctrl+X N 或 /new 开始新会话",
];

export function HomeView(props: {
	runtime: TuiRuntime;
	initialMessage?: string;
	onOpenCommands: () => void;
	onCommand?: (commandId: string) => void | Promise<void>;
	onExit?: () => void;
	inputDisabled?: boolean;
}) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const tip = createMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)]);

	return (
		<box flexGrow={1} flexDirection="column" alignItems="center" paddingLeft={2} paddingRight={2}>
			<box flexGrow={1} minHeight={0} />
			<box height={4} minHeight={0} flexShrink={1} />
			<box flexShrink={0}>
				<Logo runtime={props.runtime} />
			</box>
			<box height={1} minHeight={0} flexShrink={1} />
			<box width="100%" maxWidth={75} zIndex={1000} paddingTop={1} flexShrink={0}>
				<PromptBox
					runtime={props.runtime}
					initialMessage={props.initialMessage}
					placeholders={placeholders}
					onOpenCommands={props.onOpenCommands}
					onCommand={props.onCommand}
					onExit={props.onExit}
					disabled={props.inputDisabled}
				/>
			</box>
			<box height={4} minHeight={0} width="100%" maxWidth={75} alignItems="center" paddingTop={3} flexShrink={1}>
				<box flexDirection="row" maxWidth="100%">
					<text flexShrink={0} fg={theme().warning}>
						● Tip{" "}
					</text>
					<text flexShrink={1} fg={theme().textMuted}>
						{tip()}
					</text>
				</box>
			</box>
			<box flexGrow={1} minHeight={0} />
		</box>
	);
}
