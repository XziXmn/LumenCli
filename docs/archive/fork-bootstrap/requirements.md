> 历史降级说明：
> 本文档记录的是旧阶段的能力需求清单，其中很多能力已经完成、部分改向、部分暂缓。
> 它现在只作为历史需求来源使用，不再直接指导当前实现。当前总路线图请优先看 [../../ROADMAP.md](../../ROADMAP.md)，能力现状请看 [../../CAPABILITY_MATRIX.md](../../CAPABILITY_MATRIX.md)。

# Requirements Document

## Introduction

LumenCli Phase 3+ 后续开发规划。LumenCli 是从 earendil-works/pi-mono fork 的个人深度定制 coding agent。Phase 1（品牌定制）和 Phase 2（写作工作流、.novel 检测、记忆模块）已完成。本文档规划后续五大工作方向：Orchestrator 功能、oh-my-pi 功能移植、上游合并工作流、验证与测试、文档与配置完善。

## Glossary

- **LumenCli**: 基于 Pi coding agent fork 的个人深度定制终端 AI 助手
- **Orchestrator**: 任务编排模块，负责将复杂任务派发给外部 agent 执行
- **Worker**: 执行具体任务的外部 agent 实例（Codex、Claude 或本地进程）
- **Worker_Adapter**: 封装特定 Worker 通信协议的适配器组件
- **Isolation_Workspace**: 为 Worker 创建的隔离工作目录（git worktree 或临时目录）
- **Router**: 根据任务特征决定派发给哪个 Worker 的路由组件
- **WorkerResult**: Worker 执行完成后返回的标准化结果数据结构
- **Hashline**: oh-my-pi 的文件编辑方式，通过内容哈希锚定行号，比 str_replace 更可靠
- **TTSR**: Token-efficient Tool-call Streaming Response，零上下文成本的规则按需注入机制
- **Plan_Mode**: 结构化规划模式，先生成执行计划再逐步执行
- **Commit_Tool**: AI 驱动的 git commit 工具，自动分析变更并生成 commit message
- **Upstream**: earendil-works/pi-mono 上游仓库
- **Mimo**: 本地部署的推理服务（mimo-v2.5-pro 编程特化 + mimo-v2.5 多模态）
- **oh-my-pi**: can1357/oh-my-pi，Pi 的社区增强 fork，包含大量扩展功能
- **Extension_API**: Pi 的扩展接口，用于注册命令、hook 事件和注入上下文
- **Model_Selector**: /model 命令界面，显示可用模型列表供用户选择
- **Routing_Engine**: 内部组件，根据 Active_Preset 和 Primary_Model 解析某子系统该用哪个模型
- **Preset_Store**: 预设的持久化存储，位于模型配置文件中
- **Secrets_Redactor**: 自动检测并屏蔽敏感信息（API key、token、邮箱等）的模块
- **Config_Discovery**: 扫描并加载兼容外部工具（Claude/Cursor/Windsurf/Codex）配置的模块

## Requirements

### Requirement 1: Orchestrator Delegate Tool

**User Story:** As a LumenCli user, I want to delegate complex tasks to external agents (Codex/Claude), so that I can leverage multiple AI capabilities for parallel or specialized work.

#### Acceptance Criteria

1. WHEN a user invokes the delegate tool with a task description and worker type, THE Orchestrator SHALL spawn the specified Worker and return a WorkerResult upon completion
2. THE Orchestrator SHALL support three Worker types: codex, claude, and local
3. WHEN the delegate tool is invoked with isolation mode "worktree", THE Orchestrator SHALL create a git worktree as the Isolation_Workspace for the Worker
4. WHEN the delegate tool is invoked with isolation mode "tmpdir", THE Orchestrator SHALL create a temporary directory as the Isolation_Workspace for the Worker
5. WHEN the delegate tool is invoked with isolation mode "none", THE Orchestrator SHALL execute the Worker in the current working directory
6. WHEN a Worker completes execution, THE Orchestrator SHALL return a WorkerResult containing: worker type, success status, summary, files changed, diff, commands run, and duration
7. IF a Worker process exits with a non-zero code, THEN THE Orchestrator SHALL capture available output and return a WorkerResult with success set to false and the error details in the summary field

