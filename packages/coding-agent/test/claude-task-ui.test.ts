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
		expect(output).toContain("Plan");
		expect(output).toContain("◐ 接入数据源");
		expect(output).toContain("☐ 数据清洗");
		expect(output).toContain("Next: 数据清洗");
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
		expect(output).toContain("@worker: edit src/payment.ts · 3 uses · 640 tokens");
		expect(output).toContain("@tester: 补回归测试 · pending");
		expect(output).toContain("1 running task");
		expect(output).toContain("Plan");
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
		expect(output).toContain("@explore: read CONTRIBUTING.md");
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

		expect(output).toContain("2 running tasks...");
		expect(output).toContain("@explore: read CONTRIBUTING.md");
		expect(output).toContain("@review: grep retry logic");
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

		expect(output).not.toContain("2 running tasks...");
		expect(output).toContain("@explore: read CONTRIBUTING.md");
		expect(output).toContain("@review: grep retry logic");
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

		expect(output).toMatch(/[⣻⣽⣾⣷⣯⣟⢿⡿] 2 running tasks\.\.\./);
		expect(output).toContain("@explore: git branch --show-current");
		expect(output).toContain("@explore: read tsconfig.json");
		expect(output).not.toContain("Idle");
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

	it("hides taskbar when only todo plan remains but execution is complete", () => {
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

		expect(output.trim()).toBe("");
	});
});
