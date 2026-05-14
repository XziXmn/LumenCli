# Lumen Built-in Extensions

Lumen ships with 22 built-in extensions that provide commands and LLM-callable tools. All are registered in `packages/coding-agent/src/core/resource-loader.ts`.

## LLM-callable Tools

Tools available to the LLM (via tool-call in the model response):

| Tool | Extension | Purpose |
|------|-----------|---------|
| `todo` | lumen-todo | Structured phased task tracking |
| `ask_user` | lumen-askuser | Ask user a select/confirm/text question |
| `apply_patch` | lumen-patch | Multi-file atomic patches with auto-rollback |
| `web_search` | lumen-web | Exa / DuckDuckGo web search |
| `web_fetch` | lumen-web | Jina Reader / direct fetch (5-min cache) |
| `repo_clone` | lumen-repo | Clone external repo into `~/.lumen/agent/repos/` |
| `repo_overview` | lumen-repo | Ecosystem + structure analysis |
| `lsp` | lumen-lsp | 10 actions: diagnostics / definition / references / rename / hover / symbols / etc. |
| `snip` | lumen-snip | Smart-truncate long text |
| `brief` | lumen-snip | Summarize long text by paragraph leads |
| `code_search` | lumen-codesearch | GitHub code search API |
| `powershell` | lumen-powershell | Windows-only native PowerShell |
| `agent` | lumen-agents | Synchronous sub-agent execution |
| `agent_spawn` | lumen-agents-bg | Background sub-agent (returns id) |
| `agent_status` | lumen-agents-bg | Poll status + partial output |
| `agent_send` | lumen-agents-bg | Send steering message to running agent |
| `agent_wait` | lumen-agents-bg | Block until agent finishes |
| `agent_kill` | lumen-agents-bg | SIGTERM a running agent |

Plus built-in: `read`, `write`, `edit`, `grep`, `find`, `ls`, `bash`.

## User Commands

Slash commands typed in chat:

| Command | Extension | Description |
|---------|-----------|-------------|
| `/commit` | lumen-commit | AI-generated commit messages |
| `/plan`, `/draft`, `/review`, `/revise` | lumen-writing | Chinese writing workflow |
| `/remember <text>` | lumen-memory | Persist a fact / lesson / preference |
| `/memory [kind] [query]` | lumen-memory | Search / list memory |
| `/memory consolidate` | lumen-memory | Manually trigger phase-2 consolidation |
| `/snapshot list / restore / diff / now` | lumen-snapshot | Git-based snapshots before edits |
| `/patch <text>` | lumen-patch | Apply a patch manually |
| `/todo` | lumen-todo | View current task list |
| `/web`, `/fetch` | lumen-web | Search / fetch (same as LLM tools but for user) |
| `/plan-mode` | lumen-plan-mode | Toggle Plan Mode (Tab also works) |
| `/agent [name]` | lumen-agents | List / describe agents |
| `/agents-bg` | lumen-agents-bg | List background agents |
| `/worktree list / create / remove / patch` | lumen-worktree | Git worktree helpers |
| `/config-discovery` | lumen-config-discovery | Show detected external configs |

## Event Hooks

Extensions subscribe to events via `pi.on(event, handler)`:

| Event | Used by | Purpose |
|-------|---------|---------|
| `session_start` | agents, worktree, ttsr, memory, codedisc | Initialize state for the new session |
| `session_shutdown` | memory (2-phase), lsp, agents-bg | Cleanup + save summary |
| `before_agent_start` | memory, ttsr, config-discovery | Inject context into system prompt |
| `tool_call` | snapshot (auto-snap before write/edit/apply_patch), plan-mode | Block tools in plan mode |
| `tool_result` | secrets (redact), ttsr (rule injection) | Transform tool output |
| `input` | plan-mode (detects "执行" to exit) | Transform user input |

## Conditional Rules (TTSR)

Place files in `.lumen/rules/*.md` with frontmatter to inject conditionally:

```markdown
---
tools: [edit, write]
keywords: [rename, refactor]
---
When renaming symbols, prefer the lsp tool with action=rename.
Run apply=false first to preview the WorkspaceEdit.
```

Rules matching the current prompt's keywords or active tools get injected into the system prompt.

## Writing Your Own Extension

A minimal extension:

```typescript
// my-extension.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function myExtension(pi: ExtensionAPI): void {
  pi.registerCommand("hello", {
    description: "Greet the user",
    handler: async (args) => {
      pi.sendUserMessage(`Hello, ${args.trim() || "world"}!`);
    },
  });
}
```

Drop it in `.lumen/extensions/my-extension.ts` and restart Lumen.

For LLM-callable tools, see `packages/coding-agent/src/core/lumen-todo.ts` as a complete example using `pi.registerTool({ parameters: TypeBoxSchema, execute, renderCall, renderResult })`.

## Agent Definitions

Place markdown files in `.lumen/agents/` or `~/.lumen/agent/agents/`:

```markdown
---
name: reviewer
description: Review code changes for bugs and style issues
tools: read,grep,find,ls,bash
model: anthropic/claude-opus-4-7
---

You are a code reviewer. Focus on:
- Correctness
- Edge cases
- Consistency with surrounding code
- Performance for hot paths

Report findings as a bulleted list. No fluff.
```

Invoke via the `agent` tool: `agent(name="reviewer", task="Review the diff in packages/coding-agent")`.

