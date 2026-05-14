/**
 * Lumen Preset Routing
 *
 * 模型预设系统：在 `.lumen/presets.json` 定义多个模型角色（primary/vision/thinking/fast），
 * 按 preset 激活，运行时自动路由。
 *
 * 用法：
 * - `/preset <name>` — 激活 preset
 * - `/preset list` — 列出所有 preset
 * - `/preset show` — 查看当前 preset
 *
 * 自动路由规则（简化版）：
 * - 普通对话 → primary 模型
 * - 图片输入（image in user message）→ vision 模型（如 primary 不支持 vision）
 * - 深度思考请求（thinking level 高）→ thinking 模型（如定义）
 *
 * 配置示例 `.lumen/presets.json`：
 * {
 *   "default": "mimo",
 *   "presets": {
 *     "mimo": {
 *       "description": "小米 MiMo 主 + Claude vision fallback",
 *       "primary": "xiaomi-token-plan-sgp/mimo-v2.5-pro",
 *       "vision": "anthropic/claude-sonnet-4-6",
 *       "thinking": "anthropic/claude-opus-4-7:high"
 *     },
 *     "fast": {
 *       "description": "Groq 快速响应",
 *       "primary": "groq/openai/gpt-oss-120b"
 *     }
 *   }
 * }
 *
 * [Provenance] 来源: 自研 + Claude Code 多模型路由概念
 * [Provenance] 移植方式: 自研
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME, LEGACY_CONFIG_DIR_NAME } from "../config.js";
import type { ExtensionAPI, ExtensionContext } from "./extensions/types.js";

// ============================================================================
// Types
// ============================================================================

export interface PresetDefinition {
	description?: string;
	/** Main model (required) — used for all normal requests. Format: "provider/model[:thinkingLevel]" */
	primary: string;
	/** Vision model — used when user message contains images and primary lacks vision support */
	vision?: string;
	/** Deep-thinking model — used for high-reasoning requests */
	thinking?: string;
	/** Fast/cheap model — reserved for future auto-routing heuristics */
	fast?: string;
}

export interface PresetsFile {
	/** Name of the default preset (activated on session start) */
	default?: string;
	presets: Record<string, PresetDefinition>;
}

// ============================================================================
// State
// ============================================================================

let activePresetName: string | undefined;
let presetsFile: PresetsFile | undefined;
let presetsPath: string | undefined;

// ============================================================================
// Config I/O
// ============================================================================

function resolvePresetsPath(cwd: string): string {
	// Prefer .lumen/ but fall back to .pi/
	const primary = join(cwd, CONFIG_DIR_NAME, "presets.json");
	const fallback = join(cwd, LEGACY_CONFIG_DIR_NAME, "presets.json");
	if (existsSync(primary)) return primary;
	if (existsSync(fallback)) return fallback;
	return primary;
}

function loadPresets(cwd: string): PresetsFile {
	const path = resolvePresetsPath(cwd);
	presetsPath = path;
	if (!existsSync(path)) {
		return { presets: {} };
	}
	try {
		const raw = JSON.parse(readFileSync(path, "utf8"));
		if (!raw || typeof raw !== "object") return { presets: {} };
		const file: PresetsFile = {
			default: typeof raw.default === "string" ? raw.default : undefined,
			presets: {},
		};
		if (raw.presets && typeof raw.presets === "object") {
			for (const [name, def] of Object.entries(raw.presets)) {
				if (def && typeof def === "object" && "primary" in def) {
					const d = def as PresetDefinition;
					file.presets[name] = {
						description: typeof d.description === "string" ? d.description : undefined,
						primary: String(d.primary),
						vision: typeof d.vision === "string" ? d.vision : undefined,
						thinking: typeof d.thinking === "string" ? d.thinking : undefined,
						fast: typeof d.fast === "string" ? d.fast : undefined,
					};
				}
			}
		}
		return file;
	} catch {
		return { presets: {} };
	}
}

