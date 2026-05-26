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
import { BashExecutionComponent } from "../src/modes/interactive/components/bash-execution.ts";
import { BorderedLoader } from "../src/modes/interactive/components/bordered-loader.ts";
import { ExtensionInputComponent } from "../src/modes/interactive/components/extension-input.ts";
import { ExtensionSelectorComponent } from "../src/modes/interactive/components/extension-selector.ts";
import {
	createProgressSurfaceWorkingState,
	ProgressSurfaceComponent,
	type ProgressSurfaceSnapshot,
	shouldRenderProgressSurface,
} from "../src/modes/interactive/components/progress-surface.ts";
import { ToolExecutionComponent } from "../src/modes/interactive/components/tool-execution.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";
import {
	createImeScenarioSnapshot,
	filterImeScenariosByNames,
	findImeScenarioIndexByName,
	type ImeScenario,
	shouldImeHarnessAutoAnimate,
	shouldImeHarnessShowTerminalProgress,
} from "./ime-progress-surface-harness.ts";

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

const scenarioArgIndex = process.argv.indexOf("--scenario");
const scenarioArg =
	scenarioArgIndex >= 0 && scenarioArgIndex + 1 < process.argv.length ? process.argv[scenarioArgIndex + 1] : undefined;
const scenarioListArgIndex = process.argv.indexOf("--scenario-list");
const scenarioListArg =
	scenarioListArgIndex >= 0 && scenarioListArgIndex + 1 < process.argv.length
		? process.argv[scenarioListArgIndex + 1]
		: undefined;
const exitAfterArgIndex = process.argv.indexOf("--exit-after-ms");
const exitAfterArg =
	exitAfterArgIndex >= 0 && exitAfterArgIndex + 1 < process.argv.length
		? Number(process.argv[exitAfterArgIndex + 1])
		: undefined;
const autoCycleArgIndex = process.argv.indexOf("--auto-cycle-ms");
const autoCycleArg =
	autoCycleArgIndex >= 0 && autoCycleArgIndex + 1 < process.argv.length
		? Number(process.argv[autoCycleArgIndex + 1])
		: undefined;
const exitAfterMs =
	Number.isFinite(exitAfterArg) && (exitAfterArg as number) > 0 ? (exitAfterArg as number) : undefined;
const autoCycleMs =
	Number.isFinite(autoCycleArg) && (autoCycleArg as number) > 0 ? (autoCycleArg as number) : undefined;

const requestedScenarioNames = scenarioListArg
	?.split(",")
	.map((name) => name.trim())
	.filter((name) => name.length > 0);
const scenarios: ImeScenario[] = filterImeScenariosByNames(requestedScenarioNames);

let scenarioIndex = findImeScenarioIndexByName(scenarioArg);
let scenarioStartedAt = Date.now();
let outputTokens = 0;
let inputSuppressedUntil = 0;
let inputResumeTimer: ReturnType<typeof setTimeout> | undefined;
let animationEnabled = true;
let exitTimer: ReturnType<typeof setTimeout> | undefined;
let autoCycleTimer: ReturnType<typeof setInterval> | undefined;
const windowsVTInputMode = process.platform === "win32" ? "default" : "n/a";
let bashStreamComponent: BashExecutionComponent | undefined;
let bashStreamFrame = 0;
let branchSummaryLoader: BorderedLoader | undefined;
let approvalSelector: ExtensionSelectorComponent | undefined;
let askUserInput: ExtensionInputComponent | undefined;
let toolExecutionComponent: ToolExecutionComponent | undefined;
let toolExecutionFrame = 0;

const bashStreamFrames = [
	"packages/coding-agent/src/modes/interactive/interactive-mode.ts:6375: executeBash(",
	"packages/coding-agent/src/modes/interactive/interactive-mode.ts:6380: requestRenderUnlessInputSuppressed()",
	"packages/coding-agent/src/modes/interactive/components/bash-execution.ts:55: new Loader(... skipInitialRender)",
	"packages/tui/src/components/loader.ts:88: skipInitialRender short-circuits constructor redraw",
];

const toolExecutionArgsFrames = [
	{ path: "src/modes/interactive/interactive-mode.ts" },
	{ path: "src/modes/interactive/components/tool-execution.ts" },
];

