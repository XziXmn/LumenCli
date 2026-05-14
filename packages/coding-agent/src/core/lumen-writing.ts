/**
 * Lumen 写作工作流命令
 *
 * 直接集成到核心的写作命令：/plan /draft /review /revise
 * 这些命令将用户输入包装为写作专用 prompt 发送给当前模型。
 */

import type { ExtensionAPI } from "./extensions/types.js";

export default function lumenWritingExtension(pi: ExtensionAPI): void {
	pi.registerCommand("plan", {
		description: "创建写作或工作计划",
		handler: async (args) => {
			const goal = args.trim() || "当前目标";
			const prompt = [
				"你是写作与任务规划助手。",
				"请根据目标生成结构化计划，包含：",
				"1. 目标理解与约束分析",
				"2. 可执行步骤拆分",
				"3. 风险与需要确认的边界",
				"4. 下一步行动",
				"",
				`目标：${goal}`,
			].join("\n");
			pi.sendUserMessage(prompt);
		},
	});

	pi.registerCommand("draft", {
		description: "根据 brief 起草正文",
		handler: async (args) => {
			const brief = args.trim() || "请提供要起草的场景、章节或段落要求。";
			const prompt = [
				"你是小说写作草稿助手。",
				"请根据 brief 生成可继续扩写的正文。",
				"输出要求：",
				"- 先给 1 句创作意图",
				"- 再给正文草稿",
				"- 保持文风一致，不要解释你是 AI",
				"",
				`brief：${brief}`,
			].join("\n");
			pi.sendUserMessage(prompt);
		},
	});

	pi.registerCommand("review", {
		description: "审阅文本的结构、语言和连续性",
		handler: async (args) => {
			const target = args.trim() || "当前上下文";
			const prompt = [
				"你是小说审阅助手。",
				"请从以下维度审阅文本：",
				"1. 结构：章节/段落组织是否合理",
				"2. 语言：文风、节奏、用词是否恰当",
				"3. 连续性：前后逻辑、人物行为是否一致",
				"",
				"输出要求：",
				"- 问题按严重程度排列",
				"- 给出可执行修改建议",
				"- 如果信息不足，明确说明需要的上下文",
				"",
				`审阅目标：${target}`,
			].join("\n");
			pi.sendUserMessage(prompt);
		},
	});

	pi.registerCommand("revise", {
		description: "对文本给出修订版本和修改理由",
		handler: async (args) => {
			const target = args.trim() || "请提供需要修订的文本或目标。";
			const prompt = [
				"你是小说修订助手。",
				"请对输入文本给出修订版本。",
				"输出要求：",
				"- 先给修订方向（1-2 句）",
				"- 再给修订后的文本",
				"- 最后列出关键改动及理由",
				"",
				`修订目标：${target}`,
			].join("\n");
			pi.sendUserMessage(prompt);
		},
	});
}
