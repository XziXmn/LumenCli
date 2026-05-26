import { completeSimple } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	convertToLlm,
	createCompactionSummaryMessage,
	estimateTokens,
	serializeConversation,
} from "@earendil-works/pi-coding-agent";

const SUMMARY_SYSTEM_PROMPT =
	"You summarize coding conversations into high-signal continuation checkpoints. Preserve exact file paths, error messages, tool outcomes, and next steps.";

const HISTORY_PROMPT = `Create a structured coding-session checkpoint.

Use this exact section structure:

## Goal
[Main objective]

## Constraints & Preferences
- [...]

## Progress
### Done
- [x] ...

### In Progress
- [ ] ...

### Blocked
- ...

## Key Decisions
- **Decision**: rationale

## Next Steps
1. ...

## Critical Context
- ...

Keep the summary compact but continuation-ready.`;

const TURN_PREFIX_PROMPT = `This is the early part of a turn that was too large to keep in full.

Summarize only what is needed so the later retained part of the same turn still makes sense.

Use this exact structure:

## Original Request
[What the user asked in this turn]

## Early Progress
- ...

## Context for Retained Suffix
- ...
`;

const BRANCH_PROMPT = `Create a branch-return summary so another model can resume this abandoned branch later.

Use this exact structure:

## Goal
[What the branch was trying to do]

## Constraints & Preferences
- [...]

## Progress
### Done
- [x] ...

### In Progress
- [ ] ...

### Blocked
- ...

## Key Decisions
- **Decision**: rationale

## Next Steps
1. ...
`;

const BRANCH_SUMMARY_PREAMBLE = `The user explored a different conversation branch before returning here.
Summary of that exploration:

`;

interface CodexStyleBranchSummaryDetails {
	readFiles: string[];
	modifiedFiles: string[];
}

interface CodexStyleCompactionDetails {
	readFiles: string[];
	modifiedFiles: string[];
}

function applyCustomInstructions(
	prompt: string,
	customInstructions?: string,
	options?: { replace?: boolean },
): string {
	const trimmed = customInstructions?.trim();
	if (!trimmed) {
		return prompt;
	}
	if (options?.replace) {
		return trimmed;
	}
	return `${prompt}\n\nAdditional focus:\n${trimmed}`;
}

function countCompactionEntries(entries: Array<{ type?: string }>): number {
	return entries.filter((entry) => entry?.type === "compaction").length;
}

function mergePriorCompactionFileOps(
	fileOps: {
		read: Set<string>;
		written: Set<string>;
		edited: Set<string>;
	},
	branchEntries: Array<{
		type?: string;
		details?: unknown;
	}>,
): void {
	for (let i = branchEntries.length - 1; i >= 0; i--) {
		const entry = branchEntries[i];
		if (entry?.type !== "compaction" || !entry.details || typeof entry.details !== "object") {
			continue;
		}

		const details = entry.details as CodexStyleCompactionDetails;
		if (Array.isArray(details.readFiles)) {
			for (const file of details.readFiles) {
				fileOps.read.add(file);
			}
		}
		if (Array.isArray(details.modifiedFiles)) {
			for (const file of details.modifiedFiles) {
				fileOps.edited.add(file);
			}
		}
		break;
	}
}

function mergePriorBranchSummaryFileOps(
	fileOps: {
		read: Set<string>;
		written: Set<string>;
		edited: Set<string>;
	},
	entries: Array<{
		type?: string;
		details?: unknown;
	}>,
): void {
	for (const entry of entries) {
		if (entry?.type !== "branch_summary" || !entry.details || typeof entry.details !== "object") {
			continue;
		}

		const details = entry.details as CodexStyleBranchSummaryDetails;
		if (Array.isArray(details.readFiles)) {
			for (const file of details.readFiles) {
				fileOps.read.add(file);
			}
		}
		if (Array.isArray(details.modifiedFiles)) {
			for (const file of details.modifiedFiles) {
				fileOps.edited.add(file);
			}
		}
	}
}

function createFileOps() {
	return {
		read: new Set<string>(),
		written: new Set<string>(),
		edited: new Set<string>(),
	};
}

function computeFileLists(fileOps: {
	read: Set<string>;
	written: Set<string>;
	edited: Set<string>;
}): { readFiles: string[]; modifiedFiles: string[] } {
	const modified = new Set([...fileOps.edited, ...fileOps.written]);
	const readFiles = [...fileOps.read].filter((file) => !modified.has(file)).sort();
	const modifiedFiles = [...modified].sort();
	return { readFiles, modifiedFiles };
}

function formatFileOperations(readFiles: string[], modifiedFiles: string[]): string {
	const sections: string[] = [];
	if (readFiles.length > 0) {
		sections.push(`<read-files>\n${readFiles.join("\n")}\n</read-files>`);
	}
	if (modifiedFiles.length > 0) {
		sections.push(`<modified-files>\n${modifiedFiles.join("\n")}\n</modified-files>`);
	}
	return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
}

