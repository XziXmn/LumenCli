import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { TuiRuntime, TuiToolPart } from "../runtime/types.js";
import { filetypeFromPath } from "./filetype.js";
import { getSyntax } from "./syntax.js";
import { palette } from "./theme.js";

export function ToolBlock(props: { runtime: TuiRuntime; tool: TuiToolPart }) {
	const theme = () => palette[props.runtime.state.ui.theme];
	const [now, setNow] = createSignal(Date.now());
	createEffect(() => {
		if (props.tool.status !== "running" && props.tool.status !== "pending") return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		onCleanup(() => clearInterval(timer));
	});
	const color = createMemo(() => {
		if (props.tool.status === "running" || props.tool.status === "pending") return theme().primary;
		if (props.tool.status === "error") return theme().error;
		if (props.tool.status === "aborted") return theme().warning;
		return theme().textMuted;
	});
	// 工具行主色：稳定的低对比度灰，整行不随 status 变化，避免 running → success
	// 切换瞬间出现可见的"蓝→灰"闪烁（典型场景：read/grep 这类毫秒级工具）。
	// 状态信号靠 icon 颜色 + icon 字符变化体现，不靠整行字色变化。
	const stableColor = createMemo(() => {
		if (props.tool.status === "error") return theme().error;
		if (props.tool.status === "aborted") return theme().warning;
		return theme().textMuted;
	});
	const icon = createMemo(() => {
		if (props.tool.status === "running" || props.tool.status === "pending") return "~";
		if (props.tool.status === "error") return "x";
		if (props.tool.status === "aborted") return "!";
		return "✓";
	});
	// 工具显示模式：稳定地由 `display` 字段决定，不再因为 result 长度切换。
	// 之前的 `result.length > 120` 自动升级会让工具完成时从 inline 一行突然变成
	// 5–10 行的 block，看起来像"蹦"出来。让 display 在 tool_start 时就敲定，
	// 整个生命周期保持同一种排版。
	const block = createMemo(() => props.tool.display === "block");
	const showDetails = createMemo(() => props.runtime.state.ui.showToolDetails);
	const diffs = createMemo(() => diffBlocks(props.tool.details));
	const askUser = createMemo(() => askUserBlock(props.tool.name, props.tool.args, props.tool.details));
	const summary = createMemo(() => toolSummary(props.tool.name, props.tool.args, props.tool.details));
	const genericDetails = createMemo(() => genericToolDetails(props.tool.name, props.tool.args, props.tool.details));
	const codeBlock = createMemo(() => codeContentForTool(props.tool));
	const progress = createMemo(() => toolProgress(props.tool, now()));
	return (
		<Show
			when={block()}
			fallback={
				<box marginTop={1} paddingLeft={3}>
					<text fg={stableColor()}>
						<span style={{ fg: color() }}>{icon()}</span> {inlineTitle(props.tool)}{" "}
						<span style={{ fg: theme().textMuted }}>
							{showDetails() ? inlineSummary([...summary(), progress()]) : progress()}
						</span>
					</text>
					<Show when={showDetails() && props.tool.result && !askUser() && diffs().length === 0}>
						<text fg={theme().textMuted}>
							{"  ⎿ "}
							{trim(props.tool.result ?? "", 120)}
						</text>
					</Show>
				</box>
			}
		>
			<box
				marginTop={1}
				paddingLeft={2}
				paddingRight={1}
				paddingTop={1}
				paddingBottom={1}
				border={["left"]}
				borderColor={theme().border}
				backgroundColor={theme().panelRaised}
			>
				<text fg={stableColor()}>
					<span style={{ fg: color() }}>{icon()}</span> {props.tool.title ?? props.tool.name}
					<span style={{ fg: theme().textMuted }}> {progress()}</span>
				</text>
				<Show when={showDetails() && summary().length > 0}>
					<box flexDirection="column">
						<For each={summary()}>{(line) => <text fg={theme().textMuted}>{line}</text>}</For>
					</box>
				</Show>
				<Show when={showDetails() && askUser()}>
					<box marginTop={1} flexDirection="column" gap={1}>
						<text fg={theme().text}>{askUser()?.question}</text>
						<Show when={(askUser()?.options.length ?? 0) > 0}>
							<text fg={theme().textMuted}>Options: {askUser()?.options.join(", ")}</text>
						</Show>
						<Show when={askUser()?.answer !== undefined || askUser()?.cancelled}>
							<text fg={askUser()?.cancelled ? theme().warning : theme().success}>
								{askUser()?.cancelled ? "Cancelled" : `Answer: ${askUser()?.answer}`}
							</text>
						</Show>
					</box>
				</Show>
				<Show when={showDetails() && diffs().length > 0}>
					<For each={diffs()}>
						{(item) => (
							<box marginTop={1} flexDirection="column">
								<Show when={item.filePath}>
									<text fg={theme().textMuted}>{item.filePath}</text>
								</Show>
								<diff
									diff={item.diff}
									view="unified"
									showLineNumbers={true}
									width="100%"
									fg={theme().text}
									addedBg="#1a2e1a"
									removedBg="#2e1a1a"
									contextBg={theme().panel}
									addedSignColor={theme().success}
									removedSignColor={theme().error}
									lineNumberFg={theme().textMuted}
									lineNumberBg={theme().panel}
								/>
							</box>
						)}
					</For>
				</Show>
				<Show when={showDetails() && genericDetails().length > 0}>
					<box marginTop={1} flexDirection="column">
						<For each={genericDetails()}>
							{(line) => (
								<text fg={line.kind === "label" ? theme().secondary : theme().textMuted}>{line.text}</text>
							)}
						</For>
					</box>
				</Show>
				<Show when={showDetails() && props.tool.result && diffs().length === 0 && !askUser()}>
					<Show when={codeBlock()} fallback={<text fg={theme().text}>{trim(props.tool.result ?? "", 1200)}</text>}>
						<box marginTop={1}>
							<code
								filetype={codeBlock()!.filetype}
								streaming={false}
								drawUnstyledText={false}
								syntaxStyle={getSyntax(theme())}
								content={codeBlock()!.content}
								fg={theme().text}
								wrapMode="word"
							/>
						</box>
					</Show>
				</Show>
				<Show when={props.tool.error}>
					<text fg={theme().error}>{props.tool.error}</text>
				</Show>
			</box>
		</Show>
	);
}

