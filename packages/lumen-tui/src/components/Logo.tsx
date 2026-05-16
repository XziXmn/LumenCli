import type { TuiRuntime } from "../runtime/types.js";
import { palette } from "./theme.js";

/**
 * 主页 Logo —— 直接用 OpenTUI 内置的 ASCIIFont renderable，
 * 字体由 native 端绘制并支持多色渐变。
 */
export function Logo(props: { runtime: TuiRuntime }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	return (
		<box flexDirection="column" alignItems="center">
			<ascii_font
				text="LUMEN"
				font="block"
				color={[theme().primary, theme().secondary, theme().text]}
				selectable={false}
			/>
		</box>
	);
}
