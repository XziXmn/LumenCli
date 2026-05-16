/**
 * Knight Rider 块状跑马灯帧生成器
 * 移植自 OpenCode 的 spinner.ts（MIT License）
 *
 * 算法：双向扫描器，活跃位置渲染为 ■，尾迹渐变颜色，背景为 ⬝
 */

import type { ColorInput } from "@opentui/core";
import { RGBA } from "@opentui/core";

interface AdvancedGradientOptions {
	colors: ColorInput[];
	trailLength: number;
	defaultColor?: ColorInput;
	direction?: "forward" | "backward" | "bidirectional";
	holdFrames?: { start?: number; end?: number };
	enableFading?: boolean;
	minAlpha?: number;
}

interface ScannerState {
	activePosition: number;
	isHolding: boolean;
	holdProgress: number;
	holdTotal: number;
	movementProgress: number;
	movementTotal: number;
	isMovingForward: boolean;
}

function getScannerState(
	frameIndex: number,
	totalChars: number,
	options: Pick<AdvancedGradientOptions, "direction" | "holdFrames">,
): ScannerState {
	const { direction = "forward", holdFrames = {} } = options;

	if (direction === "bidirectional") {
		const forwardFrames = totalChars;
		const holdEndFrames = holdFrames.end ?? 0;
		const backwardFrames = totalChars - 1;

		if (frameIndex < forwardFrames) {
			return {
				activePosition: frameIndex,
				isHolding: false,
				holdProgress: 0,
				holdTotal: 0,
				movementProgress: frameIndex,
				movementTotal: forwardFrames,
				isMovingForward: true,
			};
		}
		if (frameIndex < forwardFrames + holdEndFrames) {
			return {
				activePosition: totalChars - 1,
				isHolding: true,
				holdProgress: frameIndex - forwardFrames,
				holdTotal: holdEndFrames,
				movementProgress: 0,
				movementTotal: 0,
				isMovingForward: true,
			};
		}
		if (frameIndex < forwardFrames + holdEndFrames + backwardFrames) {
			const backwardIndex = frameIndex - forwardFrames - holdEndFrames;
			return {
				activePosition: totalChars - 2 - backwardIndex,
				isHolding: false,
				holdProgress: 0,
				holdTotal: 0,
				movementProgress: backwardIndex,
				movementTotal: backwardFrames,
				isMovingForward: false,
			};
		}
		return {
			activePosition: 0,
			isHolding: true,
			holdProgress: frameIndex - forwardFrames - holdEndFrames - backwardFrames,
			holdTotal: holdFrames.start ?? 0,
			movementProgress: 0,
			movementTotal: 0,
			isMovingForward: false,
		};
	}
	if (direction === "backward") {
		return {
			activePosition: totalChars - 1 - (frameIndex % totalChars),
			isHolding: false,
			holdProgress: 0,
			holdTotal: 0,
			movementProgress: frameIndex % totalChars,
			movementTotal: totalChars,
			isMovingForward: false,
		};
	}
	return {
		activePosition: frameIndex % totalChars,
		isHolding: false,
		holdProgress: 0,
		holdTotal: 0,
		movementProgress: frameIndex % totalChars,
		movementTotal: totalChars,
		isMovingForward: true,
	};
}

function calculateColorIndex(
	frameIndex: number,
	charIndex: number,
	totalChars: number,
	options: Pick<AdvancedGradientOptions, "direction" | "holdFrames" | "trailLength">,
	state?: ScannerState,
): number {
	const { trailLength } = options;
	const { activePosition, isHolding, holdProgress, isMovingForward } =
		state ?? getScannerState(frameIndex, totalChars, options);

	const directionalDistance = isMovingForward ? activePosition - charIndex : charIndex - activePosition;

	if (isHolding) {
		return directionalDistance + holdProgress;
	}
	if (directionalDistance > 0 && directionalDistance < trailLength) {
		return directionalDistance;
	}
	if (directionalDistance === 0) {
		return 0;
	}
	return -1;
}

export function deriveTrailColors(brightColor: ColorInput, steps: number = 6): RGBA[] {
	const baseRgba = brightColor instanceof RGBA ? brightColor : RGBA.fromHex(brightColor as string);
	const colors: RGBA[] = [];
	for (let i = 0; i < steps; i++) {
		let alpha: number;
		let brightnessFactor: number;
		if (i === 0) {
			alpha = 1.0;
			brightnessFactor = 1.0;
		} else if (i === 1) {
			alpha = 0.9;
			brightnessFactor = 1.15;
		} else {
			alpha = 0.65 ** (i - 1);
			brightnessFactor = 1.0;
		}
		const r = Math.min(1.0, baseRgba.r * brightnessFactor);
		const g = Math.min(1.0, baseRgba.g * brightnessFactor);
		const b = Math.min(1.0, baseRgba.b * brightnessFactor);
		colors.push(RGBA.fromValues(r, g, b, alpha));
	}
	return colors;
}

export interface KnightRiderOptions {
	width?: number;
	holdStart?: number;
	holdEnd?: number;
	color?: ColorInput;
	trailSteps?: number;
}

/**
 * 生成 Knight Rider 块状跑马灯的所有帧字符串
 */
export function createFrames(options: KnightRiderOptions = {}): string[] {
	const width = options.width ?? 8;
	const holdStart = options.holdStart ?? 30;
	const holdEnd = options.holdEnd ?? 9;

	const colors = options.color
		? deriveTrailColors(options.color, options.trailSteps)
		: [
				RGBA.fromHex("#ff0000"),
				RGBA.fromHex("#ff5555"),
				RGBA.fromHex("#dd0000"),
				RGBA.fromHex("#aa0000"),
				RGBA.fromHex("#770000"),
				RGBA.fromHex("#440000"),
			];

	const trailOptions = {
		colors,
		trailLength: colors.length,
		direction: "bidirectional" as const,
		holdFrames: { start: holdStart, end: holdEnd },
	};

	const totalFrames = width + holdEnd + (width - 1) + holdStart;
	const frames = Array.from({ length: totalFrames }, (_, frameIndex) => {
		return Array.from({ length: width }, (_, charIndex) => {
			const index = calculateColorIndex(frameIndex, charIndex, width, trailOptions);
			const isActive = index >= 0 && index < trailOptions.colors.length;
			return isActive ? "■" : "⬝";
		}).join("");
	});

	return frames;
}