function askUserBlock(
	toolName: string,
	args: Record<string, unknown>,
	details: unknown,
): { question: string; options: string[]; answer?: string; cancelled: boolean } | undefined {
	if (toolName !== "ask_user") return undefined;
	const detailRecord = isRecord(details) ? details : {};
	const question = stringValue(detailRecord.question) ?? stringValue(args.question);
	if (!question) return undefined;
	const mode = stringValue(detailRecord.mode) ?? stringValue(args.mode);
	const options =
		stringArray(detailRecord.options) ?? stringArray(args.options) ?? (mode === "confirm" ? ["Yes", "No"] : []);
	const answer = stringValue(detailRecord.answer);
	return {
		question,
		options,
		answer: detailRecord.cancelled === true ? undefined : answer,
		cancelled: detailRecord.cancelled === true,
	};
}

function diffBlocks(details: unknown): Array<{ diff: string; filePath?: string }> {
	if (!isRecord(details)) return [];
	if (typeof details.diff === "string") {
		return [{ diff: details.diff, filePath: stringValue(details.filePath) }];
	}
	if (!Array.isArray(details.files)) return [];
	return details.files
		.map((file) => {
			if (!isRecord(file) || typeof file.patch !== "string") return undefined;
			const filePath = stringValue(file.relativePath) ?? stringValue(file.filePath);
			return {
				diff: file.patch,
				...(filePath ? { filePath } : {}),
			};
		})
		.filter((item): item is { diff: string; filePath?: string } => item !== undefined);
}