### Requirement 2: Worker Adapters

**User Story:** As a LumenCli user, I want each external agent to be accessed through a consistent interface, so that the Orchestrator can manage different workers uniformly.

#### Acceptance Criteria

1. THE Codex_Adapter SHALL spawn the codex CLI with quiet mode and full-auto approval, passing the task as input and the Isolation_Workspace as working directory
2. THE Claude_Adapter SHALL spawn the claude CLI in print mode with JSON output format, passing the task as input and the Isolation_Workspace as working directory
3. THE Local_Adapter SHALL execute the task as a shell command in the Isolation_Workspace and capture stdout and stderr
4. WHEN a Worker_Adapter spawns a process, THE Worker_Adapter SHALL enforce a configurable timeout and terminate the process if the timeout is exceeded
5. IF a Worker_Adapter timeout is exceeded, THEN THE Worker_Adapter SHALL terminate the Worker process and return a WorkerResult with success set to false and a timeout indication in the summary

### Requirement 3: Orchestrator Routing Logic

**User Story:** As a LumenCli user, I want the system to automatically choose the best worker for a task, so that I do not need to manually specify the worker type every time.

#### Acceptance Criteria

1. WHEN the delegate tool is invoked without an explicit worker type, THE Router SHALL analyze the task description and select an appropriate Worker
2. THE Router SHALL route simple file operations and shell commands to the local Worker
3. THE Router SHALL route multi-file refactoring tasks to the codex Worker when codex is available
4. THE Router SHALL route reasoning-intensive and analysis tasks to the claude Worker when claude is available
5. IF the preferred Worker is unavailable (CLI not found), THEN THE Router SHALL fall back to the next available Worker and inform the user of the fallback

### Requirement 4: Hashline Editing

**User Story:** As a LumenCli user, I want file edits to use content-hash anchored line numbers, so that edits are more reliable and consume fewer tokens than str_replace.

#### Acceptance Criteria

1. WHEN the agent reads a file for editing context, THE Hashline module SHALL annotate each line with a short content hash prefix
2. WHEN the agent specifies an edit using hashline anchors, THE Hashline module SHALL resolve the anchors to current line positions and apply the edit
3. IF a hashline anchor does not match any line in the target file, THEN THE Hashline module SHALL return an error indicating the anchor is stale or invalid
4. THE Hashline module SHALL produce shorter tool-call payloads compared to full str_replace content for edits spanning fewer than 20 lines

### Requirement 5: TTSR (Token-efficient Tool-call Streaming Response)

**User Story:** As a LumenCli user, I want rules and instructions to be injected on-demand with zero idle context cost, so that the system prompt stays compact while still providing guidance when needed.

#### Acceptance Criteria

1. THE TTSR module SHALL register trigger patterns that map keywords or tool invocations to rule snippets
2. WHEN a trigger pattern matches during a tool call or response generation, THE TTSR module SHALL inject the corresponding rule snippet into the active context
3. WHILE no trigger pattern is matched, THE TTSR module SHALL add zero tokens to the system prompt for registered rules
4. THE TTSR module SHALL support registering rules from AGENTS.md, skills files, and extension-provided content

### Requirement 6: Plan Mode

**User Story:** As a LumenCli user, I want a structured planning mode that generates an execution plan before taking action, so that I can review and approve complex operations before they execute.

#### Acceptance Criteria

1. WHEN the user activates plan mode via the /plan-mode command or configuration, THE Plan_Mode module SHALL switch the agent to planning-only output
2. WHILE plan mode is active, THE Plan_Mode module SHALL prevent the agent from executing tools and instead output a structured plan with numbered steps
3. WHEN the user approves a plan, THE Plan_Mode module SHALL execute the plan steps sequentially, reporting progress after each step
4. WHEN the user rejects or modifies a plan, THE Plan_Mode module SHALL regenerate the plan incorporating the user feedback
5. THE Plan_Mode module SHALL display each plan step with: step number, description, estimated tool calls, and risk level

