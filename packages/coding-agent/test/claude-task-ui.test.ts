import { beforeAll, describe, expect, it } from "vitest";
import { __renderTaskbarLinesForTest, type TaskbarSnapshot } from "../../../.lumen/extensions/claude-task-ui.js";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.js";
import { stripAnsi } from "../src/utils/ansi.js";

function render(snapshot: TaskbarSnapshot): string {
	return stripAnsi(__renderTaskbarLinesForTest(snapshot, theme).join("\n"));
}

describe("claude task ui taskbar", () => {
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
			summary: {
				total: 2,
				completed: 0,
				inProgress: 1,
				pending: 1,
				failed: 0,
				abandoned: 0,
			},
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
			summary: {
				total: 5,
				completed: 1,
				inProgress: 2,
				pending: 2,
				failed: 0,
				abandoned: 0,
			},
			queued: undefined,
			spinner: {
				elapsedMs: 18_000,
				outputTokens: 640,
				mode: "tool-use",
			},
			expanded: false,
		});

		expect(output).toContain("正在实现支付模块...");
		expect(output).toContain("@worker: edit src/payment.ts · 3 uses · 640 tokens");
		expect(output).toContain("@tester: 补回归测试 · pending");
		expect(output).toContain("Plan");
		expect(output).toContain("☒ 需求梳理");
		expect(output).toContain("☐ 补回归测试");
	});

	it("renders banner and queued commands together", () => {
		const output = render({
			tasks: [],
			summary: undefined,
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
		expect(output).toContain("1 queued command");
		expect(output).toContain("Follow-up: 完成后补文档");
	});

	it("renders approval banner distinctly", () => {
		const output = render({
			tasks: [],
			summary: undefined,
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
			summary: undefined,
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
			summary: undefined,
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
			summary: {
				total: 2,
				completed: 1,
				inProgress: 0,
				pending: 0,
				failed: 0,
				abandoned: 1,
			},
			queued: undefined,
			spinner: undefined,
			expanded: true,
		});

		expect(output.trim()).toBe("");
	});
});