function savePresets(file: PresetsFile): void {
	if (!presetsPath) return;
	const dir = dirname(presetsPath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(presetsPath, JSON.stringify(file, null, 2), "utf8");
}

// ============================================================================
// Helpers
// ============================================================================

function parseModelRef(ref: string): { provider: string; modelId: string; thinkingLevel?: string } | undefined {
	// Format: "provider/modelId[:thinkingLevel]"
	const colonIdx = ref.lastIndexOf(":");
	let trimmed = ref;
	let thinkingLevel: string | undefined;
	if (colonIdx > 0 && colonIdx > ref.lastIndexOf("/")) {
		// Colon is after last slash → it's a thinking level suffix
		const suffix = ref.slice(colonIdx + 1);
		if (["off", "low", "medium", "high"].includes(suffix)) {
			thinkingLevel = suffix;
			trimmed = ref.slice(0, colonIdx);
		}
	}
	const slashIdx = trimmed.indexOf("/");
	if (slashIdx === -1) return undefined;
	return {
		provider: trimmed.slice(0, slashIdx),
		modelId: trimmed.slice(slashIdx + 1),
		thinkingLevel,
	};
}

function presetDescribe(name: string, def: PresetDefinition): string {
	const lines: string[] = [`[${name}]`];
	if (def.description) lines.push(`  ${def.description}`);
	lines.push(`  primary: ${def.primary}`);
	if (def.vision) lines.push(`  vision:  ${def.vision}`);
	if (def.thinking) lines.push(`  thinking: ${def.thinking}`);
	if (def.fast) lines.push(`  fast:    ${def.fast}`);
	return lines.join("\n");
}

// ============================================================================
// Activation
// ============================================================================

async function activatePreset(name: string, _pi: ExtensionAPI): Promise<string> {
	if (!presetsFile) return `Preset system not initialized.`;
	const preset = presetsFile.presets[name];
	if (!preset) {
		const available = Object.keys(presetsFile.presets).join(", ") || "(none defined)";
		return `Unknown preset "${name}". Available: ${available}`;
	}

	const primaryRef = parseModelRef(preset.primary);
	if (!primaryRef) return `Invalid primary model reference: "${preset.primary}"`;

	// Find the model in the registry
	// We don't have direct access to modelRegistry here; use pi.setModel which
	// needs a Model object. Instead, trigger via command would require ctx.
	// For this initial impl, we set activePresetName and let the before_provider_request
	// hook do the routing (by referencing the preset config).
	activePresetName = name;

	return `Activated preset "${name}":\n${presetDescribe(name, preset)}`;
}

// ============================================================================
// Routing Logic
// ============================================================================

/**
 * Decide which model role to use based on request payload.
 * Returns the model reference string or undefined if no override needed.
 */
function routeModelForPayload(payload: unknown, preset: PresetDefinition): string | undefined {
	if (!payload || typeof payload !== "object") return undefined;

	// Check if the latest user message contains an image
	const payloadObj = payload as { messages?: unknown[] };
	const messages = payloadObj.messages;
	if (!Array.isArray(messages)) return undefined;

	// Look at the last user message
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i] as { role?: string; content?: unknown };
		if (msg?.role !== "user") continue;

		const hasImage = Array.isArray(msg.content)
			? msg.content.some((c) => {
					const part = c as { type?: string };
					return part?.type === "image" || part?.type === "image_url";
				})
			: false;

		if (hasImage && preset.vision) return preset.vision;
		break;
	}

	return undefined;
}

/**
 * Detect whether the user prompt likely benefits from a thinking model.
 * Heuristics (in order of strength):
 * 1. Explicit keywords ("think hard", "deep think", "仔细分析", etc.)
 * 2. Multi-step/structured prompts (numbered lists, multiple questions)
 * 3. Long prompts (>500 chars) with reasoning indicators
 */
const THINKING_KEYWORDS = [
	// English
	"think hard",
	"think harder",
	"deep think",
	"deeply analyze",
	"deeply consider",
	"carefully analyze",
	"thoroughly review",
	"step by step",
	"step-by-step",
	"reason through",
	"think through",
	"work through",
	// Chinese
	"仔细思考",
	"仔细分析",
	"深入分析",
	"深入思考",
	"认真考虑",
	"逐步分析",
	"详细推理",
	"严谨分析",
	"系统性",
	"全面考虑",
];

