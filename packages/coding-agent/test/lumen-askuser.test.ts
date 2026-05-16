import { describe, expect, it } from "vitest";
import type {
	ExtensionAPI,
	ExtensionContext,
	ExtensionUIContext,
	ToolDefinition,
} from "../src/core/extensions/types.js";
import lumenAskUserExtension from "../src/core/lumen-askuser.js";

type AskUserParams = {
	question: string;
	mode: "select" | "confirm" | "text";
	options?: string[];
	default?: string;
};

type AskUserResult = {
	content: Array<{ type: string; text?: string }>;
	details?: unknown;
};

type AskUserExecute = (
	toolCallId: string,
	params: AskUserParams,
	signal: AbortSignal | undefined,
	onUpdate: undefined,
	ctx: ExtensionContext,
) => Promise<AskUserResult>;

interface AskUserDetails {
	question: string;
	mode: "select" | "confirm" | "text";
	options?: string[];
	answer: string | null;
	cancelled: boolean;
}

describe("lumen ask_user extension", () => {
	it("uses the standard select UI for select questions", async () => {
		const tool = registerAskUserTool();
		const calls: Array<{ title: string; options: string[] }> = [];
		const ctx = createContext({
			select: async (title, options) => {
				calls.push({ title, options });
				return "Beta";
			},
		});

		const result = await execute(tool)(
			"call-1",
			{
				question: "Pick one",
				mode: "select",
				options: ["Alpha", "Beta"],
			},
			undefined,
			undefined,
			ctx,
		);

		expect(calls).toEqual([{ title: "Ask User", options: ["Alpha", "Beta"] }]);
		expect(result.content[0]?.text).toBe("User answered: Beta");
		expect(details(result)).toMatchObject({ question: "Pick one", mode: "select", answer: "Beta", cancelled: false });
	});

	it("uses the standard input UI for text questions without echoing through custom UI", async () => {
		const tool = registerAskUserTool();
		const calls: Array<{ title: string; placeholder?: string }> = [];
		const ctx = createContext({
			input: async (title, placeholder) => {
				calls.push({ title, placeholder });
				return "typed answer";
			},
		});

		const result = await execute(tool)(
			"call-2",
			{
				question: "Explain",
				mode: "text",
				default: "draft",
			},
			undefined,
			undefined,
			ctx,
		);

		expect(calls).toEqual([{ title: "Explain", placeholder: "draft" }]);
		expect(result.content[0]?.text).toBe("User answered: typed answer");
		expect(details(result)).toMatchObject({
			question: "Explain",
			mode: "text",
			answer: "typed answer",
			cancelled: false,
		});
	});

	it("records cancellation details when the standard UI returns no answer", async () => {
		const tool = registerAskUserTool();
		const ctx = createContext({
			select: async () => undefined,
		});

		const result = await execute(tool)(
			"call-3",
			{
				question: "Continue?",
				mode: "confirm",
			},
			undefined,
			undefined,
			ctx,
		);

		expect(result.content[0]?.text).toBe("User cancelled the selection.");
		expect(details(result)).toMatchObject({ question: "Continue?", mode: "confirm", answer: null, cancelled: true });
	});
});

function registerAskUserTool(): ToolDefinition {
	let registered: ToolDefinition | undefined;
	const api = {
		registerTool(tool: ToolDefinition) {
			registered = tool;
		},
	} as unknown as ExtensionAPI;
	lumenAskUserExtension(api);
	expect(registered).toBeDefined();
	return registered!;
}

function execute(tool: ToolDefinition): AskUserExecute {
	return tool.execute as AskUserExecute;
}

function createContext(uiOverrides: Partial<ExtensionUIContext>): ExtensionContext {
	const ui = {
		select: async () => undefined,
		input: async () => undefined,
		confirm: async () => false,
		...uiOverrides,
	} as ExtensionUIContext;
	return {
		ui,
		hasUI: true,
		cwd: "",
		sessionManager: undefined as never,
		modelRegistry: undefined as never,
		model: undefined,
		isIdle: () => true,
		signal: undefined,
		abort: () => {},
		hasPendingMessages: () => false,
		shutdown: () => {},
		getContextUsage: () => undefined,
		compact: () => {},
		getSystemPrompt: () => "test",
	};
}

function details(result: AskUserResult): AskUserDetails {
	expect(result.details).toBeDefined();
	return result.details as AskUserDetails;
}
