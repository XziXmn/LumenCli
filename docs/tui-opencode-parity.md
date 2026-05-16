# Lumen TUI OpenCode Parity Checklist

This checklist tracks the Solid/OpenTUI rewrite in `packages/lumen-tui` against the visible OpenCode TUI experience.

## Scope

- Keep the Lumen TUI codebase and startup path.
- Use OpenCode as the visual and interaction reference.
- Keep UI code behind `TuiRuntime`; backend adapters can change without rewriting components.

## Current Coverage

### Home

- [x] OpenCode-like centered logo, prompt, footer hints, and toast layer.
- [x] Initial message auto-submit.
- [x] Home tips rotation and richer startup diagnostics.

### Session Layout

- [x] Message list, sticky bottom scroll, prompt dock, footer, optional wide sidebar.
- [x] Sidebar toggle and session/model/agent/tool status.
- [x] Real session tree data from `SessionManager.getTree()`.
- [ ] Pixel-level parity for 80x24, 120x32, and narrow resize behavior.
- [x] 120x32 session view shows clipped wide sidebar without overlapping prompt/footer; 80x24 keeps sidebar hidden.
- [x] Tree dialog visual hierarchy shows structured depth, current branch, and leaf state.

### Prompt

- [x] Multiline prompt, shell mode, history, slash catalog/autocomplete, file autocomplete, paste summary.
- [x] Esc interrupt and Ctrl+C cancel/exit behavior.
- [x] Prompt prefill after undo/tree navigation.
- [x] External editor flow via `<leader>e`, `/editor`, and command palette.
- [x] `/share` routes through the new runtime share command.
- [x] Common terminal editing keys: Ctrl+A/E/K/U/W, Meta+B/F, Ctrl+Z/Y.
- [x] Additional configurable editing keys: Ctrl+B/F/H/D for char movement, backspace, and delete-forward.
- [x] OpenCode-style prompt aliases for Ctrl+N/P autocomplete, Ctrl+J newline, Delete/Shift+Delete, word delete, selection, visual-line, buffer, and select-all actions.
- [x] Explicit prompt arrow movement bindings keep basic Left/Right/Up/Down navigation active under custom Textarea keybindings.
- [x] Slash command Enter execution opens local dialogs after deferring command handling past Textarea key processing.
- [ ] Full input editing keymap parity.

### Commands And Keymap

- [x] Command palette with filtering and disabled entries.
- [x] Leader key and OpenCode-like shortcuts for session/model/agent/theme/sidebar/copy/export/undo/redo.
- [x] Disabled command/select entries no longer execute.
- [x] Slash catalog exposes unshare, sidebar, activity, model cycle, conceal, and exit entries.
- [x] Slash autocomplete exposes disabled state and backend-missing descriptions for unavailable OpenCode parity commands such as `/docs`, `/mcp`, `/plugins`, `/provider`, and `/stash`.
- [x] Configurable user keymap loading via `LUMEN_TUI_KEYBINDINGS`, `.lumen/tui-keybindings.json`, or `lumen-tui-keybindings.json`.
- [x] Leader which-key overlay shows available configured leader commands and disabled state.
- [x] Command palette exposes additional OpenCode parity entries for docs, plugins, MCP control, provider login, prompt stash, model favorites, variants, and session child navigation as disabled when the backend is missing.
- [x] Command palette search includes command IDs, so OpenCode-style queries such as `docs` find parity entries.
- [x] Ready OpenCode command aliases are wired for `messages.copy`, `session.export`, `display_thinking`, and `tool_details`.
- [x] Full OpenCode command catalog parity.

### Dialogs And Interactive Requests

- [x] Select, input, confirm, model, agent, tool, status, help, rename, session, timeline, tree, fork dialogs.
- [x] Select dialogs and command palette support OpenCode-style Ctrl+P/N, PgUp/PgDn, and Home/End navigation aliases.
- [x] Activity dialog for tools, background agents, permission waits, and queued work.
- [x] Theme command opens a selectable theme dialog instead of blind toggling.
- [x] `ask_user` uses the standard extension UI contract instead of legacy custom TUI rendering.
- [x] Confirm requests render as a dedicated OpenCode-like approval prompt.
- [x] Active input/permission requests are mirrored into the session process panel and sidebar state.
- [x] Interaction answers and cancellations leave system status transcript entries.
- [x] Declined confirm prompts leave rejected transcript entries instead of generic cancellation entries.
- [x] Regression coverage verifies ask_user uses standard select/input UI paths and cancellation details.
- [x] `/permission` and command palette expose wired approval actions versus backend-limited OpenCode actions.
- [ ] OpenCode permission request backend parity with allow-once, allow-always, reject-with-message.
- [x] Fullscreen permission/question mode for runtime select/input/confirm interaction requests.

### Messages And Tools

