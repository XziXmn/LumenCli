# Upstream Intake Dry-Run — 2026-05-12

Policy reference: `Docs/specs/2026-05-12-upstream-intake-policy.md`
Trigger type: **Scheduled (dry-run, policy calibration)**
Scope: all runtime tracking set packages + light design sweep
Status: **Complete — decision: Skip (no new npm version available)**

## 0. Purpose

First application of `upstream-intake-policy.md` after it was landed in commit `09a5ec6`. Goal is two-fold:

1. Exercise the §4 flow on an actual (if empty) intake window to validate the checklist.
2. Establish a baseline snapshot of upstream state so the next Scheduled window has a known starting point.

No code changes are expected unless the flow surfaces something urgent.

## 1. Baseline

| Field | Value |
| --- | --- |
| LumenCli HEAD at start | `09a5ec6` (`main`) |
| Last successful `smoke:all` | `09a5ec6`, 2026-05-12 (14 smoke passing) |
| Bun runtime | 1.3.13 |
| Platform | Windows x64 |

### Current runtime tracking set versions

| Package | Pinned version | Latest on npm | Latest publish |
| --- | --- | --- | --- |
| `@earendil-works/pi-ai` | `0.74.0` | `0.74.0` | 2026-05-07 |
| `@earendil-works/pi-agent-core` | `0.74.0` | `0.74.0` | 2026-05-07 |
| `typebox` | `1.1.38` | `1.1.38` | 2026-05-06 |

All three match. **No npm version delta to ingest.**

## 2. Upstream change identification

### 2.1 npm registry

Queried `https://registry.npmjs.org/@earendil-works/pi-ai`, `.../pi-agent-core`, `.../pi-coding-agent`, `.../pi-tui`, `.../typebox` on 2026-05-12.

Result: every package's `latest` tag is the same version we pin.

### 2.2 Git commits since 0.74.0 tag

Upstream repo: `earendil-works/pi` (alias of `badlogic/pi-mono`). Queried GitHub API for recent commits on `main`. Window: 2026-05-07 → 2026-05-11.

Roughly ~24 commits beyond the 0.74.0 publish, **none of which are on npm yet**. Classified against our surface:

