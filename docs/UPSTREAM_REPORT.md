# Upstream Investigation Report

> Generated: 2026-01-07
> Updated: 2026-01-10 (deep investigation: PR comments, closed issues, code comparison)
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

The upstream repository released **v2.0.0** with a major WebUI feature. There are **5 open PRs** and **6 open issues**. Key finding from investigation:

### Critical Finding: stopReason Bug (PR #96 - CLOSED)

**UPDATE**: PR #96 was **closed without merging**. Maintainer acknowledged the bug but noted the proposed fix is incomplete:

> "The issue you identified is correct... However, `stopReason` is initialized to `'end_turn'` at line 30, so it's always truthy. The condition `!stopReason` will always be `false`."

**Correct Fix** (from maintainer):

1. Initialize `stopReason = null` (not `"end_turn"`)
2. Then `!stopReason` check works correctly
3. Must also handle `MAX_TOKENS` priority over `tool_use`

**Our Bug Location**: `src/cloudcode/sse-streamer.ts`:

- Line 144: `stopReason = "end_turn"` (same issue)
- Need to initialize to `null` for the fix to work

**Fix required**: Initialize `stopReason` to `null`, add `&& !stopReason` check.

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
| Features we implemented      | 11    |
| Features skipped (WebUI)     | 1     |
| Bugs affecting us (PR #96)   | 1     |
| Open issues to monitor       | 2     |
| Closed PRs with unfixed bugs | 2     |

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

### PR #96: Fix stopReason Based on finishReason (NEW - APPLIES TO US)

**Problem**: The `stopReason` field is incorrectly overridden when `finishReason === "STOP"`. If `stopReason` was set to `"tool_use"` earlier (line 291), it gets overwritten to `"end_turn"` (line 333).

**Impact**: Breaks multi-turn tool conversations. Claude Code expects `stopReason: "tool_use"` to know it should wait for tool results.

**Upstream Fix** (PR #96):

```javascript
// Before: if (firstCandidate.finishReason) {
// After:
if (firstCandidate.finishReason && !stopReason) {
```

**Our Bug Location**: `src/cloudcode/sse-streamer.ts` lines 329-335:

```typescript
// Line 291 sets: stopReason = "tool_use"
// But lines 329-335 can override it:
if (firstCandidate?.finishReason) {
  if (firstCandidate.finishReason === "MAX_TOKENS") {
    stopReason = "max_tokens";
  } else if (firstCandidate.finishReason === "STOP") {
    stopReason = "end_turn"; // BUG: Overwrites "tool_use"!
  }
}
```

**Our Status**: **FIX REQUIRED** - Same bug exists in our codebase.

---

### PR #95: Security & Reliability Remediation (NEW - NOT MERGED YET)

**Problem**: Comprehensive security improvements including input validation, error handling, and reliability fixes.

**Key Features**:

1. **Input Validation**: Strict validation for `/v1/messages` with model whitelisting
2. **Prototype Pollution Protection**: Blocks `__proto__`, `constructor`, `prototype` keys
3. **Error Sanitization**: Masks sensitive data (emails, tokens, paths) in errors
4. **Security Headers**: CSP, X-Frame-Options, X-Content-Type-Options
5. **Proactive Token Refresh**: Refreshes tokens 5 min before expiry
6. **Graceful Shutdown**: Tracks in-flight requests before shutdown

**Our Assessment**:

| Feature                 | Our Status                 |
| ----------------------- | -------------------------- |
| Input validation        | Partial (TypeScript types) |
| Prototype pollution     | Not implemented            |
| Error sanitization      | Not implemented            |
| Security headers        | Not implemented            |
| Proactive token refresh | Not implemented            |
| Graceful shutdown       | Not implemented            |

**Our Status**: **MONITOR** - Not merged yet. Consider adopting security patterns if merged.

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

### Historical Merged PRs (Pre-v2.0.0)

| PR  | Title                                                    | Merged     | Our Status                  |
| --- | -------------------------------------------------------- | ---------- | --------------------------- |
| #55 | fix(oauth): add UTF-8 encoding to callback HTML pages    | 2026-01-06 | **IMPLEMENTED** ✅          |
| #54 | feat: Add automatic native module rebuild                | 2026-01-06 | Not applicable (TypeScript) |
| #50 | feat: add --no-browser OAuth mode for headless servers   | 2026-01-04 | **IMPLEMENTED** ✅          |
| #41 | Feature/model fallback                                   | 2026-01-03 | **IMPLEMENTED** ✅          |
| #37 | Selective fixes: Model-specific rate limits & robustness | 2026-01-03 | **IMPLEMENTED** ✅          |
| #29 | Improve logging, rate limiting, and error handling       | 2026-01-01 | **IMPLEMENTED** ✅          |
| #13 | Add count_tokens stub                                    | 2025-12-29 | **IMPLEMENTED** ✅          |
| #1  | Add Linux support with cross-platform database path      | 2025-12-25 | **IMPLEMENTED** ✅          |

### PR #37: Model-Specific Rate Limits (MERGED - IMPLEMENTED)

**Key Features**:

1. **Per-model rate tracking**: `modelRateLimits[modelId]` instead of global
2. **Network error detection**: `isNetworkError()` with auto-retry
3. **Enhanced health endpoints**: `/health` and `/account-limits` with model quotas
4. **Validation**: `max_tokens > thinking_budget` with auto-adjustment

**Our Status**: All features implemented in our TypeScript codebase.

### PR #29: Logging & Rate Limit Improvements (MERGED - IMPLEMENTED)

**Key Features**:

1. **Logger utility**: Colored, structured logging with `--debug` mode
2. **Rate limit parsing**: `quotaResetDelay` and `quotaResetTimeStamp` formats
3. **5xx handling**: 1s wait before retry, failover on persistent errors
4. **Sticky account fix**: Prioritize available accounts over rate-limited sticky

**Our Status**: All features implemented.

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

### Issue #91: API Error 400 - Tool Use Concurrency (OPEN)

**Problem**: 400 INVALID_ARGUMENT errors when using parallel tool calls (multiple screenshots, agents, simultaneous Read/Bash operations).

**Error Message**: `API Error: 400 due to tool use concurrency issues. Run /rewind to recover.`

**Suspected Root Causes**:

1. **Tool ID handling**: `functionCall.id` only added for Claude models, but parallel tool result matching may be inconsistent
2. **Session ID collision**: `deriveSessionId()` creates single ID per message, may conflict with parallel calls
3. **SSE demultiplexing**: Stream parser may not correctly handle events from multiple parallel executions
4. **Signature cache conflicts**: Parallel tool calls may overwrite cached signatures

**Workaround**: Users can process operations sequentially instead of in parallel.

**Our Status**: **MONITOR** - No reports from our users yet. May share same issues if they use parallel tool calls.

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

### Notable Closed Issues (Deep Dive)

#### Issue #53: 1M Context Window for Gemini

**Problem**: Claude Code auto-compacts frequently because it assumes 200K context window.

**Solution**: Use `[1m]` suffix in model names (e.g., `gemini-3-pro-high [1m]`).

**Our Status**: Already documented in our README. Claude Code recognizes the suffix.

#### Issue #57: Sticky Account Cooldown

**Problem**: Users complained about 60-second wait when sticky account is rate-limited.

**Solution**: Reduced `DEFAULT_COOLDOWN_MS` from 60s to 10s.

**Our Status**: Already at 10 seconds in `constants.ts`.

#### Issue #61: Empty Response Retry

**Problem**: Frequent `[No response received from API]` errors stopping Claude Code mid-conversation.

**Root Cause**: Large `thinking_budget` (31999) causes model to think too long and return empty.

**Solution**: Added `EmptyResponseError` and retry mechanism (up to 2 retries).

**Our Status**: **IMPLEMENTED** - We have `EmptyResponseError` in `errors.ts` and retry logic.

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
| NativeModuleError class          | Not applicable (TypeScript) |

---

## Code Structure Comparison

### Known Bugs & Workarounds

| Bug                          | Upstream Status               | Our Status             | Workaround                       |
| ---------------------------- | ----------------------------- | ---------------------- | -------------------------------- |
| stopReason override (PR #96) | Closed without fix            | **NEEDS FIX**          | Initialize `stopReason = null`   |
| Image interleaving (PR #79)  | Closed without fix            | Same bug likely exists | Avoid multiple images in results |
| Tool concurrency (Issue #91) | Open                          | Monitoring             | Use sequential tool calls        |
| 403 PERMISSION_DENIED (#80)  | Account-specific              | N/A                    | Contact Google support           |
| Cross-model signature (#42)  | Closed (manual fix suggested) | **IMPLEMENTED** ✅     | `stripInvalidThinkingBlocks()`   |

### File Structure

| Upstream (JavaScript)              | Our Project (TypeScript)           | Notes               |
| ---------------------------------- | ---------------------------------- | ------------------- |
| `src/cloudcode/sse-streamer.js`    | `src/cloudcode/sse-streamer.ts`    | Same structure      |
| `src/cloudcode/session-manager.js` | `src/cloudcode/session-manager.ts` | Same logic          |
| `src/format/signature-cache.js`    | `src/format/signature-cache.ts`    | Same API            |
| `src/format/schema-sanitizer.js`   | `src/format/schema-sanitizer.ts`   | Same phases         |
| `src/format/thinking-utils.js`     | `src/format/thinking-utils.ts`     | Same functions      |
| `src/errors.js`                    | `src/errors.ts`                    | Same error classes  |
| `src/fallback-config.js`           | `src/cloudcode/fallback-utils.ts`  | Different approach  |
| `src/webui/index.js`               | N/A                                | We have TUI instead |

### Error Classes Comparison

| Error Class          | Upstream | Us  | Notes                          |
| -------------------- | -------- | --- | ------------------------------ |
| `AntigravityError`   | ✅       | ✅  | Base class                     |
| `RateLimitError`     | ✅       | ✅  | Same structure                 |
| `AuthError`          | ✅       | ✅  | Same structure                 |
| `NoAccountsError`    | ✅       | ✅  | Same structure                 |
| `MaxRetriesError`    | ✅       | ✅  | Same structure                 |
| `ApiError`           | ✅       | ✅  | Same structure                 |
| `EmptyResponseError` | ✅       | ✅  | Same structure                 |
| `NativeModuleError`  | ✅       | ❌  | Not needed (no native modules) |

### Key Functions Comparison

| Function                       | Upstream | Us  | Notes              |
| ------------------------------ | -------- | --- | ------------------ |
| `deriveSessionId()`            | ✅       | ✅  | Same logic         |
| `cacheSignature()`             | ✅       | ✅  | Same API           |
| `getCachedSignature()`         | ✅       | ✅  | Same API           |
| `cacheThinkingSignature()`     | ✅       | ✅  | Same API           |
| `getCachedSignatureFamily()`   | ✅       | ✅  | Same API           |
| `stripInvalidThinkingBlocks()` | ✅       | ✅  | Same logic         |
| `closeToolLoopForThinking()`   | ✅       | ✅  | Same logic         |
| `parseResetTime()`             | ✅       | ✅  | Same parsing logic |
| `isRateLimitError()`           | ✅       | ✅  | Same detection     |
| `isAuthError()`                | ✅       | ✅  | Same detection     |
| `isEmptyResponseError()`       | ✅       | ✅  | Same detection     |

### Constants Comparison

| Constant                     | Upstream        | Us                   | Notes                    |
| ---------------------------- | --------------- | -------------------- | ------------------------ |
| `DEFAULT_COOLDOWN_MS`        | 10s (config)    | 10s                  | ✅ Match                 |
| `MAX_RETRIES`                | 5 (config)      | 5                    | ✅ Match                 |
| `MAX_EMPTY_RESPONSE_RETRIES` | 2               | 2 (env configurable) | ✅ Match (we add config) |
| `MAX_WAIT_BEFORE_ERROR_MS`   | 120000 (config) | 120000               | ✅ Match                 |
| `TOKEN_REFRESH_INTERVAL_MS`  | 5min (config)   | 5min                 | ✅ Match                 |
| `GEMINI_SIGNATURE_CACHE_TTL` | 2 hours         | 2 hours              | ✅ Match                 |
| `MIN_SIGNATURE_LENGTH`       | 50              | 50                   | ✅ Match                 |
| `GEMINI_MAX_OUTPUT_TOKENS`   | 16384           | 16384                | ✅ Match                 |
| `RATE_LIMIT_BUFFER_MS`       | N/A             | 500                  | We added this            |
| `RETRY_DELAY_MS`             | N/A             | 1000                 | We extracted constant    |
| `OAUTH_FETCH_TIMEOUT_MS`     | N/A             | 15000                | We added timeout         |
| `AUTO_REFRESH_INTERVAL_MS`   | N/A             | 5 hours              | We added auto-refresh    |

### Features Unique to Us

| Feature                    | Implementation              | Notes                          |
| -------------------------- | --------------------------- | ------------------------------ |
| Scheduling modes           | `VALID_SCHEDULING_MODES`    | sticky, refresh-priority, etc. |
| SQLite quota storage       | `quota-storage.ts`          | Persistent snapshots           |
| Burn rate calculation      | `burn-rate.ts`              | Usage analytics                |
| TUI interface              | React/Ink                   | Alternative to WebUI           |
| TypeScript types           | Full type safety            | Better DX                      |
| Comprehensive test suite   | 1,767 tests                 | Unit, fuzz, contract, etc.     |
| Discriminated unions       | `FallbackDecision` type     | Type-safe decisions            |
| Configurable empty retries | `MAX_EMPTY_RETRIES` env var | Flexibility                    |

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
8. **UTF-8 Charset in OAuth** (commit df9b935) - Already implemented
9. **10s Cooldown** (Issue #57) - Already at 10 seconds
10. **Empty Response Retry** (Issue #61) - Already implemented
11. **Cross-Model Signature Handling** (PR #42) - Already implemented via `stripInvalidThinkingBlocks()`

### Action Required

1. **PR #96: stopReason Override Bug** - **HIGH PRIORITY**
   - Our `sse-streamer.ts` has the same bug
   - Initialize `stopReason = null` (not `"end_turn"`)
   - Add `&& !stopReason` check before setting stopReason
   - Consider `MAX_TOKENS` priority over `tool_use`
   - Breaks multi-turn tool conversations if not fixed

### Monitor

2. **Issue #91: Tool Concurrency** - **MONITORING**
   - No reports from our users yet
   - Watch for 400 errors with parallel tool calls

3. **PR #95: Security Remediation** - **CLOSED (not merged)**
   - Was closed without merging
   - Contains good patterns we could adopt independently:
     - Prototype pollution protection
     - Error sanitization
     - Proactive token refresh
     - Security headers

4. **PR #79: Image Interleaving Bug** - **MONITORING**
   - Multiple `tool_result` with images cause 400 errors
   - Not yet fixed upstream (PR was closed without proper solution)
   - Watch for similar issues with our users

### Low Priority

5. **PR #15: Map 404s with context**
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

### 2026-01-10 (exhaustive investigation)

- Added Historical Merged PRs section (PRs #1-#55)
- Added Known Bugs & Workarounds table
- Added Constants Comparison table (all values match upstream)
- Added Features Unique to Us section
- Documented PR #37 (model-specific rate limits) - all features implemented
- Documented PR #29 (logging improvements) - all features implemented
- Issue #80 (403 errors) - account-specific, not a proxy bug
- Updated Implementation Status to 15+ features

### 2026-01-10 (deep investigation)

- **PR #96 update**: Closed without merging - maintainer identified fix is incomplete
  - Must initialize `stopReason = null` (not `"end_turn"`) for `!stopReason` check to work
  - Must handle `MAX_TOKENS` priority over `tool_use`
- **PR #95 update**: Also closed without merging
- **PR #79**: Image interleaving bug - closed without proper fix, still an issue
- Analyzed 30+ closed issues for patterns and insights
- Confirmed we already have: 10s cooldown, empty response retry, cross-model handling
- Added 3 more items to completed list (now 11 total)
- Added PR #79 to monitoring list

### 2026-01-10 (continued)

- Deep investigation of PR #96 - **confirmed same bug in our `sse-streamer.ts`**
- Analyzed PR #95 security features (not merged yet)
- Investigated Issue #91 tool concurrency - documented suspected causes
- Confirmed UTF-8 charset already implemented in our oauth.ts
- Confirmed cooldown already at 10 seconds (matching upstream)
- Updated all recommendations with priority levels

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