const toolExecutionResultFrames = [
	{
		content: [{ type: "text", text: "found requestRenderUnlessInputSuppressed() in ToolExecutionComponent" }],
		isError: false,
	},
	{
		content: [{ type: "text", text: "converted image callback now respects suppression-aware redraw path" }],
		isError: false,
	},
];

if (scenarios.length === 0) {
	throw new Error(`No scenarios matched --scenario-list=${scenarioListArg}`);
}
if (scenarioArg) {
	const scopedIndex = scenarios.findIndex((scenario) => scenario.name === scenarioArg);
	if (scopedIndex >= 0) {
		scenarioIndex = scopedIndex;
	} else {
		scenarioIndex = 0;
	}
}

const progressComponent = new ProgressSurfaceComponent(() => getSnapshot(), theme, progressWorking);

function currentScenario(): ImeScenario {
	return scenarios[scenarioIndex] ?? scenarios[0]!;
}

function getSnapshot(): ProgressSurfaceSnapshot {
	const scenario = currentScenario();
	return createImeScenarioSnapshot(scenario, Math.max(0, Date.now() - scenarioStartedAt), outputTokens);
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

function syncTranscriptScenarioLines(): void {
	const scenario = currentScenario();
	if (scenario.useBashStream) {
		if (!bashStreamComponent) {
			bashStreamComponent = new BashExecutionComponent(
				"rg -n requestRender packages/coding-agent/src/modes/interactive/interactive-mode.ts",
				ui,
				false,
			);
		}
		transcript.addChild(new Spacer(1));
		transcript.addChild(new Text(theme.fg("dim", `scenario transcript · ${scenario.name}`), 1, 0));
		transcript.addChild(bashStreamComponent);
		return;
	}
	if (scenario.useBranchSummaryStream) {
		if (!branchSummaryLoader) {
			branchSummaryLoader = new BorderedLoader(ui, theme, "Summarizing branch... (Esc to cancel)", {
				cancellable: false,
			});
		}
		transcript.addChild(new Spacer(1));
		transcript.addChild(new Text(theme.fg("dim", `scenario transcript · ${scenario.name}`), 1, 0));
		transcript.addChild(branchSummaryLoader);
		transcript.addChild(
			new Text(
				theme.fg(
					"text",
					"branch summary: 正在模拟 showTreeSelector 触发 summaryLoader 后，任务栏与输入框同时存在的状态",
				),
				1,
				0,
			),
		);
		return;
	}
	if (scenario.useApprovalSelector) {
		if (!approvalSelector) {
			approvalSelector = new ExtensionSelectorComponent(
				"将修改 4 个文件，确认后继续",
				["Approve", "Reject"],
				() => {},
				() => {},
				{ tui: ui },
			);
		}
		transcript.addChild(new Spacer(1));
		transcript.addChild(new Text(theme.fg("dim", `scenario transcript · ${scenario.name}`), 1, 0));
		transcript.addChild(approvalSelector);
		return;
	}
	if (scenario.useInputPrompt) {
		if (!askUserInput) {
			askUserInput = new ExtensionInputComponent(
				"请选择：保守修复 / 一次性重构",
				"输入你的选择",
				() => {},
				() => {},
				{ tui: ui },
			);
		}
		transcript.addChild(new Spacer(1));
		transcript.addChild(new Text(theme.fg("dim", `scenario transcript · ${scenario.name}`), 1, 0));
		transcript.addChild(askUserInput);
		return;
	}
	if (scenario.useToolExecutionStream) {
		if (!toolExecutionComponent) {
			toolExecutionComponent = new ToolExecutionComponent(
				"read",
				"tool-read-1",
				toolExecutionArgsFrames[0],
				{},
				undefined,
				ui,
				process.cwd(),
			);
		}
		transcript.addChild(new Spacer(1));
		transcript.addChild(new Text(theme.fg("dim", `scenario transcript · ${scenario.name}`), 1, 0));
		transcript.addChild(toolExecutionComponent);
		return;
	}
	if (!scenario.transcriptLines || scenario.transcriptLines.length === 0) {
		return;
	}
	transcript.addChild(new Spacer(1));
	transcript.addChild(new Text(theme.fg("dim", `scenario transcript · ${scenario.name}`), 1, 0));
	for (const line of scenario.transcriptLines) {
		transcript.addChild(new Text(theme.fg("text", line), 1, 0));
	}
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
		ui.terminal.setProgress(shouldImeHarnessShowTerminalProgress(currentScenario(), false));
		ui.requestRender();
	}, 201);
}