function toolSummary(toolName: string, args: Record<string, unknown>, details: unknown): string[] {
	const record = isRecord(details) ? { ...args, ...details } : args;
	const lowerName = toolName.toLowerCase();
	if (lowerName === "bash" || lowerName === "shell") {
		return compactLines([`$ ${stringValue(record.command) ?? "shell"}`, stringValue(record.description)]);
	}
	if (lowerName === "read") {
		return compactLines([`Path: ${pathValue(record) ?? "file"}`, rangeSummary(record)]);
	}
	if (lowerName === "write") {
		return compactLines([`Write: ${pathValue(record) ?? "file"}`, sizeSummary(record.content)]);
	}
	if (lowerName === "edit" || lowerName === "apply_patch" || lowerName === "patch") {
		return compactLines([`Edit: ${pathValue(record) ?? "file"}`, replacementSummary(record)]);
	}
	if (lowerName === "grep") {
		return compactLines([
			`Pattern: ${stringValue(record.pattern) ?? ""}`,
			`Path: ${stringValue(record.path) ?? stringValue(record.include) ?? "."}`,
		]);
	}
	if (lowerName === "glob") {
		return compactLines([
			`Pattern: ${stringValue(record.pattern) ?? ""}`,
			`Path: ${stringValue(record.path) ?? "."}`,
		]);
	}
	if (lowerName === "find") {
		return compactLines([
			`Find: ${stringValue(record.pattern) ?? stringValue(record.query) ?? ""}`,
			`Path: ${stringValue(record.path) ?? "."}`,
		]);
	}
	if (lowerName === "ls") {
		return compactLines([`List: ${stringValue(record.path) ?? "."}`]);
	}
	if (lowerName === "webfetch" || lowerName === "web_fetch") {
		return compactLines([`URL: ${stringValue(record.url) ?? ""}`, stringValue(record.prompt)]);
	}
	if (lowerName === "websearch" || lowerName === "web_search") {
		return compactLines([`Query: ${stringValue(record.query) ?? ""}`, stringValue(record.provider)]);
	}
	if (lowerName === "task" || lowerName === "subagent") {
		return compactLines([
			`Agent: ${stringValue(record.subagent_type) ?? stringValue(record.agent) ?? "default"}`,
			stringValue(record.description) ?? stringValue(record.prompt),
		]);
	}
	if (lowerName === "todo" || lowerName === "todowrite") {
		return todoSummary(record);
	}
	return formatArgs(args) ? [formatArgs(args)] : [];
}

function genericToolDetails(
	toolName: string,
	args: Record<string, unknown>,
	details: unknown,
): Array<{ kind: "label" | "value"; text: string }> {
	if (isKnownTool(toolName)) return [];
	const lines: Array<{ kind: "label" | "value"; text: string }> = [];
	const argLines = structuredRecordLines(args);
	if (argLines.length > 0) {
		lines.push({ kind: "label", text: "Args" });
		lines.push(...argLines.map((text) => ({ kind: "value" as const, text })));
	}
	const detailLines = structuredValueLines(details);
	if (detailLines.length > 0) {
		lines.push({ kind: "label", text: "Details" });
		lines.push(...detailLines.map((text) => ({ kind: "value" as const, text })));
	}
	return lines.slice(0, 12);
}

function isKnownTool(toolName: string): boolean {
	const lowerName = toolName.toLowerCase();
	return [
		"ask_user",
		"bash",
		"shell",
		"read",
		"write",
		"edit",
		"apply_patch",
		"patch",
		"grep",
		"glob",
		"find",
		"ls",
		"webfetch",
		"web_fetch",
		"websearch",
		"web_search",
		"task",
		"subagent",
		"todo",
		"todowrite",
	].includes(lowerName);
}

function structuredValueLines(value: unknown): string[] {
	if (isRecord(value)) return structuredRecordLines(value);
	if (Array.isArray(value)) return value.slice(0, 6).map((item, index) => `${index}: ${formatValue(item)}`);
	const formatted = formatValue(value);
	return formatted ? [formatted] : [];
}

function structuredRecordLines(record: Record<string, unknown>): string[] {
	return Object.entries(record)
		.filter(([, value]) => value !== undefined && value !== "")
		.slice(0, 8)
		.map(([key, value]) => `${key}: ${formatValue(value)}`);
}

function inlineSummary(lines: string[]): string {
	return trim(lines.join(" · ").replace(/\s+/g, " "), 160);
}

function toolProgress(tool: TuiToolPart, currentTime: number): string {
	const elapsed = formatElapsed((tool.endTime ?? currentTime) - tool.startTime);
	const lines = outputLineCount(tool.error ?? tool.result);
	const chunks = compactLines([
		tool.status === "running" || tool.status === "pending" ? `${elapsed} elapsed` : `${elapsed} total`,
		lines === undefined ? undefined : `${lines} output ${lines === 1 ? "line" : "lines"}`,
	]);
	return chunks.join(" · ");
}

function formatElapsed(milliseconds: number): string {
	const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes <= 0) return `${seconds}s`;
	return `${minutes}m ${seconds}s`;
}

function outputLineCount(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const normalized = value.replace(/(?:\r?\n)+$/, "");
	if (!normalized) return 0;
	return normalized.split(/\r?\n/).length;
}

function compactLines(lines: Array<string | undefined>): string[] {
	return lines
		.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
		.map((line) => trim(line, 180));
}

function pathValue(record: Record<string, unknown>): string | undefined {
	return stringValue(record.filePath) ?? stringValue(record.file_path) ?? stringValue(record.path);
}

