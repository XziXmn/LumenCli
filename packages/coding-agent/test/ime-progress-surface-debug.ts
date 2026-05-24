/**
 * Manual IME verification harness for the core-owned progress surface.
 *
 * Run with:
 *   npx tsx packages/coding-agent/test/ime-progress-surface-debug.ts
 *
 * Controls:
 *   Ctrl+N  next scenario
 *   Ctrl+C  exit
 *   Enter   append the current input into the transcript
 *
 * Goal:
 *   Provide a controlled local scene for validating Chinese IME behavior while
 *   the progress surface, queued area, and passive footer keep updating.
 */

import type { Terminal } from "@earendil-works/pi-tui";
import { Container, Input, Key, matchesKey, ProcessTerminal, Spacer, Text, TUI } from "@earendil-works/pi-tui";
import type { SpinnerUiState, TaskUiItem } from "../src/core/extensions/types.js";
import {
	createProgressSurfaceWorkingState,
	ProgressSurfaceComponent,
	type ProgressSurfaceSnapshot,
	shouldRenderProgressSurface,
} from "../src/modes/interactive/components/progress-surface.js";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.js";

type Scenario = {
	name: string;
	description: string;
	tasks: TaskUiItem[];
	pending: string[];
	banner?: SpinnerUiState["banner"];
	mode?: SpinnerUiState["mode"];
	isThinking?: boolean;
	animateTokens?: boolean;
	complete?: boolean;
};

initTheme("dark");

class CountingTerminal implements Terminal {
	private readonly delegate = new ProcessTerminal();
	private writeOperations = 0;
	private progressActive = false;

	start(onInput: (data: string) => void, onResize: () => void): void {
		this.delegate.start(onInput, onResize);
	}

	stop(): void {
		this.delegate.stop();
	}

	drainInput(maxMs?: number, idleMs?: number): Promise<void> {
		return this.delegate.drainInput(maxMs, idleMs);
	}

	write(data: string): void {
		this.writeOperations++;
		this.delegate.write(data);
	}

	get columns(): number {
		return this.delegate.columns;
	}

	get rows(): number {
		return this.delegate.rows;
	}

	get kittyProtocolActive(): boolean {
		return this.delegate.kittyProtocolActive;
	}

	moveBy(lines: number): void {
		this.writeOperations++;
		this.delegate.moveBy(lines);
	}

	hideCursor(): void {
		this.writeOperations++;
		this.delegate.hideCursor();
	}

	showCursor(): void {
		this.writeOperations++;
		this.delegate.showCursor();
	}

	clearLine(): void {
		this.writeOperations++;
		this.delegate.clearLine();
	}

	clearFromCursor(): void {
		this.writeOperations++;
		this.delegate.clearFromCursor();
	}

	clearScreen(): void {
		this.writeOperations++;
		this.delegate.clearScreen();
	}

	setTitle(title: string): void {
		this.writeOperations++;
		this.delegate.setTitle(title);
	}

	setProgress(active: boolean): void {
		this.writeOperations++;
		this.progressActive = active;
		this.delegate.setProgress(active);
	}

	getWriteOperations(): number {
		return this.writeOperations;
	}

	resetWriteOperations(): void {
		this.writeOperations = 0;
	}

	isProgressActive(): boolean {
		return this.progressActive;
	}
}

