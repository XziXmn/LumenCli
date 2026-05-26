import { beforeAll, describe, expect, it } from "vitest";
import {
	__renderProgressSurfaceLinesForTest,
	type ProgressSurfaceSnapshot,
} from "../src/modes/interactive/components/progress-surface.js";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.js";
import { stripAnsi } from "../src/utils/ansi.js";

function render(snapshot: ProgressSurfaceSnapshot): string {
	return stripAnsi(__renderProgressSurfaceLinesForTest(snapshot, theme).join("\n"));
}

describe("core progress surface", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("renders todo-only state as headline plus plan", () => {
		const output = render({
			tasks: [
				{
					id: "todo:0:0:接入数据源",
					content: "接入数据源",
					subject: "接入数据源",
					activeForm: "正在接入数据源",
					status: "in_progress",
					group: "数据采集",
				},
				{
					id: "todo:0:1:数据清洗",
					content: "数据清洗",
					subject: "数据清洗",
					status: "pending",
					group: "数据采集",
				},
			],
			queued: undefined,
			spinner: {
				elapsedMs: 9_000,
				outputTokens: 295,
				isThinking: true,
				mode: "thinking",
			},
			expanded: false,
		});

		expect(output).toMatch(/[⣻⣽⣾⣷⣯⣟⢿⡿] 正在接入数据源\.\.\./);
		expect(output).toContain("计划");
		expect(output).toContain("◐ 接入数据源");
		expect(output).toContain("☐ 数据清洗");
		expect(output).toContain("下一步：数据清洗");
	});

	it("renders task execution above todo plan when both exist", () => {
		const output = render({
			tasks: [
				{
					id: "task:worker-1",
					content: "实现支付模块",
					subject: "实现支付模块",
					activeForm: "正在实现支付模块",
					status: "running",
					group: "worker",
					meta: "edit src/payment.ts",
					toolCount: 3,
					tokens: 640,
				},
				{
					id: "task:tester-1",
					content: "补回归测试",
					subject: "补回归测试",
					status: "pending",
					group: "tester",
				},
				{
					id: "todo:0:0:需求梳理",
					content: "需求梳理",
					subject: "需求梳理",
					status: "completed",
					group: "阶段一",
				},
				{
					id: "todo:0:1:实现支付模块",
					content: "实现支付模块",
					subject: "实现支付模块",
					activeForm: "正在实现支付模块",
					status: "in_progress",
					group: "阶段一",
				},
				{
					id: "todo:0:2:补回归测试",
					content: "补回归测试",
					subject: "补回归测试",
					status: "pending",
					group: "阶段一",
				},
			],
			queued: undefined,
			spinner: {
				elapsedMs: 18_000,
				outputTokens: 640,
				mode: "tool-use",
			},
			expanded: false,
		});

		expect(output).toContain("正在实现支付模块...");
		expect(output).not.toContain("@worker 正在实现支付模块...");
		expect(output).toContain("@worker: 实现支付模块 · 当前工具：edit src/payment.ts · 3 次调用 · 640 tokens");
		expect(output).toContain("@tester: 补回归测试 · 等待中");
		expect(output).toContain("1 个运行中的任务");
		expect(output).toContain("计划");
		expect(output).toContain("☒ 需求梳理");
		expect(output).toContain("☐ 补回归测试");
	});

	it("prefers the current todo headline over a running subagent detail", () => {
		const output = render({
			tasks: [
				{
					id: "task:explore-1",
					content: "读取 CONTRIBUTING.md",
					subject: "读取 CONTRIBUTING.md",
					status: "running",
					group: "explore",
					meta: "read CONTRIBUTING.md",
					toolCount: 1,
					tokens: 406,
				},
				{
					id: "todo:0:0:抽取公共工具类",
					content: "抽取公共工具类",
					subject: "抽取公共工具类",
					activeForm: "抽取公共工具类",
					status: "in_progress",
					group: "阶段一",
				},
			],
			queued: undefined,
			spinner: {
				elapsedMs: 22_000,
				outputTokens: 406,
				mode: "tool-use",
			},
			expanded: false,
		});

		expect(output).toContain("抽取公共工具类...");
		expect(output).not.toContain("@explore 读取 CONTRIBUTING.md...");
		expect(output).toContain("@explore: 读取 CONTRIBUTING.md · 当前工具：read CONTRIBUTING.md");
	});

	it("aggregates multi-agent execution in the headline while keeping detail rows below", () => {
		const output = render({
			tasks: [
				{
					id: "task:explore-1",
					content: "读取 CONTRIBUTING.md",
					subject: "读取 CONTRIBUTING.md",
					status: "running",
					group: "explore",
					meta: "read CONTRIBUTING.md",
					toolCount: 1,
					tokens: 1700,
					durationMs: 14_000,
				},
				{
					id: "task:review-1",
					content: "扫描错误处理路径",
					subject: "扫描错误处理路径",
					status: "running",
					group: "review",
					meta: "grep retry logic",
					toolCount: 2,
					tokens: 2100,
					durationMs: 15_000,
				},
			],
			queued: undefined,
			spinner: {
				elapsedMs: 15_000,
				outputTokens: 3800,
				mode: "tool-use",
			},
			expanded: false,
		});

		expect(output).toContain("2 个运行中的任务...");
		expect(output).toContain("@explore: 读取 CONTRIBUTING.md · 当前工具：read CONTRIBUTING.md");
		expect(output).toContain("@review: 扫描错误处理路径 · 当前工具：grep retry logic");
	});

	it("keeps execution row text stable when a running task briefly loses meta", () => {
		const withMeta = render({
			tasks: [
				{
					id: "task:explore-1",
					content: "分析审批和用户判断流程实现",
					subject: "分析审批和用户判断流程实现",
					activeForm: "分析审批和用户判断流程实现",
					status: "running",
					group: "explore",
					meta: "分析审批和用户判断流程实现",
					toolCount: 55,
					tokens: 26_000,
					durationMs: 3 * 60_000 + 29_000,
				},
			],
			queued: undefined,
			spinner: {
				elapsedMs: 3 * 60_000 + 57_000,
				outputTokens: 502,
				mode: "tool-use",
			},
			expanded: false,
		});

		const withoutMeta = render({
			tasks: [
				{
					id: "task:explore-1",
					content: "分析审批和用户判断流程实现",
					subject: "分析审批和用户判断流程实现",
					activeForm: "分析审批和用户判断流程实现",
					status: "running",
					group: "explore",
					toolCount: 55,
					tokens: 26_000,
					durationMs: 3 * 60_000 + 30_000,
				},
			],
			queued: undefined,
			spinner: {
				elapsedMs: 3 * 60_000 + 58_000,
				outputTokens: 502,
				mode: "tool-use",
			},
			expanded: false,
		});

		expect(withMeta).toContain("@explore: 分析审批和用户判断流程实现 · 55 次调用 · 26k tokens · 3m 29s");
		expect(withoutMeta).toContain("@explore: 分析审批和用户判断流程实现 · 55 次调用 · 26k tokens · 3m 30s");
		expect(withoutMeta).not.toContain("@explore: 分析审批和用户判断流程实现...");
	});

	it("keeps execution row primary text stable when the current tool changes", () => {
		const readPhase = render({
			tasks: [
				{
					id: "task:explore-1",
					content: "分析审批和用户判断流程实现",
					subject: "分析审批和用户判断流程实现",
					status: "running",
					group: "explore",
					meta: "read approval-flow.ts",
					toolCount: 55,
					tokens: 26_000,
					durationMs: 3 * 60_000 + 29_000,
				},
			],
			queued: undefined,
			spinner: {
				elapsedMs: 3 * 60_000 + 57_000,
				outputTokens: 502,
				mode: "tool-use",
			},
			expanded: false,
		});

		const grepPhase = render({
			tasks: [
				{
					id: "task:explore-1",
					content: "分析审批和用户判断流程实现",
					subject: "分析审批和用户判断流程实现",
					status: "running",
					group: "explore",
					meta: "grep approvalState",
					toolCount: 56,
					tokens: 26_300,
					durationMs: 3 * 60_000 + 31_000,
				},
			],
			queued: undefined,
			spinner: {
				elapsedMs: 3 * 60_000 + 59_000,
				outputTokens: 520,
				mode: "tool-use",
			},
			expanded: false,
		});

		expect(readPhase).toContain(
			"@explore: 分析审批和用户判断流程实现 · 当前工具：read approval-flow.ts · 55 次调用 · 26k tokens · 3m 29s",
		);
		expect(grepPhase).toContain(
			"@explore: 分析审批和用户判断流程实现 · 当前工具：grep approvalState · 56 次调用 · 26k tokens · 3m 31s",
		);
		expect(grepPhase).not.toContain("@explore: grep approvalState");
	});

	it("keeps the generic working verb when there is no active todo and the leader is just streaming", () => {
		const output = render({
			tasks: [
				{
					id: "task:explore-1",
					content: "读取 CONTRIBUTING.md",
					subject: "读取 CONTRIBUTING.md",
					status: "running",
					group: "explore",
					meta: "read CONTRIBUTING.md",
					toolCount: 1,
					tokens: 1700,
					durationMs: 14_000,
				},
				{
					id: "task:review-1",
					content: "扫描错误处理路径",
					subject: "扫描错误处理路径",
					status: "running",
					group: "review",
					meta: "grep retry logic",
					toolCount: 2,
					tokens: 2100,
					durationMs: 15_000,
				},
			],
			queued: undefined,
			spinner: {
				elapsedMs: 15_000,
				outputTokens: 3800,
				mode: "responding",
			},
			expanded: false,
		});

		expect(output).not.toContain("2 个运行中的任务...");
		expect(output).toContain("@explore: 读取 CONTRIBUTING.md · 当前工具：read CONTRIBUTING.md");
		expect(output).toContain("@review: 扫描错误处理路径 · 当前工具：grep retry logic");
	});

	it("keeps a live multi-agent execution headline instead of falling back to idle", () => {
		const output = render({
			tasks: [
				{
					id: "task:explore-1",
					content: "查看Git分支信息",
					subject: "查看Git分支信息",
					status: "running",
					group: "explore",
					meta: "git branch --show-current",
					toolCount: 3,
					tokens: 2048,
					durationMs: 11_000,
				},
				{
					id: "task:explore-2",
					content: "读取tsconfig配置",
					subject: "读取tsconfig配置",
					status: "running",
					group: "explore",
					meta: "read tsconfig.json",
					toolCount: 2,
					tokens: 1700,
					durationMs: 12_000,
				},
			],
			queued: undefined,
			spinner: {
				elapsedMs: 12_000,
				outputTokens: 0,
				mode: "tool-use",
			},
			expanded: false,
		});

		expect(output).toMatch(/[⣻⣽⣾⣷⣯⣟⢿⡿] 2 个运行中的任务\.\.\./);
		expect(output).toContain("@explore: 查看Git分支信息 · 当前工具：git branch --show-current");
		expect(output).toContain("@explore: 读取tsconfig配置 · 当前工具：read tsconfig.json");
		expect(output).not.toContain("空转");
	});

	it("renders banner headline without mixing queued commands into the status surface", () => {
		const output = render({
			tasks: [],
			queued: {
				steering: [],
				followUp: [
					{
						kind: "followUp",
						mode: "prompt",
						text: "完成后补文档",
					},
				],
			},
			spinner: {
				banner: {
					kind: "warning",
					title: "接口不稳定，正在自动重试",
					detail: "第 1/3 次重试 · timeout",
				},
				overrideMessage: "Retrying request",
				mode: "requesting",
			},
			expanded: false,
		});

		expect(output).toContain("接口不稳定，正在自动重试");
		expect(output).toContain("第 1/3 次重试 · timeout");
		expect(output).not.toContain("1 queued command");
		expect(output).not.toContain("Follow-up: 完成后补文档");
	});

	it("renders approval banner distinctly", () => {
		const output = render({
			tasks: [],
			queued: undefined,
			spinner: {
				banner: {
					kind: "approval",
					title: "等待审批确认",
					detail: "将修改 4 个文件，确认后继续",
				},
			},
			expanded: false,
		});

		expect(output).toContain("等待审批确认");
		expect(output).toContain("将修改 4 个文件，确认后继续");
	});

	it("lets approval banner and override message dominate over a live todo headline", () => {
		const output = render({
			tasks: [
				{
					id: "todo:0:0:实现核心功能",
					content: "实现核心功能",
					subject: "实现核心功能",
					activeForm: "实现核心功能",
					status: "in_progress",
					group: "开发实现",
				},
			],
			queued: undefined,
			spinner: {
				banner: {
					kind: "approval",
					title: "等待审批确认",
					detail: "将修改 4 个文件，确认后继续",
				},
				overrideMessage: "Waiting for approval",
				mode: "requesting",
			},
			expanded: false,
		});

		expect(output).toContain("等待审批确认");
		expect(output).toContain("Waiting for approval...");
		expect(output).not.toContain("实现核心功能...");
	});

	it("renders user-input banner distinctly", () => {
		const output = render({
			tasks: [],
			queued: undefined,
			spinner: {
				banner: {
					kind: "input",
					title: "等待你的输入",
					detail: "请选择：保守修复 / 一次性重构",
				},
			},
			expanded: false,
		});

		expect(output).toContain("等待你的输入");
		expect(output).toContain("请选择：保守修复 / 一次性重构");
	});

	it("lets user-input banner dominate over a live todo headline", () => {
		const output = render({
			tasks: [
				{
					id: "todo:0:0:整理接口定义",
					content: "整理接口定义",
					subject: "整理接口定义",
					activeForm: "整理接口定义",
					status: "in_progress",
					group: "接口收口",
				},
			],
			queued: undefined,
			spinner: {
				banner: {
					kind: "input",
					title: "等待你的输入",
					detail: "请选择：保守修复 / 一次性重构",
				},
			},
			expanded: false,
		});

		expect(output).toContain("等待你的输入...");
		expect(output).toContain("请选择：保守修复 / 一次性重构");
		expect(output).not.toContain("整理接口定义...");
	});

	it("renders stream recovery banner distinctly", () => {
		const output = render({
			tasks: [],
			queued: undefined,
			spinner: {
				banner: {
					kind: "warning",
					title: "网络连接不稳定，正在恢复会话流",
					detail: "SSE reconnect · 第 2/10 次",
				},
			},
			expanded: false,
		});

		expect(output).toContain("网络连接不稳定，正在恢复会话流");
		expect(output).toContain("SSE reconnect · 第 2/10 次");
	});

	it("lets reconnect banner dominate over a live todo headline", () => {
		const output = render({
			tasks: [
				{
					id: "todo:0:0:继续拉取接口结果",
					content: "继续拉取接口结果",
					subject: "继续拉取接口结果",
					activeForm: "继续拉取接口结果",
					status: "in_progress",
					group: "数据同步",
				},
			],
			queued: undefined,
			spinner: {
				banner: {
					kind: "warning",
					title: "网络连接不稳定，正在恢复会话流",
					detail: "SSE reconnect · 第 2/10 次",
				},
			},
			expanded: false,
		});

		expect(output).toContain("网络连接不稳定，正在恢复会话流...");
		expect(output).toContain("SSE reconnect · 第 2/10 次");
		expect(output).not.toContain("继续拉取接口结果...");
	});

	it("hides taskbar when only completed or abandoned todo items remain", () => {
		const output = render({
			tasks: [
				{
					id: "todo:0:0:需求梳理",
					content: "需求梳理",
					subject: "需求梳理",
					status: "completed",
					group: "阶段一",
				},
				{
					id: "todo:0:1:接口设计",
					content: "接口设计",
					subject: "接口设计",
					status: "abandoned",
					group: "阶段一",
				},
			],
			queued: undefined,
			spinner: undefined,
			expanded: true,
		});

		expect(output.trim()).toBe("");
	});

	it("keeps taskbar visible when only todo plan remains so todo can own progress", () => {
		const output = render({
			tasks: [
				{
					id: "todo:0:0:实现分页查询",
					content: "实现分页查询",
					subject: "实现分页查询",
					status: "in_progress",
					group: "阶段一",
				},
				{
					id: "todo:0:1:添加参数校验",
					content: "添加参数校验",
					subject: "添加参数校验",
					status: "pending",
					group: "阶段一",
				},
			],
			queued: undefined,
			spinner: undefined,
			expanded: false,
		});

		expect(output).toContain("实现分页查询...");
		expect(output).toContain("计划");
		expect(output).toContain("◐ 实现分页查询");
		expect(output).toContain("☐ 添加参数校验");
		expect(output).toContain("下一步：添加参数校验");
	});
});
