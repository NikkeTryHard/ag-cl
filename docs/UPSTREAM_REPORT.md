# Upstream Investigation Report

> Generated: 2026-01-07
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

- Line 144: `stopReason = "end_turn"` → needs to be `null`
- Lines 328-335: Missing `&& !stopReason` check
- Line 364: `stopReason` → needs to be `stopReason || "end_turn"`

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

## Open Pull Requests

### New PRs (Since Last Report)

| PR                                                                       | Title                                                            | Author       | Created    | Priority       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------ | ---------- | -------------- |
| [#101](https://github.com/badri-s2001/antigravity-claude-proxy/pull/101) | feat(webui): Comprehensive UI enhancements, responsive design    | @jgor20      | 2026-01-11 | OPEN (WebUI)   |
| [#99](https://github.com/badri-s2001/antigravity-claude-proxy/pull/99)   | Add "Restore Default Claude CLI" button to web console settings  | @simon-ami   | 2026-01-11 | MERGED (WebUI) |
| [#95](https://github.com/badri-s2001/antigravity-claude-proxy/pull/95)   | feat(security): comprehensive security & reliability remediation | @midnightnow | 2026-01-10 | CLOSED         |

### Existing Open PRs

| PR                                                                     | Title                                | Author         | Created    | Our Status      |
| ---------------------------------------------------------------------- | ------------------------------------ | -------------- | ---------- | --------------- |
| [#44](https://github.com/badri-s2001/antigravity-claude-proxy/pull/44) | feat: Add quota reset trigger system | @shivangtanwar | 2026-01-03 | **IMPLEMENTED** |
| [#15](https://github.com/badri-s2001/antigravity-claude-proxy/pull/15) | Map model/project 404s               | @jroth1111     | 2025-12-29 | Low priority    |

---

### PR #96: stopReason Bug (MERGED via commit 325acdb)

**Status**: The original PR was closed, but maintainer fixed the bug directly in commit `325acdb`.

**The Fix** (from upstream commit):

```diff
-let stopReason = 'end_turn';
+let stopReason = null;

-if (firstCandidate.finishReason) {
+if (firstCandidate.finishReason && !stopReason) {

-delta: { stop_reason: stopReason, stop_sequence: null },
+delta: { stop_reason: stopReason || 'end_turn', stop_sequence: null },
```

**Our Status**: **IMPLEMENTED** ✅ - Same fix applied to our `sse-streamer.ts`.

---

### PR #95: Security & Reliability Remediation (CLOSED - NOT MERGED)

**Status**: Closed without merging

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

**Our Status**: **CLOSED** - Not merged. Contains good patterns we could adopt independently:

- Prototype pollution protection
- Error sanitization
- Proactive token refresh
- Security headers

---

## Recently Merged PRs

| PR                                                                     | Title                                                | Author           | Merged     | Our Status         |
| ---------------------------------------------------------------------- | ---------------------------------------------------- | ---------------- | ---------- | ------------------ |
| N/A                                                                    | fix: preserve tool_use stop reason (commit 325acdb)  | @badri-s2001     | 2026-01-11 | **IMPLEMENTED** ✅ |
| [#94](https://github.com/badri-s2001/antigravity-claude-proxy/pull/94) | feat(webui): Improve connection health checks        | @jgor20          | 2026-01-11 | WebUI only         |
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

| Issue                                                                    | Title                                            | Author           | Created    | Priority                  |
| ------------------------------------------------------------------------ | ------------------------------------------------ | ---------------- | ---------- | ------------------------- |
| [#97](https://github.com/badri-s2001/antigravity-claude-proxy/issues/97) | [BUG] gemini-3-flash [1m] space in model name    | @user            | 2026-01-11 | Closed (PR #94)           |
| [#92](https://github.com/badri-s2001/antigravity-claude-proxy/issues/92) | [BUG] Frontend issue                             | @user            | 2026-01-11 | Closed (PR #93)           |
| [#91](https://github.com/badri-s2001/antigravity-claude-proxy/issues/91) | [BUG] API Error 400 - tool use concurrency       | @KumarAnandSingh | 2026-01-10 | **OPEN - Needs testing**  |
| [#88](https://github.com/badri-s2001/antigravity-claude-proxy/issues/88) | Claude 500 on large conversations (99+ messages) | @tiagonrodrigues | 2026-01-10 | **OPEN - API limitation** |

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

**Maintainer Investigation (2026-01-11)**:

- Maintainer tested parallel tool calls across Claude/Gemini in streaming/non-streaming modes
- **Could not reproduce** with standard parallel `tool_use` and `tool_result` blocks
- User reports similar error when reading **multiple images concurrently**
- **Likely related to image interleaving bug** (PR #79)

**Suspected Root Causes**:

1. **Multiple images in tool_result**: Image interleaving in tool results causes 400 errors
2. **Tool ID handling**: `functionCall.id` only added for Claude models, but parallel tool result matching may be inconsistent
3. **Session ID collision**: `deriveSessionId()` creates single ID per message, may conflict with parallel calls
4. **SSE demultiplexing**: Stream parser may not correctly handle events from multiple parallel executions

**Workaround**: Process image operations sequentially instead of in parallel.

**Our Status**: **MONITOR** - No reports from our users yet. Watch for issues with parallel image processing.

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
| stopReason override (PR #96) | Fixed in commit 325acdb       | **IMPLEMENTED** ✅     | Initialize `stopReason = null`   |
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

## Deep Code Comparison

### Account Manager Module

Comprehensive comparison of account-manager implementations:

#### Credentials Management (`credentials.ts`)

| Function                 | Upstream                 | Us                            | Notes                   |
| ------------------------ | ------------------------ | ----------------------------- | ----------------------- |
| `getTokenForAccount()`   | Uses raw `fetch()`       | Uses `fetchWithTimeout()`     | **We added timeout** ✅ |
| `getProjectForAccount()` | Uses raw `fetch()`       | Uses `fetchWithTimeout()`     | **We added timeout** ✅ |
| `discoverProject()`      | Uses raw `fetch()`       | Uses `fetchWithTimeout()`     | **We added timeout** ✅ |
| Network error handling   | `isNetworkError()` check | Same `isNetworkError()` check | ✅ Match                |
| Token cache structure    | `{ token, extractedAt }` | Typed `TokenCacheEntry`       | Type safety added       |

#### Rate Limits Management (`rate-limits.ts`)

| Feature                  | Upstream              | Us                    | Notes                |
| ------------------------ | --------------------- | --------------------- | -------------------- |
| Model-specific limits    | `modelRateLimits[id]` | Same structure, typed | ✅ Match             |
| `isAllRateLimited()`     | ✅                    | ✅                    | ✅ Match             |
| `getAvailableAccounts()` | Checks `acc.enabled`  | Same check            | ✅ Match             |
| `markRateLimited()`      | ✅                    | ✅                    | ✅ Match             |
| `markInvalid()`          | ✅                    | ✅                    | ✅ Match             |
| `resetAllRateLimits()`   | ✅                    | ✅                    | ✅ Match             |
| `triggerQuotaReset()`    | N/A                   | ✅ Group-based reset  | **We added this** ✅ |
| `QuotaResetResult` type  | N/A                   | ✅ Typed return       | Type safety added    |

#### Selection Logic (`selection.ts`)

| Feature                         | Upstream                | Us                                     | Notes                            |
| ------------------------------- | ----------------------- | -------------------------------------- | -------------------------------- |
| `pickNext()`                    | ✅                      | ✅                                     | ✅ Match                         |
| `pickStickyAccount()`           | ✅                      | ✅                                     | ✅ Match                         |
| `getCurrentStickyAccount()`     | ✅                      | ✅                                     | ✅ Match                         |
| `shouldWaitForCurrentAccount()` | ✅                      | ✅                                     | ✅ Match                         |
| `optimisticReset()`             | N/A                     | ✅ For post-429 buffer wait            | **We added this** ✅             |
| `pickByMode()`                  | N/A                     | ✅ sticky/round-robin/refresh-priority | **We added scheduling modes** ✅ |
| `pickRefreshPriority()`         | N/A                     | ✅ Sorts by quota reset time           | **We added this** ✅             |
| `pickDrainHighest()`            | N/A                     | ✅ Sorts by quota percentage           | **We added this** ✅             |
| `pickRoundRobin()`              | N/A                     | ✅ Module-level index rotation         | **We added this** ✅             |
| WebUI enabled check             | `acc.enabled === false` | Not implemented (no WebUI)             | Not needed                       |

### Format Module

#### Schema Sanitizer (`schema-sanitizer.ts`)

| Phase                       | Upstream                         | Us   | Notes    |
| --------------------------- | -------------------------------- | ---- | -------- |
| Phase 1: Convert $refs      | `convertRefsToHints()`           | Same | ✅ Match |
| Phase 1b: Enum hints        | `addEnumHints()`                 | Same | ✅ Match |
| Phase 1c: additionalProps   | `addAdditionalPropertiesHints()` | Same | ✅ Match |
| Phase 1d: Constraints       | `moveConstraintsToDescription()` | Same | ✅ Match |
| Phase 2a: Merge allOf       | `mergeAllOf()`                   | Same | ✅ Match |
| Phase 2b: Flatten anyOf     | `flattenAnyOfOneOf()`            | Same | ✅ Match |
| Phase 2c: Type arrays       | `flattenTypeArrays()`            | Same | ✅ Match |
| Phase 3: Remove unsupported | Allowlist approach               | Same | ✅ Match |
| Phase 4: Final cleanup      | Required validation              | Same | ✅ Match |
| Phase 5: Uppercase types    | `toGoogleType()`                 | Same | ✅ Match |

#### Thinking Utils (`thinking-utils.ts`)

| Function                         | Upstream | Us  | Notes    |
| -------------------------------- | -------- | --- | -------- |
| `isThinkingPart()`               | ✅       | ✅  | ✅ Match |
| `hasValidSignature()`            | ✅       | ✅  | ✅ Match |
| `hasGeminiHistory()`             | ✅       | ✅  | ✅ Match |
| `sanitizeThinkingPart()`         | ✅       | ✅  | ✅ Match |
| `filterUnsignedThinkingBlocks()` | ✅       | ✅  | ✅ Match |
| `removeTrailingThinkingBlocks()` | ✅       | ✅  | ✅ Match |
| `restoreThinkingSignatures()`    | ✅       | ✅  | ✅ Match |
| `reorderAssistantContent()`      | ✅       | ✅  | ✅ Match |
| `analyzeConversationState()`     | ✅       | ✅  | ✅ Match |
| `needsThinkingRecovery()`        | ✅       | ✅  | ✅ Match |
| `stripInvalidThinkingBlocks()`   | ✅       | ✅  | ✅ Match |
| `closeToolLoopForThinking()`     | ✅       | ✅  | ✅ Match |

### Auth Module

#### OAuth (`oauth.ts`)

| Function                 | Upstream                | Us                              | Notes                   |
| ------------------------ | ----------------------- | ------------------------------- | ----------------------- |
| `getAuthorizationUrl()`  | Has `customRedirectUri` | No custom redirect (not needed) | Simplified              |
| `extractCodeFromInput()` | ✅                      | ✅                              | ✅ Match                |
| `startCallbackServer()`  | ✅                      | ✅                              | ✅ Match                |
| `exchangeCode()`         | Uses raw `fetch()`      | Uses `fetchWithTimeout()`       | **We added timeout** ✅ |
| `refreshAccessToken()`   | Uses raw `fetch()`      | Uses `fetchWithTimeout()`       | **We added timeout** ✅ |
| `getUserEmail()`         | Uses raw `fetch()`      | Uses `fetchWithTimeout()`       | **We added timeout** ✅ |
| `discoverProjectId()`    | Uses raw `fetch()`      | Uses `fetchWithTimeout()`       | **We added timeout** ✅ |
| `completeOAuthFlow()`    | ✅                      | ✅                              | ✅ Match                |
| `validateRefreshToken()` | N/A                     | ✅                              | **We added this** ✅    |

### Auth Module Deep Comparison

#### oauth.ts vs oauth.js (400 lines upstream, 522 lines ours)

| Feature                  | Upstream                  | Us                       | Notes                    |
| ------------------------ | ------------------------- | ------------------------ | ------------------------ |
| Lines of code            | 400                       | 522                      | More types + new feature |
| PKCE implementation      | ✅                        | ✅                       | ✅ Match                 |
| Custom redirect URI      | `customRedirectUri` param | Not supported            | Simplified (CLI only)    |
| State parameter          | ✅                        | ✅                       | ✅ Match                 |
| Callback server          | ✅                        | ✅                       | ✅ Match                 |
| UTF-8 HTML charset       | ✅                        | ✅                       | ✅ Match                 |
| Fetch timeout            | ❌                        | `OAUTH_FETCH_TIMEOUT_MS` | **We added this** ✅     |
| TypeScript interfaces    | ❌                        | 8 interfaces             | **Type safety** ✅       |
| `validateRefreshToken()` | ❌                        | ✅                       | **We added this** ✅     |
| Default export object    | ✅                        | ❌                       | Named exports only       |

**TypeScript Interfaces We Added**:

```typescript
interface PKCEData {
  verifier: string;
  challenge: string;
}
interface AuthorizationUrlData {
  url: string;
  verifier: string;
  state: string;
}
interface ExtractedCode {
  code: string;
  state: string | null;
}
interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
interface RefreshedToken {
  accessToken: string;
  expiresIn: number;
}
interface AccountInfo {
  email: string;
  refreshToken: string;
  accessToken: string;
  projectId: string | null;
}
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}
interface UserInfoResponse {
  email: string;
  [key: string]: unknown;
}
interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string | { id: string };
}
```

**`validateRefreshToken()` Function (Unique to Us)**:

```typescript
export async function validateRefreshToken(refreshToken: string): Promise<AccountInfo>;
```

This function enables:

- Adding accounts using only a refresh token (no OAuth browser flow)
- Importing tokens from other tools (Gemini CLI, opencode-antigravity-auth)
- Adding accounts on headless servers
- `npm run accounts:add -- --refresh-token` CLI flag

#### database.ts vs database.js

| Feature                  | Upstream               | Us                   | Notes              |
| ------------------------ | ---------------------- | -------------------- | ------------------ |
| Lines of code            | ~150                   | ~80                  | Simplified         |
| SQLite query             | ✅ ItemTable           | ✅ Same              | ✅ Match           |
| Auto-rebuild on mismatch | `attemptAutoRebuild()` | ❌                   | Not needed         |
| `NativeModuleError`      | ✅                     | ❌                   | Not needed         |
| Lazy loading             | `loadDatabaseModule()` | Direct import        | Simpler approach   |
| TypeScript types         | ❌                     | `AuthData` interface | **Type safety** ✅ |

**Why We Skip Native Module Handling**:

Upstream has elaborate auto-rebuild logic for `better-sqlite3` version mismatches:

```javascript
// Upstream functions we don't have:
isModuleVersionError(); // Check NODE_MODULE_VERSION error
extractModulePath(); // Get .node file path
findPackageRoot(); // Walk up to package.json
rebuildModule(); // Run npm rebuild
attemptAutoRebuild(); // Full rebuild workflow
clearRequireCache(); // Clear require cache
```

We skip this because:

1. TypeScript build process handles compatibility
2. Direct `better-sqlite3` import (no lazy loading)
3. Users run `npm rebuild` manually if needed

#### token-extractor.ts vs token-extractor.js

| Feature                | Upstream               | Us                      | Notes        |
| ---------------------- | ---------------------- | ----------------------- | ------------ |
| Token caching          | `cachedToken` object   | `TokenCacheEntry` typed | ✅ Match     |
| `needsRefresh()` check | 5-minute interval      | Same                    | ✅ Match     |
| DB extraction          | Primary method         | Same                    | ✅ Match     |
| HTML page fallback     | Secondary method       | Same                    | ✅ Match     |
| Force refresh          | `forceRefresh()` param | Same                    | ✅ Match     |
| TypeScript interfaces  | ❌                     | `TokenCacheEntry` type  | **Added** ✅ |

### WebUI Module Deep Analysis (Upstream Only)

#### WebUI API Endpoints (17 total)

| Endpoint                       | Method | Purpose                              | Our Alternative           |
| ------------------------------ | ------ | ------------------------------------ | ------------------------- |
| `/api/accounts`                | GET    | List accounts with status            | `npm run accounts:list`   |
| `/api/accounts/:email/refresh` | POST   | Refresh token cache                  | Account auto-refresh      |
| `/api/accounts/:email/toggle`  | POST   | Enable/disable account               | Edit accounts.json        |
| `/api/accounts/:email`         | DELETE | Remove account                       | `npm run accounts:remove` |
| `/api/accounts/reload`         | POST   | Reload accounts from disk            | N/A (auto-loads)          |
| `/api/config`                  | GET    | Get server configuration             | constants.ts              |
| `/api/config`                  | POST   | Update configuration                 | Edit env vars             |
| `/api/config/password`         | POST   | Set WebUI password                   | N/A                       |
| `/api/settings`                | GET    | Get Claude CLI settings              | N/A                       |
| `/api/claude/config`           | GET    | Get Claude CLI config                | N/A                       |
| `/api/claude/config`           | POST   | Update Claude CLI config             | N/A                       |
| `/api/models/config`           | POST   | Update model config (pin/hide/alias) | N/A                       |
| `/api/logs`                    | GET    | Get server logs                      | Terminal output           |
| `/api/logs/stream`             | GET    | SSE log streaming                    | Terminal output           |
| `/api/auth/url`                | GET    | Start OAuth flow via WebUI           | `npm run accounts:add`    |

#### WebUI JavaScript Architecture (20 files, ~3,000 lines)

| File                                        | Lines | Purpose                                    |
| ------------------------------------------- | ----- | ------------------------------------------ |
| `public/app.js`                             | 198   | Alpine.js app controller                   |
| `public/js/store.js`                        | 550   | Global store with i18n (EN/zh_CN)          |
| `public/js/data-store.js`                   | 305   | Data store (accounts, models, quotas)      |
| `public/js/settings-store.js`               | ~100  | User preferences store                     |
| `public/js/utils.js`                        | 70    | Request wrapper, formatTimeUntil, debounce |
| `public/js/config/constants.js`             | 83    | Centralized magic numbers                  |
| `public/js/utils/validators.js`             | 169   | Input validation utilities                 |
| `public/js/utils/error-handler.js`          | 146   | Error handling with toast notifications    |
| `public/js/utils/account-actions.js`        | 200   | Account CRUD operations                    |
| `public/js/utils/model-config.js`           | 43    | Model configuration updates                |
| `public/js/components/dashboard.js`         | 221   | Dashboard orchestration                    |
| `public/js/components/dashboard/charts.js`  | ~200  | Chart.js quota visualization               |
| `public/js/components/dashboard/filters.js` | ~150  | Family/model filtering                     |
| `public/js/components/dashboard/stats.js`   | ~100  | Stats calculation                          |
| `public/js/components/models.js`            | ~150  | Models page component                      |
| `public/js/components/account-manager.js`   | ~200  | Account management component               |
| `public/js/components/claude-config.js`     | ~150  | Claude CLI config editor                   |
| `public/js/components/logs-viewer.js`       | ~150  | Log streaming component                    |
| `public/js/components/server-config.js`     | ~100  | Server settings component                  |
| `public/js/app-init.js`                     | ~50   | Alpine.js initialization                   |

#### WebUI Patterns (Reference Only)

**Optimistic Updates with Rollback** (`account-actions.js`):

```javascript
// Store previous state before optimistic update
const previousState = account ? account.enabled : !enabled;
if (account) {
    account.enabled = enabled;  // Optimistic update
}
try {
    const { response } = await window.utils.request(...);
    if (data.status !== 'ok') throw new Error(data.error);
    await dataStore.fetchData();  // Confirm with server
} catch (error) {
    // Rollback on error
    if (account) {
        account.enabled = previousState;
    }
}
```

**Health Check with Visibility API** (`data-store.js`):

```javascript
// Pause health checks when tab is hidden
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    this.stopHealthCheck();
  } else {
    this.startHealthCheck();
  }
});
// Check every 15 seconds when visible
this.healthCheckTimer = setInterval(() => {
  if (!document.hidden) this.performHealthCheck();
}, 15000);
```

**Debounced Chart Updates** (`dashboard.js`):

```javascript
// Prevent rapid chart updates (300ms debounce)
this._debouncedUpdateTrendChart = window.utils.debounce(() => {
  window.DashboardCharts.updateTrendChart(this);
}, 300);
```

#### Why We Skip WebUI

| Reason             | Explanation                              |
| ------------------ | ---------------------------------------- |
| We have TUI        | React/Ink-based terminal interface       |
| Different use case | CLI workflow vs browser-based management |
| Simpler deployment | No static file serving needed            |
| Type safety        | Our TypeScript TUI is more maintainable  |

Features in upstream's WebUI that we skip (we have TUI instead):

| Route                               | Purpose                    | Our Alternative           |
| ----------------------------------- | -------------------------- | ------------------------- |
| `GET /api/accounts`                 | List accounts with status  | `npm run accounts:list`   |
| `POST /api/accounts/:email/refresh` | Refresh token cache        | Account auto-refresh      |
| `POST /api/accounts/:email/toggle`  | Enable/disable account     | Edit accounts.json        |
| `DELETE /api/accounts/:email`       | Remove account             | `npm run accounts:remove` |
| `GET /api/config`                   | Get server configuration   | constants.ts              |
| `POST /api/config`                  | Update configuration       | Edit env vars             |
| `GET /api/claude/config`            | Get Claude CLI config      | N/A                       |
| `POST /api/claude/config`           | Update Claude CLI config   | N/A                       |
| `GET /api/logs/stream`              | SSE log streaming          | Terminal output           |
| `GET /api/auth/url`                 | Start OAuth flow via WebUI | `npm run accounts:add`    |

**WebUI-specific features we don't need:**

- Password protection (`WEBUI_PASSWORD` env var)
- Dashboard with Chart.js quota visualization
- i18n support (EN/zh_CN)
- Alpine.js + TailwindCSS frontend
- Pending OAuth flow state management

---

## Known Limitations

These are inherent limitations of the Cloud Code API, not bugs in the proxy:

### WebSearch Tool (Issue #27)

**Problem**: Claude Code's WebSearch tool always returns 0 results.

**Cause**: WebSearch uses Anthropic's internal APIs, not the proxied endpoint. The proxy cannot intercept or replace this functionality.

**Status**: **NOT FIXABLE** - Inherent to Claude Code architecture.

**Workaround**: Use external search tools or MCP-based web search.

### Skills/Plugins Persistence (Issue #34)

**Problem**: Installed skills disappear after closing Claude Code.

**Cause**: Claude Code session state issue, not proxy-related.

**Status**: **NOT PROXY ISSUE** - Claude Code behavior.

**Workaround**: Clear cache and reinstall, or persist skills manually.

### Image Processing (Issue #22)

**Problem**: Claude Code unable to process images with some models.

**Cause**: Image handling varies between model families. Gemini and Claude have different image format requirements.

**Status**: **MOSTLY WORKS** - Basic image processing works, edge cases may fail.

### Account Suspension Risk (Issue #59)

**Question**: Can Google ban accounts for using this proxy?

**Answer from maintainer**: "I don't think Google will ban, but for safety create a burner account and add it to your family plan."

**Recommendation**: Use separate/burner accounts, respect rate limits, don't abuse the service.

### Proto Field Errors (Issue #6)

**Problem**: `Proto field is not repeating, cannot start list` errors.

**Cause**: Tool schema types sent as lowercase instead of uppercase.

**Status**: **FIXED** in PR #83 - Schema uppercase conversion implemented.

### Cross-Model Resume (Issue #18)

**Problem**: "Corrupted thought signature" error when switching from Claude to Gemini mid-conversation.

**Cause**: Gemini requires thought signatures that Claude doesn't generate. Signatures are model-family specific.

**Status**: **FIXED** in v1.2.6 - `stripInvalidThinkingBlocks()` and `closeToolLoopForThinking()` handle this.

---

## Community Insights

Tips and workarounds from community discussions:

### 1M Context Window (Issue #53)

Use `[1m]` suffix in model names to tell Claude Code the model has 1M context:

```
gemini-3-pro-high [1m]
gemini-3-flash [1m]
```

This prevents excessive auto-compaction.

### VPN Location Matters (Issue #59)

Some users report better results with US-based VPNs vs other regions. Japan VPN caused 429 errors for one user while US worked fine.

### Export Before Model Switch (Issue #18)

Use `/export` to copy message history before switching model families. Paste into new chat to preserve context.

### Multiple Claude Code Instances (Issue #75)

Run multiple instances on different ports:

```bash
# Terminal 1
PORT=8080 npm start

# Terminal 2
PORT=8081 npm start
```

### Rate Limit Recovery (Issue #78)

429 errors on launch are expected if you exhausted quota in previous session. Wait for reset or use different model.

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
12. **stopReason Fix** (commit 325acdb) - Done

### Monitor

1. **Issue #91: Tool Concurrency** - **MONITORING**
   - No reports from our users yet
   - Watch for 400 errors with parallel tool calls

2. **PR #99: Restore Default Claude CLI** - **MONITOR** (WebUI only)
   - Adds button to restore Claude CLI config to defaults
   - Not applicable to us (we have TUI)

3. **PR #79: Image Interleaving Bug** - **MONITORING**
   - Multiple `tool_result` with images cause 400 errors
   - Not yet fixed upstream (PR was closed without proper solution)
   - Watch for similar issues with our users

### Low Priority

5. **PR #15: Map 404s with context**
   - We already warn in logs
   - Could improve error messages

---

## Potential Improvements

Patterns from upstream that could enhance our implementation:

### Retry with Jitter (from `utils/retry.js`)

**Current State**: We use fixed `RETRY_DELAY_MS = 1000ms` for all retries.

**Upstream Approach**: Exponential backoff with ±25% jitter to prevent thundering herd.

```javascript
// Upstream calculateBackoff()
const exponential = baseMs * Math.pow(2, attempt);
const capped = Math.min(exponential, maxMs);
const jitter = capped * 0.25 * (Math.random() * 2 - 1);
return Math.floor(capped + jitter);
```

**Benefit**: Prevents multiple clients from retrying at the exact same time, reducing server load spikes.

**Priority**: 🟢 Minor - Could extract to `utils/retry.ts` for consistency.

**Implementation**:

```typescript
// src/utils/retry.ts (proposed)
export function calculateBackoff(attempt: number, baseMs = 1000, maxMs = 30000): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, maxMs);
  const jitter = capped * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(capped + jitter);
}
```

---

### Error Classification Functions (from `utils/retry.js`)

**Current State**: We use inline checks like `is5xxError()` and `isNetworkError()`.

**Upstream Approach**: Two comprehensive functions for error classification.

| Function                | What It Checks                       |
| ----------------------- | ------------------------------------ |
| `isRetryableError()`    | 5xx, network errors, 429 rate limits |
| `isNonRetryableError()` | 401, 403, 400, 404                   |

**Benefit**: Centralized error classification for consistent behavior.

**Priority**: 🟢 Minor - We already have similar logic scattered across handlers.

---

### Security Patterns (from closed PR #95)

PR #95 was closed without merging, but contains valuable patterns:

#### 1. Prototype Pollution Protection

**Problem**: Malicious input with `__proto__`, `constructor`, or `prototype` keys could pollute object prototypes.

**Solution**:

```javascript
function sanitizeObject(obj) {
  const forbidden = ["__proto__", "constructor", "prototype"];
  for (const key of Object.keys(obj)) {
    if (forbidden.includes(key)) {
      delete obj[key];
    }
  }
  return obj;
}
```

**Priority**: 🟡 Important - Security consideration, especially for tool input.

**Status**: NOT IMPLEMENTED - Consider for future security hardening.

---

#### 2. Error Sanitization

**Problem**: Error messages may leak sensitive data (emails, tokens, file paths).

**Solution**:

```javascript
function sanitizeError(error) {
  let message = error.message;
  // Mask emails
  message = message.replace(/[\w.-]+@[\w.-]+\.\w+/g, "[EMAIL]");
  // Mask tokens
  message = message.replace(/ya29\.[^\s]+/g, "[ACCESS_TOKEN]");
  message = message.replace(/1\/\/[^\s]+/g, "[REFRESH_TOKEN]");
  // Mask paths
  message = message.replace(/\/home\/[\w/.-]+/g, "[PATH]");
  return message;
}
```

**Priority**: 🟡 Important - Security consideration for production.

**Status**: NOT IMPLEMENTED - Consider for public-facing error responses.

---

#### 3. Proactive Token Refresh

**Problem**: Token refresh happens reactively on 401, causing one failed request.

**Solution**: Refresh token 5 minutes before expiry.

```javascript
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5 minutes

function needsProactiveRefresh(extractedAt, expiresIn) {
  const expiryTime = extractedAt + expiresIn * 1000;
  const refreshTime = expiryTime - TOKEN_REFRESH_MARGIN_MS;
  return Date.now() >= refreshTime;
}
```

**Priority**: 🟢 Minor - We already have robust token refresh; this is an optimization.

**Status**: NOT IMPLEMENTED - Our current reactive approach works well.

---

#### 4. Security Headers

**Problem**: Missing security headers for WebUI.

**Solution**:

```javascript
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});
```

**Priority**: 🟢 Minor - We don't have WebUI, but good practice for any HTTP endpoints.

**Status**: NOT IMPLEMENTING - Our TUI doesn't need these.

---

#### 5. Graceful Shutdown

**Problem**: Hard shutdown may interrupt in-flight requests.

**Solution**: Track active requests and wait for completion.

```javascript
let activeRequests = 0;

app.use((req, res, next) => {
  activeRequests++;
  res.on("finish", () => activeRequests--);
  next();
});

process.on("SIGTERM", async () => {
  console.log("Shutting down gracefully...");
  while (activeRequests > 0) {
    await sleep(100);
  }
  process.exit(0);
});
```

**Priority**: 🟢 Minor - Nice-to-have for production deployments.

**Status**: NOT IMPLEMENTED - Could add if users report issues.

---

### Implementation Priority Summary

| Pattern                 | Priority     | Status           | Recommendation                  |
| ----------------------- | ------------ | ---------------- | ------------------------------- |
| Backoff with jitter     | 🟢 Minor     | Not implemented  | Consider for v1.3.0             |
| Error classification    | 🟢 Minor     | Partial          | Already have similar            |
| Prototype pollution     | 🟡 Important | Not implemented  | Consider for security hardening |
| Error sanitization      | 🟡 Important | Not implemented  | Consider for production         |
| Proactive token refresh | 🟢 Minor     | Not implemented  | Current approach works          |
| Security headers        | 🟢 Minor     | Not implementing | No WebUI                        |
| Graceful shutdown       | 🟢 Minor     | Not implemented  | Nice-to-have                    |
| Model mapping           | 🟢 Minor     | Not implementing | Different use case              |
| Persistent token cache  | 🟢 Minor     | Not implementing | We use SQLite                   |

---

## Additional Upstream Features (Not Previously Documented)

### Model Mapping / Alias System

**Location**: `config.js` line 17, `server.js` lines 609-614, `webui/index.js` lines 442-467

**What it does**: Allows users to configure model aliases via WebUI or config file.

```javascript
// config.js default
modelMapping: {
}

// server.js usage
const modelMapping = config.modelMapping || {};
if (modelMapping[requestedModel] && modelMapping[requestedModel].mapping) {
  const targetModel = modelMapping[requestedModel].mapping;
  logger.info(`[Server] Mapping model ${requestedModel} -> ${targetModel}`);
  requestedModel = targetModel;
}
```

**WebUI Features**:

- `POST /api/models/config` - Update model configuration (hidden/pinned/alias)
- Each model can have: `hidden`, `pinned`, `mapping` (alias target)

**Our Status**: NOT IMPLEMENTING - We don't have WebUI. Users can configure model directly in Claude CLI settings.

---

### Configurable Options in `config.json`

Upstream exposes these options via config file and WebUI settings:

| Option                 | Default  | Purpose                        | Our Status                        |
| ---------------------- | -------- | ------------------------------ | --------------------------------- |
| `webuiPassword`        | `""`     | Password protection for WebUI  | N/A (no WebUI)                    |
| `debug`                | `false`  | Enable debug logging           | ✅ Via `--debug`                  |
| `logLevel`             | `info`   | Log verbosity                  | ✅ Via `--log-level`              |
| `maxRetries`           | `5`      | Max retry attempts             | ✅ Via `MAX_RETRIES`              |
| `retryBaseMs`          | `1000`   | Base retry delay               | ✅ Via `RETRY_DELAY_MS`           |
| `retryMaxMs`           | `30000`  | Max retry delay (with backoff) | ❌ Not implemented (we use fixed) |
| `persistTokenCache`    | `false`  | Persist token cache to disk    | ❌ Not needed                     |
| `defaultCooldownMs`    | `60000`  | Cooldown after rate limit      | ✅ 10s (hardcoded)                |
| `maxWaitBeforeErrorMs` | `120000` | Max wait before throwing error | ✅ Via `MAX_WAIT_BEFORE_ERROR_MS` |
| `modelMapping`         | `{}`     | Model alias configuration      | ❌ Not implementing               |

**Key Difference**: Upstream defaults to 60s cooldown; we use 10s (Issue #57 fix).

---

### Pending OAuth Flow Management

**Location**: `webui/index.js` lines 40, 534-581

Upstream manages pending OAuth flows for WebUI-initiated authentication:

```javascript
const pendingOAuthFlows = new Map();

// Store flow data when user clicks "Add Account" in WebUI
pendingOAuthFlows.set(state, {
  serverPromise,
  verifier,
  state,
  timestamp: Date.now(),
});

// Auto-cleanup flows older than 10 minutes
for (const [key, val] of pendingOAuthFlows.entries()) {
  if (now - val.timestamp > 10 * 60 * 1000) {
    pendingOAuthFlows.delete(key);
  }
}
```

**Our Status**: N/A - We use CLI-based OAuth flow instead.

---

### AbortController Usage Comparison

**Upstream**: Does NOT use AbortController for fetch timeouts.

- OAuth callback server has 2-minute timeout via `setTimeout`
- Native module rebuild has 2-minute timeout via child process options
- But fetch calls themselves have no timeout (can hang forever)

**Us**: Added `fetchWithTimeout()` with AbortController:

- Applied to 7 OAuth/credential functions
- Prevents hanging on slow networks (Issue #68 fix)
- 15-second timeout via `OAUTH_FETCH_TIMEOUT_MS`

**This is a significant improvement** we made that upstream lacks.

---

## Sync Status

```
Current bookmark: upstream-synced (a06cd30)
Upstream HEAD: 1142f3e (v2.0.1)
Commits since bookmark: 6
```

**Recent Commits Not Yet Marked**:

| SHA       | Description                                               |
| --------- | --------------------------------------------------------- |
| `1142f3e` | Merge PR #94 - WebUI health check improvements            |
| `5879022` | fix: use lightweight /api/config for health checks        |
| `325acdb` | **fix: preserve tool_use stop reason** ✅ IMPLEMENTED     |
| `7b921ab` | fix(webui): remove space before [1m] suffix               |
| `c3629d6` | fix(webui): prevent duplicate visibility change listeners |
| `6944058` | feat(webui): add health check monitoring for connection   |

**Commands**:

```bash
npm run upstream:status     # Show bookmark position vs upstream HEAD
npm run upstream:log        # Show new commits since last bookmark
npm run upstream:diff       # File-level summary of changes
npm run upstream:mark       # Update bookmark after review
```

---

## Test Structure Comparison

### Upstream Test Structure

Upstream uses CommonJS (`.cjs`) integration tests that run against a live server:

| Test File                           | Purpose                                | Tests |
| ----------------------------------- | -------------------------------------- | ----- |
| `test-thinking-signatures.cjs`      | Validate thinking signature generation | 3     |
| `test-multiturn-thinking-tools.cjs` | Multi-turn tool conversations          | 4     |
| `test-multiturn-streaming.cjs`      | Streaming multi-turn                   | 4     |
| `test-interleaved-thinking.cjs`     | Interleaved thinking blocks            | 2     |
| `test-images.cjs`                   | Image/document support                 | 5     |
| `test-caching-streaming.cjs`        | Prompt caching                         | 3     |
| `test-cross-model-thinking.cjs`     | Cross-model thinking compatibility     | 4     |
| `test-schema-sanitizer.cjs`         | Schema sanitizer unit tests            | 10    |
| `test-empty-response-retry.cjs`     | Empty response retry mechanism         | 3     |
| `test-oauth-no-browser.cjs`         | OAuth no-browser flow                  | 2     |
| `frontend/test-frontend-*.cjs` (×5) | WebUI frontend tests                   | ~20   |
| **Total**                           |                                        | ~60   |

### Our Test Structure

We use Vitest with comprehensive test types:

| Category  | Location          | Tests | Purpose                               |
| --------- | ----------------- | ----- | ------------------------------------- |
| Unit      | `tests/unit/`     | ~800  | Individual functions, mocked deps     |
| Fuzz      | `tests/fuzz/`     | ~50   | Random input, edge cases (fast-check) |
| Contract  | `tests/contract/` | ~100  | API schema validation                 |
| Snapshot  | `tests/snapshot/` | ~30   | Detect unintended format changes      |
| Golden    | `tests/golden/`   | ~20   | Known good request/response pairs     |
| Chaos     | `tests/chaos/`    | ~50   | Network failures, malformed responses |
| Load      | `tests/load/`     | ~10   | Concurrent handling, stress testing   |
| Security  | `tests/security/` | ~100  | Input sanitization, token handling    |
| Type      | `tests/types/`    | ~50   | Exported types correctness            |
| Benchmark | `tests/bench/`    | ~20   | Performance regression                |
| **Total** |                   | 1,767 |                                       |

### Test Coverage Comparison

| Aspect                | Upstream       | Us                              |
| --------------------- | -------------- | ------------------------------- |
| Test framework        | Node.js assert | Vitest + fast-check             |
| Unit tests            | 10             | ~800                            |
| Integration tests     | 50             | 50 (same structure, TypeScript) |
| Frontend tests        | 20             | N/A (TUI tested differently)    |
| Property-based (fuzz) | None           | ~50                             |
| Chaos/fault injection | None           | ~50                             |
| Type tests            | N/A            | ~50                             |
| Coverage threshold    | None           | 80% (unit), 50% (fuzz/chaos)    |
| CI integration        | Unknown        | GitHub Actions                  |

### Integration Test Parity

| Test File                       | Upstream | Us  | Notes                         |
| ------------------------------- | -------- | --- | ----------------------------- |
| `test-thinking-signatures.cjs`  | ✅       | ✅  | ✅ Identical                  |
| `test-multiturn-thinking-*.cjs` | ✅       | ✅  | ✅ Identical (both streaming) |
| `test-interleaved-thinking.cjs` | ✅       | ✅  | ✅ Identical                  |
| `test-images.cjs`               | ✅       | ✅  | ✅ Identical                  |
| `test-caching-streaming.cjs`    | ✅       | ✅  | ✅ Identical                  |
| `test-cross-model-thinking.cjs` | ✅       | ✅  | ✅ Identical                  |
| `test-oauth-no-browser.cjs`     | ✅       | ✅  | ✅ Identical                  |
| `test-schema-sanitizer.cjs`     | ✅       | ❌  | Unit tests cover this         |
| `test-empty-response-retry.cjs` | ✅       | ❌  | Unit tests cover this         |
| `http-client.cjs` (helper)      | ✅       | ✅  | ✅ Identical                  |
| `test-models.cjs` (helper)      | ✅       | ✅  | ✅ Identical                  |
| Frontend tests (5 files)        | ✅       | ❌  | Not applicable (we have TUI)  |

**Summary**: 9/11 integration tests match. 2 missing tests are covered by unit tests.

---

## Utility Module Comparison

### Retry Utilities (`utils/retry.js`)

Upstream has a dedicated retry module we **don't have** (we inline retry logic):

| Function                | Upstream | Us  | Notes                                |
| ----------------------- | -------- | --- | ------------------------------------ |
| `calculateBackoff()`    | ✅       | ❌  | Exponential backoff with jitter      |
| `retryWithBackoff()`    | ✅       | ❌  | Generic retry wrapper                |
| `isRetryableError()`    | ✅       | ❌  | Check if error can be retried        |
| `isNonRetryableError()` | ✅       | ❌  | Check if error should NOT be retried |

**Assessment**: We inline retry logic in handlers. Consider extracting to utility for consistency.

### Helper Functions (`utils/helpers.js`)

| Function             | Upstream | Us  | Notes                |
| -------------------- | -------- | --- | -------------------- |
| `formatDuration()`   | ✅       | ✅  | ✅ Match             |
| `sleep()`            | ✅       | ✅  | ✅ Match             |
| `isNetworkError()`   | ✅       | ✅  | ✅ Match             |
| `isAuthError()`      | ✅       | ✅  | ✅ Match             |
| `isRateLimitError()` | ✅       | ✅  | ✅ Match             |
| `fetchWithTimeout()` | ❌       | ✅  | **We added this** ✅ |

**Our Extra**: `fetchWithTimeout()` - AbortController-based timeout for fetch calls.

### Error Classes (`errors.js` / `errors.ts`)

| Error Class          | Upstream | Us  | Notes                          |
| -------------------- | -------- | --- | ------------------------------ |
| `AntigravityError`   | ✅       | ✅  | Same structure                 |
| `RateLimitError`     | ✅       | ✅  | Same structure                 |
| `AuthError`          | ✅       | ✅  | Same structure                 |
| `NoAccountsError`    | ✅       | ✅  | Same structure                 |
| `MaxRetriesError`    | ✅       | ✅  | Same structure                 |
| `ApiError`           | ✅       | ✅  | Same structure                 |
| `EmptyResponseError` | ✅       | ✅  | Same structure                 |
| `NativeModuleError`  | ✅       | ❌  | Not needed (no native modules) |
| `ErrorMetadata` type | ❌       | ✅  | **We added TypeScript types**  |

### Rate Limit Parser (`cloudcode/rate-limit-parser.js`)

| Function           | Upstream | Us  | Notes    |
| ------------------ | -------- | --- | -------- |
| `parseResetTime()` | ✅       | ✅  | ✅ Match |

Both implementations parse:

- `Retry-After` header (seconds or HTTP date)
- `x-ratelimit-reset` header (Unix timestamp)
- `x-ratelimit-reset-after` header
- `quotaResetDelay` from error body
- `quotaResetTimeStamp` from error body
- Duration strings (`1h23m45s`)
- ISO timestamps

### Fallback Configuration (`fallback-config.js`)

| Function                  | Upstream | Us  | Notes                           |
| ------------------------- | -------- | --- | ------------------------------- |
| `getFallbackModel()`      | ✅       | ✅  | ✅ Match                        |
| `hasFallback()`           | ✅       | ✅  | ✅ Match                        |
| `is5xxError()`            | ❌       | ✅  | **We added this** ✅            |
| `shouldAttemptFallback()` | ❌       | ✅  | **We added this** ✅            |
| `FallbackDecision` type   | ❌       | ✅  | **Discriminated union type** ✅ |

**Our Extra**: `fallback-utils.ts` provides type-safe fallback decision logic with discriminated unions.

### Usage Stats (`modules/usage-stats.js`)

Upstream has usage tracking we don't replicate (we use SQLite + burn rate instead):

| Feature             | Upstream                | Us                       |
| ------------------- | ----------------------- | ------------------------ |
| Usage tracking      | JSON file per hour      | SQLite quota snapshots   |
| Storage location    | `usage-history.json`    | `quota-snapshots.db`     |
| Data structure      | Hierarchical by model   | By account + model       |
| Analytics           | Request counts per hour | Burn rate calculation    |
| API endpoint        | `/api/stats/history`    | N/A (TUI shows directly) |
| Middleware tracking | Express middleware      | N/A (not needed for TUI) |
| Auto-pruning        | 30-day retention        | SQLite handles this      |

**Assessment**: We chose SQLite-based quota storage with burn rate calculation over JSON file history. Different approach, similar goal.

### Message Handlers (`cloudcode/message-handler.js`, `streaming-handler.js`)

Both implementations share the same core logic:

| Feature                       | Upstream | Us  | Notes                |
| ----------------------------- | -------- | --- | -------------------- |
| Sticky account selection      | ✅       | ✅  | ✅ Match             |
| Endpoint failover             | ✅       | ✅  | ✅ Match             |
| Rate limit handling           | ✅       | ✅  | ✅ Match             |
| Empty response retry          | ✅       | ✅  | ✅ Match             |
| 5xx error handling            | ✅       | ✅  | ✅ Match             |
| Network error handling        | ✅       | ✅  | ✅ Match             |
| Fallback model support        | ✅       | ✅  | ✅ Match             |
| Optimistic reset              | ✅       | ✅  | ✅ Match             |
| `emitEmptyResponseFallback()` | ✅       | ✅  | ✅ Match             |
| Typed interfaces              | ❌       | ✅  | **TypeScript types** |

### Session Manager (`cloudcode/session-manager.js`)

| Function            | Upstream | Us  | Notes    |
| ------------------- | -------- | --- | -------- |
| `deriveSessionId()` | ✅       | ✅  | ✅ Match |

Both implementations:

- Hash first user message with SHA256
- Return first 32 hex characters
- Fall back to random UUID if no user message

### Request Builder (`cloudcode/request-builder.js`)

| Feature                                | Upstream       | Us                     |
| -------------------------------------- | -------------- | ---------------------- |
| `buildCloudCodeRequest()`              | ✅             | ✅ (extended)          |
| `buildHeaders()`                       | ✅             | ✅                     |
| System instruction injection           | Fixed identity | **Configurable modes** |
| `AG_INJECT_IDENTITY` env var           | ❌             | ✅ `full/short/none`   |
| `shouldInjectIdentity()`               | ❌             | ✅ (model-specific)    |
| `injectAntigravitySystemInstruction()` | Inline         | ✅ (extracted)         |
| `CloudCodeRequest` interface           | ❌             | ✅                     |
| `RequestHeaders` interface             | ❌             | ✅                     |

**Our Extras**:

- Configurable identity modes (`full`, `short`, `none`) via `AG_INJECT_IDENTITY`
- Only inject identity for claude and gemini-3-pro (CLIProxyAPI v6.6.89 behavior)
- TypeScript interfaces for request and header types
- Full identity (~300 tokens) vs short identity (~50 tokens) option

### Configuration (`config.js`)

| Feature               | Upstream                                  | Us                      |
| --------------------- | ----------------------------------------- | ----------------------- |
| Config file location  | `~/.config/antigravity-proxy/config.json` | Same                    |
| Local config fallback | `./config.json`                           | Same                    |
| Environment overrides | `WEBUI_PASSWORD`, `DEBUG`                 | Same + more             |
| `getPublicConfig()`   | ✅                                        | N/A (TUI uses settings) |
| `saveConfig()`        | ✅                                        | N/A (TUI uses settings) |
| Default cooldown      | 60000ms (1 min)                           | 10000ms (10 sec)        |

**Key Difference**: We use 10-second cooldown (Issue #57 fix) while upstream defaults to 60 seconds.

### Claude Config (`utils/claude-config.js`)

Upstream has Claude CLI settings management (WebUI feature) that we skip:

| Function                | Upstream | Us  | Notes                 |
| ----------------------- | -------- | --- | --------------------- |
| `getClaudeConfigPath()` | ✅       | ❌  | Not needed (no WebUI) |
| `readClaudeConfig()`    | ✅       | ❌  | Not needed (no WebUI) |
| `updateClaudeConfig()`  | ✅       | ❌  | Not needed (no WebUI) |
| `deepMerge()`           | ✅       | ❌  | Internal helper       |

**Assessment**: We don't need these since we don't have WebUI's Claude CLI config editor.

---

## Format Module Deep Comparison

### Request Converter (`format/request-converter.ts`)

| Feature                        | Upstream           | Us                       | Notes          |
| ------------------------------ | ------------------ | ------------------------ | -------------- |
| `convertAnthropicToGoogle()`   | ✅                 | ✅                       | ✅ Match       |
| System instruction handling    | ✅                 | ✅                       | ✅ Match       |
| Interleaved thinking hint      | ✅                 | ✅                       | ✅ Match       |
| Thinking recovery (Gemini)     | ✅                 | ✅                       | ✅ Match       |
| Cross-model recovery (Claude)  | ✅                 | ✅                       | ✅ Match       |
| Empty parts placeholder        | ✅ (`.`)           | ✅ (`.`)                 | ✅ Match       |
| Unsigned thinking block filter | ✅                 | ✅                       | ✅ Match       |
| Claude thinking config         | `include_thoughts` | Same                     | ✅ Match       |
| Gemini thinking config         | `includeThoughts`  | Same                     | ✅ Match       |
| `thinking_budget` validation   | ✅                 | ✅                       | ✅ Match       |
| Tool schema sanitization       | `sanitizeSchema()` | Same                     | ✅ Match       |
| Tool schema cleaning           | `cleanSchema()`    | `cleanSchemaForGemini()` | Same logic     |
| Gemini max_tokens cap          | 16384              | 16384                    | ✅ Match       |
| TypeScript interfaces          | ❌                 | ✅                       | We added types |

### Response Converter (`format/response-converter.ts`)

| Feature                      | Upstream          | Us   | Notes          |
| ---------------------------- | ----------------- | ---- | -------------- |
| `convertGoogleToAnthropic()` | ✅                | ✅   | ✅ Match       |
| Response wrapper unwrap      | ✅                | ✅   | ✅ Match       |
| Thinking block conversion    | ✅                | ✅   | ✅ Match       |
| Tool use conversion          | ✅                | ✅   | ✅ Match       |
| `thoughtSignature` handling  | ✅                | ✅   | ✅ Match       |
| Stop reason determination    | ✅                | ✅   | ✅ Match       |
| Usage metadata extraction    | ✅                | ✅   | ✅ Match       |
| Cache token calculation      | `prompt - cached` | Same | ✅ Match       |
| Tool ID generation           | `toolu_xxx`       | Same | ✅ Match       |
| TypeScript interfaces        | ❌                | ✅   | We added types |

### Content Converter (`format/content-converter.ts`)

| Feature                          | Upstream | Us  | Notes    |
| -------------------------------- | -------- | --- | -------- |
| `convertRole()`                  | ✅       | ✅  | ✅ Match |
| `convertContentToParts()`        | ✅       | ✅  | ✅ Match |
| Text block handling              | ✅       | ✅  | ✅ Match |
| Image base64 handling            | ✅       | ✅  | ✅ Match |
| Image URL handling               | ✅       | ✅  | ✅ Match |
| Document (PDF) handling          | ✅       | ✅  | ✅ Match |
| `tool_use` conversion            | ✅       | ✅  | ✅ Match |
| `tool_result` conversion         | ✅       | ✅  | ✅ Match |
| Thinking block signature check   | ✅       | ✅  | ✅ Match |
| Cross-model signature filter     | ✅       | ✅  | ✅ Match |
| Claude ID field inclusion        | ✅       | ✅  | ✅ Match |
| Gemini thoughtSignature          | ✅       | ✅  | ✅ Match |
| Image extraction from results    | ✅       | ✅  | ✅ Match |
| `GEMINI_SKIP_SIGNATURE` fallback | ✅       | ✅  | ✅ Match |

---

## CloudCode Module Deep Comparison

### Model API (`cloudcode/model-api.js` vs `quota-api.ts`)

| Feature                  | Upstream              | Us                   | Notes                 |
| ------------------------ | --------------------- | -------------------- | --------------------- |
| `listModels()`           | ✅                    | ✅                   | ✅ Match              |
| `fetchAvailableModels()` | ✅                    | ✅                   | ✅ Match              |
| `getModelQuotas()`       | ✅                    | ✅                   | ✅ Match              |
| `getSubscriptionTier()`  | ✅                    | `fetchAccountTier()` | Same logic            |
| `isSupportedModel()`     | Inline check          | Same inline          | ✅ Match              |
| Tier normalization       | `toLowerCase()` check | `normalizeTier()`    | We extracted function |
| Model pool grouping      | N/A                   | ✅ `groupByPool()`   | **We added this** ✅  |
| `fetchAccountCapacity()` | N/A                   | ✅                   | **We added this** ✅  |
| `AccountCapacity` type   | N/A                   | ✅                   | **We added this** ✅  |
| `ModelPoolInfo` type     | N/A                   | ✅                   | **We added this** ✅  |
| `ModelQuotaInfo` type    | N/A                   | ✅                   | **We added this** ✅  |

**Our Extras**:

- `groupByPool()` - Groups models by quota pool (Claude, Gemini Pro, Gemini Flash)
- `findEarliestReset()` - Finds earliest reset time across models
- `fetchAccountCapacity()` - Combines tier + quota fetching with pool grouping
- TypeScript interfaces for all quota types

### SSE Parser (`cloudcode/sse-parser.ts`)

| Feature                       | Upstream | Us  | Notes                            |
| ----------------------------- | -------- | --- | -------------------------------- |
| `parseThinkingSSEResponse()`  | ✅       | ✅  | ✅ Match                         |
| Accumulate thinking text      | ✅       | ✅  | ✅ Match                         |
| Accumulate thinking signature | ✅       | ✅  | ✅ Match                         |
| Accumulate text               | ✅       | ✅  | ✅ Match                         |
| Handle functionCall           | ✅       | ✅  | ✅ Match                         |
| `flushThinking()` helper      | ✅       | ✅  | ✅ Match                         |
| `flushText()` helper          | ✅       | ✅  | ✅ Match                         |
| Debug logging                 | ✅       | ✅  | ✅ Match                         |
| TypeScript interfaces         | ❌       | ✅  | `ParsedPart`, `ReadableResponse` |

### Database Module (`auth/database.ts`)

| Feature                          | Upstream                  | Us   | Notes                               |
| -------------------------------- | ------------------------- | ---- | ----------------------------------- |
| `getAuthStatus()`                | ✅                        | ✅   | ✅ Match                            |
| `isDatabaseAccessible()`         | ✅                        | ✅   | ✅ Match                            |
| SQLite query                     | ItemTable                 | Same | ✅ Match                            |
| Error handling                   | Custom messages           | Same | ✅ Match                            |
| Auto-rebuild on version mismatch | ✅ `loadDatabaseModule()` | ❌   | Upstream adds native module rebuild |
| `NativeModuleError` support      | ✅                        | ❌   | Not needed (simpler approach)       |
| TypeScript `AuthData` interface  | ❌                        | ✅   | **We added type**                   |

**Key Difference**: Upstream has elaborate auto-rebuild logic for native module version mismatches (`isModuleVersionError()`, `attemptAutoRebuild()`, `clearRequireCache()`). We don't need this since:

1. TypeScript build process handles this
2. Our `better-sqlite3` import is direct, not lazy-loaded
3. We don't support the auto-rebuild workflow (users run `npm rebuild` manually)

### Token Extractor (`auth/token-extractor.ts`)

| Feature                 | Upstream                          | Us   | Notes              |
| ----------------------- | --------------------------------- | ---- | ------------------ |
| `getToken()`            | ✅                                | ✅   | ✅ Match           |
| `forceRefresh()`        | ✅                                | ✅   | ✅ Match           |
| Token caching           | `cachedToken`, `tokenExtractedAt` | Same | ✅ Match           |
| `needsRefresh()` check  | ✅                                | ✅   | ✅ Match           |
| DB extraction (primary) | ✅                                | ✅   | ✅ Match           |
| HTML page fallback      | ✅                                | ✅   | ✅ Match           |
| TypeScript types        | ❌                                | ✅   | **We added types** |

---

## Server Entry Point Comparison

### Server.ts vs server.js

| Feature                   | Upstream                       | Us                     | Notes             |
| ------------------------- | ------------------------------ | ---------------------- | ----------------- |
| Express setup             | ✅                             | ✅                     | ✅ Match          |
| CORS middleware           | ✅                             | ✅                     | ✅ Match          |
| JSON body limit           | `REQUEST_BODY_LIMIT`           | Same                   | ✅ Match          |
| Account manager init      | `ensureInitialized()`          | Same                   | ✅ Match          |
| Race condition protection | `initPromise`                  | Same                   | ✅ Match          |
| Error parsing             | `parseError()`                 | Same                   | ✅ Match          |
| Request logging           | Skip batch unless debug        | Same                   | ✅ Match          |
| Health endpoint           | `/health`                      | Same                   | ✅ Match          |
| Account limits endpoint   | `/account-limits`              | Same                   | ✅ Match          |
| Token refresh endpoint    | `/refresh-token`               | Same                   | ✅ Match          |
| Models endpoint           | `/v1/models`                   | Same                   | ✅ Match          |
| Count tokens stub         | `/v1/messages/count_tokens`    | Same                   | ✅ Match          |
| Messages endpoint         | `/v1/messages`                 | Same                   | ✅ Match          |
| Streaming headers         | 4 headers                      | Same                   | ✅ Match          |
| Optimistic retry          | Reset if all rate-limited      | Same                   | ✅ Match          |
| 404 handler               | Catch-all                      | Same                   | ✅ Match          |
| WebUI mounting            | `mountWebUI()`                 | ❌                     | We have TUI       |
| Usage stats middleware    | `usageStats.setupMiddleware()` | ❌                     | We use SQLite     |
| Model mapping             | `config.modelMapping`          | ❌                     | Not implemented   |
| Quota reset endpoint      | ❌                             | `/trigger-reset`       | **We added** ✅   |
| Group reset times         | ❌                             | `getGroupResetTimes()` | **We added** ✅   |
| TypeScript interfaces     | ❌                             | ✅                     | All types defined |

**Key Differences**:

1. **We have `/trigger-reset` endpoint** they don't:
   - Triggers quota reset for quota groups
   - Uses `triggerQuotaResetApi()` with minimal API calls
   - Also clears local rate limit flags

2. **We have `getGroupResetTimes()`** they don't:
   - Returns per-group reset times (Claude, Gemini Pro, Gemini Flash)
   - Used in `/account-limits` JSON response

3. **We skip WebUI** (have TUI instead):
   - No `mountWebUI()` call
   - No `usageStats` middleware
   - No model mapping config

4. **TypeScript type safety**:
   - All interfaces defined: `AccountWithRateLimits`, `ModelQuota`, `ParsedError`
   - Request body types: `MessagesRequestBody`
   - `FlushableResponse` for streaming

### Index.ts vs index.js

| Feature                | Upstream            | Us                    | Notes            |
| ---------------------- | ------------------- | --------------------- | ---------------- |
| Debug mode parsing     | `--debug` arg       | Same                  | ✅ Match         |
| Fallback mode parsing  | `--fallback` arg    | Same                  | ✅ Match         |
| Logger initialization  | `logger.setDebug()` | `LoggerConfig`        | Different API    |
| Port configuration     | `process.env.PORT`  | Same                  | ✅ Match         |
| Startup banner         | ASCII box art       | CLI with clear output | Different style  |
| Endpoint documentation | Inline in banner    | Separate file         | We use CLAUDE.md |

---

## CLI Module Comparison

### Upstream CLI (`src/cli/accounts.js`)

Upstream has a single monolithic CLI file with all account commands. We have a modular structure with separate files per command.

| Command  | Upstream                                | Our Implementation                    | Notes              |
| -------- | --------------------------------------- | ------------------------------------- | ------------------ |
| `add`    | `addAccount()`, `addAccountNoBrowser()` | `src/cli/commands/accounts-add.ts`    | Same functionality |
| `list`   | `listAccounts()`                        | `src/cli/commands/accounts-list.ts`   | Same functionality |
| `remove` | `interactiveRemove()`                   | `src/cli/commands/accounts-remove.ts` | Same functionality |
| `clear`  | `clearAccounts()`                       | `src/cli/commands/accounts-clear.ts`  | Same functionality |
| `verify` | `verifyAccounts()`                      | `src/cli/commands/accounts-verify.ts` | Same functionality |
| `help`   | Inline usage text                       | Commander.js built-in                 | Better CLI UX      |

### CLI Structure Differences

| Aspect            | Upstream                | Us                                    |
| ----------------- | ----------------------- | ------------------------------------- |
| Framework         | Raw `readline/promises` | `@clack/prompts` + Commander.js       |
| File organization | Single file (509 lines) | Modular (12 files, 2,494 lines total) |
| Browser opening   | `child_process.exec()`  | `open` npm package                    |
| Server check      | Raw `net.Socket`        | `isServerRunning()` utility           |
| UI feedback       | Console.log with emojis | `@clack/prompts` spinners/logs        |
| Auth method       | OAuth only (inline)     | OAuth + refresh token option          |
| `--no-browser`    | ✅                      | ✅                                    |
| `--refresh-token` | ❌                      | ✅ **We added this**                  |
| REFRESH_TOKEN env | ❌                      | ✅ **We added this**                  |

### Our CLI File Structure

| File                          | Lines | Purpose                           |
| ----------------------------- | ----- | --------------------------------- |
| `cli/index.ts`                | 272   | Commander.js main entry           |
| `cli/ui.ts`                   | 195   | UI helpers, spinners, prompts     |
| `cli/utils.ts`                | 38    | `isServerRunning()`, utilities    |
| `cli/capacity-renderer.ts`    | 690   | Colored quota display with charts |
| `commands/init.ts`            | 277   | Interactive setup wizard          |
| `commands/accounts-list.ts`   | 251   | List accounts with capacity info  |
| `commands/accounts-add.ts`    | 218   | OAuth + refresh token flows       |
| `commands/accounts-verify.ts` | 152   | Token verification                |
| `commands/accounts-remove.ts` | 117   | Interactive removal               |
| `commands/trigger-reset.ts`   | 111   | Quota reset command               |
| `commands/accounts-clear.ts`  | 87    | Clear all accounts                |
| `commands/start.ts`           | 86    | Server start with flags           |

### Functions Unique to Us

| Function                   | Location                    | Purpose                                   |
| -------------------------- | --------------------------- | ----------------------------------------- |
| `validateRefreshToken()`   | `auth/oauth.ts`             | Validate refresh token without OAuth flow |
| `isServerRunning()`        | `cli/utils.ts`              | Port check utility                        |
| `handleRefreshTokenFlow()` | `commands/accounts-add.ts`  | Refresh token auth flow                   |
| `triggerResetCommand()`    | `commands/trigger-reset.ts` | Quota reset CLI command                   |
| `startCommand()`           | `commands/start.ts`         | Server start with flags                   |
| `initCommand()`            | `commands/init.ts`          | Interactive setup wizard                  |

---

## Error Classes Comparison

### All Error Classes

| Error Class          | Upstream | Us  | Notes                          |
| -------------------- | -------- | --- | ------------------------------ |
| `AntigravityError`   | ✅       | ✅  | Base class, identical          |
| `RateLimitError`     | ✅       | ✅  | Identical structure            |
| `AuthError`          | ✅       | ✅  | Identical structure            |
| `NoAccountsError`    | ✅       | ✅  | Identical structure            |
| `MaxRetriesError`    | ✅       | ✅  | Identical structure            |
| `ApiError`           | ✅       | ✅  | Identical structure            |
| `EmptyResponseError` | ✅       | ✅  | Identical structure            |
| `NativeModuleError`  | ✅       | ❌  | Not needed (no native modules) |
| `ErrorMetadata` type | ❌       | ✅  | **We added TypeScript type**   |

### Helper Functions

| Function                 | Upstream | Us  | Notes    |
| ------------------------ | -------- | --- | -------- |
| `isRateLimitError()`     | ✅       | ✅  | ✅ Match |
| `isAuthError()`          | ✅       | ✅  | ✅ Match |
| `isEmptyResponseError()` | ✅       | ✅  | ✅ Match |

---

## Retry Module Comparison

Upstream has a dedicated `utils/retry.js` module we **don't have**. We inline retry logic in handlers.

### Upstream Retry Functions

| Function                | Description                          | Our Status             |
| ----------------------- | ------------------------------------ | ---------------------- |
| `calculateBackoff()`    | Exponential backoff with ±25% jitter | Inline in handlers     |
| `retryWithBackoff()`    | Generic async retry wrapper          | Inline in handlers     |
| `isRetryableError()`    | Check if error can be retried        | `is5xxError()` similar |
| `isNonRetryableError()` | Check if error should NOT be retried | Not implemented        |

### Backoff Algorithm (Upstream)

```javascript
// Exponential: baseMs * 2^attempt
const exponential = baseMs * Math.pow(2, attempt);
// Cap at max
const capped = Math.min(exponential, maxMs);
// Add random jitter (±25%)
const jitter = capped * 0.25 * (Math.random() * 2 - 1);
return Math.floor(capped + jitter);
```

**Assessment**: We handle retries inline in `streaming-handler.ts` and `message-handler.ts`. Could extract to utility for consistency, but current approach works.

### Retry Module Deep Dive

Upstream's `utils/retry.js` (162 lines) provides a complete retry framework:

**`calculateBackoff(attempt, baseMs = 1000, maxMs = 30000)`**

```javascript
// Exponential: baseMs * 2^attempt (e.g., 1s, 2s, 4s, 8s, 16s)
// Cap at maxMs (30s)
// Add ±25% jitter to prevent thundering herd
```

**`retryWithBackoff(fn, options)`**

Options:

- `maxAttempts` (default: 5)
- `baseMs` (default: 1000)
- `maxMs` (default: 30000)
- `shouldRetry(error, attempt)` callback
- `onRetry(error, attempt, backoffMs)` callback

**`isRetryableError(error)`**

Returns `true` for:

- Network errors: `econnrefused`, `econnreset`, `etimedout`, `fetch failed`
- 5xx errors: `500`, `502`, `503`, `504`
- Rate limits: `429`, `rate limit`

**`isNonRetryableError(error)`**

Returns `true` for:

- Auth errors: `401`, `403`, `unauthorized`, `forbidden`
- Client errors: `400`, `bad request`
- Not found: `404`, `not found`

**Our Approach vs Upstream**:

| Aspect               | Upstream                              | Us                                 |
| -------------------- | ------------------------------------- | ---------------------------------- |
| Backoff calculation  | Dedicated function with jitter        | Simple exponential (500ms \* 2^n)  |
| Retry wrapper        | Generic `retryWithBackoff()`          | Inline while loops                 |
| Error classification | `isRetryableError()` checks 10+ cases | `is5xxError()` checks 5xx only     |
| Callback support     | `shouldRetry`, `onRetry` callbacks    | Hardcoded logic                    |
| Max delay cap        | Configurable `maxMs`                  | No cap (uses fixed delays)         |
| Jitter               | ±25% random variation                 | None (fixed delays)                |
| TypeScript           | ❌                                    | ✅ Full type safety                |
| Fallback decision    | Inline check                          | `shouldAttemptFallback()` function |

**Potential Improvement**: Could extract a `calculateBackoff()` utility function and add jitter for better thundering herd prevention.

---

## Message Handlers Deep Comparison

### streaming-handler.ts vs streaming-handler.js

| Feature                    | Upstream                     | Us                            | Notes                    |
| -------------------------- | ---------------------------- | ----------------------------- | ------------------------ |
| Lines of code              | 347                          | 333                           | Slightly shorter         |
| Sticky account selection   | ✅                           | ✅                            | ✅ Match                 |
| Buffer delay after wait    | `sleep(500)` inline          | `RATE_LIMIT_BUFFER_MS`        | We extracted constant    |
| Optimistic reset           | `resetAllRateLimits()`       | `optimisticReset(modelId)`    | We use model-specific    |
| 5xx error tracking         | Inline check                 | `all5xxErrors` flag           | **We added tracking** ✅ |
| 5xx fallback on exhaustion | ❌                           | `shouldAttemptFallback()`     | **We added this** ✅     |
| Retry delay                | `sleep(1000)` inline         | `RETRY_DELAY_MS`              | We extracted constant    |
| Empty response retry       | `MAX_EMPTY_RESPONSE_RETRIES` | `MAX_EMPTY_RETRIES`           | Same logic               |
| Backoff on empty retry     | `500 * 2^n`                  | None (immediate retry)        | Upstream more gradual    |
| emitEmptyResponseFallback  | ✅                           | ✅                            | ✅ Match                 |
| TypeScript interfaces      | ❌                           | ✅ `RateLimitErrorInfo`, etc. | **Type safety** ✅       |
| `is5xxError()` function    | ❌                           | ✅                            | **We added this** ✅     |
| Import from fallback-utils | ❌                           | ✅                            | **We modularized** ✅    |

### message-handler.ts vs message-handler.js

| Feature                    | Upstream                 | Us                                   | Notes                    |
| -------------------------- | ------------------------ | ------------------------------------ | ------------------------ |
| Lines of code              | 233                      | 289                                  | We have more types       |
| Thinking model detection   | `isThinkingModel(model)` | Same                                 | ✅ Match                 |
| SSE for thinking           | ✅                       | ✅                                   | ✅ Match                 |
| JSON for non-thinking      | ✅                       | ✅                                   | ✅ Match                 |
| 5xx error tracking         | Inline check             | `all5xxErrors` flag                  | **We added tracking** ✅ |
| 5xx fallback on exhaustion | ❌                       | `shouldAttemptFallback()`            | **We added this** ✅     |
| TypeScript interfaces      | ❌                       | `Account`, `AccountManagerInterface` | **Type safety** ✅       |
| Re-export types            | ❌                       | `export type { AnthropicResponse }`  | **We added** ✅          |
| Response body null check   | ❌                       | ✅ `if (!response.body)`             | **We added safety** ✅   |

### Shared Handler Logic

Both implementations follow the same core retry flow:

```
1. Calculate maxAttempts = max(MAX_RETRIES, accountCount + 1)
2. For each attempt:
   a. Pick sticky account (wait if needed)
   b. If all rate-limited: wait for reset + buffer, try optimistic reset
   c. If no account: attempt fallback model or throw
   d. Get token/project for account
   e. Try each endpoint (DAILY → PROD failover)
   f. Handle 401 (clear cache), 429 (mark rate-limited), 5xx (wait and retry)
   g. On success: return/yield response
   h. On account failure: continue to next account
3. If all attempts exhausted: try 5xx fallback or throw
```

### Key Improvements We Made

1. **5xx Fallback on Exhaustion**: When all retries fail with 5xx errors only, attempt fallback model
2. **Model-Specific Optimistic Reset**: `optimisticReset(modelId)` instead of `resetAllRateLimits()`
3. **Extracted Constants**: `RATE_LIMIT_BUFFER_MS`, `RETRY_DELAY_MS` for clarity
4. **TypeScript Interfaces**: Full type safety for `Account`, `AccountManagerInterface`, `RateLimitErrorInfo`
5. **Fallback Utils Module**: `is5xxError()`, `shouldAttemptFallback()` extracted to dedicated module
6. **Response Body Safety**: Explicit null checks for `response.body`

---

## Storage Module Comparison

### `loadAccounts()` Function

| Feature                 | Upstream                | Us                 |
| ----------------------- | ----------------------- | ------------------ |
| Async file access       | ✅                      | ✅                 |
| `enabled` field default | `acc.enabled !== false` | Same               |
| Reset invalid flag      | ✅                      | ✅                 |
| Model rate limits init  | ✅                      | ✅                 |
| Subscription tracking   | `subscription` object   | ❌ Not implemented |
| Quota tracking          | `quota` object          | ❌ (we use SQLite) |
| TypeScript types        | ❌                      | ✅                 |

### Upstream Subscription/Quota Fields

Upstream stores per-account subscription and quota data in accounts.json:

```javascript
subscription: acc.subscription || { tier: 'unknown', projectId: null, detectedAt: null },
quota: acc.quota || { models: {}, lastChecked: null }
```

**Our Approach**: We use SQLite (`quota-snapshots.db`) for quota storage instead of JSON.

### `saveAccounts()` Function

| Feature               | Upstream | Us                    |
| --------------------- | -------- | --------------------- |
| Directory creation    | ✅       | ✅                    |
| Persist enabled state | ✅       | ❌ Not in our version |
| Persist subscription  | ✅       | ❌ (SQLite instead)   |
| Persist quota         | ✅       | ❌ (SQLite instead)   |
| TypeScript types      | ❌       | ✅                    |

---

## Rate Limit Parser Comparison

Both implementations are **functionally identical**:

### Parsing Formats Supported

| Format                           | Upstream | Us  | Notes    |
| -------------------------------- | -------- | --- | -------- |
| `Retry-After` header (seconds)   | ✅       | ✅  | ✅ Match |
| `Retry-After` header (HTTP date) | ✅       | ✅  | ✅ Match |
| `x-ratelimit-reset` (Unix ts)    | ✅       | ✅  | ✅ Match |
| `x-ratelimit-reset-after` (s)    | ✅       | ✅  | ✅ Match |
| `quotaResetDelay` (ms/s)         | ✅       | ✅  | ✅ Match |
| `quotaResetTimeStamp` (ISO)      | ✅       | ✅  | ✅ Match |
| `retry-after-ms` (ms)            | ✅       | ✅  | ✅ Match |
| Duration strings (`1h23m45s`)    | ✅       | ✅  | ✅ Match |
| ISO timestamp                    | ✅       | ✅  | ✅ Match |
| Sanity check (min 2s buffer)     | ✅       | ✅  | ✅ Match |

### TypeScript Additions

| Type           | Purpose                        |
| -------------- | ------------------------------ |
| `HeadersLike`  | Interface for headers access   |
| `ResponseLike` | Interface for Response objects |

---

## Helpers Module Comparison

### Shared Functions

| Function             | Upstream | Us  | Notes             |
| -------------------- | -------- | --- | ----------------- |
| `formatDuration()`   | ✅       | ✅  | ✅ Match          |
| `sleep()`            | ✅       | ✅  | ✅ Match          |
| `isNetworkError()`   | ✅       | ✅  | ✅ Match          |
| `isAuthError()`      | ✅       | ✅  | ✅ Match          |
| `isRateLimitError()` | ✅       | ✅  | ✅ Match          |
| `fetchWithTimeout()` | ❌       | ✅  | **We added this** |

### `fetchWithTimeout()` Implementation

```typescript
export async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

Used in 7 OAuth/credential functions to prevent hanging on slow networks.

---

## Usage Stats Module (Upstream Only)

Upstream has `modules/usage-stats.js` for tracking request counts per model/hour. We use SQLite-based quota storage instead.

### Upstream Implementation

| Function                        | Description                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `setupMiddleware(app)`          | Express middleware to track POST requests to `/v1/messages` and `/v1/chat/completions` |
| `setupRoutes(app)`              | Adds `GET /api/stats/history` endpoint                                                 |
| `track(modelId)`                | Increment request count for model in current hour bucket                               |
| `getFamily(modelId)`            | Extract model family (claude/gemini/other)                                             |
| `getShortName(modelId, family)` | Remove family prefix from model name                                                   |
| `getHistory()`                  | Return sorted history data                                                             |
| `load()`                        | Load history from JSON file                                                            |
| `save()`                        | Persist history to JSON file                                                           |
| `prune()`                       | Remove data older than 30 days                                                         |

### Storage Format

Upstream uses JSON file (`~/.config/antigravity-proxy/usage-history.json`):

```javascript
{
  "2026-01-11T08:00:00.000Z": {
    "claude": { "sonnet-4-5": 5, "_subtotal": 5 },
    "gemini": { "3-flash": 10, "_subtotal": 10 },
    "_total": 15
  }
}
```

### Our Alternative

We use SQLite-based quota storage (`quota-storage.ts`) with burn rate calculation:

| Our Feature            | Description                                  |
| ---------------------- | -------------------------------------------- |
| `saveQuotaSnapshot()`  | Store quota snapshot with timestamp          |
| `getRecentSnapshots()` | Retrieve snapshots for burn rate calculation |
| `calculateBurnRate()`  | Compute tokens/hour consumption rate         |
| SQLite database        | `~/.config/ag-cl/quota-snapshots.db`         |

**Assessment**: Different approach, same goal (usage analytics). We chose SQLite for better querying and type safety.

---

## Entry Point Comparison (index.js vs index.ts)

### Upstream index.js

| Feature              | Implementation                          | Notes                  |
| -------------------- | --------------------------------------- | ---------------------- |
| Debug mode           | `--debug` arg or `DEBUG=true` env       | Same                   |
| Fallback mode        | `--fallback` arg or `FALLBACK=true` env | Same                   |
| Logger init          | `logger.setDebug(isDebug)`              | Different API          |
| Port config          | `process.env.PORT \|\| DEFAULT_PORT`    | Same                   |
| Startup banner       | ASCII box art with endpoints            | We use simpler output  |
| Config dir display   | Shows `~/.antigravity-claude-proxy`     | We show different path |
| Console clear        | `console.clear()` on start              | We don't clear         |
| Export fallback flag | `FALLBACK_ENABLED` export               | We use env var check   |

### Our index.ts

| Feature           | Implementation                           | Notes           |
| ----------------- | ---------------------------------------- | --------------- |
| CLI parsing       | Commander.js with structured options     | More structured |
| Log level         | `--log-level` option (6 levels)          | More granular   |
| Log file          | `--log-file` option                      | We added        |
| JSON logs         | `--json-logs` option                     | We added        |
| Silent mode       | `--silent` option                        | We added        |
| Auto-refresh      | `--auto-refresh` or `AUTO_REFRESH` env   | We added        |
| Trigger reset     | `--trigger-reset` or `TRIGGER_RESET` env | We added        |
| Max empty retries | `--max-empty-retries` option             | We added        |

### Features We Added (Upstream Lacks)

| Feature               | Description                                       |
| --------------------- | ------------------------------------------------- |
| `--log-level`         | 6 log levels (silent/error/warn/info/debug/trace) |
| `--log-file`          | Log to file for debugging                         |
| `--json-logs`         | JSON output for log parsing                       |
| `--silent`            | Suppress all output except errors                 |
| `--auto-refresh`      | Auto-refresh quota every 5 hours                  |
| `--trigger-reset`     | Reset quotas on startup                           |
| `--max-empty-retries` | Configure empty response retries                  |

---

## Constants Comparison (Deep Dive)

### Shared Constants (Matching)

| Constant                        | Upstream                                    | Us                   | Notes         |
| ------------------------------- | ------------------------------------------- | -------------------- | ------------- |
| `ANTIGRAVITY_ENDPOINT_DAILY`    | `https://daily-cloudcode-pa.googleapis.com` | Same                 | ✅ Match      |
| `ANTIGRAVITY_ENDPOINT_PROD`     | `https://cloudcode-pa.googleapis.com`       | Same                 | ✅ Match      |
| `DEFAULT_PROJECT_ID`            | `rising-fact-p41fc`                         | Same                 | ✅ Match      |
| `TOKEN_REFRESH_INTERVAL_MS`     | 5 min                                       | 5 min                | ✅ Match      |
| `REQUEST_BODY_LIMIT`            | `50mb`                                      | `50mb`               | ✅ Match      |
| `ANTIGRAVITY_AUTH_PORT`         | 9092                                        | 9092                 | ✅ Match      |
| `DEFAULT_PORT`                  | 8080                                        | 8080                 | ✅ Match      |
| `DEFAULT_COOLDOWN_MS`           | 10s (config)                                | 10s                  | ✅ Match      |
| `MAX_RETRIES`                   | 5                                           | 5                    | ✅ Match      |
| `MAX_EMPTY_RESPONSE_RETRIES`    | 2                                           | 2 (env configurable) | We add config |
| `MAX_ACCOUNTS`                  | 10                                          | 10                   | ✅ Match      |
| `MAX_WAIT_BEFORE_ERROR_MS`      | 120000                                      | 120000               | ✅ Match      |
| `MIN_SIGNATURE_LENGTH`          | 50                                          | 50                   | ✅ Match      |
| `GEMINI_MAX_OUTPUT_TOKENS`      | 16384                                       | 16384                | ✅ Match      |
| `GEMINI_SKIP_SIGNATURE`         | sentinel                                    | Same                 | ✅ Match      |
| `GEMINI_SIGNATURE_CACHE_TTL_MS` | 2 hours                                     | 2 hours              | ✅ Match      |
| `OAUTH_CONFIG`                  | Full config object                          | Same                 | ✅ Match      |
| `MODEL_FALLBACK_MAP`            | 6 mappings                                  | Same                 | ✅ Match      |

### Constants We Added (Upstream Lacks)

| Constant                         | Value    | Purpose                        |
| -------------------------------- | -------- | ------------------------------ |
| `RATE_LIMIT_BUFFER_MS`           | 500      | Buffer after rate limit wait   |
| `RETRY_DELAY_MS`                 | 1000     | Pause between retries          |
| `OAUTH_FETCH_TIMEOUT_MS`         | 15000    | Prevent hanging OAuth calls    |
| `AUTO_REFRESH_INTERVAL_MS`       | 5 hours  | Auto-refresh quota period      |
| `AUTO_REFRESH_CHECK_INTERVAL_MS` | 5 min    | Clock-aligned check interval   |
| `MAX_EMPTY_RETRIES_LIMIT`        | 10       | Upper bound for retries config |
| `DEFAULT_SCHEDULING_MODE`        | `sticky` | Default account selection      |
| `VALID_SCHEDULING_MODES`         | 4 modes  | Type-safe mode list            |

### Constants Upstream Has (We Skip)

| Constant                         | Reason                               |
| -------------------------------- | ------------------------------------ |
| `USAGE_HISTORY_PATH`             | We use SQLite instead                |
| `ANTIGRAVITY_SYSTEM_INSTRUCTION` | We have configurable injection modes |

### Functions Comparison

| Function                 | Upstream | Us  | Notes                                 |
| ------------------------ | -------- | --- | ------------------------------------- |
| `getAntigravityDbPath()` | ✅       | ✅  | ✅ Match (platform detection)         |
| `getPlatformUserAgent()` | ✅       | ✅  | ✅ Match                              |
| `getModelFamily()`       | ✅       | ✅  | ✅ Match (returns `ModelFamily` type) |
| `isThinkingModel()`      | ✅       | ✅  | ✅ Match                              |

### TypeScript Types (We Added)

| Type              | Purpose                             |
| ----------------- | ----------------------------------- |
| `ModelFamily`     | `"claude" \| "gemini" \| "unknown"` |
| `OAuthConfigType` | Typed OAuth configuration interface |
| `SchedulingMode`  | Account selection mode type         |

---

## Test Helpers Comparison

### Upstream Test Helpers (`tests/helpers/`)

| File              | Purpose                | Functions                                                                                   |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `http-client.cjs` | HTTP request utilities | `streamRequest()`, `makeRequest()`, `analyzeContent()`, `analyzeEvents()`, `extractUsage()` |
| `test-models.cjs` | Model configuration    | `getTestModels()`, `getThinkingModels()`, `familySupportsThinking()`, `getModelConfig()`    |

### Our Test Helpers (`tests/helpers/`)

| File                      | Purpose             | Functions                                                                                                                                           |
| ------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mocks.ts`                | Mock factories      | `createMockResponse()`, `createMockStream()`, `createMockStreamResponse()`, `createMockLogger()`, `createMockFetch()`, `createMockAccountManager()` |
| `factories.ts`            | Test data factories | Request/response factory functions                                                                                                                  |
| `fixtures.ts`             | Static test data    | Fixture constants                                                                                                                                   |
| `snapshot-normalizers.ts` | Snapshot formatting | Normalize dynamic values for snapshots                                                                                                              |
| `time-constants.ts`       | Time constants      | Test timing values                                                                                                                                  |

### Key Differences

| Aspect           | Upstream                              | Us                           |
| ---------------- | ------------------------------------- | ---------------------------- |
| HTTP client      | Raw Node.js `http.request()`          | Vitest mocks + fetch mocking |
| SSE parsing      | Manual in `streamRequest()`           | Via `createMockStream()`     |
| Content analysis | `analyzeContent()`, `analyzeEvents()` | Unit test assertions         |
| Model config     | `test-models.cjs`                     | Constants in test files      |
| Mock types       | N/A (JavaScript)                      | Full TypeScript interfaces   |
| Account mocking  | N/A                                   | `createMockAccountManager()` |
| Logger mocking   | N/A                                   | `createMockLogger()`         |

### Upstream `analyzeContent()` Function

```javascript
function analyzeContent(content) {
    return {
        thinking: content.filter(b => b.type === 'thinking'),
        toolUse: content.filter(b => b.type === 'tool_use'),
        text: content.filter(b => b.type === 'text'),
        hasThinking: thinking.length > 0,
        hasToolUse: toolUse.length > 0,
        hasText: text.length > 0,
        thinkingHasSignature: /* signature check */,
        toolUseHasSignature: /* signature check */,
        hasSignature: /* combined check */
    };
}
```

**Assessment**: We use Vitest assertions directly instead of helper functions. Both approaches work, ours is more idiomatic for Vitest.

---

## Module Index Files Comparison

Both projects use barrel exports (index.js/ts) for clean module boundaries.

### Format Module Index

| Export                              | Upstream               | Us   | Notes    |
| ----------------------------------- | ---------------------- | ---- | -------- |
| `convertAnthropicToGoogle`          | ✅                     | ✅   | ✅ Match |
| `convertGoogleToAnthropic`          | ✅                     | ✅   | ✅ Match |
| Re-export from `request-converter`  | ✅                     | ✅   | ✅ Match |
| Re-export from `response-converter` | ✅                     | ✅   | ✅ Match |
| Re-export from `content-converter`  | ✅                     | ✅   | ✅ Match |
| Re-export from `schema-sanitizer`   | ✅                     | ✅   | ✅ Match |
| Re-export from `thinking-utils`     | ✅                     | ✅   | ✅ Match |
| Default export                      | Object with converters | Same | ✅ Match |

### CloudCode Module Index

| Export                 | Upstream                  | Us   | Notes        |
| ---------------------- | ------------------------- | ---- | ------------ |
| `sendMessage`          | ✅                        | ✅   | ✅ Match     |
| `sendMessageStream`    | ✅                        | ✅   | ✅ Match     |
| `listModels`           | ✅                        | ✅   | ✅ Match     |
| `fetchAvailableModels` | ✅                        | ✅   | ✅ Match     |
| `getModelQuotas`       | ✅                        | ✅   | ✅ Match     |
| `getSubscriptionTier`  | ✅                        | ✅   | ✅ Match     |
| `fetchAccountCapacity` | ❌                        | ✅   | **We added** |
| `groupByPool`          | ❌                        | ✅   | **We added** |
| `findEarliestReset`    | ❌                        | ✅   | **We added** |
| Default export         | Object with API functions | Same | ✅ Match     |

---

## AccountManager Class Comparison

Both implementations use the same class structure with private fields and the same method signatures.

### Class Structure

| Aspect                | Upstream                           | Us              | Notes    |
| --------------------- | ---------------------------------- | --------------- | -------- |
| Private fields syntax | `#accounts`, `#currentIndex`       | Same            | ✅ Match |
| Caching strategy      | `Map<email, {token, extractedAt}>` | Same with types | ✅ Match |
| Initialization guard  | `#initialized` flag                | Same            | ✅ Match |
| Config path           | Constructor parameter              | Same            | ✅ Match |

### Methods Comparison

| Method                                      | Upstream | Us  | Notes        |
| ------------------------------------------- | -------- | --- | ------------ |
| `initialize()`                              | ✅       | ✅  | ✅ Match     |
| `reload()`                                  | ✅       | ✅  | ✅ Match     |
| `getAccountCount()`                         | ✅       | ✅  | ✅ Match     |
| `isAllRateLimited(modelId?)`                | ✅       | ✅  | ✅ Match     |
| `getAvailableAccounts(modelId?)`            | ✅       | ✅  | ✅ Match     |
| `getInvalidAccounts()`                      | ✅       | ✅  | ✅ Match     |
| `clearExpiredLimits()`                      | ✅       | ✅  | ✅ Match     |
| `resetAllRateLimits()`                      | ✅       | ✅  | ✅ Match     |
| `pickNext(modelId?)`                        | ✅       | ✅  | ✅ Match     |
| `getCurrentStickyAccount(modelId?)`         | ✅       | ✅  | ✅ Match     |
| `shouldWaitForCurrentAccount(modelId?)`     | ✅       | ✅  | ✅ Match     |
| `pickStickyAccount(modelId?)`               | ✅       | ✅  | ✅ Match     |
| `markRateLimited(email, resetMs, modelId?)` | ✅       | ✅  | ✅ Match     |
| `markInvalid(email, reason)`                | ✅       | ✅  | ✅ Match     |
| `getMinWaitTimeMs(modelId?)`                | ✅       | ✅  | ✅ Match     |
| `getTokenForAccount(account)`               | ✅       | ✅  | ✅ Match     |
| `getProjectForAccount(account, token)`      | ✅       | ✅  | ✅ Match     |
| `clearProjectCache(email?)`                 | ✅       | ✅  | ✅ Match     |
| `clearTokenCache(email?)`                   | ✅       | ✅  | ✅ Match     |
| `saveToDisk()`                              | ✅       | ✅  | ✅ Match     |
| `getStatus()`                               | ✅       | ✅  | ✅ Match     |
| `getSettings()`                             | ✅       | ✅  | ✅ Match     |
| `getAllAccounts()`                          | ✅       | ✅  | ✅ Match     |
| `pickByMode(modelId, mode?)`                | ❌       | ✅  | **We added** |
| `optimisticReset(modelId)`                  | ❌       | ✅  | **We added** |
| `triggerQuotaReset(group?)`                 | ❌       | ✅  | **We added** |
| `getSchedulingMode()`                       | ❌       | ✅  | **We added** |
| `setSchedulingMode(mode)`                   | ❌       | ✅  | **We added** |

### Features We Added

| Feature               | Description                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `pickByMode()`        | Dispatch to scheduling mode (sticky/round-robin/refresh-priority/drain-highest) |
| `optimisticReset()`   | Clear rate limits for model after buffer wait fails                             |
| `triggerQuotaReset()` | Trigger quota reset for quota groups                                            |
| Scheduling modes      | 4 modes: sticky, refresh-priority, drain-highest, round-robin                   |
| TypeScript interfaces | `Account`, `AccountSettings`, `TokenCacheEntry`, `AccountStatus`, etc.          |

### TypeScript Types We Added

```typescript
export interface Account {
  email: string;
  refreshToken?: string;
  projectId?: string;
  source: "oauth" | "refresh-token" | "database";
  enabled?: boolean;
  isInvalid?: boolean;
  invalidReason?: string | null;
  modelRateLimits?: Record<string, ModelRateLimit>;
  lastUsed?: string | null;
  addedAt?: string;
}

export interface TokenCacheEntry {
  token: string;
  extractedAt: number;
}

export type SchedulingMode = "sticky" | "refresh-priority" | "drain-highest" | "round-robin";
```

---

## Native Module Helper (Upstream Only)

Upstream has `utils/native-module-helper.js` for auto-rebuilding native modules. We **don't need this** since we use TypeScript.

| Function                 | Description                            |
| ------------------------ | -------------------------------------- |
| `isModuleVersionError()` | Check if error is NODE_MODULE_VERSION  |
| `extractModulePath()`    | Extract .node file path from error     |
| `findPackageRoot()`      | Walk up to find package.json           |
| `rebuildModule()`        | Run `npm rebuild` in package directory |
| `attemptAutoRebuild()`   | Full auto-rebuild workflow             |
| `clearRequireCache()`    | Clear module from require cache        |

**Why We Skip**: TypeScript compilation handles module compatibility. Our `better-sqlite3` import is direct, not lazy-loaded. Users run `npm rebuild` manually if needed.

---

## Claude Config Utility (Upstream Only)

Upstream has `utils/claude-config.js` for WebUI's Claude CLI settings editor. We **skip this** since we don't have WebUI.

| Function                | Description                              |
| ----------------------- | ---------------------------------------- |
| `getClaudeConfigPath()` | Returns `~/.claude/settings.json` path   |
| `readClaudeConfig()`    | Read config, handle missing/invalid JSON |
| `updateClaudeConfig()`  | Deep merge updates into existing config  |
| `deepMerge()`           | Recursive object merge helper            |

**Why We Skip**: We have TUI instead of WebUI. Users manually configure Claude CLI.

---

## Logger Module Comparison

### Architecture Differences

| Aspect          | Upstream                          | Us                                      |
| --------------- | --------------------------------- | --------------------------------------- |
| Library         | Custom class + ANSI codes         | Pino + pino-pretty                      |
| Singleton       | Exported `logger` instance        | `getLogger()` function                  |
| Log levels      | info, success, warn, error, debug | silent, error, warn, info, debug, trace |
| History         | In-memory array (max 1000)        | Not implemented                         |
| Event emitter   | ✅ `emit('log', entry)`           | ❌ Not needed                           |
| TUI mode        | ❌ Not implemented                | ✅ Writes to buffer                     |
| Pretty printing | Custom ANSI colors                | pino-pretty transport                   |
| JSON output     | ❌                                | ✅ Native Pino feature                  |

### Upstream Logger Features We Skip

| Feature           | Upstream                     | Why We Skip               |
| ----------------- | ---------------------------- | ------------------------- |
| Log history       | `getHistory()` returns array | Not needed (no WebUI SSE) |
| Event emission    | `on('log', callback)`        | Not needed (no WebUI SSE) |
| `success()` level | Green-colored success logs   | Use `info()` instead      |
| `header()` method | Section header formatting    | Not needed                |

### Our Logger Additions

| Feature               | Description                       |
| --------------------- | --------------------------------- |
| `initLogger()`        | Configure logger with options     |
| `setLogLevel()`       | Dynamic level changes             |
| `isLoggerInTuiMode()` | Check if using TUI destination    |
| `tuiDestination`      | Write to buffer for TUI rendering |
| `LogLevel` type       | TypeScript type for log levels    |

---

## Fallback Config Comparison

### Shared Functions (Identical)

| Function             | Upstream                     | Us      |
| -------------------- | ---------------------------- | ------- |
| `getFallbackModel()` | Returns fallback or null     | ✅ Same |
| `hasFallback()`      | Checks if model has fallback | ✅ Same |

### Our Extensions

| Function/Type             | Description                              |
| ------------------------- | ---------------------------------------- |
| `shouldAttemptFallback()` | Decision logic for 5xx fallback          |
| `is5xxError()`            | Check if error is 5xx server error       |
| `FallbackDecision`        | Discriminated union type for type safety |

### `FallbackDecision` Type

```typescript
export type FallbackDecision = { shouldFallback: false; fallbackModel: null } | { shouldFallback: true; fallbackModel: string };
```

Provides type-safe fallback decisions in message handlers.

---

## Config Module Comparison

### Upstream Config Features

| Feature               | Upstream                                  | Us                      |
| --------------------- | ----------------------------------------- | ----------------------- |
| Config file location  | `~/.config/antigravity-proxy/config.json` | Environment + constants |
| Local config fallback | `./config.json`                           | Not implemented         |
| `getPublicConfig()`   | Returns copy of config                    | Not implemented         |
| `saveConfig()`        | Write updates to file                     | Not implemented         |
| Environment overrides | WEBUI_PASSWORD, DEBUG                     | Various env vars        |

### Upstream Default Config

```javascript
const DEFAULT_CONFIG = {
  webuiPassword: "",
  debug: false,
  logLevel: "info",
  maxRetries: 5,
  retryBaseMs: 1000,
  retryMaxMs: 30000,
  persistTokenCache: false,
  defaultCooldownMs: 60000, // Note: We use 10000 (10s)
  maxWaitBeforeErrorMs: 120000,
  modelMapping: {},
};
```

**Key Difference**: Upstream uses 60s cooldown by default; we use 10s (Issue #57 fix).

### Why We Skip Config Module

1. **No WebUI**: No need for `webuiPassword`, `modelMapping`, or dynamic config changes
2. **Constants file**: We define settings in `constants.ts`
3. **Environment variables**: We prefer env vars for configuration
4. **TypeScript types**: Better type safety with explicit constants

---

## Logger Module Deep Comparison

### Architecture Differences

| Aspect          | Upstream                          | Us                                      |
| --------------- | --------------------------------- | --------------------------------------- |
| Library         | Custom class + ANSI codes         | Pino + pino-pretty                      |
| Singleton       | Exported `logger` instance        | `getLogger()` function                  |
| Lines of code   | 146                               | 93                                      |
| Log levels      | info, success, warn, error, debug | silent, error, warn, info, debug, trace |
| History         | In-memory array (max 1000)        | Not implemented                         |
| Event emitter   | ✅ `emit('log', entry)`           | ❌ Not needed                           |
| TUI mode        | ❌ Not implemented                | ✅ Writes to buffer                     |
| Pretty printing | Custom ANSI colors                | pino-pretty transport                   |
| JSON output     | ❌                                | ✅ Native Pino feature                  |

### Upstream Logger Implementation

```javascript
class Logger extends EventEmitter {
  constructor() {
    super();
    this.isDebugEnabled = false;
    this.history = [];
    this.maxHistory = 1000;
  }

  // Methods: setDebug(), getTimestamp(), getHistory(), print()
  // Levels: info(), success(), warn(), error(), debug(), log(), header()
}

export const logger = new Logger();
```

**Upstream-Only Features**:

| Feature          | Purpose                                 |
| ---------------- | --------------------------------------- |
| `getHistory()`   | Returns array of last 1000 log entries  |
| `emit('log', e)` | EventEmitter for log streaming to WebUI |
| `success()`      | Green-colored success logs              |
| `header()`       | Section header formatting               |

### Our Logger Implementation

```typescript
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

export interface LoggerOptions {
  level?: LogLevel;
  tuiMode?: boolean;
  tuiDestination?: DestinationStream;
}

// Functions: createLogger(), isLoggerInTuiMode(), initLogger(), getLogger(), setLogLevel()
```

**Our Additions**:

| Feature               | Purpose                                |
| --------------------- | -------------------------------------- |
| `initLogger(options)` | Configure logger with level, TUI mode  |
| `setLogLevel(level)`  | Dynamic level changes at runtime       |
| `isLoggerInTuiMode()` | Check if using TUI destination         |
| `tuiDestination`      | Write to buffer for TUI rendering      |
| `LogLevel` type       | TypeScript type for 6 log levels       |
| `LoggerOptions`       | TypeScript interface for configuration |
| `trace` level         | More verbose than debug                |
| `silent` level        | Suppress all output                    |

### Why Different Approaches

| Consideration       | Upstream Choice              | Our Choice                 |
| ------------------- | ---------------------------- | -------------------------- |
| WebUI SSE streaming | Needs EventEmitter + history | Not needed (have TUI)      |
| Performance         | Custom implementation        | Pino (high-performance)    |
| Pretty output       | Manual ANSI codes            | pino-pretty transport      |
| JSON logs           | Not supported                | Native Pino feature        |
| TUI integration     | Not needed                   | Custom destination stream  |
| Type safety         | JSDoc comments               | Full TypeScript interfaces |

---

## Helpers Module Deep Comparison

### Shared Functions (Identical Logic)

| Function             | Upstream Lines | Our Lines | Notes          |
| -------------------- | -------------- | --------- | -------------- |
| `formatDuration(ms)` | 13             | 13        | ✅ Identical   |
| `sleep(ms)`          | 3              | 3         | ✅ Identical   |
| `isNetworkError()`   | 10             | 4         | ✅ Same checks |
| `isAuthError()`      | 8              | 4         | ✅ Same checks |
| `isRateLimitError()` | 7              | 4         | ✅ Same checks |

### Our Addition: `fetchWithTimeout()`

```typescript
export async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**Used in 7 OAuth/credential functions**:

1. `exchangeCode()` - Token exchange
2. `refreshAccessToken()` - Token refresh
3. `getUserEmail()` - User info endpoint
4. `discoverProjectId()` - Project discovery
5. `getTokenForAccount()` - Token fetch
6. `getProjectForAccount()` - Project fetch
7. `validateRefreshToken()` - Token validation

**Timeout value**: `OAUTH_FETCH_TIMEOUT_MS = 15000` (15 seconds)

### Why We Added Timeout

**Problem** (Issue #68): First request after idle period hangs indefinitely.

**Root Cause**: OAuth fetch calls have no timeout. After token cache expires (5 min), refresh call can hang forever on slow networks.

**Solution**: Added `fetchWithTimeout()` with AbortController to all OAuth calls.

---

## Native Module Helper (Upstream Only)

Upstream has `utils/native-module-helper.js` (163 lines) for auto-rebuilding native modules. We **don't need this** since we use TypeScript.

### Functions

| Function                 | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `isModuleVersionError()` | Check if error is NODE_MODULE_VERSION      |
| `extractModulePath()`    | Extract .node file path from error message |
| `findPackageRoot()`      | Walk up to find package.json               |
| `rebuildModule()`        | Run `npm rebuild` in package directory     |
| `attemptAutoRebuild()`   | Full auto-rebuild workflow                 |
| `clearRequireCache()`    | Clear module from require cache            |

### How It Works

```javascript
export function isModuleVersionError(error) {
  const message = error?.message || "";
  return message.includes("NODE_MODULE_VERSION") && message.includes("was compiled against a different Node.js version");
}

export function attemptAutoRebuild(error) {
  const nodePath = extractModulePath(error); // 1. Find .node file
  const packagePath = findPackageRoot(nodePath); // 2. Find package root
  return rebuildModule(packagePath); // 3. Run npm rebuild
}
```

### Why We Skip This

| Reason                         | Explanation                                |
| ------------------------------ | ------------------------------------------ |
| TypeScript compilation         | Build process handles module compatibility |
| Direct `better-sqlite3` import | No lazy loading needed                     |
| Simpler error handling         | Users run `npm rebuild` manually if needed |
| No `NativeModuleError` class   | Not needed in TypeScript codebase          |

---

## Claude Config Utility (Upstream Only)

Upstream has `utils/claude-config.js` (112 lines) for WebUI's Claude CLI settings editor. We **skip this** since we don't have WebUI.

### Functions

| Function                | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `getClaudeConfigPath()` | Returns `~/.claude/settings.json` path   |
| `readClaudeConfig()`    | Read config, handle missing/invalid JSON |
| `updateClaudeConfig()`  | Deep merge updates into existing config  |
| `deepMerge()`           | Recursive object merge helper            |

### Config Path

```javascript
export function getClaudeConfigPath() {
  return path.join(os.homedir(), ".claude", "settings.json");
}
```

### How It's Used (WebUI Only)

```javascript
// POST /api/claude/config route
app.post("/api/claude/config", async (req, res) => {
  const updates = req.body;
  await updateClaudeConfig(updates);
  res.json({ success: true });
});
```

### Why We Skip This

| Reason                 | Explanation                                |
| ---------------------- | ------------------------------------------ |
| No WebUI               | No web-based Claude CLI config editor      |
| Manual config          | Users edit Claude CLI settings directly    |
| TUI alternative        | Our TUI doesn't modify Claude CLI settings |
| Different architecture | We use environment variables, not files    |

---

## Fallback Config Deep Comparison

### Upstream Implementation (`fallback-config.js` - 30 lines)

```javascript
export function getFallbackModel(model) {
  return MODEL_FALLBACK_MAP[model] || null;
}

export function hasFallback(model) {
  return model in MODEL_FALLBACK_MAP;
}
```

### Our Implementation (`fallback-config.ts` + `fallback-utils.ts`)

We split into two files for separation of concerns:

**`fallback-config.ts`** - Re-exports from constants (same as upstream)
**`fallback-utils.ts`** - Added 5xx detection and fallback decision logic

### Functions Comparison

| Function                  | Upstream | Us  | Notes                      |
| ------------------------- | -------- | --- | -------------------------- |
| `getFallbackModel(model)` | ✅       | ✅  | ✅ Identical               |
| `hasFallback(model)`      | ✅       | ✅  | ✅ Identical               |
| `shouldAttemptFallback()` | ❌       | ✅  | **We added this** ✅       |
| `is5xxError()`            | ❌       | ✅  | **We added this** ✅       |
| `FallbackDecision` type   | ❌       | ✅  | **Discriminated union** ✅ |

### Our `shouldAttemptFallback()` Function

```typescript
export type FallbackDecision = { shouldFallback: false; fallbackModel: null } | { shouldFallback: true; fallbackModel: string };

export function shouldAttemptFallback(model: string, all5xxErrors: boolean, fallbackEnabled: boolean): FallbackDecision {
  if (!all5xxErrors || !fallbackEnabled) {
    return { shouldFallback: false, fallbackModel: null };
  }
  const fallbackModel = getFallbackModel(model);
  if (!fallbackModel) {
    return { shouldFallback: false, fallbackModel: null };
  }
  return { shouldFallback: true, fallbackModel };
}
```

### Our `is5xxError()` Function

```typescript
export function is5xxError(err: Error): boolean {
  const msg = err.message;
  // Match 5xx status codes with word boundaries to avoid false positives
  return /\b5\d{2}\b/.test(msg) || msg.includes("API error 5");
}
```

**Why Word Boundaries**: Avoids false positives like "port 5000" being matched as 500.

### Why We Added These

**Problem** (PR #90): When all retries are exhausted with 5xx server errors, requests fail completely even when an alternate model family might be available.

**Solution**:

- Track whether all failures were 5xx errors
- On exhaustion, attempt fallback to configured alternate model
- Discriminated union provides type-safe decision handling

---

## Session Manager Deep Comparison

### Core Logic (Identical)

Both implementations use the exact same algorithm:

| Feature                 | Upstream | Us  | Notes              |
| ----------------------- | -------- | --- | ------------------ |
| `deriveSessionId()`     | ✅       | ✅  | ✅ Same logic      |
| Find first user message | ✅       | ✅  | ✅ Same logic      |
| SHA256 hash (32 chars)  | ✅       | ✅  | ✅ Same logic      |
| Random UUID fallback    | ✅       | ✅  | ✅ Same logic      |
| TypeScript types        | ❌       | ✅  | We added types     |
| Type predicate filter   | ❌       | ✅  | TypeScript feature |

### Algorithm

```typescript
export function deriveSessionId(anthropicRequest: AnthropicRequest): string {
  const messages = anthropicRequest.messages ?? [];

  for (const msg of messages) {
    if (msg.role === "user") {
      let content = "";
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .filter(/* text blocks only */)
          .map((block) => block.text)
          .join("\n");
      }
      if (content) {
        const hash = crypto.createHash("sha256").update(content).digest("hex");
        return hash.substring(0, 32);
      }
    }
  }
  return crypto.randomUUID();
}
```

### Why Session IDs Matter

Session IDs enable **prompt caching** in Cloud Code:

- Cache is scoped to session + organization
- Same conversation = same session ID = reuse cached context
- First user message hash ensures stability across turns

---

## Credentials Module Deep Comparison

### Functions Comparison

| Function                 | Upstream           | Us                                                              | Notes                |
| ------------------------ | ------------------ | --------------------------------------------------------------- | -------------------- |
| `getTokenForAccount()`   | Uses raw `fetch()` | Uses `fetchWithTimeout()` (indirectly via `refreshAccessToken`) | **Timeout added** ✅ |
| `getProjectForAccount()` | Uses raw `fetch()` | Uses `fetchWithTimeout()`                                       | **Timeout added** ✅ |
| `discoverProject()`      | Uses raw `fetch()` | Uses `fetchWithTimeout()`                                       | **Timeout added** ✅ |
| `clearProjectCache()`    | ✅                 | ✅                                                              | ✅ Identical         |
| `clearTokenCache()`      | ✅                 | ✅                                                              | ✅ Identical         |
| Network error handling   | `isNetworkError()` | Same                                                            | ✅ Identical         |
| TypeScript types         | ❌                 | `Account`, `TokenCacheEntry`, etc.                              | **Type safety** ✅   |

### Key Difference: `fetchWithTimeout()`

**Upstream `discoverProject()`**:

```javascript
const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify({ ... })
});
```

**Our `discoverProject()`**:

```typescript
const response = await fetchWithTimeout(
    `${endpoint}/v1internal:loadCodeAssist`,
    {
        method: "POST",
        headers: { ... },
        body: JSON.stringify({ ... }),
    },
    OAUTH_FETCH_TIMEOUT_MS,  // 15 seconds timeout
);
```

### TypeScript Types We Added

```typescript
export interface Account {
  email: string;
  refreshToken?: string;
  projectId?: string;
  source: "oauth" | "refresh-token" | "database" | "manual";
  apiKey?: string;
  dbPath?: string;
  enabled?: boolean;
  isInvalid?: boolean;
  invalidReason?: string | null;
  modelRateLimits?: Record<string, ModelRateLimit>;
  lastUsed?: string | null;
  addedAt?: string;
}

export interface TokenCacheEntry {
  token: string;
  extractedAt: number;
}

export type OnInvalidCallback = (email: string, reason: string) => void;
export type OnSaveCallback = () => Promise<void>;
```

### Additional Response Type

```typescript
interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string | { id: string };
}
```

---

## Selection Module Deep Comparison

### selection.ts vs selection.js

| Aspect         | Upstream                  | Us                                   | Notes                                  |
| -------------- | ------------------------- | ------------------------------------ | -------------------------------------- |
| Lines of code  | 202                       | 480                                  | We added scheduling modes              |
| Core functions | 4                         | 10                                   | We added 6 new functions               |
| TypeScript     | ❌                        | ✅ Full types                        | Type safety                            |
| Module state   | `stickyAccountEmail` only | + `lastPickedIndex` + quota state    | Round-robin and refresh-priority state |
| Callbacks      | `onSave` only             | + `onSave` + quota state integration | Auto-refresh support                   |

### Shared Functions (All Match Exactly)

| Function                        | Upstream | Us  | Notes    |
| ------------------------------- | -------- | --- | -------- |
| `pickNext()`                    | ✅       | ✅  | ✅ Match |
| `getCurrentStickyAccount()`     | ✅       | ✅  | ✅ Match |
| `shouldWaitForCurrentAccount()` | ✅       | ✅  | ✅ Match |
| `pickStickyAccount()`           | ✅       | ✅  | ✅ Match |

### Functions We Added (Upstream Lacks)

| Function                | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `optimisticReset()`     | Clear rate limits for model after buffer wait fails (Issue #72 enhancement)     |
| `pickByMode()`          | Dispatch to scheduling mode (sticky/round-robin/refresh-priority/drain-highest) |
| `pickRefreshPriority()` | Sort by earliest quota reset time, pick first available                         |
| `pickDrainHighest()`    | Sort by highest quota percentage, drain most-full accounts first                |
| `pickRoundRobin()`      | Module-level index rotation across accounts                                     |
| `pickSticky()`          | Simplified sticky logic for `pickByMode()` dispatcher                           |

### `pickByMode()` Function

```typescript
export function pickByMode(accounts: Account[], modelId: string, mode: SchedulingMode = DEFAULT_SCHEDULING_MODE, onSave?: () => Promise<void>): Account | null;
```

Dispatches to appropriate picker based on mode:

| Mode               | Implementation                   | Use Case                             |
| ------------------ | -------------------------------- | ------------------------------------ |
| `sticky`           | `pickSticky()` + mark `lastUsed` | Default - stay with one account      |
| `refresh-priority` | Sort by `resetAt`, pick first    | Use accounts closest to quota reset  |
| `drain-highest`    | Sort by quota %, pick highest    | Even out quota usage across accounts |
| `round-robin`      | `lastPickedIndex++` modulo count | Equal distribution                   |

### `optimisticReset()` Function

```typescript
export function optimisticReset(accounts: Account[], modelId: string): number;
```

Called after rate limit buffer wait (500ms) fails. Clears expired model-specific rate limits and returns count of accounts freed. This is an enhancement over upstream's `resetAllRateLimits()` which clears all limits globally.

### Quota State Integration

We integrate with the auto-refresh scheduler's quota state:

```typescript
// In pickRefreshPriority() and pickDrainHighest()
import { getQuotaState } from "../cloudcode/auto-refresh-scheduler.js";

function pickRefreshPriority(...): Account | null {
  const quotaState = getQuotaState();
  // Sort accounts by their model's reset time
  const sortedWithReset = available.map(acc => ({
    account: acc,
    resetAt: findEarliestResetForModel(quotaState, acc.email, modelId)
  }));
  sortedWithReset.sort((a, b) => (a.resetAt ?? Infinity) - (b.resetAt ?? Infinity));
  // ...
}
```

### TypeScript Types We Added

```typescript
export type SchedulingMode = "sticky" | "refresh-priority" | "drain-highest" | "round-robin";

export const VALID_SCHEDULING_MODES: readonly SchedulingMode[] = ["sticky", "refresh-priority", "drain-highest", "round-robin"];

export const DEFAULT_SCHEDULING_MODE: SchedulingMode = "sticky";
```

---

## Rate Limits Module Deep Comparison

### rate-limits.ts vs rate-limits.js

| Aspect              | Upstream | Us                   | Notes                        |
| ------------------- | -------- | -------------------- | ---------------------------- |
| Lines of code       | 203      | 254                  | We added quota group reset   |
| Core functions      | 8        | 9                    | We added `triggerQuotaReset` |
| TypeScript          | ❌       | ✅ Full types        | Type safety                  |
| Quota group support | ❌       | ✅ Group-based reset | `QuotaGroupKey` type         |

### Shared Functions (All Match Exactly)

| Function                 | Upstream | Us  | Notes    |
| ------------------------ | -------- | --- | -------- |
| `isAllRateLimited()`     | ✅       | ✅  | ✅ Match |
| `getAvailableAccounts()` | ✅       | ✅  | ✅ Match |
| `getInvalidAccounts()`   | ✅       | ✅  | ✅ Match |
| `clearExpiredLimits()`   | ✅       | ✅  | ✅ Match |
| `resetAllRateLimits()`   | ✅       | ✅  | ✅ Match |
| `markRateLimited()`      | ✅       | ✅  | ✅ Match |
| `markInvalid()`          | ✅       | ✅  | ✅ Match |
| `getMinWaitTimeMs()`     | ✅       | ✅  | ✅ Match |

### Function We Added: `triggerQuotaReset()`

```typescript
export interface QuotaResetResult {
  accountsAffected: number;
  limitsCleared: number;
  groups: string[];
}

export function triggerQuotaReset(accounts: Account[], group: QuotaGroupKey | "all"): QuotaResetResult;
```

Triggers quota reset for specific quota groups:

| Group         | Models Affected                                     |
| ------------- | --------------------------------------------------- |
| `claude`      | claude-sonnet-4-5, claude-opus-4-5-thinking, etc.   |
| `geminiPro`   | gemini-3-pro-high, gemini-3-pro-low, gemini-2.5-pro |
| `geminiFlash` | gemini-3-flash, gemini-2.5-flash                    |
| `all`         | All models in all groups                            |

Implementation:

```typescript
export function triggerQuotaReset(accounts: Account[], group: QuotaGroupKey | "all"): QuotaResetResult {
  const result: QuotaResetResult = { accountsAffected: 0, limitsCleared: 0, groups: [] };

  const groupsToReset = group === "all" ? (Object.keys(QUOTA_GROUPS) as QuotaGroupKey[]) : [group];

  result.groups = groupsToReset;

  for (const acc of accounts) {
    if (!acc.modelRateLimits) continue;
    let affected = false;

    for (const modelId of Object.keys(acc.modelRateLimits)) {
      if (isModelInGroups(modelId, groupsToReset)) {
        delete acc.modelRateLimits[modelId];
        result.limitsCleared++;
        affected = true;
      }
    }

    if (affected) result.accountsAffected++;
  }

  return result;
}
```

### Quota Group Constants

```typescript
export type QuotaGroupKey = "claude" | "geminiPro" | "geminiFlash";

export const QUOTA_GROUPS: Record<QuotaGroupKey, readonly string[]> = {
  claude: ["claude-sonnet-4-5", "claude-opus-4-5-thinking", "claude-sonnet-4-5-thinking"],
  geminiPro: ["gemini-3-pro-high", "gemini-3-pro-low", "gemini-2.5-pro"],
  geminiFlash: ["gemini-3-flash", "gemini-2.5-flash"],
};
```

### TypeScript Types We Added

```typescript
export interface ModelRateLimit {
  resetAt: number; // Unix timestamp when limit expires
  limitedAt: number; // Unix timestamp when limit was set
  reason?: string; // Optional reason for rate limit
}

export interface Account {
  // ... other fields
  modelRateLimits?: Record<string, ModelRateLimit>;
}

export interface QuotaResetResult {
  accountsAffected: number;
  limitsCleared: number;
  groups: string[];
}
```

---

## Signature Cache Module Deep Comparison

### signature-cache.ts vs signature-cache.js

| Aspect         | Upstream   | Us                         | Notes                   |
| -------------- | ---------- | -------------------------- | ----------------------- |
| Lines of code  | 115        | 134                        | We added testing helper |
| Core functions | 6          | 7                          | We added test reset     |
| TypeScript     | ❌         | ✅ Full types              | Type safety             |
| Cache types    | Plain Maps | Typed Maps with interfaces | `SignatureCacheEntry`   |

### Shared Functions (All Match Exactly)

| Function                     | Upstream | Us  | Notes    |
| ---------------------------- | -------- | --- | -------- |
| `cacheSignature()`           | ✅       | ✅  | ✅ Match |
| `getCachedSignature()`       | ✅       | ✅  | ✅ Match |
| `cleanupCache()`             | ✅       | ✅  | ✅ Match |
| `getCacheSize()`             | ✅       | ✅  | ✅ Match |
| `cacheThinkingSignature()`   | ✅       | ✅  | ✅ Match |
| `getCachedSignatureFamily()` | ✅       | ✅  | ✅ Match |
| `getThinkingCacheSize()`     | ✅       | ✅  | ✅ Match |

### Function We Added

```typescript
/**
 * Reset all caches - FOR TESTING ONLY
 * @internal
 */
export function _resetCacheForTesting(): void {
  signatureCache.clear();
  thinkingSignatureCache.clear();
}
```

### TypeScript Interfaces We Added

```typescript
interface SignatureCacheEntry {
  signature: string;
  timestamp: number;
}

interface ThinkingSignatureCacheEntry {
  modelFamily: ModelFamily;
  timestamp: number;
}

const signatureCache = new Map<string, SignatureCacheEntry>();
const thinkingSignatureCache = new Map<string, ThinkingSignatureCacheEntry>();
```

---

## Token Extractor Module Deep Comparison

### token-extractor.ts vs token-extractor.js

| Aspect         | Upstream                  | Us                 | Notes                  |
| -------------- | ------------------------- | ------------------ | ---------------------- |
| Lines of code  | 118                       | 114                | Similar size           |
| Core functions | 5                         | 5                  | Same function count    |
| TypeScript     | ❌                        | ✅ Full types      | Type safety            |
| Default export | Object with named exports | Named exports only | Different export style |

### Shared Functions (All Match Exactly)

| Function              | Upstream | Us  | Notes    |
| --------------------- | -------- | --- | -------- |
| `extractChatParams()` | ✅       | ✅  | ✅ Match |
| `getTokenData()`      | ✅       | ✅  | ✅ Match |
| `needsRefresh()`      | ✅       | ✅  | ✅ Match |
| `getToken()`          | ✅       | ✅  | ✅ Match |
| `forceRefresh()`      | ✅       | ✅  | ✅ Match |

### TypeScript Interfaces We Added

```typescript
interface ChatParams {
  apiKey?: string;
  [key: string]: unknown;
}
```

### Export Style Difference

**Upstream:**

```javascript
export default {
  getToken,
  forceRefresh,
};
```

**Us:**

```typescript
// Named exports only - no default export
export async function getToken(): Promise<string> { ... }
export async function forceRefresh(): Promise<string> { ... }
```

---

## Request Builder Module Deep Comparison

### request-builder.ts vs request-builder.js

| Aspect             | Upstream            | Us                        | Notes                          |
| ------------------ | ------------------- | ------------------------- | ------------------------------ |
| Lines of code      | 94                  | 197                       | We added configurable identity |
| Core functions     | 2                   | 4                         | We added 2 helper functions    |
| TypeScript         | ❌                  | ✅ Full types             | Type safety                    |
| Identity injection | Single fixed string | Configurable modes        | `AG_INJECT_IDENTITY` env var   |
| Model filtering    | ❌ All models       | ✅ Only claude/gemini-pro | CLIProxyAPI v6.6.89 behavior   |

### Shared Functions

| Function                  | Upstream | Us  | Notes                        |
| ------------------------- | -------- | --- | ---------------------------- |
| `buildCloudCodeRequest()` | ✅       | ✅  | Same core logic, we enhanced |
| `buildHeaders()`          | ✅       | ✅  | ✅ Match                     |

### Functions We Added

| Function                               | Purpose                                          |
| -------------------------------------- | ------------------------------------------------ |
| `shouldInjectIdentity()`               | Check if model should have identity injection    |
| `injectAntigravitySystemInstruction()` | Extracted injection logic with configurable mode |

### Configurable Identity Injection

We added the `AG_INJECT_IDENTITY` environment variable with three modes:

| Mode    | Description                                          |
| ------- | ---------------------------------------------------- |
| `full`  | Full identity (~300 tokens) - default                |
| `short` | Shortened identity (~50 tokens) for token efficiency |
| `none`  | Disable injection (may cause 429 errors)             |

### Model Filtering (CLIProxyAPI v6.6.89 Behavior)

```typescript
function shouldInjectIdentity(model: string): boolean {
  const modelLower = model.toLowerCase();
  return modelLower.includes("claude") || modelLower.includes("gemini-3-pro");
}
```

Only injects identity for:

- `claude` models (all variants)
- `gemini-3-pro` models (gemini-3-pro-high, gemini-3-pro-low)

NOT injected for:

- `gemini-3-flash` models
- Other models

### TypeScript Interfaces We Added

```typescript
interface CloudCodeGoogleRequest extends GoogleRequest {
  sessionId?: string;
}

export interface CloudCodeRequest {
  project: string;
  model: string;
  request: CloudCodeGoogleRequest;
  userAgent: string;
  requestId: string;
  requestType: string;
}

export interface RequestHeaders {
  Authorization: string;
  "Content-Type": string;
  "User-Agent"?: string;
  "X-Goog-Api-Client"?: string;
  "Client-Metadata"?: string;
  "anthropic-beta"?: string;
  Accept?: string;
  [key: string]: string | undefined;
}
```

### Upstream vs Our Identity Text

**Upstream** (single fixed string):

```javascript
const ANTIGRAVITY_SYSTEM_INSTRUCTION = `You are Antigravity...`;
```

**Us** (two configurable options):

```typescript
const ANTIGRAVITY_IDENTITY_FULL = `<identity>
You are Antigravity, a powerful agentic AI coding assistant...
</identity>
<tool_calling>...</tool_calling>
<communication_style>...</communication_style>`;

const ANTIGRAVITY_IDENTITY_SHORT = `You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.You are pair programming with a USER to solve their coding task.**Absolute paths only****Proactiveness**`;
```

---

## Storage Module Deep Comparison

### storage.ts vs storage.js

| Aspect             | Upstream              | Us                 | Notes         |
| ------------------ | --------------------- | ------------------ | ------------- |
| Lines of code      | 137                   | ~100               | Simplified    |
| Subscription field | `subscription` object | ❌ Not implemented | We use SQLite |
| Quota field        | `quota` object        | ❌ Not implemented | We use SQLite |
| TypeScript         | ❌                    | ✅ Full types      | Type safety   |

### Shared Functions

| Function         | Upstream | Us  | Notes         |
| ---------------- | -------- | --- | ------------- |
| `loadAccounts()` | ✅       | ✅  | ✅ Same logic |
| `saveAccounts()` | ✅       | ✅  | ✅ Same logic |
| `getConfigDir()` | ✅       | ✅  | ✅ Same logic |

### Upstream Fields We Skip

```javascript
// Upstream stores in accounts.json:
subscription: acc.subscription || { tier: 'unknown', projectId: null, detectedAt: null },
quota: acc.quota || { models: {}, lastChecked: null }
```

**Our Approach**: We use SQLite (`quota-snapshots.db`) for quota storage:

| Aspect        | Upstream              | Us                          |
| ------------- | --------------------- | --------------------------- |
| Quota storage | JSON in accounts.json | SQLite `quota-snapshots.db` |
| Analytics     | Per-hour counts       | Burn rate calculation       |
| Persistence   | File-based            | SQLite transactions         |
| Querying      | Load entire file      | SQL queries                 |

---

## Complete Module Comparison Summary

### All 34 Upstream Modules Analyzed

The following table summarizes our investigation of all 34 JavaScript files in the upstream `src/` directory against our TypeScript equivalents:

| Module                    | Upstream Lines | Our Lines | Match Status           | Key Differences                   |
| ------------------------- | -------------- | --------- | ---------------------- | --------------------------------- |
| **Account Manager**       |                |           |                        |                                   |
| `credentials.js`          | 186            | ~200      | ✅ All functions match | We added `fetchWithTimeout()`     |
| `index.js`                | 319            | ~350      | ✅ All methods match   | We added 5 methods for scheduling |
| `rate-limits.js`          | 202            | 254       | ✅ All functions match | We added `triggerQuotaReset()`    |
| `selection.js`            | 201            | 480       | ✅ All functions match | We added 6 scheduling functions   |
| `storage.js`              | 136            | ~100      | ✅ All functions match | We use SQLite vs JSON             |
| **Auth**                  |                |           |                        |                                   |
| `database.js`             | 169            | ~80       | ✅ Match               | We skip native module rebuild     |
| `oauth.js`                | 399            | 522       | ✅ All functions match | We added `validateRefreshToken()` |
| `token-extractor.js`      | 117            | 114       | ✅ All functions match | Named exports only                |
| **CloudCode**             |                |           |                        |                                   |
| `index.js`                | 29             | ~40       | ✅ Match               | We added 3 exports                |
| `message-handler.js`      | 232            | 289       | ✅ Match               | We added 5xx fallback tracking    |
| `model-api.js`            | 184            | ~250      | ✅ Match               | We added pool grouping            |
| `rate-limit-parser.js`    | 181            | ~180      | ✅ Identical           | TypeScript types added            |
| `request-builder.js`      | 93             | 197       | ✅ Match               | Configurable identity injection   |
| `session-manager.js`      | 47             | ~50       | ✅ Identical           | TypeScript types added            |
| `sse-parser.js`           | 116            | ~120      | ✅ Identical           | TypeScript types added            |
| `sse-streamer.js`         | 260            | ~280      | ✅ Match               | stopReason fix implemented        |
| `streaming-handler.js`    | 346            | 333       | ✅ Match               | We added 5xx fallback             |
| **Format**                |                |           |                        |                                   |
| `content-converter.js`    | 187            | ~200      | ✅ Identical           | TypeScript types added            |
| `index.js`                | 20             | ~25       | ✅ Identical           | Same exports                      |
| `request-converter.js`    | 237            | ~250      | ✅ Identical           | TypeScript types added            |
| `response-converter.js`   | 110            | ~120      | ✅ Identical           | TypeScript types added            |
| `schema-sanitizer.js`     | 673            | ~700      | ✅ All 5 phases match  | TypeScript types added            |
| `signature-cache.js`      | 114            | 134       | ✅ All functions match | We added test helper              |
| `thinking-utils.js`       | 542            | ~550      | ✅ Identical           | TypeScript types added            |
| **Utils**                 |                |           |                        |                                   |
| `claude-config.js`        | 111            | N/A       | ⏭️ Skipped             | WebUI-only feature                |
| `helpers.js`              | 80             | ~100      | ✅ Match               | We added `fetchWithTimeout()`     |
| `logger.js`               | 145            | 93        | 🔄 Different           | Pino vs custom class              |
| `native-module-helper.js` | 162            | N/A       | ⏭️ Skipped             | Not needed in TypeScript          |
| `retry.js`                | 161            | N/A       | ⏭️ Skipped             | Inline retry logic                |
| **Top-Level**             |                |           |                        |                                   |
| `config.js`               | 85             | N/A       | ⏭️ Skipped             | We use constants.ts               |
| `constants.js`            | 196            | ~250      | ✅ Match               | We added more constants           |
| `errors.js`               | 203            | ~200      | ✅ Match               | Skip `NativeModuleError`          |
| `fallback-config.js`      | 29             | ~80       | ✅ Match               | We added utilities                |
| `index.js`                | 107            | 83        | 🔄 Different           | Simpler banner style              |
| `server.js`               | 761            | ~800      | ✅ Match               | We added `/trigger-reset`         |
| **CLI**                   |                |           |                        |                                   |
| `cli/accounts.js`         | 509            | 12 files  | 🔄 Different           | Modular structure                 |
| **Modules**               |                |           |                        |                                   |
| `modules/usage-stats.js`  | 205            | N/A       | ⏭️ Skipped             | We use SQLite                     |
| **WebUI**                 |                |           |                        |                                   |
| `webui/index.js`          | 598            | N/A       | ⏭️ Skipped             | We have TUI                       |

### Summary Statistics

| Category                 | Count | Percentage |
| ------------------------ | ----- | ---------- |
| ✅ Matching or enhanced  | 28    | 82%        |
| 🔄 Different approach    | 3     | 9%         |
| ⏭️ Intentionally skipped | 6     | 18%        |

### Functions We Added (Upstream Lacks)

| Function                  | Module             | Purpose                             |
| ------------------------- | ------------------ | ----------------------------------- |
| `fetchWithTimeout()`      | helpers.ts         | Prevent hanging OAuth calls         |
| `validateRefreshToken()`  | oauth.ts           | Add accounts via refresh token      |
| `optimisticReset()`       | selection.ts       | Clear rate limits after buffer wait |
| `pickByMode()`            | selection.ts       | Dispatch to scheduling mode         |
| `pickRefreshPriority()`   | selection.ts       | Sort by quota reset time            |
| `pickDrainHighest()`      | selection.ts       | Sort by quota percentage            |
| `pickRoundRobin()`        | selection.ts       | Rotate across accounts              |
| `triggerQuotaReset()`     | rate-limits.ts     | Group-based quota reset             |
| `shouldAttemptFallback()` | fallback-utils.ts  | Type-safe 5xx fallback decision     |
| `is5xxError()`            | fallback-utils.ts  | Detect 5xx server errors            |
| `groupByPool()`           | quota-api.ts       | Group models by quota pool          |
| `findEarliestReset()`     | quota-api.ts       | Find earliest reset time            |
| `fetchAccountCapacity()`  | quota-api.ts       | Combined tier + quota fetch         |
| `shouldInjectIdentity()`  | request-builder.ts | Model filtering for identity        |
| `_resetCacheForTesting()` | signature-cache.ts | Test helper                         |

### Features We Have (Upstream Lacks)

| Feature               | Implementation          | Benefit                   |
| --------------------- | ----------------------- | ------------------------- |
| TypeScript            | Full codebase           | Type safety, better DX    |
| Scheduling modes      | 4 modes                 | Flexible account rotation |
| SQLite quota storage  | quota-storage.ts        | Persistent, queryable     |
| Burn rate calculation | burn-rate.ts            | Usage analytics           |
| TUI interface         | React/Ink               | Terminal UI alternative   |
| Discriminated unions  | FallbackDecision        | Type-safe decisions       |
| OAuth timeout         | 15s via AbortController | Prevent hanging           |
| Refresh token auth    | --refresh-token flag    | Headless account adding   |
| Configurable identity | AG_INJECT_IDENTITY env  | 3 injection modes         |
| 5xx fallback tracking | all5xxErrors flag       | Smart model fallback      |
| Comprehensive tests   | 1,767 tests             | 10 test categories        |

### Features We Skip (Upstream Has)

| Feature                    | Reason                    |
| -------------------------- | ------------------------- |
| WebUI Dashboard            | We have TUI               |
| Native module rebuild      | Not needed in TypeScript  |
| Usage stats middleware     | We use SQLite             |
| Config file persistence    | We use constants.ts       |
| Claude CLI config editor   | Not needed                |
| Log history (1000 entries) | Not needed (no WebUI SSE) |

---

## New Open PRs

### PR #101: WebUI Comprehensive Enhancements (NEW - OPEN)

**Status**: Open, not merged yet

**Problem**: WebUI needs improved responsive design, better quota display logic, and navigation state persistence.

**Key Changes**:

1. **Weighted Priority System for Quota Display**:
   - Shows "Best Available" model quota based on tier (Opus > Sonnet > Pro > Flash)
   - Prevents misleading values (e.g., showing 100% Flash while Opus is exhausted)
   - Shows 0% when high-tier is exhausted instead of falling back to full low-tier

2. **Responsive Design**:
   - Collapsible sidebar with backdrop overlay for mobile
   - Auto-sync logic for sidebar (closes on mobile resize, opens on desktop)
   - 5-column grid on desktop, 2-column on mobile

3. **Navigation & State**:
   - Hash-based routing to persist tab state on reload
   - Local storage caching with TTL expiration
   - Sortable tables (Name, Family, Quota)

4. **Bug Fixes**:
   - Removed ~600 lines of duplicated HTML causing `ReferenceError`
   - Enhanced chart memory leak prevention
   - Improved model identification logic

**Files Changed**: 13 files (660 additions, 249 deletions)

**Our Assessment**: WebUI only - not applicable to us (we have TUI).

---

### PR #99: Restore Default Claude CLI (NEW - OPEN)

**Status**: Open, not merged yet

**Problem**: Users need a way to toggle between proxied and direct Claude API without manual config editing.

**Solution**:

- New `POST /api/claude/config/restore` endpoint
- New `replaceClaudeConfig()` function (overwrites vs merge)
- "Restore Default" button in WebUI settings
- Removes proxy env vars: `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL`, etc.

**Our Assessment**: WebUI only - not applicable to us (we have TUI).

---

## Changelog

### 2026-01-11 (Final Investigation Summary)

**Files Compared**: 40+ source files across all modules
**Feature Parity**: ✅ Complete - all critical features match

**Unique to ag-cl** (not in upstream):
| Category | Count | Key Items |
|----------|-------|-----------|
| Modules | 7 | quota-api, quota-storage, burn-rate, fallback-utils, quota-groups, auto-refresh-scheduler, quota-reset-trigger |
| Functions | 8+ | `optimisticReset()`, `pickByMode()`, `pickRefreshPriority()`, `triggerQuotaReset()`, `validateRefreshToken()`, `fetchWithTimeout()` |
| Constants | 9 | `AUTO_REFRESH_INTERVAL_MS`, `RATE_LIMIT_BUFFER_MS`, `VALID_SCHEDULING_MODES`, etc. |
| CLI Commands | 2 | `init` (setup wizard), `trigger-reset` (quota reset) |
| TypeScript types | 400+ lines | `types.ts`, interfaces across all modules |
| Tests | 1,616 cases | Unit, fuzz, contract, chaos, security, load (vs ~50 in upstream) |

**Unique to Upstream** (intentionally skipped):
| Feature | Reason |
|---------|--------|
| WebUI Dashboard (6,464 lines) | We have TUI alternative |
| Native module auto-rebuild | Not needed for TypeScript |
| Usage history JSON | We use SQLite snapshots |
| `async-mutex` dependency | Listed but unused |

**Adoption Candidates** (low priority):

1. ±25% jitter in backoff (`retry.js`)
2. Log history with EventEmitter (`logger.js`)
3. Proactive token refresh (from closed PR #95)
4. Error sanitization (from closed PR #95)

**Key Commits Analyzed**:

- `325acdb` - stopReason fix ✅ (implemented, tested)
- `1045ebe` - PR #99 merge (WebUI only)
- `5879022` - Health check optimization (WebUI only)

### 2026-01-11 (v2.0.1 Release)

- **stopReason Bug Fixed** (commit 325acdb): `stopReason = null` + `&& !stopReason` check
- Test added: `preserves tool_use stop_reason when finishReason is STOP`
- PR #94 merged (WebUI health checks - not applicable)
- PR #99 merged (WebUI restore default - not applicable)

### 2026-01-10 (Deep Investigation)

- Analyzed 50+ closed issues for patterns
- Added Known Limitations: WebSearch, Skills, Images in tool_result, Bans, Proto errors
- Added Community Insights: VPN location, 1M context, export workarounds
- Documented Historical Merged PRs (#1-#55)
- Added Constants Comparison (all values match)
- Confirmed implementations: 5xx fallback, schema uppercase, OAuth timeout, optimistic reset

### 2026-01-10 (PR Analysis)

- PR #96: stopReason fix closed → maintainer fixed directly in 325acdb
- PR #95: Security features closed without merge (patterns documented for reference)
- PR #79: Image interleaving bug closed without fix (monitoring)
- Issue #91: Tool concurrency 400 errors (suspected causes documented)
- Issue #68: First request hang (IMPLEMENTED via optimistic reset)

### 2026-01-07

- Initial report generation

---
---

## Test Coverage Comparison

### Summary

| Metric             | Upstream           | ag-cl      | Difference |
| ------------------ | ------------------ | ---------- | ---------- |
| Test files         | 11                 | 79         | +68        |
| Test lines         | ~2,429             | ~15,000+   | +12,500+   |
| Test cases         | ~50                | 1,616+     | +1,566     |
| Test framework     | Custom CJS scripts | Vitest     | Different  |
| Coverage reporting | No                 | Yes (85%+) | +85%       |

### Upstream Test Structure

Upstream uses custom CommonJS integration tests requiring a running server:

| Test File                                     | Lines | Purpose                       |
| --------------------------------------------- | ----- | ----------------------------- |
| `run-all.cjs`                                 | 122   | Test runner script            |
| `test-caching-streaming.cjs`                  | 181   | Prompt caching with streaming |
| `test-cross-model-thinking.cjs`               | 461   | Cross-model thinking resume   |
| `test-empty-response-retry.cjs`               | 122   | Empty response retry logic    |
| `test-images.cjs`                             | 150   | Image/document support        |
| `test-interleaved-thinking.cjs`               | 185   | Interleaved thinking blocks   |
| `test-multiturn-thinking-tools.cjs`           | 244   | Multi-turn tool conversations |
| `test-multiturn-thinking-tools-streaming.cjs` | 180   | Streaming multi-turn tools    |
| `test-oauth-no-browser.cjs`                   | 217   | OAuth no-browser flow         |
| `test-schema-sanitizer.cjs`                   | 269   | Schema sanitization           |
| `test-thinking-signatures.cjs`                | 204   | Thinking signature validation |

### Our Test Structure

We use Vitest with comprehensive test categories:

| Category    | Files | Description                            |
| ----------- | ----- | -------------------------------------- |
| Unit        | 57    | Function/module isolation tests        |
| Fuzz        | 2     | Property-based testing with fast-check |
| Contract    | 1     | API schema validation                  |
| Snapshot    | 2     | Format consistency tests               |
| Golden      | 1     | Known good request/response pairs      |
| Chaos       | 2     | Network failure simulation             |
| Load        | 1     | Concurrent handling stress tests       |
| Security    | 1     | Input sanitization, token masking      |
| Types       | 1     | TypeScript type correctness            |
| Integration | 1     | End-to-end with real server            |

### Key Differences

1. **Test Isolation**: We have unit tests that mock dependencies; upstream relies on integration tests
2. **Coverage**: We track and enforce 85%+ coverage; upstream has no coverage tracking
3. **CI/CD**: Our tests run in CI; upstream tests require manual execution
4. **Fuzz Testing**: We use fast-check for property-based testing; upstream has none
5. **Chaos Testing**: We simulate network failures; upstream doesn't test failure scenarios

### Tests We Derived From Upstream

We created equivalent unit tests for upstream's integration tests:

| Upstream Test                       | Our Equivalent                               |
| ----------------------------------- | -------------------------------------------- |
| `test-thinking-signatures.cjs`      | `tests/unit/format/signature-cache.test.ts`  |
| `test-schema-sanitizer.cjs`         | `tests/unit/format/schema-sanitizer.test.ts` |
| `test-multiturn-thinking-tools.cjs` | `tests/unit/cloudcode/sse-streamer.test.ts`  |
| `test-cross-model-thinking.cjs`     | `tests/unit/format/thinking-utils.test.ts`   |
