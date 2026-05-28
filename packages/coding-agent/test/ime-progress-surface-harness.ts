import type { SpinnerUiState, TaskUiItem } from "../src/core/extensions/types.ts";
import type { ProgressSurfaceSnapshot } from "../src/modes/interactive/components/progress-surface.ts";

export type ImeScenario = {
	name: string;
	description: string;
	tasks: TaskUiItem[];
	pending: string[];
	banner?: SpinnerUiState["banner"];
	mode?: SpinnerUiState["mode"];
	isThinking?: boolean;
	animateTokens?: boolean;
	complete?: boolean;
	transcriptLines?: string[];
	useBashStream?: boolean;
	useBranchSummaryStream?: boolean;
	useApprovalSelector?: boolean;
	useInputPrompt?: boolean;
	useToolExecutionStream?: boolean;
};

export const IME_PROGRESS_SURFACE_SCENARIOS: ImeScenario[] = [
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
				content: "Read retry flow",
				subject: "Read retry flow",
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
			title: "Awaiting approval",
			detail: "将修改 4 个文件，确认后继续",
		},
		mode: "requesting",
		useApprovalSelector: true,
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
			title: "Awaiting your input",
			detail: "请选择：保守修复 / 一次性重构",
		},
		mode: "requesting",
		useInputPrompt: true,
	},
	{
		name: "retry",
		description: "自动重试",
		tasks: [],
		pending: ["Follow-up: 恢复后继续补测试"],
		banner: {
			kind: "warning",
			title: "Request unstable, retrying automatically",
			detail: "Attempt 1/3 · retrying in 2s",
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
			title: "Connection unstable, recovering stream",
			detail: "SSE reconnect · attempt 2/10",
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
				content: "Read CONTRIBUTING.md",
				subject: "Read CONTRIBUTING.md",
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
		name: "bash",
		description: "bash 流式输出",
		tasks: [
			{
				id: "todo:0:0:验证 bash 输出收口",
				content: "验证 bash 输出收口",
				subject: "验证 bash 输出收口",
				activeForm: "验证 bash 输出收口",
				status: "in_progress",
				group: "IME",
			},
		],
		pending: [],
		mode: "responding",
		animateTokens: true,
		useBashStream: true,
	},
	{
		name: "branch-summary",
		description: "branch summary 流式输出",
		tasks: [
			{
				id: "todo:0:0:验证 branch summary 输出收口",
				content: "验证 branch summary 输出收口",
				subject: "验证 branch summary 输出收口",
				activeForm: "验证 branch summary 输出收口",
				status: "in_progress",
				group: "IME",
			},
		],
		pending: [],
		mode: "requesting",
		animateTokens: true,
		useBranchSummaryStream: true,
	},
	{
		name: "tool-execution",
		description: "tool execution 流式输出",
		tasks: [
			{
				id: "todo:0:0:验证 tool execution 输出收口",
				content: "验证 tool execution 输出收口",
				subject: "验证 tool execution 输出收口",
				activeForm: "验证 tool execution 输出收口",
				status: "in_progress",
				group: "IME",
			},
		],
		pending: [],
		mode: "tool-use",
		animateTokens: true,
		useToolExecutionStream: true,
	},
	{
		name: "complete",
		description: "会话完成后任务栏消失",
		tasks: [],
		pending: [],
		complete: true,
	},
];

export const IME_CRITICAL_SCENARIO_NAMES = [
	"approval",
	"ask-user",
	"retry",
	"reconnect",
	"parallel",
	"bash",
	"branch-summary",
	"complete",
] as const;

export function findImeScenarioIndexByName(name: string | undefined): number {
	if (!name) return 0;
	const index = IME_PROGRESS_SURFACE_SCENARIOS.findIndex((scenario) => scenario.name === name);
	return index >= 0 ? index : 0;
}

export function expandImeScenarioNames(names: string[] | undefined): string[] | undefined {
	if (!names || names.length === 0) {
		return undefined;
	}

	const expanded: string[] = [];
	for (const name of names) {
		if (name === "critical") {
			expanded.push(...IME_CRITICAL_SCENARIO_NAMES);
			continue;
		}
		if (name === "all") {
			expanded.push(...IME_PROGRESS_SURFACE_SCENARIOS.map((scenario) => scenario.name));
			continue;
		}
		expanded.push(name);
	}

	return [...new Set(expanded)];
}

export function filterImeScenariosByNames(names: string[] | undefined): ImeScenario[] {
	const expanded = expandImeScenarioNames(names);
	if (!expanded || expanded.length === 0) {
		return IME_PROGRESS_SURFACE_SCENARIOS;
	}
	return IME_PROGRESS_SURFACE_SCENARIOS.filter((scenario) => expanded.includes(scenario.name));
}

export function createImeScenarioSnapshot(
	scenario: ImeScenario,
	elapsedMs: number,
	outputTokens: number,
): ProgressSurfaceSnapshot {
	if (scenario.complete) {
		return {
			tasks: [],
			queued: undefined,
			spinner: undefined,
			expanded: false,
		};
	}

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

export function shouldImeHarnessShowTerminalProgress(scenario: ImeScenario, inputSuppressed: boolean): boolean {
	return !scenario.complete && !inputSuppressed;
}

export function shouldImeHarnessAutoAnimate(scenario: ImeScenario): boolean {
	if (scenario.complete) {
		return false;
	}

	return (
		scenario.animateTokens === true ||
		scenario.mode !== undefined ||
		scenario.banner !== undefined ||
		scenario.tasks.length > 0 ||
		scenario.pending.length > 0
	);
}
