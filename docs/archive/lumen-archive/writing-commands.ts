import type { CommandRegistry } from "@lumen/command-system";
import type { CommandContext, CommandHandlerInput } from "@lumen/command-system";

export function registerWritingCommands(registry: CommandRegistry): void {
  registry.register({
    name: "plan",
    summary: "Create a writing or work plan from the current request.",
    usage: "/plan <goal>",
    async handle(input, context) {
      const goal = input.text || "当前目标";
      if (context.complete) {
        return {
          title: "Plan",
          content: await context.complete(createPlanPrompt(goal)),
          exitCode: 0,
        };
      }
      return {
        title: "Plan",
        content: [
          `目标：${goal}`,
          "",
          "1. 明确当前上下文和约束。",
          "2. 拆分可执行步骤。",
          "3. 标出需要用户确认的边界。",
          "4. 执行后回收结果与记忆。",
        ].join("\n"),
        exitCode: 0,
      };
    },
  });

  registry.register({
    name: "draft",
    summary: "Draft prose or a scene from a writing brief.",
    usage: "/draft <brief>",
    async handle(input, context) {
      if (context.complete) {
        return {
          title: "Draft",
          content: await context.complete(createDraftPrompt(input)),
          exitCode: 0,
        };
      }
      return {
        title: "Draft",
        content: `写作草稿占位：${input.text || "请提供要起草的场景、章节或段落要求。"}`,
        exitCode: 0,
      };
    },
  });

  registry.register({
    name: "review",
    summary: "Review prose, structure, continuity, or tone.",
    usage: "/review <text or target>",
    async handle(input, context) {
      if (context.complete) {
        return {
          title: "Review",
          content: await context.complete(createReviewPrompt(input)),
          exitCode: 0,
        };
      }
      return {
        title: "Review",
        content: [
          `审阅目标：${input.text || "当前上下文"}`,
          "",
          "- 结构：待接入正文上下文后分析。",
          "- 连续性：待接入 .novel memory 后分析。",
          "- 语言：待接入模型后分析。",
        ].join("\n"),
        exitCode: 0,
      };
    },
  });

  registry.register({
    name: "revise",
    summary: "Suggest revisions for selected prose or a writing target.",
    usage: "/revise <text or target>",
    async handle(input, context) {
      if (context.complete) {
        return {
          title: "Revise",
          content: await context.complete(createRevisePrompt(input)),
          exitCode: 0,
        };
      }
      return {
        title: "Revise",
        content: `修订建议占位：${input.text || "请提供需要修订的文本或目标。"}`,
        exitCode: 0,
      };
    },
  });
}

function createPlanPrompt(goal: string): string {
  return [
    "你是 LumenCli 的写作与任务规划模块。",
    "请根据目标生成结构化计划，包含目标理解、步骤、风险、下一步。",
    "",
    `目标：${goal}`,
  ].join("\n");
}

function createDraftPrompt(input: CommandHandlerInput): string {
  return [
    "你是 LumenCli 的小说写作草稿模块。",
    "请根据 brief 生成可继续扩写的正文 artifact。",
    "输出要求：",
    "- 先给 1 句创作意图。",
    "- 再给正文草稿。",
    "- 不要解释你是 AI。",
    "",
    `brief：${input.text || "请提供要起草的场景、章节或段落要求。"}`,
  ].join("\n");
}

function createReviewPrompt(input: CommandHandlerInput): string {
  return [
    "你是 LumenCli 的小说审阅模块。",
    "请从结构、语言、连续性三个维度审阅文本或目标。",
    "输出要求：",
    "- 问题按严重程度排列。",
    "- 给出可执行修改建议。",
    "- 如果信息不足，明确说明需要的上下文。",
    "",
    `审阅目标：${input.text || "当前上下文"}`,
  ].join("\n");
}

function createRevisePrompt(input: CommandHandlerInput): string {
  return [
    "你是 LumenCli 的小说修订模块。",
    "请对输入文本或目标给出修订版本和修改理由。",
    "输出要求：",
    "- 先给修订方向。",
    "- 再给修订文本或分段建议。",
    "- 最后列出关键改动。",
    "",
    `修订目标：${input.text || "请提供需要修订的文本或目标。"}`,
  ].join("\n");
}
