/**
 * Lumen Vision Tool
 *
 * 当主模型不支持图片时，LLM 可调用此工具让 vision 模型描述图片。
 * 图片数据通过 <!--VISION_DATA:...--> 标记嵌入在 session 消息中。
 *
 * [Provenance] 来源: 自研（独创的 vision tool 方案）
 */

import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext, ToolRenderResultOptions } from "./extensions/types.js";

// ============================================================================
// Schema
// ============================================================================

const DescribeImageParams = Type.Object(
	{
		detail: Type.Optional(
			Type.String({
				description:
					"What to focus on: 'code' for code transcription, 'ui' for UI description, 'general' for general description",
			}),
		),
	},
	{
		description:
			"Describe the pending image(s) using a vision-capable model. Call this when you see '[用户附加了图片]' in the message.",
	},
);

interface VisionDetails {
	imageCount: number;
	descriptionLength: number;
	model: string;
}

// ============================================================================
// Image extraction from session
// ============================================================================

const VISION_DATA_RE = /<!--VISION_DATA:(.*?)-->/;

function extractPendingImages(ctx: ExtensionContext): Array<{ mimeType: string; data: string }> | undefined {
	// Search recent messages for the VISION_DATA marker
	const branch = ctx.sessionManager.getBranch();
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry.type !== "message") continue;
		const msg = entry.message as { role?: string; content?: unknown };
		if (msg.role !== "user") continue;

		// Check text content for the marker
		const content = msg.content;
		let text = "";
		if (typeof content === "string") {
			text = content;
		} else if (Array.isArray(content)) {
			for (const part of content) {
				if ((part as { type?: string }).type === "text") {
					text += (part as { text?: string }).text ?? "";
				}
			}
		}

		const match = text.match(VISION_DATA_RE);
		if (match) {
			try {
				return JSON.parse(match[1]);
			} catch {
				return undefined;
			}
		}
	}
	return undefined;
}

// ============================================================================
// Extension
// ============================================================================

export default function lumenVisionExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "describe_image",
		label: "Describe Image",
		description:
			"Describe pending image(s) using a vision-capable model. " +
			"Call this tool when you see '[用户附加了图片]' in the user message. " +
			"Returns a text description of the image content.",
		promptSnippet: "describe_image — 用 vision 模型描述用户附加的图片",
		promptGuidelines: [
			"当用户消息中出现 '[用户附加了图片]' 时，立即调用 describe_image 获取图片描述。",
			"获取描述后，基于描述内容回答用户的问题。",
		],
		parameters: DescribeImageParams,

		async execute(
			_toolCallId: string,
			params: { detail?: string },
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			ctx: ExtensionContext,
		) {
			// Extract images from session messages
			const pendingImages = extractPendingImages(ctx);

			if (!pendingImages || pendingImages.length === 0) {
				return {
					content: [{ type: "text" as const, text: "没有待描述的图片（未找到 VISION_DATA 标记）。" }],
					details: { imageCount: 0, descriptionLength: 0, model: "" } as VisionDetails,
				};
			}

			// Find a vision model
			const allModels = ctx.modelRegistry.getAll();
			const visionModel = allModels.find((m) => m.input.includes("image"));
			if (!visionModel) {
				return {
					content: [
						{
							type: "text" as const,
							text: "没有可用的 vision 模型（需要在 models.json 中配置支持 image 的模型）。",
						},
					],
					details: { imageCount: pendingImages.length, descriptionLength: 0, model: "" } as VisionDetails,
				};
			}

			// Build prompt based on detail level
			let prompt = "请详细描述这些图片的内容。";
			if (params.detail === "code") {
				prompt = "这是代码截图。请完整转录所有代码，保持格式和缩进。";
			} else if (params.detail === "ui") {
				prompt = "这是界面截图。请描述布局、按钮、文字内容和状态。";
			}

			try {
				const { streamSimple } = await import("@earendil-works/pi-ai");

				// Get API key
				const authResult = await ctx.modelRegistry.getApiKeyAndHeaders(visionModel);
				const apiKey = authResult.ok ? (authResult as any).apiKey : undefined;
				const headers = authResult.ok ? (authResult as any).headers : undefined;

				// Build image content in the format the API expects
				const imageContent = pendingImages.map((img) => ({
					type: "image" as const,
					mimeType: img.mimeType,
					data: img.data,
				}));

				const content = [{ type: "text" as const, text: prompt }, ...imageContent];

				const stream = streamSimple(
					visionModel,
					{
						messages: [{ role: "user" as const, content, timestamp: Date.now() }],
						systemPrompt: "精确描述图片内容。代码截图完整转录。不要添加评论。",
					},
					{ apiKey, headers },
				);

				let description = "";
				for await (const event of stream) {
					if (event.type === "text_delta") {
						description += event.delta;
					} else if (event.type === "done" || event.type === "error") {
						if (event.type === "error") {
							const errMsg = (event as any).error?.errorMessage ?? "unknown error";
							return {
								content: [{ type: "text" as const, text: `Vision 模型返回错误: ${errMsg}` }],
								details: {
									imageCount: pendingImages.length,
									descriptionLength: 0,
									model: visionModel.id,
								} as VisionDetails,
							};
						}
						break;
					}
				}

				if (!description.trim()) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Vision 模型未返回描述（可能是图片格式不支持或模型不支持 vision）。",
							},
						],
						details: {
							imageCount: pendingImages.length,
							descriptionLength: 0,
							model: visionModel.id,
						} as VisionDetails,
					};
				}

				return {
					content: [{ type: "text" as const, text: description }],
					details: {
						imageCount: pendingImages.length,
						descriptionLength: description.length,
						model: visionModel.id,
					} as VisionDetails,
				};
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text" as const, text: `图片描述异常: ${errMsg}` }],
					details: {
						imageCount: pendingImages.length,
						descriptionLength: 0,
						model: visionModel.id,
					} as VisionDetails,
				};
			}
		},

		renderCall(args: { detail?: string }, theme, _context) {
			const detail = args.detail ? ` [${args.detail}]` : "";
			return new Text(theme.fg("toolTitle", theme.bold("describe_image")) + theme.fg("muted", detail), 0, 0);
		},

		renderResult(result, _options: ToolRenderResultOptions, theme, _context) {
			const details = result.details as VisionDetails | undefined;
			if (!details) return new Text(theme.fg("dim", "—"), 0, 0);
			if (details.descriptionLength === 0) {
				return new Text(theme.fg("error", "✗ ") + theme.fg("muted", "无描述"), 0, 0);
			}
			return new Text(
				theme.fg("success", "✓ ") +
					theme.fg("muted", `${details.imageCount} 张图片, ${details.descriptionLength} 字 [${details.model}]`),
				0,
				0,
			);
		},
	});
}
