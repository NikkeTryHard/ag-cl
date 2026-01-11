# Upstream Investigation Report

> Generated: 2026-01-07
> Updated: 2026-01-11 (v2.0.0 release, new PRs #93-#96, new issues #88-#97, implemented fixes)
> Upstream: [badri-s2001/antigravity-claude-proxy](https://github.com/badri-s2001/antigravity-claude-proxy)
> Stars: 1,331 | Forks: 168 | Last Updated: 2026-01-11

---

## Version Tracking

| Project      | Version | Tag         | Notes                                    |
| ------------ | ------- | ----------- | ---------------------------------------- |
| **Upstream** | 2.0.0   | `v2.0.0`    | Major release with WebUI (PR #47)        |
| **ag-cl**    | 1.2.2   | `ag-v1.0.0` | TypeScript rewrite, different versioning |

### Upstream Release History

| Version | Date       | Key Changes                                     |
| ------- | ---------- | ----------------------------------------------- |
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

The upstream repository released **v2.0.0** with a major WebUI feature. There are **5 open PRs** and **6 open issues**. Key updates since last report:

### What's New in v2.0.0

| Feature                     | PR/Commit | Status                         |
| --------------------------- | --------- | ------------------------------ |
| **Web UI Dashboard**        | PR #47    | Not implementing (we have TUI) |
| **5xx Fallback**            | PR #90    | **IMPLEMENTED** ✅             |
| **Schema Uppercase**        | PR #83    | **IMPLEMENTED** ✅             |
| **Optimistic 429 Reset**    | PR #72    | **IMPLEMENTED** ✅             |
| **System Prompt Filtering** | 4c5236d   | **IMPLEMENTED** ✅             |
| **Daily Endpoint Fix**      | 5f6ce1b   | **IMPLEMENTED** ✅             |

### Implementation Status Summary

| Category                     | Count |
| ---------------------------- | ----- |
| Features we implemented      | 7     |
| Features skipped (WebUI)     | 1     |
| Open issues applicable to us | 2     |
| New PRs to review            | 3     |

---

## Open Pull Requests

### New PRs (Since Last Report)

| PR                                                                     | Title                                                            | Author       | Created    | Priority   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------ | ---------- | ---------- |
| [#96](https://github.com/badri-s2001/antigravity-claude-proxy/pull/96) | fix: ensure stopReason is set correctly based on finishReason    | @caozhiyuan  | 2026-01-11 | **REVIEW** |
| [#95](https://github.com/badri-s2001/antigravity-claude-proxy/pull/95) | feat(security): comprehensive security & reliability remediation | @midnightnow | 2026-01-10 | **REVIEW** |
| [#94](https://github.com/badri-s2001/antigravity-claude-proxy/pull/94) | feat(webui): Improve connection health checks and monitoring     | @jgor20      | 2026-01-10 | WebUI only |

### Existing Open PRs

| PR                                                                     | Title                                | Author         | Created    | Our Status      |
| ---------------------------------------------------------------------- | ------------------------------------ | -------------- | ---------- | --------------- |
| [#44](https://github.com/badri-s2001/antigravity-claude-proxy/pull/44) | feat: Add quota reset trigger system | @shivangtanwar | 2026-01-03 | **IMPLEMENTED** |
| [#15](https://github.com/badri-s2001/antigravity-claude-proxy/pull/15) | Map model/project 404s               | @jroth1111     | 2025-12-29 | Low priority    |

---

### PR #96: Fix stopReason Based on finishReason (NEW)

**Problem**: The `stopReason` field may not be set correctly based on Google's `finishReason` response, causing protocol compatibility issues.

**Our Status**: **REVIEW NEEDED** - Check if our response conversion handles all `finishReason` values correctly.

---

### PR #95: Security & Reliability Remediation (NEW)

**Problem**: Comprehensive security improvements including input validation, error handling, and reliability fixes.

**Our Status**: **REVIEW NEEDED** - May contain valuable security patterns to adopt.

---

## Recently Merged PRs

| PR                                                                     | Title                                                | Author           | Merged     | Our Status         |
| ---------------------------------------------------------------------- | ---------------------------------------------------- | ---------------- | ---------- | ------------------ |
| [#93](https://github.com/badri-s2001/antigravity-claude-proxy/pull/93) | fix: refactor frontend architecture for production   | @Wha1eChai       | 2026-01-11 | WebUI only         |
| [#90](https://github.com/badri-s2001/antigravity-claude-proxy/pull/90) | feat: fallback to alternate model on 5xx errors      | @tiagonrodrigues | 2026-01-10 | **IMPLEMENTED** ✅ |
| [#47](https://github.com/badri-s2001/antigravity-claude-proxy/pull/47) | feat: Add Web UI for account and quota management    | @Wha1eChai       | 2026-01-10 | Not implementing   |
| [#83](https://github.com/badri-s2001/antigravity-claude-proxy/pull/83) | fix: convert schema types to Google uppercase format | @tiagonrodrigues | 2026-01-09 | **IMPLEMENTED** ✅ |
| [#75](https://github.com/badri-s2001/antigravity-claude-proxy/pull/75) | docs: add instructions for multiple instances        | @ahmed0magdy     | 2026-01-09 | Documentation      |
| [#72](https://github.com/badri-s2001/antigravity-claude-proxy/pull/72) | fix: add optimistic reset for transient 429 errors   | @s21v1d9p        | 2026-01-08 | **IMPLEMENTED** ✅ |
| [#64](https://github.com/badri-s2001/antigravity-claude-proxy/pull/64) | fix: add retry mechanism for empty API responses     | @BrunoMarc       | 2026-01-08 | **IMPLEMENTED**    |

---

### PR #90: 5xx Fallback to Alternate Model (MERGED - IMPLEMENTED)

**Problem**: When all retries are exhausted with 5xx server errors, requests fail completely even when an alternate model family might be available.

**Solution**:

- Track whether all failures were 5xx errors
- On exhaustion, attempt fallback to configured alternate model
- Prevent infinite recursion with fallback flag

**Our Implementation**:

- Added `fallback-utils.ts` with `is5xxError()` and `shouldAttemptFallback()`
- Updated `message-handler.ts` and `streaming-handler.ts`
- Used discriminated union for type safety
- Added comprehensive tests

---

### PR #83: Schema Uppercase Conversion (MERGED - IMPLEMENTED)

**Problem**: `/compact` command fails with `Proto field is not repeating, cannot start list` error.

**Root Cause**: JSON Schema types (`array`, `object`, `string`) sent lowercase, but Google Cloud Code API expects uppercase protobuf types (`ARRAY`, `OBJECT`, `STRING`).

**Our Implementation**:

- Added `toGoogleType()` function in `schema-sanitizer.ts`
- Added Phase 5 to convert types to uppercase
- Applied to ALL models (not just Gemini)
- Added tests for uppercase conversion

---

### PR #72: Optimistic 429 Reset (MERGED - IMPLEMENTED)

**Problem**: False "No accounts available" errors due to timing race conditions after rate limit expiration.

**Solution**: Two-layer defense:

1. 500ms buffer delay after waiting
2. Optimistic reset that clears limiters if selection still fails

**Our Implementation**:

- Added `RATE_LIMIT_BUFFER_MS = 500` constant
- Added `optimisticReset()` function in `selection.ts`
- Applied in both handlers after buffer wait fails

---

### PR #47: Web UI Dashboard (MERGED - NOT IMPLEMENTING)

**Features**:

- Dashboard with Chart.js quota visualization
- Account management with OAuth
- Live server log streaming via SSE
- Settings with 4 tabs: Interface, Claude CLI, Models, Server Info
- i18n support (EN/zh_CN)
- Password protection (`WEBUI_PASSWORD` env var)
- Subscription tier detection (Free/Pro/Ultra)

**Our Status**: Not implementing - we have TUI (`npm run tui`) with similar functionality.

---

## Open Issues

### New Issues (Since Last Report)

| Issue                                                                    | Title                                            | Author           | Created    | Priority        |
| ------------------------------------------------------------------------ | ------------------------------------------------ | ---------------- | ---------- | --------------- |
| [#97](https://github.com/badri-s2001/antigravity-claude-proxy/issues/97) | [BUG] gemini-3-flash [1m] space in model name    | @user            | 2026-01-11 | Closed          |
| [#92](https://github.com/badri-s2001/antigravity-claude-proxy/issues/92) | [BUG] Frontend issue                             | @user            | 2026-01-11 | Closed (PR #93) |
| [#91](https://github.com/badri-s2001/antigravity-claude-proxy/issues/91) | [BUG] API Error 400 - tool use concurrency       | @KumarAnandSingh | 2026-01-10 | **INVESTIGATE** |
| [#88](https://github.com/badri-s2001/antigravity-claude-proxy/issues/88) | Documentation: Claude 500 on large conversations | @tiagonrodrigues | 2026-01-10 | Documentation   |

### Existing Open Issues

| Issue                                                                    | Title                                   | Author         | Created    | Our Status                 |
| ------------------------------------------------------------------------ | --------------------------------------- | -------------- | ---------- | -------------------------- |
| [#80](https://github.com/badri-s2001/antigravity-claude-proxy/issues/80) | [BUG] 403 error from Google API         | @UtkarshTheDev | 2026-01-09 | Needs investigation        |
| [#70](https://github.com/badri-s2001/antigravity-claude-proxy/issues/70) | BadRequest - MCP tool schema type       | @tanm-sys      | 2026-01-08 | **LIKELY FIXED** by PR #83 |
| [#68](https://github.com/badri-s2001/antigravity-claude-proxy/issues/68) | Bug: First request hangs after idle     | @parkjaeuk0210 | 2026-01-08 | **IMPLEMENTED** ✅         |
| [#67](https://github.com/badri-s2001/antigravity-claude-proxy/issues/67) | Bug: Compaction fails with Invalid JSON | @IrvanFza      | 2026-01-08 | **LIKELY FIXED** by PR #83 |
| [#39](https://github.com/badri-s2001/antigravity-claude-proxy/issues/39) | Dashboard interface                     | @chuanghiduoc  | 2026-01-03 | PR #47 addresses           |

---

### Issue #91: API Error 400 - Tool Use Concurrency (NEW)

**Problem**: 400 INVALID_ARGUMENT errors when using tool calls, possibly related to concurrent tool use.

**Our Status**: **INVESTIGATE** - May be related to schema conversion or concurrent request handling.

---

### Issue #68: First Request Hangs After Idle (IMPLEMENTED)

**Problem**: First request after idle period hangs indefinitely, requires ESC + retry.

**Root Cause**: OAuth fetch calls have no timeout. After token cache expires (5 min), the refresh call can hang forever on slow networks.

**Our Fix**:

- Added `fetchWithTimeout()` helper with `AbortController`
- Applied 15-second timeout to all OAuth calls
- Updated `refreshAccessToken()`, `discoverProject()`, `getUserEmail()`, `exchangeCode()`

---

## Recently Closed Issues

| Issue | Title                                   | Closed     | Resolution                        |
| ----- | --------------------------------------- | ---------- | --------------------------------- |
| #97   | gemini-3-flash [1m] space in model name | 2026-01-11 | User error                        |
| #92   | Frontend issue                          | 2026-01-11 | Fixed by PR #93                   |
| #89   | Auto-run antigravity if not running     | 2026-01-10 | Won't implement                   |
| #87   | Claude 500 on large conversations       | 2026-01-10 | Documentation                     |
| #85   | OpenAI Tool Calling for AI IDEs         | 2026-01-10 | Won't implement - use CLIProxyAPI |
| #84   | Google increased rate limits            | 2026-01-10 | Won't bypass limits               |
| #82   | /compact schema transformation error    | 2026-01-09 | Fixed by PR #83                   |
| #81   | Allow setting different port            | 2026-01-09 | Already works via PORT env        |
| #78   | 429 RESOURCE_EXHAUSTED on launch        | 2026-01-09 | Expected behavior                 |
| #76   | Filter internal system prompt           | 2026-01-09 | Discussed, we implemented         |
| #74   | Permission denied error                 | 2026-01-09 | Account-specific                  |

---

## Feature Gap Analysis

### Features We Implemented (From Upstream)

| Feature                     | Upstream Source           | Our Implementation                     | Status      |
| --------------------------- | ------------------------- | -------------------------------------- | ----------- |
| Schema uppercase conversion | PR #83                    | `schema-sanitizer.ts` Phase 5          | ✅ Complete |
| OAuth timeout               | Issue #68                 | `fetchWithTimeout()` helper            | ✅ Complete |
| Optimistic 429 reset        | PR #72                    | `selection.ts` + buffer delay          | ✅ Complete |
| Daily endpoint fix          | commit 5f6ce1b            | `constants.ts`                         | ✅ Complete |
| Enum stringification        | Issue #70                 | `schema-sanitizer.ts` Phase 4b         | ✅ Complete |
| System prompt filtering     | Issue #76, commit 4c5236d | `request-builder.ts` [ignore] tags     | ✅ Complete |
| 5xx fallback                | PR #90                    | `fallback-utils.ts` + handlers         | ✅ Complete |
| Empty response retry        | PR #64                    | `streaming-handler.ts`                 | ✅ Complete |
| Quota reset trigger         | PR #44                    | `/trigger-reset` endpoint              | ✅ Complete |
| --no-browser OAuth          | PR #50                    | `npm run accounts:add -- --no-browser` | ✅ Complete |

### Features We Have That Upstream Lacks

| Feature                  | Our Implementation                | Notes                |
| ------------------------ | --------------------------------- | -------------------- |
| TypeScript codebase      | Full TypeScript                   | Type safety          |
| Comprehensive test suite | Unit, fuzz, contract, chaos, etc. | 1,767 tests          |
| SQLite quota snapshots   | `quota-storage.ts`                | Persistent storage   |
| Burn rate calculation    | `burn-rate.ts`                    | Usage analytics      |
| TUI interface            | React/Ink                         | Alternative to WebUI |
| Discriminated unions     | `FallbackDecision` type           | Better type safety   |

### Features Upstream Has That We Skip

| Feature                          | Reason                      |
| -------------------------------- | --------------------------- |
| Web UI Dashboard                 | We have TUI alternative     |
| Alpine.js + TailwindCSS frontend | Not needed                  |
| Native module auto-rebuild       | Not applicable (TypeScript) |
| Usage history JSON               | We use SQLite               |

---

## Recommendations

### Completed ✅

1. **Schema Uppercase Conversion** (PR #83) - Done
2. **OAuth Timeout** (Issue #68) - Done
3. **Optimistic 429 Reset** (PR #72) - Done
4. **Enum Stringification** (Issue #70) - Done
5. **System Prompt Filtering** (Issue #76) - Done
6. **5xx Fallback** (PR #90) - Done
7. **Daily Endpoint Fix** - Done

### Action Required

1. **PR #96: stopReason Fix** - **REVIEW**
   - Check if our response conversion handles all `finishReason` values
   - Effort: ~30 min

2. **PR #95: Security Remediation** - **REVIEW**
   - Review for applicable security patterns
   - Effort: ~1 hour

3. **Issue #91: Tool Concurrency Bug** - **INVESTIGATE**
   - May affect our implementation
   - Effort: ~1 hour

### Low Priority

4. **PR #15: Map 404s with context**
   - We already warn in logs
   - Could improve error messages

---

## Sync Status

```
Current bookmark: upstream-synced
Upstream HEAD: a06cd30 (v2.0.0+)
Commits since bookmark: 47
```

**Commands**:

```bash
npm run upstream:status     # Show bookmark position vs upstream HEAD
npm run upstream:log        # Show new commits since last bookmark
npm run upstream:diff       # File-level summary of changes
npm run upstream:mark       # Update bookmark after review
```

---

## Changelog

### 2026-01-11

- Added Version Tracking section
- Updated for v2.0.0 release
- Added new PRs #93-#96
- Added new issues #88-#97
- Marked implemented features: 5xx fallback, schema uppercase, OAuth timeout, optimistic reset, system prompt filtering

### 2026-01-10

- Added PR #83 (schema uppercase)
- Added issues #80-#85
- Marked PR #72, #64 as implemented

### 2026-01-07

- Initial report generation