const scenarios: Scenario[] = [
	{
		name: "todo-task",
		description: "计划 + 执行并行",
		tasks: [
			{
				id: "todo:0:0:整理接口定义",
				content: "整理接口定义",
				subject: "整理接口定义",
				activeForm: "整理接口定义",
				status: "in_progress",
				group: "接口收口",
			},
			{
				id: "todo:0:1:补回归测试",
				content: "补回归测试",
				subject: "补回归测试",
				status: "pending",
				group: "接口收口",
			},
			{
				id: "task:explore-1",
				content: "读取 retry 逻辑",
				subject: "读取 retry 逻辑",
				status: "running",
				group: "explore",
				meta: "read src/modes/interactive/interactive-mode.ts",
				toolCount: 2,
				tokens: 1200,
				durationMs: 12_000,
			},
		],
		pending: ["Follow-up: 完成后补文档"],
		mode: "tool-use",
		animateTokens: true,
	},
	{
		name: "approval",
		description: "审批态",
		tasks: [
			{
				id: "todo:0:0:修改 interactive-mode",
				content: "修改 interactive-mode",
				subject: "修改 interactive-mode",
				activeForm: "修改 interactive-mode",
				status: "in_progress",
				group: "实现",
			},
		],
		pending: [],
		banner: {
			kind: "approval",
			title: "等待审批确认",
			detail: "将修改 4 个文件，确认后继续",
		},
		mode: "requesting",
	},
	{
		name: "ask-user",
		description: "等待用户输入",
		tasks: [
			{
				id: "todo:0:0:确认收口方案",
				content: "确认收口方案",
				subject: "确认收口方案",
				activeForm: "确认收口方案",
				status: "in_progress",
				group: "确认",
			},
		],
		pending: ["Steer: 先做真实 IME 验证"],
		banner: {
			kind: "input",
			title: "等待你的输入",
			detail: "请选择：保守修复 / 一次性重构",
		},
		mode: "requesting",
	},
	{
		name: "retry",
		description: "自动重试",
		tasks: [],
		pending: ["Follow-up: 恢复后继续补测试"],
		banner: {
			kind: "warning",
			title: "接口不稳定，正在自动重试",
			detail: "第 1/3 次重试 · 2s 后继续",
		},
		mode: "requesting",
	},
	{
		name: "reconnect",
		description: "连接恢复",
		tasks: [],
		pending: [],
		banner: {
			kind: "warning",
			title: "网络连接不稳定，正在恢复会话流",
			detail: "SSE reconnect · 第 2/10 次",
		},
		mode: "requesting",
	},
	{
		name: "parallel",
		description: "子代理并行 + todo/task 并行",
		tasks: [
			{
				id: "task:review-1",
				content: "扫描错误处理路径",
				subject: "扫描错误处理路径",
				status: "running",
				group: "review",
				meta: "grep retry logic",
				toolCount: 2,
				tokens: 1800,
				durationMs: 15_000,
			},
			{
				id: "task:explore-1",
				content: "读取 CONTRIBUTING.md",
				subject: "读取 CONTRIBUTING.md",
				status: "running",
				group: "explore",
				meta: "read CONTRIBUTING.md",
				toolCount: 1,
				tokens: 900,
				durationMs: 11_000,
			},
			{
				id: "todo:0:0:收口 progress surface",
				content: "收口 progress surface",
				subject: "收口 progress surface",
				activeForm: "收口 progress surface",
				status: "in_progress",
				group: "主线程",
			},
		],
		pending: ["Queued command: /tree", "Follow-up: 完成后总结差异"],
		mode: "tool-use",
		animateTokens: true,
	},
	{
		name: "complete",
		description: "会话完成后任务栏消失",
		tasks: [],
		pending: [],
		complete: true,
	},
];

const terminal = new CountingTerminal();
const ui = new TUI(terminal, true);
const transcript = new Container();
const promptAreaContainer = new Container();
const statusContainer = new Container();
const pendingContainer = new Container();
const interactionAreaContainer = new Container();
const extensionAreaContainer = new Container();
const widgetAbove = new Container();
const editorContainer = new Container();
const widgetBelow = new Container();
const footerContainer = new Container();
const input = new Input();
const footerText = new Text("", 0, 0);
const progressWorking = createProgressSurfaceWorkingState(0);
const writeLogPath = process.env.PI_TUI_WRITE_LOG;

let scenarioIndex = 0;
let scenarioStartedAt = Date.now();
let outputTokens = 0;
let inputSuppressedUntil = 0;
let inputResumeTimer: ReturnType<typeof setTimeout> | undefined;
let animationEnabled = true;
const windowsVTInputMode = process.platform === "win32" ? "default" : "n/a";

const progressComponent = new ProgressSurfaceComponent(() => getSnapshot(), theme, progressWorking);

function currentScenario(): Scenario {
	return scenarios[scenarioIndex] ?? scenarios[0]!;
}

function getSnapshot(): ProgressSurfaceSnapshot {
	const scenario = currentScenario();
	if (scenario.complete) {
		return {
			tasks: [],
			queued: undefined,
			spinner: undefined,
			expanded: false,
		};
	}

	const elapsedMs = Math.max(0, Date.now() - scenarioStartedAt);
	const spinner: SpinnerUiState = {
		elapsedMs,
		mode: scenario.mode,
		banner: scenario.banner,
		isThinking: scenario.isThinking,
		outputTokens,
	};

	return {
		tasks: scenario.tasks,
		queued: undefined,
		spinner,
		expanded: false,
	};
}

function isInputSuppressed(): boolean {
	return Date.now() < inputSuppressedUntil;
}

function syncStatusArea(): void {
	statusContainer.clear();
	const snapshot = getSnapshot();
	if (!shouldRenderProgressSurface(snapshot)) {
		return;
	}
	statusContainer.addChild(new Spacer(1));
	statusContainer.addChild(progressComponent);
}

function syncPendingArea(): void {
	pendingContainer.clear();
	const scenario = currentScenario();
	if (scenario.pending.length === 0) {
		return;
	}
	pendingContainer.addChild(new Spacer(1));
	pendingContainer.addChild(
		new Text(
			theme.fg("dim", `${scenario.pending.length} queued command${scenario.pending.length > 1 ? "s" : ""}`),
			1,
			0,
		),
	);
	for (const line of scenario.pending) {
		pendingContainer.addChild(new Text(theme.fg("dim", `  ⎿ ${line}`), 1, 0));
	}
}

