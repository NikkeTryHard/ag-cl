# Upstream Investigation Report

> Generated: 2026-01-07

## Navigation

| Document                                | Description                                 |
| --------------------------------------- | ------------------------------------------- |
| [PRs & Issues](prs-issues.md)           | Open/merged PRs, open/closed issues         |
| [Feature Analysis](feature-analysis.md) | Feature gap analysis, code structure        |
| [Deep Comparison](deep-comparison.md)   | Code comparison, limitations, insights      |
| [Improvements](improvements.md)         | Potential improvements, additional features |
| [Modules](modules.md)                   | All module-by-module comparisons            |
| [Tracking](tracking.md)                 | New PRs, changelog                          |
| [Testing](testing.md)                   | Test coverage comparison                    |

---

> Updated: 2026-01-11 (test coverage comparison, upstream modules analysis, dependency comparison)
> Upstream: [badri-s2001/antigravity-claude-proxy](https://github.com/badri-s2001/antigravity-claude-proxy)
> Stars: 1,331 | Forks: 168 | Last Updated: 2026-01-11

---

## Version Tracking

| Project      | Version | Tag         | Notes                                    |
| ------------ | ------- | ----------- | ---------------------------------------- |
| **Upstream** | 2.0.1   | `v2.0.1`    | stopReason fix (325acdb), WebUI health   |
| **ag-cl**    | 1.2.2   | `ag-v1.0.0` | TypeScript rewrite, different versioning |

### Upstream Release History

| Version | Date       | Key Changes                                     |
| ------- | ---------- | ----------------------------------------------- |
| v2.0.1  | 2026-01-11 | stopReason fix (325acdb), WebUI health (PR #94) |
| v2.0.0  | 2026-01-10 | WebUI dashboard (PR #47), 5xx fallback (PR #90) |
| v1.2.16 | 2026-01-09 | Schema uppercase fix (PR #83), tests            |
| v1.2.15 | 2026-01-09 | System prompt filtering (commit 4c5236d)        |
| v1.2.14 | 2026-01-08 | Optimistic 429 reset (PR #72)                   |
| v1.2.13 | 2026-01-08 | Daily endpoint URL fix                          |
| v1.2.12 | 2026-01-08 | Empty response retry (PR #64)                   |

### Version Compatibility Notes

- Upstream uses `v*` tags; we use `ag-v*` prefix to avoid confusion
- Our versioning is independent (TypeScript rewrite diverged at v1.0.0)
- We track upstream via `upstream-synced` bookmark tag

---

## Executive Summary

The upstream repository released **v2.0.1** with the critical stopReason fix. There are **4 open PRs** and **6 open issues**. Key finding from investigation:

### Critical Finding: stopReason Bug (FIXED in v2.0.1)

**UPDATE**: The maintainer fixed this bug in commit `325acdb` (v2.0.1). The fix:

1. Initialize `stopReason = null` (not `"end_turn"`)
2. Add `&& !stopReason` check before setting from finishReason
3. Use `stopReason || 'end_turn'` when emitting message_delta

**Commit message**:

> fix: preserve tool_use stop reason from being overwritten by finishReason
>
> When a tool call is made, stopReason is set to 'tool_use'. However, when
> finishReason: STOP arrives later, it was overwriting stopReason back to
> 'end_turn', breaking multi-turn tool conversations in clients like OpenCode.

**Our Bug Location**: `src/cloudcode/sse-streamer.ts`:

- In streaming response handler: `stopReason = "end_turn"` → needs to be `null`
- In message completion logic: Missing `&& !stopReason` check
- In final response: `stopReason` → needs to be `stopReason || "end_turn"`

**Status**: **IMPLEMENTED** ✅ - Same fix applied to our `sse-streamer.ts`.

### What's New in v2.0.1

| Feature                     | PR/Commit | Status                         |
| --------------------------- | --------- | ------------------------------ |
| **stopReason fix**          | 325acdb   | **IMPLEMENTED** ✅             |
| **WebUI health checks**     | PR #94    | Not implementing (we have TUI) |
| **Web UI Dashboard**        | PR #47    | Not implementing (we have TUI) |
| **5xx Fallback**            | PR #90    | **IMPLEMENTED** ✅             |
| **Schema Uppercase**        | PR #83    | **IMPLEMENTED** ✅             |
| **Optimistic 429 Reset**    | PR #72    | **IMPLEMENTED** ✅             |
| **System Prompt Filtering** | 4c5236d   | **IMPLEMENTED** ✅             |
| **Daily Endpoint Fix**      | 5f6ce1b   | **IMPLEMENTED** ✅             |

### Implementation Status Summary

| Category                     | Count |
| ---------------------------- | ----- |
| Features we implemented      | 12    |
| Features skipped (WebUI)     | 1     |
| Bugs fixed (stopReason)      | 1     |
| Open issues to monitor       | 2     |
| Closed PRs with unfixed bugs | 1     |

---
