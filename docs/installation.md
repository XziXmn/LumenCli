# Installation

## Requirements

- **Node.js** 20+ (Node 22 LTS or Node 24 recommended)
- **Git** (required for snapshot, worktree, commit, repo tools)
- **Windows / macOS / Linux**

Optional but recommended:
- **ripgrep** (`rg`) — auto-downloaded on first use if missing
- **typescript-language-server** — for LSP support on TypeScript projects
- **pyright** — for LSP support on Python projects
- **gopls** — for LSP support on Go projects
- **rust-analyzer** — for LSP support on Rust projects

## From Source (Development)

```bash
git clone https://github.com/XziXmn/LumenCli.git
cd LumenCli
npm install
```

Run from source:

```bash
# Windows
.\lumen-test.ps1

# macOS / Linux
./lumen-test.sh
```

## Configuration

Lumen reads config from (in priority order):

1. `.lumen/` in current directory (project-level)
2. `.pi/` in current directory (legacy fallback)
3. `~/.lumen/agent/` (user-level)

### Basic Configuration

Create `.lumen/settings.json`:

```json
{
  "defaultModel": "xiaomi-token-plan-sgp/mimo-v2.5-pro",
  "defaultThinkingLevel": "medium"
}
```

### Model Presets

Create `.lumen/presets.json`:

```json
{
  "default": "mimo",
  "presets": {
    "mimo": {
      "description": "MiMo primary with Claude vision fallback",
      "primary": "xiaomi-token-plan-sgp/mimo-v2.5-pro",
      "vision": "anthropic/claude-sonnet-4-6",
      "thinking": "anthropic/claude-opus-4-7:high"
    },
    "fast": {
      "description": "Groq for fast iteration",
      "primary": "groq/openai/gpt-oss-120b"
    }
  }
}
```

Activate at runtime: `/preset mimo`. See `docs/preset-routing.md` for details.

### API Keys

Set environment variables or use `/login`:

```bash
# Windows PowerShell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
$env:XIAOMI_API_KEY = "..."

# Unix
export ANTHROPIC_API_KEY="sk-ant-..."
```

Supported keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `XIAOMI_API_KEY`, `DEEPSEEK_API_KEY`, and 20+ more. See `packages/ai/src/env-api-keys.ts` for the full list.

### LSP Servers (optional)

Install language servers you need:

```bash
# TypeScript / JavaScript
npm install -g typescript-language-server typescript

# Python
pip install pyright

# Go
go install golang.org/x/tools/gopls@latest

# Rust
rustup component add rust-analyzer
```

Override / extend defaults via `.lumen/lsp.json`:

```json
{
  "servers": {
    "typescript-language-server": {
      "warmupTimeoutMs": 20000
    }
  },
  "idleTimeoutMs": 600000
}
```

## Verification

Run the test suites:

```bash
# Unit tests
npx tsx scripts/deep-test.mjs

# LSP E2E (mock server)
npx tsx scripts/test-lsp-e2e.mjs

# Type check
npx tsgo --noEmit

# Lint
npx biome check .
```

## Environment Variables

| Variable | Effect |
|---|---|
| `LUMEN_OFFLINE=1` | Disable all network calls (web search, model downloads) |
| `LUMEN_TELEMETRY=0` | Disable telemetry |
| `LUMEN_DISABLE_EXTERNAL_CONFIG=1` | Skip discovery of `.claude/`, `.cursor/`, etc. |
| `LUMEN_MEMORY_PATH` | Override path to `memory.jsonl` |
| `LUMEN_HASHLINE_ALGO` | Hash algorithm (md5 default; any `node:crypto` algo) |
| `GITHUB_TOKEN` / `GH_TOKEN` | For `code_search` tool (higher rate limit) |

## Troubleshooting

**"No bash shell found"** (Windows): install Git for Windows, or use the `powershell` tool instead.

**LSP hang on first run**: language servers can take 10-30s to index large projects. Increase `warmupTimeoutMs` in `.lumen/lsp.json`.

**Memory inject too much noise**: lower the relevance threshold by editing `lumen-memory.ts` `MIN_SCORE` constant (default 3), or use `/memory consolidate` to merge old entries.
