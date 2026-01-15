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