function extractRecentUserMessages(messages: AgentMessage[], count: number): string[] {
	const result: string[] = [];
	for (let i = messages.length - 1; i >= 0 && result.length < count; i--) {
		const message = messages[i];
		if (message.role !== "user") continue;
		const content = message.content;
		if (typeof content === "string" && content.trim()) {
			result.push(content.trim());
			continue;
		}
		if (Array.isArray(content)) {
			const text = content
				.filter((block): block is { type: "text"; text: string } => block.type === "text")
				.map((block) => block.text)
				.join("\n")
				.trim();
			if (text) {
				result.push(text);
			}
		}
	}
	return result.reverse();
}

function createReplacementMessages(
	recentUserMessages: string[],
	summaryBridge: string | undefined,
	tokensBefore: number,
	maxRecentUserMessages: number,
): AgentMessage[] | undefined {
	if (recentUserMessages.length === 0 && !summaryBridge) {
		return undefined;
	}

	const replacementMessages: AgentMessage[] = recentUserMessages
		.slice(Math.max(0, recentUserMessages.length - maxRecentUserMessages))
		.map((text, index) => ({
		role: "user",
		content: text,
		timestamp: Date.now() + index,
	}));

	if (summaryBridge) {
		replacementMessages.push(createCompactionSummaryMessage(summaryBridge, tokensBefore, new Date().toISOString()));
	}

	return replacementMessages;
}

async function summarizeWithModel(
	model: ExtensionContext["model"],
	modelRegistry: ExtensionContext["modelRegistry"],
	messages: AgentMessage[],
	prompt: string,
	signal: AbortSignal,
	previousSummary?: string,
): Promise<string | undefined> {
	if (!model || messages.length === 0) {
		return undefined;
	}

	const auth = await modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) {
		return undefined;
	}

	const conversationText = serializeConversation(convertToLlm(messages));
	const previousContext = previousSummary ? `\n\n<previous-summary>\n${previousSummary}\n</previous-summary>` : "";
	const response = await completeSimple(
		model,
		{
			systemPrompt: SUMMARY_SYSTEM_PROMPT,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `<conversation>\n${conversationText}\n</conversation>${previousContext}\n\n${prompt}`,
						},
					],
					timestamp: Date.now(),
				},
			],
		},
		{
			apiKey: auth.apiKey,
			headers: auth.headers,
			maxTokens: Math.min(8192, model.maxTokens > 0 ? model.maxTokens : 8192),
			signal,
		},
	);

	if (response.stopReason === "error" || response.stopReason === "aborted") {
		return undefined;
	}

	const text = response.content
		.filter((block): block is { type: "text"; text: string } => block.type === "text")
		.map((block) => block.text)
		.join("\n")
		.trim();
	return text || undefined;
}

function getBranchSummaryMessage(entry: {
	type?: string;
	message?: AgentMessage;
	customType?: string;
	content?: string | Array<{ type: string; text?: string }>;
	display?: boolean;
	details?: unknown;
	timestamp?: string;
	summary?: string;
	fromId?: string;
	tokensBefore?: number;
}): AgentMessage | undefined {
	if (entry.type === "message") {
		return entry.message;
	}
	if (entry.type === "custom_message") {
		if (
			typeof entry.customType === "string" &&
			entry.content !== undefined &&
			typeof entry.display === "boolean" &&
			typeof entry.timestamp === "string"
		) {
			return {
				role: "custom",
				customType: entry.customType,
				content: entry.content,
				display: entry.display,
				details: entry.details,
				timestamp: new Date(entry.timestamp).getTime(),
			} as AgentMessage;
		}
		return undefined;
	}
	if (entry.type === "branch_summary") {
		if (typeof entry.summary === "string" && typeof entry.fromId === "string" && typeof entry.timestamp === "string") {
			return {
				role: "branchSummary",
				summary: entry.summary,
				fromId: entry.fromId,
				timestamp: new Date(entry.timestamp).getTime(),
			} as AgentMessage;
		}
		return undefined;
	}
	if (entry.type === "compaction") {
		if (
			typeof entry.summary === "string" &&
			typeof entry.tokensBefore === "number" &&
			typeof entry.timestamp === "string"
		) {
			return createCompactionSummaryMessage(entry.summary, entry.tokensBefore, entry.timestamp);
		}
	}
	return undefined;
}

function selectBranchMessagesWithinBudget(
	messages: AgentMessage[],
	tokenBudget: number,
): AgentMessage[] {
	if (tokenBudget <= 0) {
		return [...messages];
	}

	const selected: AgentMessage[] = [];
	let totalTokens = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i]!;
		const tokens = estimateTokens(message);
		if (totalTokens + tokens > tokenBudget) {
			if (
				(message.role === "branchSummary" || message.role === "compactionSummary") &&
				totalTokens < tokenBudget * 0.9
			) {
				selected.unshift(message);
				totalTokens += tokens;
			}
			break;
		}
		selected.unshift(message);
		totalTokens += tokens;
	}

	if (selected.length === 0) {
		for (let i = messages.length - 1; i >= 0; i--) {
			const message = messages[i]!;
			if (message.role === "branchSummary" || message.role === "compactionSummary") {
				return [message];
			}
		}
	}

	return selected;
}