| Commit | Date | Class | Relevance |
| --- | --- | --- | --- |
| `3d9e14d` fix(compaction): clamp summary output tokens (#4390) | 2026-05-11 | 🟡 Behavior change | pi-agent-core's compaction. Relevant when **P4** lands compaction integration. Not impacting current code. |
| `c0f416a` feat(agent): add harness stream configuration | 2026-05-10 | 🟢 Additive | AgentHarness-level. LumenCli uses `Agent` class directly, **not** AgentHarness. No impact. |
| `f8d0fa6` fix(coding-agent): share theme across package scopes | 2026-05-10 | 🔵 Internal | pi-coding-agent only. Not a dependency of LumenCli. |
| `f6b6b1f` fix(ai): respect proxy envs in bun's websocket (#4354 / #4346) | 2026-05-10 | 🟢 Bugfix | **Relevant for Bun runtime on Windows with corporate proxies**. LumenCli is private local use with direct mimo API; current environment doesn't hit this bug. Worth tracking. |
| `cb3c42e` fix(ai): add session affinity and compat fixes for Fireworks provider | 2026-05-10 | 🟢 Bugfix | Fireworks-only provider fix. LumenCli uses OpenAI-compatible → mimo, not Fireworks. No impact. |
| `79db9d6` + `e25415d` + `322759a` + `401017a` + `f13e6a8` refactor(agent): harness resource/turn state/formatting | 2026-05-09/10 | 🔵 Internal | AgentHarness internals. We use `Agent` class directly. No impact. |
| `7adb8e7` feat(ai): add Together AI provider | 2026-05-08 | 🟢 Additive | New provider. Relevant if S1.10 multi-provider routing decides to support Together AI. No current impact. |
| `9751057` feat: image content | 2026-05-08 | 🟢 Additive | Image content support at pi-ai level. LumenCli already handles vision through mimo-v2.5-pro. Will be useful when S1.10 capability slots and vision input plumb through uniformly. |
| `91bacac` fix(coding-agent): show Option key on macOS | 2026-05-08 | 🔵 Internal | pi-coding-agent only + macOS only. Not our dep, not our platform. |
| `3d5cbe9` feat(tui): wrap list items with indent | 2026-05-08 | 🔵 Internal | pi-tui only. We use OpenTUI. No impact. |
| Various `docs`, `chore`, `test` commits | 2026-05-08/10 | 🔵 Internal | No behavior impact. |

No 🔴 breaking changes identified.

### 2.3 Design tracking set — light sweep

Time-boxed to 30 minutes; did **not** pull external repos. Sources:

- `references/codex/` (local clone at prior commit) — already fully documented in Reference Usage Policy §6.6 and `pi-powered-runtime-strategy.md` §5. No new design inspection this window; next Scheduled window will pick up codex-rs recent changes.
- `references/opencode/` (local clone) — no pass this window.
- `references/oh-my-pi/` (local clone) — no pass this window.
- `openclaw/openclaw` — not cloned; cited as architecture validation sample only (see `pi-powered-runtime-strategy.md` §5). License core still **待 sweep 核对**; flagged as a lingering action item (see §6).

## 3. Decision

Per policy §4.2, each intake must resolve to one of three outcomes:

**Decision: 3 — Skip / defer**

Rationale:

- **No npm version delta**. Our pinned `0.74.0` matches the latest published. Upgrading to a "tip of main" git SHA is not in scope for dependency-first tracking and would violate version pin discipline (§4.3).
- The only Bun-relevant fix (`fix(ai): respect proxy envs in bun's websocket`) doesn't affect LumenCli's current path (direct HTTP to mimo on local network).
- The compaction fix (`#4390`) lands at a layer we haven't integrated yet (compaction is part of P4). Policy §4.2 calls for evaluating cost/value at integration time, not pre-emptively.
- No 🔴 breaking changes; no security fixes.

Next re-evaluation trigger:

- **Pi 0.75.x published** — triggers full Scheduled intake.
- **Before P4 starts** — pull in the compaction fix as a dedicated Opportunistic intake.
- **If any user reports proxy-related failures** — triggers Patch intake for `fix(ai): respect proxy envs in bun's websocket`.

## 4. Actions taken

- None at the code level.
- Updated `upstream-intake-policy.md` §2.1 `当前版本 pin` column? **No**, values unchanged.
- This log file written.
- No `package.json` modification, no `bun install`, no new commit required for the intake itself (only this log, which ships with the next commit).

## 5. Learnings / policy calibration

Observations about the policy from walking through §4 in practice:

1. **§4.1 "记录当前 baseline" was fast** — `git log --oneline -1` + checking package.json version pins was ~30 seconds. Good.
2. **§4.1 "识别上游变化" had friction**: the `@earendil-works/pi-mono` repo has been renamed to `earendil-works/pi`, so API calls must use the canonical repo name. **Policy improvement**: record the canonical upstream repo URL in §2.1 table alongside the npm package names. Proposed diff to policy §2.1:
   > Add column `Upstream repo` with value `https://github.com/earendil-works/pi` (alias: `badlogic/pi-mono`).
3. **§4.2 "决策三选一" worked cleanly** — the binary "upstream has new npm version" filter immediately routes to decision 3 when the answer is no. This is the 90% case and the policy handles it efficiently.
4. **§5 Design Sweep** — the 2-hour time box felt right. This window I spent <10 minutes on design sweep because it's a dry-run; real Scheduled windows should allocate more.
5. **§8 Scoped Vendor** — not exercised. First real opportunity will be when we need to borrow something pi has but doesn't publicly export.
6. **§9 KPI** — "Adapter-only discipline: consecutive ≥ 3 intakes with zero product-layer changes" — this dry-run counts as **1/3**. If the next two Scheduled windows also land without product-layer touches, we've validated the architecture.

**Policy diff proposed**:

- Add `Upstream repo` column to §2.1 Runtime tracking set table.
- Add a sentence near §4.1 step 3 explicitly reminding to verify canonical repo name (because maintainer renames happen).

Will land those diffs in a follow-up commit rather than amending this log after the fact.

## 6. Open tracking items for the next intake

Carry forward to the next Scheduled window:

1. **Verify license of `openclaw/openclaw`** — referenced as architecture sample in spec but license not yet confirmed by local inspection. Needed before any further citation.
2. **Watch for Pi 0.75.x release** — contains at least the compaction fix and harness stream additive.
3. **Watch for typebox 1.2.x** — currently no signal of major version bump.
4. **Consider whether Together AI provider could slot into LumenCli's capability-slot design (S1.10)** — just a bookmark, not an action.

## 7. Commit strategy

This intake log ships as part of a broader commit that also includes:

- The policy diff (§5 item 2): add `Upstream repo` column to §2.1 and the reminder sentence.
- S1.6 work that follows in the same session (separate commit, separate concern).

---

End of dry-run log.