/**
 * Detect signals indicating the user wants fast/cheap responses.
 */
const FAST_KEYWORDS = ["quick", "quickly", "briefly", "short answer", "快速", "简短", "简单回答", "扼要"];

export function detectThinkingMode(prompt: string): "thinking" | "fast" | "normal" {
	const lower = prompt.toLowerCase();

	// Strong fast signals first (short, explicit)
	if (FAST_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) {
		return "fast";
	}

	// Explicit thinking keywords
	if (THINKING_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) {
		return "thinking";
	}

	// Structured multi-step prompts (3+ numbered or bulleted items)
	const numberedItems = (prompt.match(/^[\s]*\d+[.)]\s/gm) ?? []).length;
	const bulletedItems = (prompt.match(/^[\s]*[-*]\s/gm) ?? []).length;
	if (numberedItems >= 3 || bulletedItems >= 4) {
		return "thinking";
	}

	// Long prompts with reasoning indicators
	if (prompt.length > 500 && /\bwhy\b|\bhow\b|\bexplain\b|为什么|如何|解释|分析/i.test(prompt)) {
		return "thinking";
	}

	return "normal";
}

/**
 * Look up a model in the registry by a preset reference.
 * Reference format: "provider/modelId[:thinkingLevel]"
 */
function resolveModelRef(ref: string, ctx: ExtensionContext): { model: unknown; thinkingLevel?: string } | undefined {
	const parsed = parseModelRef(ref);
	if (!parsed) return undefined;
	const model = ctx.modelRegistry.find(parsed.provider, parsed.modelId);
	if (!model) return undefined;
	return { model, thinkingLevel: parsed.thinkingLevel };
}

// ============================================================================
// Extension
// ============================================================================