function rangeSummary(record: Record<string, unknown>): string | undefined {
	const offset = numberValue(record.offset);
	const limit = numberValue(record.limit);
	if (offset === undefined && limit === undefined) return undefined;
	if (offset !== undefined && limit !== undefined) return `Lines: ${offset}-${offset + limit}`;
	if (offset !== undefined) return `Offset: ${offset}`;
	return `Limit: ${limit}`;
}

function sizeSummary(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const lines = (value.match(/\n/g)?.length ?? 0) + 1;
	return `${lines} lines, ${value.length} chars`;
}

function replacementSummary(record: Record<string, unknown>): string | undefined {
	const oldText = stringValue(record.oldString) ?? stringValue(record.old_string);
	const newText = stringValue(record.newString) ?? stringValue(record.new_string);
	if (!oldText && !newText) return undefined;
	return compactLines([oldText ? `- ${oldText}` : undefined, newText ? `+ ${newText}` : undefined]).join(" ");
}

function todoSummary(record: Record<string, unknown>): string[] {
	const todos = Array.isArray(record.todos) ? record.todos : [];
	if (todos.length === 0) return [];
	const counts = new Map<string, number>();
	for (const todo of todos) {
		if (!isRecord(todo)) continue;
		const status = stringValue(todo.status) ?? "unknown";
		counts.set(status, (counts.get(status) ?? 0) + 1);
	}
	return [`Todos: ${[...counts.entries()].map(([status, count]) => `${count} ${status}`).join(", ")}`];
}

function formatArgs(args: Record<string, unknown>): string {
	const entries = Object.entries(args).slice(0, 4);
	if (entries.length === 0) return "";
	return entries.map(([key, value]) => `${key}=${formatValue(value)}`).join(" ");
}

function formatValue(value: unknown): string {
	if (typeof value === "string") return trim(value.replace(/\s+/g, " "), 72);
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (value === null || value === undefined) return "";
	return trim(JSON.stringify(value), 72);
}

function trim(value: string, max: number): string {
	if (value.length <= max) return value;
	return `${value.slice(0, Math.max(0, max - 3))}...`;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const items = value.filter((item): item is string => typeof item === "string" && item.length > 0);
	return items.length > 0 ? items : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function inlineTitle(tool: TuiToolPart): string {
	const lowerName = tool.name.toLowerCase();
	if (lowerName === "read") return `← ${tool.title ?? "Read"}`;
	if (lowerName === "write") return `# ${tool.title ?? "Write"}`;
	if (lowerName === "edit" || lowerName === "apply_patch" || lowerName === "patch") return `← ${tool.title ?? "Edit"}`;
	if (lowerName === "grep") return `⌕ ${tool.title ?? "Grep"}`;
	if (lowerName === "glob") return `⌕ ${tool.title ?? "Glob"}`;
	if (lowerName === "find" || lowerName === "ls") return `⌕ ${tool.title ?? tool.name}`;
	if (lowerName === "webfetch" || lowerName === "web_fetch") return `↗ ${tool.title ?? "Fetch"}`;
	if (lowerName === "websearch" || lowerName === "web_search") return `↗ ${tool.title ?? "Search"}`;
	if (lowerName === "task" || lowerName === "subagent") return `→ ${tool.title ?? "Task"}`;
	if (lowerName === "todo" || lowerName === "todowrite") return `⚙ ${tool.title ?? "Todo"}`;
	if (lowerName === "ask_user") return `? ${tool.title ?? "Ask"}`;
	return tool.title ?? tool.name;
}

function codeContentForTool(tool: TuiToolPart): { filetype: string; content: string } | undefined {
	const lowerName = tool.name.toLowerCase();
	const filePath = stringValue(tool.args.filePath) ?? stringValue(tool.args.file_path) ?? stringValue(tool.args.path);
	if (lowerName === "read") {
		const result = tool.result;
		if (!filePath || !result) return undefined;
		return { filetype: filetypeFromPath(filePath), content: trim(result, 4000) };
	}
	if (lowerName === "write") {
		const content = stringValue(tool.args.content);
		if (!filePath || !content) return undefined;
		return { filetype: filetypeFromPath(filePath), content: trim(content, 4000) };
	}
	if (lowerName === "bash" || lowerName === "shell") {
		if (!tool.result) return undefined;
		return { filetype: "bash", content: trim(tool.result, 4000) };
	}
	return undefined;
}