export default function codexStyleCompactionExtension(pi: ExtensionAPI) {
	pi.on("session_before_compact", async (event, ctx) => {
		const { preparation, reason, signal, customInstructions, branchEntries } = event;
		const {
			messagesToSummarize,
			turnPrefixMessages,
			keptMessages,
			isSplitTurn,
			firstKeptEntryId,
			tokensBefore,
			previousSummary,
		} = preparation;

		mergePriorCompactionFileOps(preparation.fileOps, branchEntries);

		const recentUserMessages = extractRecentUserMessages(
			keptMessages.length > 0 ? keptMessages : [...messagesToSummarize, ...turnPrefixMessages],
			reason === "overflow" ? 5 : 3,
		);
		const historySummary =
			(await summarizeWithModel(
				ctx.model,
				ctx.modelRegistry,
				messagesToSummarize,
				applyCustomInstructions(HISTORY_PROMPT, customInstructions),
				signal,
				previousSummary,
			)) ??
			previousSummary;
		const turnPrefixSummary = isSplitTurn && reason === "manual"
			? await summarizeWithModel(
					ctx.model,
					ctx.modelRegistry,
					turnPrefixMessages,
					applyCustomInstructions(TURN_PREFIX_PROMPT, customInstructions),
					signal,
				)
			: undefined;

		if (!historySummary && !turnPrefixSummary) {
			return;
		}

		const sections: string[] = [];
		if (historySummary) {
			sections.push(historySummary);
		}
		if (turnPrefixSummary) {
			sections.push(`## Split Turn Context\n${turnPrefixSummary}`);
		}

		const { readFiles, modifiedFiles } = computeFileLists(preparation.fileOps);
		const fileOperations = formatFileOperations(readFiles, modifiedFiles);
		const summaryBridge = `${sections.join("\n\n")}${fileOperations}`;
		const replacementMessages = createReplacementMessages(
			recentUserMessages,
			summaryBridge,
			tokensBefore,
			reason === "overflow" ? 3 : 2,
		);

		return {
			compaction: {
				summary: summaryBridge,
				firstKeptEntryId,
				tokensBefore,
				summaryPlacement: "after-kept",
				replacementMessages,
				details: {
					readFiles,
					modifiedFiles,
				} satisfies CodexStyleCompactionDetails,
			},
		};
	});

	pi.on("compaction_end", async (event, ctx) => {
		if (event.aborted || !event.result) {
			return;
		}

		const existingCompactions = countCompactionEntries(ctx.sessionManager.getBranch());
		if (event.reason === "overflow") {
			ctx.ui.notify(
				"会话已经触发上下文溢出恢复压缩。建议尽快开新会话，避免后续继续依赖长线程摘要桥接。",
				"warning",
			);
			return;
		}

		if (existingCompactions >= 2) {
			ctx.ui.notify(
				`当前分支已累计压缩 ${existingCompactions} 次。建议尽快开新会话，减少多层摘要继续累积。`,
				"warning",
			);
		}
	});

	pi.on("session_before_tree", async (event, ctx) => {
		const { preparation, signal } = event;
		if (!preparation.userWantsSummary) {
			return;
		}

		const fileOps = createFileOps();
		mergePriorBranchSummaryFileOps(fileOps, preparation.entriesToSummarize);
		const branchMessages = preparation.entriesToSummarize
			.map((entry) => getBranchSummaryMessage(entry as Parameters<typeof getBranchSummaryMessage>[0]))
			.filter((message): message is AgentMessage => Boolean(message));
		const tokenBudget = (ctx.model?.contextWindow || 128000) - 16384;
		const messages = selectBranchMessagesWithinBudget(branchMessages, tokenBudget);
		for (const message of messages) {
			if (message.role !== "assistant" || !Array.isArray(message.content)) {
				continue;
			}
			for (const block of message.content) {
				if (
					typeof block !== "object" ||
					block === null ||
					block.type !== "toolCall" ||
					typeof block.name !== "string" ||
					typeof block.arguments !== "object" ||
					block.arguments === null
				) {
					continue;
				}
				const path = typeof (block.arguments as Record<string, unknown>).path === "string"
					? (block.arguments as Record<string, unknown>).path as string
					: undefined;
				if (!path) continue;
				if (block.name === "read") {
					fileOps.read.add(path);
				} else if (block.name === "write") {
					fileOps.written.add(path);
				} else if (block.name === "edit") {
					fileOps.edited.add(path);
				}
			}
		}

		const summaryText = await summarizeWithModel(
			ctx.model,
			ctx.modelRegistry,
			messages,
			applyCustomInstructions(BRANCH_PROMPT, preparation.customInstructions, {
				replace: preparation.replaceInstructions,
			}),
			signal,
		);
		if (!summaryText) {
			return;
		}

		const { readFiles, modifiedFiles } = computeFileLists(fileOps);
		const summary = `${BRANCH_SUMMARY_PREAMBLE}${summaryText}${formatFileOperations(readFiles, modifiedFiles)}`;

		return {
			summary: {
				summary,
				details: {
					readFiles,
					modifiedFiles,
				} satisfies CodexStyleBranchSummaryDetails,
			},
		};
	});
}
