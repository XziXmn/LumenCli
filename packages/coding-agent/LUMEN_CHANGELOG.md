# Lumen Changelog

## [0.75.5-lumen.1] - 2026-05-27

### Changed

- Core compaction now owns the default Codex-style summary bridge, replacement history rebuilding, branch summary defaults, and repeated-compaction notices.
- Removed the legacy project compaction extension shim after moving the default behavior into core.
- Added `compaction.thresholdPercent` so automatic compaction can trigger by context usage ratio, and exposed it in `/settings`.
- Adjusted interactive status copy so `thinking` state uses the English phrasing that fits the current mixed-language progress surface better.

### Upstream Base

- Based on Pi coding-agent `0.75.5`
- Local sync reference: `3fe2129e merge(main): 同步 pi 上游更新`
