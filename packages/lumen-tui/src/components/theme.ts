import { RGBA } from "@opentui/core";

export const palette = {
	dark: {
		background: "#0a0a0a", // 改为 OpenCode 风格的纯黑（之前是 #0b0f14 带蓝调）
		panel: "#111821",
		panelRaised: "#17202b",
		element: "#151d27",
		elementHover: "#1e2936",
		border: "#2a3542",
		text: "#d7dde5",
		textMuted: "#7f8b99",
		primary: "#7cc4ff",
		secondary: "#b9e887",
		warning: "#f2c36b",
		success: "#8bd17c",
		error: "#ff7b72",
		info: "#9ecbff",
	},
	light: {
		background: "#ffffff", // 改为纯白
		panel: "#ffffff",
		panelRaised: "#eef2f6",
		element: "#e9edf2",
		elementHover: "#dde4ec",
		border: "#b8c4d2",
		text: "#1c2530",
		textMuted: "#607080",
		primary: "#1769aa",
		secondary: "#317a42",
		warning: "#9a6500",
		success: "#2f7d42",
		error: "#bd2c2c",
		info: "#235d91",
	},
} as const;

export type TuiTheme = (typeof palette)[keyof typeof palette];

export function color(value: string): RGBA {
	return RGBA.fromHex(value);
}