function syncFooter(): void {
	const scenario = currentScenario();
	footerText.setText(
		theme.fg(
			"dim",
			`Passive footer only · ${scenario.name} · ${scenarioIndex + 1}/${scenarios.length} · suppress=${isInputSuppressed() ? "on" : "off"} · progress=${terminal.isProgressActive() ? "on" : "off"} · ops=${terminal.getWriteOperations()} · Ctrl+N next · Ctrl+P pause · Ctrl+R reset · Ctrl+C exit`,
		),
	);
}

function syncExtensionArea(): void {
	const scenario = currentScenario();
	widgetAbove.clear();
	widgetBelow.clear();

	widgetAbove.addChild(new Spacer(1));
	widgetAbove.addChild(
		new Text(
			theme.fg(
				"muted",
				`Upper extension slot below editor · scenario: ${scenario.name} · ${scenario.description} · windows-vt-input=${windowsVTInputMode}`,
			),
			1,
			0,
		),
	);

	const bottomLines = ["Lower extension slot below editor · passive metadata only"];
	if (writeLogPath) {
		bottomLines.push(`ANSI log: ${writeLogPath}`);
	}
	widgetBelow.addChild(new Spacer(1));
	widgetBelow.addChild(new Text(theme.fg("muted", bottomLines.join("\n")), 1, 0));
}

function markInputActivity(): void {
	const wasSuppressed = isInputSuppressed();
	inputSuppressedUntil = Date.now() + 200;
	if (inputResumeTimer) {
		clearTimeout(inputResumeTimer);
	}
	if (!wasSuppressed) {
		ui.terminal.setProgress(false);
	}
	inputResumeTimer = setTimeout(() => {
		inputResumeTimer = undefined;
		ui.terminal.setProgress(!currentScenario().complete);
		ui.requestRender();
	}, 201);
}

function renderAll(): void {
	syncStatusArea();
	syncPendingArea();
	syncExtensionArea();
	syncFooter();
	ui.requestRender();
}

function advanceScenario(): void {
	scenarioIndex = (scenarioIndex + 1) % scenarios.length;
	scenarioStartedAt = Date.now();
	outputTokens = 0;
	terminal.resetWriteOperations();
	renderAll();
}

function shutdown(): void {
	if (inputResumeTimer) {
		clearTimeout(inputResumeTimer);
		inputResumeTimer = undefined;
	}
	clearInterval(animationTimer);
	ui.stop();
	process.exit(0);
}

input.onSubmit = (value) => {
	const trimmed = value.trim();
	if (!trimmed) return;
	transcript.addChild(new Spacer(1));
	transcript.addChild(new Text(theme.fg("text", `你：${trimmed}`), 1, 0));
	input.setValue("");
	terminal.resetWriteOperations();
	renderAll();
};

footerContainer.addChild(footerText);
editorContainer.addChild(input);
extensionAreaContainer.addChild(widgetAbove);
extensionAreaContainer.addChild(widgetBelow);
promptAreaContainer.addChild(statusContainer);
promptAreaContainer.addChild(pendingContainer);
interactionAreaContainer.addChild(editorContainer);
interactionAreaContainer.addChild(extensionAreaContainer);
interactionAreaContainer.addChild(footerContainer);

transcript.addChild(new Spacer(1));
transcript.addChild(new Text(theme.bold(theme.fg("accent", "IME Progress Surface Debug")), 1, 0));
transcript.addChild(
	new Text(
		theme.fg(
			"muted",
			"在这里切到中文输入法，流式状态变化期间输入拼音，观察正文区 / 任务栏 / footer 是否还会闪出拼音。",
		),
		1,
		0,
	),
);
transcript.addChild(new Text(theme.fg("dim", "Ctrl+N 切换场景，Ctrl+C 退出，Enter 会把当前输入追加到正文。"), 1, 0));
transcript.addChild(new Spacer(1));
transcript.addChild(
	new Text(
		theme.fg("text", "assistant: 正在模拟 interactive-mode 的 transcript / taskbar / pending / footer 布局"),
		1,
		0,
	),
);

ui.addChild(transcript);
ui.addChild(promptAreaContainer);
ui.addChild(interactionAreaContainer);
ui.setFocus(input);
ui.shouldSuppressBackgroundRenderUpdates = () => isInputSuppressed();

ui.addInputListener((data) => {
	if (matchesKey(data, Key.ctrl("c"))) {
		shutdown();
		return { consume: true };
	}
	if (matchesKey(data, Key.ctrl("n"))) {
		advanceScenario();
		return { consume: true };
	}
	if (matchesKey(data, Key.ctrl("p"))) {
		animationEnabled = !animationEnabled;
		renderAll();
		return { consume: true };
	}
	if (matchesKey(data, Key.ctrl("r"))) {
		terminal.resetWriteOperations();
		renderAll();
		return { consume: true };
	}
	if (data.length > 0) {
		markInputActivity();
	}
	return undefined;
});

const animationTimer = setInterval(() => {
	const scenario = currentScenario();
	if (animationEnabled && scenario.animateTokens) {
		outputTokens += 24;
	}
	renderAll();
}, 120);

ui.start();
ui.terminal.setProgress(true);
renderAll();

process.on("SIGINT", shutdown);