- [x] Text, thinking, status/error, code fences, timestamps, tool blocks.
- [x] Diff rendering for tool details.
- [x] Tool-specific summaries for shell/read/write/edit/grep/glob/web/task/todo.
- [x] Core Lumen built-in summaries include bash/read/write/edit/grep/glob/find/ls/ask_user.
- [x] `ask_user` visual result block.
- [x] Consecutive read/search/list tool calls collapse into a compact ClaudeCodeRev-style activity line.
- [x] Running tools are exposed through runtime activity state and surfaced in the sidebar.
- [x] Interrupted running tools/tasks are marked as aborted instead of staying in a running state.
- [x] Permission/activity panels explicitly mark allow-once, allow-always, and reject-with-message as unimplemented when no backend exists.
- [x] Unknown or extension-provided tools fall back to structured Args/Details rendering when tool details are enabled.
- [x] Confirm rejection transcript is wired for current ExtensionUIContext confirm prompts.
- [ ] Rich permission blocks and backend rejected-permission transcript once a generic permission backend exists.
- [ ] Specialized renderers for every extension-provided tool.

### Sessions

- [x] List, switch, new, fork, tree navigation, tree navigation with summary.
- [x] Import session JSONL from command palette or `/import <path>`.
- [x] Delete saved sessions with confirmation while protecting the current session.
- [x] Undo previous message and redo restored branch behavior.
- [x] Copy last assistant, export HTML, export JSONL.
- [x] Share current session through GitHub CLI secret gist and copy the Lumen share URL.
- [x] Real unshare support with persisted gist tracking.
- [x] Richer session metadata UI through Session Info command/dialog.

### Footer And Sidebar

- [x] cwd, status, model, agent, tokens, toggles, saved session count, shortcuts.
- [x] Process panel for permission waiting, queued prompts/commands, and background task status.
- [x] Sidebar shows running tools, queued count, and background task count.
- [x] Status/help/sidebar expose ready, partial, disabled, and unimplemented capability states.
- [x] Status dialog exposes LSP configured/available/active counts and MCP config discovery.
- [x] MCP partial status lists discovered config files and declared server counts when runtime health is unavailable.
- [ ] Full LSP/MCP runtime health once those backends expose live server state.
- [x] More compact OpenCode-style footer density on narrow terminals.

### Agent Process Readability

- [x] Background `task`/`subagent` tools are promoted into a coordinator-style panel with status and summary.
- [x] Queued steering/follow-up messages are rendered above the prompt dock.
- [x] Read-only background agent/activity detail dialog inspired by ClaudeCodeRev coordinator panels.
- [x] Background agent panels explicitly show read-only status and disabled steering/task-abort affordances.
- [ ] Task steering/action parity with ClaudeCodeRev's coordinator agent panel.
- [x] Long-running shell/tool progress line with elapsed time and output line count.

## Verification Gates

- [x] `npx tsgo --noEmit --pretty false`
- [x] `npm run check`
- [x] `npx tsx ../../node_modules/vitest/dist/cli.js --run test/lumen-askuser.test.ts`
- [x] `npx tsx ../../node_modules/vitest/dist/cli.js --run test/agent-session-tui-runtime.test.ts`
- [x] Smoke: `cd packages/coding-agent; bun run src/cli.ts --tui` stays running.
- [x] Smoke: OpenCode-style prompt keymap expansion keeps TUI startup rendering at 120x32.
- [x] tmux keyboard capture: command palette query `docs` shows disabled OpenCode-style documentation entry with backend-missing explanation.
- [x] tmux keyboard capture: command palette accepts Ctrl+N and PgDn navigation without closing or corrupting layout.
- [x] tmux keyboard capture: `/docs` slash autocomplete shows disabled state and backend-missing explanation.
- [x] tmux keyboard capture: command palette query `display_thinking` finds the ready OpenCode alias.
- [x] Smoke: `LUMEN_TUI_KEYBINDINGS=<temp json>` startup stays running.
- [x] Real terminal capture at 80x24 and 120x32 through MSYS2 `tmux`.
- [x] tmux keyboard capture: footer compacts cwd/tokens/command hint at 80x24 and keeps full density at 120x32.
- [x] tmux keyboard capture: `Ctrl+X` opens the leader which-key overlay.
- [x] tmux keyboard capture: command palette search shows disabled `Unshare session` when no active tracked share exists.
- [x] tmux keyboard capture: shell mode runs `echo lumen-tui-smoke` and renders the shell tool block.
- [x] tmux keyboard capture: tree dialog opens and shows structured current branch/current leaf rows.
- [x] tmux keyboard capture: command palette opens Activity dialog without leaking query text into the prompt.
- [x] tmux keyboard capture: Ctrl+A then Ctrl+K clears a draft through Textarea editing bindings.
- [x] tmux keyboard capture: Ctrl+B then Ctrl+D edits `abc` to `ab`; Ctrl+H backspaces `abc` to `ab`.
- [x] tmux keyboard capture: Left then Delete edits `abc` to `ab`.
- [x] tmux keyboard capture: Status dialog shows LSP availability and MCP config discovery state.
- [x] tmux keyboard capture: `/un` slash autocomplete shows `/undo` and `/unshare`.
- [x] tmux keyboard capture: command palette query `approval` opens Permission Status with backend-limited actions.
- [x] tmux keyboard capture: `/permission` slash autocomplete and permission status dialog show backend-limited approval actions.
- [x] tmux keyboard capture: `/import <path>` shows fullscreen confirm interaction at 120x32 and 80x24.
- [x] tmux keyboard capture: `/session-info` opens metadata dialog with ID, cwd, messages, tree, tokens, model, agent, and runtime capabilities.
- [ ] Manual keyboard walkthrough for command palette, dialogs, tree navigation, undo/redo, ask_user, and shell mode.
