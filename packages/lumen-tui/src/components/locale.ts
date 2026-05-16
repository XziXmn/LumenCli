/**
 * Lumen TUI 中文本地化字符串。
 * 所有用户可见的 UI 文本集中在此处管理。
 * 风格参考旧 TUI（interactive-mode）的中文用语。
 */

export const locale = {
	// Command Palette
	commandPaletteTitle: "命令面板",
	commandPaletteFilter: "输入以过滤命令...",
	commandPaletteDisabled: "不可用",
	commandPaletteMoreAbove: (n: number) => `  ... 上方还有 ${n} 项`,
	commandPaletteMoreBelow: (n: number) => `  ... 下方还有 ${n} 项`,
	commandPaletteStatus: (total: number, current: number) => `共 ${total} 个命令 | 第 ${current}/${total} 项`,

	// Select Dialog
	selectDialogFilter: "输入以过滤...",
	selectDialogMoreAbove: (n: number) => `  ... 上方还有 ${n} 项`,
	selectDialogMoreBelow: (n: number) => `  ... 下方还有 ${n} 项`,
	selectDialogStatus: (total: number, current: number) => `共 ${total} 项 | 第 ${current}/${total} 项`,

	// Dialog Layer
	dialogClose: "Esc",

	// Home View
	homePromptHint: "输入消息开始对话，Tab 切换 Shell 模式",
	homeTip: "提示",

	// Footer
	footerLeaderHint: "Ctrl+X 命令",
	footerPaletteHint: "Ctrl+P 面板",
	footerWorking: "工作中",
	footerIdle: "就绪",
	footerCompacting: "压缩中",
	footerRetrying: "重试中",
	footerError: "错误",

	// Messages
	messageYou: "你",
	messageSystem: "系统",
	messageLumen: "Lumen",
	messageReverted: "消息已撤回",
	messageRedoHint: "<leader>r 或 /redo 恢复",
	messageThinking: "思考中...",

	// Tools - group summary
	toolReading: (n: number) => `正在读取 ${n} 个文件`,
	toolRead: (n: number) => `已读取 ${n} 个文件`,
	toolSearching: (n: number) => `正在搜索 ${n} 个模式`,
	toolSearched: (n: number) => `已搜索 ${n} 个模式`,
	toolGlobbing: (n: number) => `正在匹配 ${n} 个模式`,
	toolGlobbed: (n: number) => `已匹配 ${n} 个模式`,
	toolListing: (n: number) => `正在列出 ${n} 个目录`,
	toolListed: (n: number) => `已列出 ${n} 个目录`,

	// Toast
	toastInterrupted: "已中断",
	toastSessionCompacted: "会话已压缩",
	toastNewSession: "已创建新会话",
	toastNewSessionCancelled: "新建会话已取消",
	toastSessionDeleted: "会话已删除",
	toastImportCancelled: "导入已取消",
	toastDeleteCancelled: "删除已取消",
	toastAlreadyOnSession: "已在当前会话",
	toastNoAlternateModel: "未配置备选模型",
	toastNoAgents: "未配置代理",
	toastModel: (name: string) => `模型: ${name}`,
	toastAgent: (name: string) => `代理: ${name}`,
	toastTheme: (name: string) => `主题: ${name}`,
	toastConcealNotAvailable: "隐藏值渲染尚未实现",
	toastEditorNotConfigured: "未配置编辑器，请设置 VISUAL 或 EDITOR",
	toastCommandNotWired: (id: string) => `${id} 尚未接入`,
	toastSessionSwitched: (name: string) => `已切换会话: ${name}`,
	toastSessionSwitchCancelled: "切换会话已取消",
	toastFreshView: "已重置视图",
	toastCopied: "已复制到剪贴板",
	toastExported: (path: string) => `已导出到 ${path}`,
	toastShared: (url: string) => `已分享: ${url}`,
	toastUnshared: "已取消分享",
	toastInvalidModel: (id: string) => `无效模型: ${id}`,
	toastModelNotFound: (id: string) => `模型未找到: ${id}`,
	toastImportUsage: "用法: /import <路径.jsonl>",
	toastImportWithCwd: (cwd: string) => `已使用 cwd ${cwd} 导入会话`,
	toastCannotDeleteCurrent: "不能删除当前会话",
	toastRefuseDeleteOutside: "拒绝删除会话目录外的文件",
	toastNoSession: "无可选会话",
	toastChooseImport: "选择要导入的 JSONL 文件",
	toastChooseDelete: "选择要删除的已保存会话",
	toastSwitchRequiresHost: "切换会话需要 Lumen 运行时宿主",
	toastImportRequiresHost: "导入会话需要 Lumen 运行时宿主",

	// Confirm
	confirmImportTitle: "导入会话",
	confirmImportMessage: (path: string) => `用 ${path} 替换当前会话？`,
	confirmDeleteTitle: "删除会话",
	confirmDeleteMessage: (path: string) => `删除 ${path}？`,

	// Process Panel
	processPanelPermission: "等待授权",
	processPanelQueued: "排队中",
	processPanelBackground: "后台任务",

	// Sidebar
	sidebarModel: "模型",
	sidebarAgent: "代理",
	sidebarTokens: "令牌",
	sidebarSessions: "会话",
	sidebarCapabilities: "能力",
	sidebarTools: "工具",
	sidebarActivity: "活动",

	// Which Key
	whichKeyTitle: "快捷键",

	// Activity Dialog
	activityTitle: "活动详情",
	activityTools: "工具",
	activityBackground: "后台代理",
	activityPermission: "授权等待",
	activityQueued: "排队项",
	activityReadOnly: "只读",

	// Status
	statusTitle: "状态",
	statusLsp: "LSP",
	statusMcp: "MCP",

	// Compaction
	compactionStart: (reason: string) => `正在压缩会话（${reason}）`,
	compactionComplete: "压缩完成",
	compactionAborted: "压缩已中止",

	// Thinking
	thinkingLevelChanged: (level: string) => `思考等级: ${level}`,
} as const;