### Requirement 7: Enhanced Memory (oh-my-pi Comparison)

**User Story:** As a LumenCli user, I want the memory module to automatically extract and retain important context across sessions, so that I do not need to manually /remember every relevant fact.

#### Acceptance Criteria

1. WHEN a session ends, THE Memory module SHALL generate a summary of key decisions, facts, and preferences from the session and persist the summary to the memory store
2. WHEN a new session starts, THE Memory module SHALL inject the most relevant memory entries into the system prompt based on the current working directory and recent topics
3. THE Memory module SHALL support memory entry kinds: fact, preference, context, summary, and lesson
4. WHEN the memory store exceeds 500 entries, THE Memory module SHALL consolidate older entries by merging related facts into summary entries
5. THE Memory module SHALL provide a /memory search command that supports keyword and kind-based filtering

### Requirement 8: Commit Tool

**User Story:** As a LumenCli user, I want an AI-driven git commit tool that analyzes staged changes and generates appropriate commit messages, so that my commit history is clean and descriptive.

#### Acceptance Criteria

1. WHEN the user invokes the commit tool, THE Commit_Tool SHALL analyze the current git diff (staged or all changes) and generate a conventional commit message
2. THE Commit_Tool SHALL present the generated commit message to the user for approval before executing the commit
3. WHEN the diff contains changes across multiple logical concerns, THE Commit_Tool SHALL suggest splitting into multiple commits with separate messages
4. THE Commit_Tool SHALL follow the commit message format defined in the project AGENTS.md (no emojis, concise, technical)
5. IF no changes are staged or present, THEN THE Commit_Tool SHALL inform the user that there is nothing to commit

### Requirement 9: Upstream Merge Workflow

**User Story:** As a LumenCli maintainer, I want an established workflow for periodically merging upstream changes, so that the fork stays current with Pi improvements while preserving customizations.

#### Acceptance Criteria

1. THE Upstream_Merge workflow SHALL provide a script that executes: fetch upstream, attempt merge, and report conflict status
2. WHEN merge conflicts occur, THE Upstream_Merge workflow SHALL generate a conflict report listing each conflicting file with a brief description of both sides' changes
3. THE Upstream_Merge workflow SHALL include a prompt template for AI-assisted conflict resolution that provides context about LumenCli customizations (branding, Chinese UI, writing commands, orchestrator, memory)
4. THE Upstream_Merge workflow SHALL maintain a CUSTOMIZATION_MANIFEST.md file listing all files modified from upstream with a one-line description of each customization
5. WHEN the upstream merge script is run, THE Upstream_Merge workflow SHALL check if the last merge was more than 14 days ago and display a reminder if overdue

### Requirement 10: End-to-End Testing with Local Mimo

**User Story:** As a LumenCli developer, I want to run end-to-end tests against the local mimo service, so that I can verify the full agent loop works correctly.

#### Acceptance Criteria

1. THE Test_Harness SHALL connect to the local mimo service endpoint and execute a predefined set of agent interactions
2. WHEN the mimo service is unreachable, THE Test_Harness SHALL skip end-to-end tests and report the service as unavailable
3. THE Test_Harness SHALL verify that writing commands (/plan, /draft, /review, /revise) produce non-empty responses from the model
4. THE Test_Harness SHALL verify that .novel project detection correctly identifies a test fixture directory containing a .novel folder with project.yaml and manuscript files
5. THE Test_Harness SHALL verify that the memory module persists entries across two sequential sessions by writing in session one and reading in session two

### Requirement 11: Documentation - User Installation Guide

**User Story:** As a new LumenCli user, I want a clear installation guide, so that I can set up the tool on my machine without prior knowledge of the project internals.

#### Acceptance Criteria

1. THE Installation_Guide SHALL document prerequisites: Node.js version, git, and optional dependencies (codex CLI, claude CLI)
2. THE Installation_Guide SHALL provide step-by-step instructions for: cloning the repository, installing dependencies, building, and creating a global command link
3. THE Installation_Guide SHALL document how to configure the local mimo service endpoint in the models configuration file
4. THE Installation_Guide SHALL document the configuration directory structure (~/.lumen/agent/) and the purpose of each configuration file
5. THE Installation_Guide SHALL include a verification section with commands to confirm successful installation

