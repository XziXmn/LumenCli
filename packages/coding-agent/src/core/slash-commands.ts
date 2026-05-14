import { APP_NAME } from "../config.js";
import type { SourceInfo } from "./source-info.js";

export type SlashCommandSource = "extension" | "prompt" | "skill";

export interface SlashCommandInfo {
	name: string;
	description?: string;
	source: SlashCommandSource;
	sourceInfo: SourceInfo;
}

export interface BuiltinSlashCommand {
	name: string;
	description: string;
}

export const BUILTIN_SLASH_COMMANDS: ReadonlyArray<BuiltinSlashCommand> = [
	{ name: "settings", description: "打开设置菜单" },
	{ name: "model", description: "选择模型（打开选择器 UI）" },
	{ name: "scoped-models", description: "启用/禁用 Ctrl+P 循环切换的模型" },
	{ name: "export", description: "导出会话（默认 HTML，或指定路径：.html/.jsonl）" },
	{ name: "import", description: "导入并恢复 JSONL 会话文件" },
	{ name: "share", description: "将会话分享为 GitHub secret gist" },
	{ name: "copy", description: "复制最后一条助手消息到剪贴板" },
	{ name: "name", description: "设置会话显示名称" },
	{ name: "session", description: "显示会话信息和统计" },
	{ name: "changelog", description: "显示更新日志" },
	{ name: "hotkeys", description: "显示所有快捷键" },
	{ name: "fork", description: "从之前的用户消息创建新分支" },
	{ name: "clone", description: "在当前位置复制会话" },
	{ name: "tree", description: "浏览会话树（切换分支）" },
	{ name: "login", description: "配置 provider 认证" },
	{ name: "logout", description: "移除 provider 认证" },
	{ name: "new", description: "开始新会话" },
	{ name: "compact", description: "手动压缩会话上下文" },
	{ name: "resume", description: "恢复其他会话" },
	{ name: "reload", description: "重新加载快捷键、扩展、技能、提示词和主题" },
	{ name: "quit", description: `退出 ${APP_NAME}` },
];
