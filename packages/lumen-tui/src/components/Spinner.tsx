/**
 * Knight Rider 块状跑马灯组件，匹配 OpenCode 的视觉风格。
 * 双向扫描，块字符 ■，间隔 ⬝，带尾迹颜色。
 */
import { createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { createFrames } from "./spinner-frames.js";
import { palette } from "./theme.js";

const SPINNER_INTERVAL = 40;
const SPINNER_WIDTH = 6;

export function Spinner(props: { themeId?: keyof typeof palette; color?: string }) {
	const [frame, setFrame] = createSignal(0);
	const theme = () => palette[props.themeId ?? "dark"];
	const color = () => props.color ?? theme().primary;

	const frames = createMemo(() => createFrames({ width: SPINNER_WIDTH, color: color() }));

	onMount(() => {
		const timer = setInterval(() => {
			setFrame((index) => (index + 1) % frames().length);
		}, SPINNER_INTERVAL);
		onCleanup(() => clearInterval(timer));
	});

	return <text fg={color()}>{frames()[frame() % frames().length]}</text>;
}