export default function lumenPresetExtension(pi: ExtensionAPI): void {
	let cwd = process.cwd();

	pi.on("session_start", (_event, ctx) => {
		cwd = ctx.cwd;
		presetsFile = loadPresets(cwd);

		// Auto-activate default preset if defined
		if (presetsFile.default && presetsFile.presets[presetsFile.default]) {
			activePresetName = presetsFile.default;
		}
	});

	// Apply preset's thinking/fast routing at agent start.
	// Vision routing is handled by agent-session core (sub-agent approach).
	pi.on("before_agent_start", async (event, ctx) => {
		if (!activePresetName || !presetsFile) return;
		const preset = presetsFile.presets[activePresetName];
		if (!preset) return;

		// Decide which model role to use:
		// 1. Thinking: prompt has reasoning indicators or is long+structured
		// 2. Fast: prompt asks for a quick/short answer
		// 3. Primary: default
		let targetRef = preset.primary;
		const mode = detectThinkingMode(event.prompt);
		if (mode === "thinking" && preset.thinking) targetRef = preset.thinking;
		else if (mode === "fast" && preset.fast) targetRef = preset.fast;

		const resolved = resolveModelRef(targetRef, ctx);
		if (!resolved) return;

		const currentModel = ctx.model as { provider?: string; id?: string } | undefined;
		const targetModel = resolved.model as { provider?: string; id?: string };
		// Only switch if different from current
		if (currentModel && currentModel.provider === targetModel.provider && currentModel.id === targetModel.id) {
			// Same model — but maybe different thinking level
			if (resolved.thinkingLevel && ["off", "low", "medium", "high"].includes(resolved.thinkingLevel)) {
				pi.setThinkingLevel(resolved.thinkingLevel as "off" | "low" | "medium" | "high");
			}
			return;
		}

		// Switch the model; this may fail if no API key is configured
		try {
			await pi.setModel(resolved.model as Parameters<typeof pi.setModel>[0]);
			if (resolved.thinkingLevel && ["off", "low", "medium", "high"].includes(resolved.thinkingLevel)) {
				pi.setThinkingLevel(resolved.thinkingLevel as "off" | "low" | "medium" | "high");
			}
		} catch {
			// Silently continue with current model if preset switch fails
		}
	});

	// Route for thinking requests — reserved for deep-reasoning detection later
	pi.on("before_provider_request", (event) => {
		if (!activePresetName || !presetsFile) return;
		const preset = presetsFile.presets[activePresetName];
		if (!preset) return;

		const override = routeModelForPayload(event.payload, preset);
		if (!override) return;
		// Full routing would require modifying payload.model, which is provider-specific.
		// Here we just mark intent; primary switching happens in before_agent_start.
		void override;
	});

	// /preset command
	pi.registerCommand("preset", {
		description: "管理模型 preset（list / show / <name> / save / delete）",
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/);
			const sub = parts[0] || "show";
			const param = parts[1];

			if (!presetsFile) {
				presetsFile = loadPresets(ctx.cwd);
			}

			switch (sub) {
				case "list": {
					const names = Object.keys(presetsFile.presets);
					if (names.length === 0) {
						pi.sendUserMessage(
							"没有定义任何 preset。\n\n" +
								`在 \`.lumen/presets.json\` 中定义：\n` +
								"```json\n" +
								JSON.stringify(
									{
										default: "mimo",
										presets: {
											mimo: {
												description: "小米 MiMo 主模型",
												primary: "xiaomi-token-plan-sgp/mimo-v2.5-pro",
												vision: "anthropic/claude-sonnet-4-6",
											},
										},
									},
									null,
									2,
								) +
								"\n```",
						);
						return;
					}
					const lines: string[] = [`共 ${names.length} 个 preset:`, ""];
					for (const name of names) {
						const isActive = name === activePresetName ? " (active)" : "";
						const isDefault = name === presetsFile.default ? " (default)" : "";
						lines.push(presetDescribe(name, presetsFile.presets[name]) + isActive + isDefault);
						lines.push("");
					}
					pi.sendUserMessage(lines.join("\n"));
					return;
				}
				case "show": {
					if (!activePresetName) {
						pi.sendUserMessage("没有激活的 preset。用 `/preset <name>` 激活一个。");
						return;
					}
					const preset = presetsFile.presets[activePresetName];
					if (!preset) {
						pi.sendUserMessage(`当前激活的 preset "${activePresetName}" 不存在（可能已删除）。`);
						return;
					}
					pi.sendUserMessage(`当前激活: ${activePresetName}\n\n${presetDescribe(activePresetName, preset)}`);
					return;
				}
				case "save": {
					// Save current active preset as a default
					if (!activePresetName) {
						pi.sendUserMessage("没有激活的 preset 可以保存为默认。");
						return;
					}
					presetsFile.default = activePresetName;
					savePresets(presetsFile);
					pi.sendUserMessage(`已将 "${activePresetName}" 设为默认 preset。`);
					return;
				}
				case "delete": {
					if (!param) {
						pi.sendUserMessage("用法：/preset delete <name>");
						return;
					}
					if (!presetsFile.presets[param]) {
						pi.sendUserMessage(`Preset "${param}" 不存在。`);
						return;
					}
					delete presetsFile.presets[param];
					if (presetsFile.default === param) presetsFile.default = undefined;
					if (activePresetName === param) activePresetName = undefined;
					savePresets(presetsFile);
					pi.sendUserMessage(`已删除 preset "${param}"。`);
					return;
				}
				default: {
					// Treat as preset name to activate
					const msg = await activatePreset(sub, pi);
					pi.sendUserMessage(msg);
					return;
				}
			}
		},
	});

	pi.registerCommand("presets", {
		description: "列出所有 preset（同 /preset list）",
		handler: async () => {
			if (!presetsFile) presetsFile = loadPresets(cwd);
			const names = Object.keys(presetsFile.presets);
			if (names.length === 0) {
				pi.sendUserMessage("没有定义任何 preset。用 `/preset list` 查看配置示例。");
				return;
			}
			const lines: string[] = [];
			for (const name of names) {
				const isActive = name === activePresetName ? " *" : "";
				lines.push(
					`- ${name}${isActive} — ${presetsFile.presets[name].description ?? presetsFile.presets[name].primary}`,
				);
			}
			pi.sendUserMessage(`Presets:\n${lines.join("\n")}`);
		},
	});
}

// Testing exports
export { loadPresets, parseModelRef, routeModelForPayload };
