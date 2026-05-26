/**
 * Lumen Plan Mode
 *
 * 结构化规划模式：先输出计划再执行，用户可审批/修改。
 * 通过 --plan flag 或 /plan-mode 命令激活。
 * 激活后 agent 只输出计划不执行工具，用户确认后才执行。
 *
 * [Provenance] 来源: oh-my-pi src/plan-mode/ + opencode src/tool/plan.ts
 * [Provenance] 移植方式: 参考重写（简化版，通过 extension API 实现）
 */

import type { ExtensionAPI } from "./extensions/types.ts";

let planModeActive = false;

const PLAN_MODE_SYSTEM_PROMPT = `
# Plan Mode Active

你当前处于 Plan Mode（规划模式）。在此模式下：

1. **不要执行任何工具**（不要调用 read/write/edit/bash 等）
2. **只输出结构化计划**，格式如下：

## 计划：[目标描述]

### 步骤 1: [步骤名]
- 文件：\`path/to/file\`
- 操作：[创建/修改/删除]
- 描述：[具体做什么]
- 风险：[低/中/高]

### 步骤 2: [步骤名]
...

### 验证方式
- [如何确认实现正确]

---
用户确认后我会退出 Plan Mode 并执行计划。
用户可以说"执行"来批准计划，或提出修改意见。
`;

export default function lumenPlanModeExtension(pi: ExtensionAPI): void {
	// Register --plan flag
	pi.registerFlag("plan", {
		type: "boolean",
		default: false,
		description: "启动时进入 Plan Mode（只输出计划不执行）",
	});

	// Check flag on session start
	pi.on("session_start", () => {
		const flagValue = pi.getFlag("plan");
		if (flagValue === true) {
			planModeActive = true;
		}
	});

	// Note: Tab shortcut removed — conflicts with TUI input.tab (autocomplete).
	// Use /plan-mode command instead, or Ctrl+Shift+P if we add it later.

	// Inject plan mode instructions into system prompt
	pi.on("before_agent_start", (event) => {
		if (!planModeActive) return;
		return {
			systemPrompt: `${event.systemPrompt}\n${PLAN_MODE_SYSTEM_PROMPT}`,
		};
	});

	// Block tool calls when plan mode is active
	pi.on("tool_call", (event) => {
		if (!planModeActive) return;
		// Allow read-only tools (agent might need to read files to make a plan)
		const readOnlyTools = new Set(["read", "grep", "find", "ls"]);
		if (readOnlyTools.has(event.toolName)) return;

		return {
			block: true,
			reason: `Plan Mode 已激活：不允许执行 ${event.toolName}。请先输出计划，等用户确认后再执行。`,
		};
	});

	// /plan-mode command to toggle
	pi.registerCommand("plan-mode", {
		description: "切换 Plan Mode（规划模式：只输出计划不执行）",
		handler: async (args) => {
			const arg = args.trim().toLowerCase();

			if (arg === "on" || arg === "enter" || arg === "开") {
				planModeActive = true;
				pi.sendUserMessage(
					"✅ Plan Mode 已激活。Agent 将只输出计划，不执行工具。\n\n说「执行」或 `/plan-mode off` 退出。",
				);
			} else if (arg === "off" || arg === "exit" || arg === "关") {
				planModeActive = false;
				pi.sendUserMessage("✅ Plan Mode 已关闭。Agent 恢复正常执行模式。");
			} else {
				planModeActive = !planModeActive;
				const status = planModeActive ? "已激活" : "已关闭";
				pi.sendUserMessage(
					`Plan Mode ${status}。${planModeActive ? "Agent 将只输出计划。" : "Agent 恢复正常执行。"}`,
				);
			}
		},
	});

	// Listen for "执行" / "execute" to exit plan mode
	pi.on("input", (event) => {
		if (!planModeActive) return;
		const text = event.text.trim().toLowerCase();
		if (text === "执行" || text === "execute" || text === "go" || text === "approve") {
			planModeActive = false;
			return {
				action: "transform" as const,
				text: `${event.text}\n\n[Plan Mode 已关闭，开始执行上述计划]`,
			};
		}
		return;
	});
}