### Requirement 12: Documentation - Local Mimo Service Configuration Guide

**User Story:** As a LumenCli user, I want a guide for configuring the local mimo inference service, so that I can use LumenCli with my local models.

#### Acceptance Criteria

1. THE Mimo_Guide SHALL document the expected API endpoint format and authentication method for the local mimo service
2. THE Mimo_Guide SHALL provide the models.json configuration template with all required fields for mimo-v2.5-pro and mimo-v2.5
3. THE Mimo_Guide SHALL document how to verify the mimo service is running and accessible from LumenCli
4. THE Mimo_Guide SHALL document how to switch between local mimo and cloud providers using the /model command or CLI flags

### Requirement 13: Documentation - Extension Development Guide

**User Story:** As a LumenCli power user, I want a guide for developing custom extensions, so that I can add new capabilities using the Extension_API.

#### Acceptance Criteria

1. THE Extension_Guide SHALL document the Extension_API interface including available events (session_start, before_agent_start) and methods (registerCommand, sendUserMessage)
2. THE Extension_Guide SHALL provide a minimal working extension example that registers a slash command and hooks into the session lifecycle
3. THE Extension_Guide SHALL document the extension loading mechanism: file location (.lumen/extensions/), naming conventions, and export requirements
4. THE Extension_Guide SHALL document how to access and modify the system prompt from an extension via the before_agent_start event

### Requirement 14: Model Preset and Routing System

**User Story:** As a LumenCli user, I want to define named model presets that route different sub-systems (coding, vision, writing, fast) to specific models, so that I can optimize model usage for different task types.

#### Acceptance Criteria

1. WHEN the user invokes /model without arguments, THE Model_Selector SHALL display a flat list of all registered models and allow selection of a primary model
2. THE Routing_Engine SHALL route all sub-system requests to the primary model when no preset is active
3. WHEN the user invokes /model preset with a preset name, THE Routing_Engine SHALL activate the named preset and override sub-system routes according to the preset mapping
4. THE Preset_Store SHALL persist presets in the models configuration file under a presets section, supporting partial mappings where unmapped sub-systems fall back to the primary model
5. WHEN the primary model does not support vision and a vision-capable model exists in the registry, THE Routing_Engine SHALL automatically route vision requests to the vision-capable model

### Requirement 15: Secrets Redaction

**User Story:** As a LumenCli user, I want API keys, tokens, and sensitive data to be automatically redacted from agent output and logs, so that secrets are not accidentally exposed.

#### Acceptance Criteria

1. THE Secrets_Redactor SHALL scan all tool output and agent responses for patterns matching API keys, bearer tokens, email addresses, and private key content
2. WHEN a secret pattern is detected in tool output, THE Secrets_Redactor SHALL replace the matched content with a redaction placeholder before displaying to the user
3. THE Secrets_Redactor SHALL scan environment variables passed to shell commands and redact known secret values from command output
4. THE Secrets_Redactor SHALL allow users to register custom redaction patterns via configuration

### Requirement 16: Universal Config Discovery

**User Story:** As a LumenCli user who also uses Claude Code, Cursor, Windsurf, or Codex, I want LumenCli to discover and load compatible configuration from those tools, so that I do not need to duplicate my setup.

#### Acceptance Criteria

1. THE Config_Discovery module SHALL scan the following directories for compatible configuration: ~/.claude/, ~/.cursor/, .claude/, .mcp.json, and AGENTS.md
2. WHEN compatible skills or commands are found in external tool directories, THE Config_Discovery module SHALL load them with lower precedence than LumenCli native configuration
3. WHEN compatible MCP server configurations are found in external tool config files, THE Config_Discovery module SHALL merge them into the MCP server registry
4. THE Config_Discovery module SHALL support disabling external config sources via environment variables (LUMEN_DISABLE_EXTERNAL_CONFIG)
5. WHEN a conflict exists between external and native configuration, THE Config_Discovery module SHALL prefer native configuration and emit a diagnostic message