function renderAll(): void {
	while (transcript.children.length > transcriptBaseChildrenCount) {
		transcript.removeChild(transcript.children[transcript.children.length - 1]!);
	}
	syncTranscriptScenarioLines();
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
	bashStreamFrame = 0;
	bashStreamComponent = undefined;
	branchSummaryLoader = undefined;
	approvalSelector = undefined;
	askUserInput = undefined;
	toolExecutionComponent = undefined;
	toolExecutionFrame = 0;
	terminal.resetWriteOperations();
	renderAll();
}

function shutdown(): void {
	if (inputResumeTimer) {
		clearTimeout(inputResumeTimer);
		inputResumeTimer = undefined;
	}
	if (exitTimer) {
		clearTimeout(exitTimer);
		exitTimer = undefined;
	}
	if (autoCycleTimer) {
		clearInterval(autoCycleTimer);
		autoCycleTimer = undefined;
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
if (scenarioArg) {
	transcript.addChild(new Text(theme.fg("dim", `预设场景：${scenarioArg}`), 1, 0));
}
if (scenarioListArg) {
	transcript.addChild(new Text(theme.fg("dim", `场景集合：${scenarioListArg}`), 1, 0));
}
if (exitAfterMs) {
	transcript.addChild(new Text(theme.fg("dim", `自动退出：${exitAfterMs}ms`), 1, 0));
}
if (autoCycleMs) {
	transcript.addChild(new Text(theme.fg("dim", `自动切场景：每 ${autoCycleMs}ms`), 1, 0));
}
transcript.addChild(new Spacer(1));
transcript.addChild(
	new Text(
		theme.fg("text", "assistant: 正在模拟 interactive-mode 的 transcript / taskbar / pending / footer 布局"),
		1,
		0,
	),
);

const transcriptBaseChildrenCount = transcript.children.length;

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
	if (!shouldImeHarnessAutoAnimate(scenario)) {
		return;
	}
	if (animationEnabled && scenario.animateTokens) {
		outputTokens += 24;
	}
	if (animationEnabled && scenario.useBashStream) {
		if (!bashStreamComponent) {
			bashStreamComponent = new BashExecutionComponent(
				"rg -n requestRender packages/coding-agent/src/modes/interactive/interactive-mode.ts",
				ui,
				false,
			);
		}
		if (bashStreamFrame < bashStreamFrames.length) {
			bashStreamComponent.appendOutput(`${bashStreamFrames[bashStreamFrame++]}\n`);
		} else if (bashStreamFrame === bashStreamFrames.length) {
			bashStreamComponent.setComplete(0, false);
			bashStreamFrame++;
		}
	}
	if (animationEnabled && scenario.useToolExecutionStream) {
		if (!toolExecutionComponent) {
			toolExecutionComponent = new ToolExecutionComponent(
				"read",
				"tool-read-1",
				toolExecutionArgsFrames[0],
				{},
				undefined,
				ui,
				process.cwd(),
			);
		}
		if (toolExecutionFrame === 0) {
			toolExecutionComponent.markExecutionStarted();
			toolExecutionFrame++;
		} else if (toolExecutionFrame <= toolExecutionArgsFrames.length) {
			toolExecutionComponent.updateArgs(toolExecutionArgsFrames[toolExecutionFrame - 1]!);
			toolExecutionFrame++;
		} else if (toolExecutionFrame === toolExecutionArgsFrames.length + 1) {
			toolExecutionComponent.setArgsComplete();
			toolExecutionFrame++;
		} else {
			const resultIndex = toolExecutionFrame - (toolExecutionArgsFrames.length + 2);
			if (resultIndex < toolExecutionResultFrames.length) {
				toolExecutionComponent.updateResult(
					toolExecutionResultFrames[resultIndex]!,
					resultIndex < toolExecutionResultFrames.length - 1,
				);
				toolExecutionFrame++;
			}
		}
	}
	renderAll();
}, 120);

ui.start();
ui.terminal.setProgress(shouldImeHarnessShowTerminalProgress(currentScenario(), false));
renderAll();

if (exitAfterMs) {
	exitTimer = setTimeout(() => {
		exitTimer = undefined;
		shutdown();
	}, exitAfterMs);
}

if (autoCycleMs) {
	autoCycleTimer = setInterval(() => {
		advanceScenario();
	}, autoCycleMs);
}

process.on("SIGINT", shutdown);
