# Upstream Version Map

记录 Lumen 当前用户可见版本口径对应的 Pi 上游基线，避免把上游 changelog 直接当成 Lumen changelog 展示。

## Current Mapping

| Lumen visible changelog version | Upstream Pi base | Notes |
|---|---|---|
| `0.75.5-lumen.1` | `packages/coding-agent@0.75.5` | Includes the upstream sync merged at commit `3fe2129e` plus Lumen-specific interactive / compatibility / compaction changes |

## Scope Notes

- `LUMEN_CHANGELOG.md` is the user-facing changelog shown by the interactive UI.
- Upstream Pi changelog entries are no longer shown directly as if they were Lumen release notes.
- When Lumen keeps the same upstream base but adds local behavior, the visible Lumen version stays on the `-lumen.N` track until the next upstream sync changes the base.
