---
name: pi-config-migration
description: Use when migrating a project or user setup from legacy .pi configuration into .lumen, especially for first-run import prompts, extension/plugin compatibility checks, path rewriting, or one-time config transfer without keeping .pi as a runtime fallback.
---

# Pi Config Migration

## Overview

Migrate legacy `pi` configuration into Lumen by copying usable assets from `.pi` to `.lumen`, rewriting paths where needed, and avoiding any design that keeps `.pi` as a long-term runtime fallback.

Core rule: `.lumen/` is the only live config surface. `.pi/` is only a migration source.

## Use This Skill For

- Designing or implementing first-run import prompts from `.pi` to `.lumen`
- Migrating user-level config from `~/.pi/agent/` into `~/.lumen/agent/`
- Migrating project-level config from `<cwd>/.pi/` into `<cwd>/.lumen/`
- Auditing whether current runtime still reads legacy `.pi` paths
- Installing or adapting old `pi` extensions/plugins into Lumen
- Rewriting settings, manifests, or package entries that still assume `.pi`

Do not use this skill for ordinary extension authoring or unrelated config cleanup.

## Migration Policy

Always preserve this policy:

1. `.lumen/` is the only official runtime config directory.
2. `.pi/` must not stay in the runtime read path after migration is implemented.
3. Legacy assets are copied or transformed into `.lumen/`.
4. If something cannot be safely migrated automatically, surface it clearly and ask the user.

## What To Migrate

Usually migrate these if present:

- `settings.json`
- `models.json`
- `auth.json` / legacy auth material
- `extensions/`
- `skills/`
- `prompts/`
- `themes/`
- `agents/`
- `rules/`
- `SYSTEM.md`
- `APPEND_SYSTEM.md`
- `lsp.json`
- package/resource settings that reference local extension paths

Usually do not blindly migrate:

- stale caches
- temporary session artifacts
- generated lock/debug files
- binaries/tool caches unless the runtime explicitly still needs them

## Path-Rewrite Rules

When migrating config content, check for path semantics:

- Rewrite project-local `.pi/...` assumptions to `.lumen/...`
- Rewrite user-level `~/.pi/agent/...` assumptions to `~/.lumen/agent/...`
- Recompute relative paths if the base directory changes
- Keep package source strings intact unless they embed literal `.pi` paths

Be especially careful with:

- `settings.json` resource arrays
- package manager source filters
- extension manifests
- LSP config paths
- custom command/prompt directories

## Extension / Plugin Adaptation

For a legacy `pi` extension/plugin, classify it before migrating:

### 1. Directly usable

Usually safe if it only depends on:

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `typebox`
- ordinary Node built-ins

Action:

- copy into `.lumen/extensions/`
- update docs/examples if needed

### 2. Needs lightweight adaptation

Common reasons:

- hardcoded `.pi` paths
- user messages or docs still say `pi`
- assumes old widget/status placement semantics
- expects resources under `.pi/*`

Action:

- copy into `.lumen/extensions/`
- rewrite config path assumptions
- adjust wording and placement semantics
- run targeted verification

### 3. Needs AI-assisted rewrite

Common reasons:

- depends on `oh-my-pi`-specific modules
- depends on Bun-only APIs
- depends on `@oh-my-pi/pi-utils` / `pi-natives`
- assumes incompatible session/runtime internals

Action:

- do not install as-is
- have the AI generate an adapted Lumen-native version
- keep the original as reference only

## First-Run Import Prompt

If implementing startup import UX, prefer this behavior:

1. Detect whether `.lumen/` is missing or substantially empty.
2. Detect whether `.pi/` contains migratable config.
3. Prompt once whether to import now.
4. If accepted:
   - copy/transform assets into `.lumen/`
   - report what was migrated
   - report any items that need manual review
5. If declined:
   - do not silently keep reading `.pi/`
   - remind the user how to import later

Good prompt shape:

- explain that `.pi/` is legacy config
- explain that Lumen now uses `.lumen/`
- offer import, skip, or inspect

## Recommended Execution Flow

1. Inventory legacy `.pi` files.
2. Classify each file as copy, transform, skip, or manual-review.
3. Migrate into `.lumen/`.
4. Rewrite embedded path references.
5. Verify Lumen can run without runtime `.pi` fallback.
6. For extensions/plugins, classify as direct / light-adapt / AI-rewrite.
7. Run targeted checks after code changes.

## Verification

After code changes related to migration, prefer:

```bash
npx tsc -p tsconfig.extensions.json --noEmit
npm run check
```

If extensions, resource loading, or interactive behavior changed, also run the relevant targeted tests for those surfaces.

## Common Mistakes

- Keeping `.pi/` in runtime discovery "just in case"
- Copying files without rewriting internal path references
- Treating every old extension as directly installable
- Migrating caches and noise instead of real config
- Documenting `.lumen/` as primary while code still reads `.pi/`
- Letting migration logic and runtime fallback coexist indefinitely

## Output Expectations

When using this skill, the final result should state:

- what was migrated or changed
- whether runtime `.pi` fallback still exists
- which legacy extensions/plugins were directly usable
- which ones required adaptation
- any remaining manual follow-up
