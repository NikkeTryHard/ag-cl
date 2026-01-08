# Upstream Investigation Report

> Generated: 2026-01-07
> Updated: 2026-01-08
> Upstream: [badri-s2001/antigravity-claude-proxy](https://github.com/badri-s2001/antigravity-claude-proxy)
> Stars: 1,123 | Forks: 136 | Last Updated: 2026-01-08

## Executive Summary

The upstream repository is actively maintained with strong community engagement. There are **4 open PRs** and **6 open issues** as of this report. Key themes include:

- Web dashboard/UI features (multiple implementations)
- Empty response retry mechanism - **IMPLEMENTED**
- Quota reset triggers - **IMPLEMENTED**
- Context window reporting for Gemini models - **IMPLEMENTED**
- WebSearch limitation - **DOCUMENTED**
- Sticky account configuration - **ALREADY ADDRESSED** (upstream closed)
- New bugs: idle hang (#68), tool schema conversion (#67) - **INVESTIGATING**

---

## Open Pull Requests

### High Priority (Features)

| PR                                                                     | Title                                             | Author         | Created    | Status | Our Status                            |
| ---------------------------------------------------------------------- | ------------------------------------------------- | -------------- | ---------- | ------ | ------------------------------------- |
| [#64](https://github.com/badri-s2001/antigravity-claude-proxy/pull/64) | fix: add retry mechanism for empty API responses  | @BrunoMarc     | 2026-01-07 | OPEN   | **IMPLEMENTED**                       |
| [#47](https://github.com/badri-s2001/antigravity-claude-proxy/pull/47) | feat: Add Web UI for account and quota management | @Wha1eChai     | 2026-01-04 | OPEN   | Not implemented (We have TUI instead) |
| [#44](https://github.com/badri-s2001/antigravity-claude-proxy/pull/44) | feat: Add quota reset trigger system              | @shivangtanwar | 2026-01-03 | OPEN   | **IMPLEMENTED**                       |
| [#15](https://github.com/badri-s2001/antigravity-claude-proxy/pull/15) | Map model/project 404s with context               | @jroth1111     | 2025-12-29 | OPEN   | Not implemented                       |

### PR #64: Empty Response Retry Mechanism

**Problem**: When Claude Code sends requests with large `thinking_budget` values (e.g., 31999), the model may spend all tokens on "thinking" and return empty responses. This causes `[No response received from API]` errors, making Claude Code stop mid-conversation.

**Solution**: Implements automatic retry (up to 2 times) before emitting fallback message.

```mermaid
flowchart TD
    A[Request] --> B[Stream Response]
    B --> C{Empty Response?}
    C -->|No| D[Success]
    C -->|Yes| E{Retry < 2?}
    E -->|Yes| F[Retry Request]
    F --> B
    E -->|No| G[Emit Fallback Message]
```

**Testing Results** (6+ hours production):
| Metric | Before | After |
|--------|--------|-------|
| Empty response errors | 49 | 2 |
| Recovery rate | 0% | 88% |
| Total requests processed | - | 1,884 |

**Recommendation**: **HIGH PRIORITY** - This addresses a critical UX issue.

**Our Status**: **IMPLEMENTED** in v1.2.2 via `src/cloudcode/streaming-handler.ts` with `MAX_EMPTY_RETRIES` constant (configurable, default 2, max 10).

---

### PR #47: Web UI for Account and Quota Management

**Features**:

- Dashboard with real-time model quota visualization (Chart.js)
- Account management (OAuth add/enable/disable/refresh/remove)
- Live server log streaming via SSE with search and filtering
- Settings with 4 tabs: Interface, Claude CLI, Models, Server Info
- i18n support (EN/zh_CN)
- Optional password protection (`WEBUI_PASSWORD` env var)
- Minimal integration (only 5 lines added to server.js)

**Technical Stack**: Alpine.js + TailwindCSS + DaisyUI

**New API Endpoints**:

- `GET/POST /api/config` - Server configuration
- `GET/POST /api/claude/config` - Claude CLI configuration
- `POST /api/models/config` - Model alias/hidden settings
- `GET /api/accounts` - Account list with status
- `POST /api/accounts/:email/toggle` - Enable/disable account
- `POST /api/accounts/:email/refresh` - Refresh account token
- `DELETE /api/accounts/:email` - Remove account
- `GET /api/logs` - Log history
- `GET /api/logs/stream` - Live log streaming (SSE)
- `GET /api/auth/url` - OAuth URL generation
- `GET /oauth/callback` - OAuth callback handler

**Recommendation**: **MEDIUM PRIORITY** - Nice-to-have but adds complexity. Consider feature flags.

**Our Status**: Not implementing. We have a TUI (`npm run tui`) built with React/Ink that provides similar functionality.

---

### PR #44: Quota Reset Trigger System

**Features**:

- Trigger 5-hour quota reset timer for all accounts via:
  - API endpoint: `POST /trigger-reset`
  - CLI command: `antigravity-claude-proxy trigger-reset`
  - Server startup flag: `--trigger-reset` or `TRIGGER_RESET=true`
- Enhanced `/account-limits` showing 3 separate quota reset times per quota group

**Quota Groups**:
| Group | Models |
|-------|--------|
| Claude | claude-sonnet-4-5, claude-opus-4-5-thinking, gpt-oss-120b |
| Gemini Pro | gemini-3-pro-high, gemini-3-pro-low |
| Gemini Flash | gemini-3-flash |

**Recommendation**: **LOW PRIORITY** - Edge case feature.

**Our Status**: **IMPLEMENTED** in v1.2.2:

- API endpoint: `POST /trigger-reset` with `?group=claude|geminiPro|geminiFlash|all`
- CLI command: `npm run trigger-reset`
- Startup flag: `--trigger-reset` or `TRIGGER_RESET=true`
- Enhanced `/account-limits` with per-group reset times

---

## Open Issues

| Issue                                                                    | Title                                            | Author         | Created    | Type            | Our Status               |
| ------------------------------------------------------------------------ | ------------------------------------------------ | -------------- | ---------- | --------------- | ------------------------ |
| [#68](https://github.com/badri-s2001/antigravity-claude-proxy/issues/68) | Bug: First request hangs after idle period       | @parkjaeuk0210 | 2026-01-08 | Bug             | **INVESTIGATING**        |
| [#67](https://github.com/badri-s2001/antigravity-claude-proxy/issues/67) | Bug: Compaction fails with Invalid JSON payload  | @IrvanFza      | 2026-01-08 | Bug             | **INVESTIGATING**        |
| [#61](https://github.com/badri-s2001/antigravity-claude-proxy/issues/61) | Fix: Add retry mechanism for empty API responses | @BrunoMarc     | 2026-01-06 | Bug/Enhancement | **IMPLEMENTED** (PR #64) |
| [#53](https://github.com/badri-s2001/antigravity-claude-proxy/issues/53) | Report correct context_length for Gemini models  | @BrunoMarc     | 2026-01-04 | Feature Request | **IMPLEMENTED**          |
| [#39](https://github.com/badri-s2001/antigravity-claude-proxy/issues/39) | Dashboard interface                              | @chuanghiduoc  | 2026-01-03 | Feature Request | TUI alternative          |
| [#27](https://github.com/badri-s2001/antigravity-claude-proxy/issues/27) | WebSearch tool - 0 results                       | @Anderson-RC   | 2025-12-31 | Bug/Limitation  | **DOCUMENTED**           |

### Issue #68: First Request Hangs After Idle (NEW)

**Problem**: The first request after the proxy has been idle for several minutes hangs indefinitely, requiring ESC + retry.

**Suspected Causes**:

- Connection pool going stale
- OAuth token not refreshing properly on first request

**Proposed Solutions**:

- Keep-alive mechanism for connections
- Connection health check before first request

**Workaround**: Use `gemini-2.5-flash-lite` model (reportedly doesn't trigger the bug)

**Our Status**: **INVESTIGATING** - May be related to our token refresh logic (5-minute cache). Need to add timeout to token refresh.

---

### Issue #67: Tool Schema Conversion Fails on Compaction (NEW)

**Problem**: The `/compact` command fails with "Invalid JSON payload" error when hitting token limits with sub agents.

**Error**: `400 - Proto field is not repeating, cannot start list` at tool schema conversion.

**Root Cause**: Incorrect conversion of Anthropic tool schemas to Google Generative AI function declarations format.

**Our Status**: **INVESTIGATING** - We have comprehensive schema sanitization in `src/format/schema-sanitizer.ts`. Need to test with the specific schema that causes the error to verify if we're affected.

---

### Issue #61: Empty API Response Retry (Same as PR #64)

Already addressed by PR #64 above.

### Issue #57: Disable Sticky Accounts (CLOSED)

**Request**: Option to disable sticky account behavior for reduced rate limits.

**Context**: Sticky accounts keep requests on the same account to maintain conversation context, but this can lead to faster rate limiting on individual accounts vs round-robin distribution.

**Upstream Resolution**: Issue was closed after reducing cooldown from 60s to 10s. The requester confirmed "working fine now."

**Our Analysis**: Our implementation already handles this optimally:

1. `pickStickyAccount` tries current account first
2. If unavailable, immediately switches to any available account
3. Only waits if ALL accounts are rate-limited AND wait is <= 2 minutes

**Our Status**: **ALREADY ADDRESSED** - Our failover logic prioritizes switching to available accounts. No `--no-sticky` flag needed.

---

### Issue #53: Report Correct context_length for Gemini Models

**Problem**: Claude Code's auto-compaction triggers frequently because it assumes 200K context window (Claude default). Gemini models support up to 1M tokens.

**Current Behavior**:

```json
{
  "id": "gemini-3-pro-high",
  "object": "model",
  "owned_by": "anthropic"
}
```

**Proposed Solution**:

```json
{
  "id": "gemini-3-pro-high",
  "object": "model",
  "owned_by": "anthropic",
  "context_length": 1000000
}
```

**Affected Models**:
| Model | Suggested context_length |
|-------|-------------------------|
| gemini-3-flash | 1,000,000 |
| gemini-3-pro-low | 1,000,000 |
| gemini-3-pro-high | 1,000,000 |
| gemini-2.5-pro | 1,000,000 |
| gemini-2.5-flash | 1,000,000 |

**Recommendation**: **HIGH PRIORITY** - Quick win, significant UX improvement.

---

### Issue #39: Dashboard Interface

**Request**: Visual dashboard for monitoring (referenced [cliProxyAPI-Dashboard](https://github.com/0xAstroAlpha/cliProxyAPI-Dashboard) - 74 stars).

**Status**: Multiple implementations attempted:

- PR #47 (WebUI by @Wha1eChai) - OPEN, most comprehensive
- PR #46 (Dashboard by @SlasshyOverhere) - CLOSED
- PR #43 (Dashboard by @udayvarmora07) - CLOSED

**Recommendation**: Consider merging PR #47 or creating a simpler standalone solution.

---

### Issue #27: WebSearch Tool Returns 0 Results

**Status**: Known limitation (expected behavior)

**Root Cause**: WebSearch is an **Anthropic-only server-side tool** that requires direct connection to Anthropic's API. When using third-party proxies (like this proxy, Bedrock, or Vertex), Claude Code hides or disables the WebSearch tool because the server-side search infrastructure is unavailable.

**Solution**: Disable WebSearch in Claude Code settings and use an MCP-based search alternative.

**Step 1: Disable WebSearch**

Add to `~/.claude/settings.json` or `.claude/settings.json`:

```json
{
  "permissions": {
    "deny": ["WebSearch"]
  }
}
```

**Step 2 (Optional): Add Brave Search MCP**

```bash
claude mcp add brave-search -s user \
  -- env BRAVE_API_KEY=YOUR_KEY \
  npx -y @modelcontextprotocol/server-brave-search
```

Or add to settings:

```json
{
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

**Our Status**: **DOCUMENTED** - This is expected behavior, not a bug we can fix.

---

## Recently Merged PRs (Notable)

| PR                                                                     | Title                                                        | Merged     | Impact           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ | ---------- | ---------------- |
| [#55](https://github.com/badri-s2001/antigravity-claude-proxy/pull/55) | fix(oauth): add UTF-8 encoding to callback HTML              | 2026-01-06 | Bug fix          |
| [#54](https://github.com/badri-s2001/antigravity-claude-proxy/pull/54) | feat: Auto native module rebuild on Node.js version mismatch | 2026-01-06 | DX improvement   |
| [#50](https://github.com/badri-s2001/antigravity-claude-proxy/pull/50) | feat: add --no-browser OAuth mode for headless servers       | 2026-01-04 | Feature          |
| [#41](https://github.com/badri-s2001/antigravity-claude-proxy/pull/41) | Feature/model fallback                                       | 2026-01-03 | Feature          |
| [#37](https://github.com/badri-s2001/antigravity-claude-proxy/pull/37) | Selective fixes: Model-specific rate limits & robustness     | 2026-01-03 | Bug fix          |
| [#29](https://github.com/badri-s2001/antigravity-claude-proxy/pull/29) | Improve logging, rate limiting, and error handling           | 2026-01-01 | Quality          |
| [#13](https://github.com/badri-s2001/antigravity-claude-proxy/pull/13) | Add count_tokens stub                                        | 2025-12-29 | Compatibility    |
| [#1](https://github.com/badri-s2001/antigravity-claude-proxy/pull/1)   | Add Linux support with cross-platform detection              | 2025-12-25 | Platform support |

---

## Closed Issues (Common Themes)

### Recently Closed (Notable)

| Issue | Title                                 | Resolution                        |
| ----- | ------------------------------------- | --------------------------------- |
| #69   | Resource has been exhausted           | Rate limit handling               |
| #66   | Expected 429 Rate Limiting on Pro     | Normal behavior                   |
| #63   | How to be safe from being ratelimited | Documentation                     |
| #62   | Unable to use cc without login        | Need to re-authenticate           |
| #58   | Dockerized version + OpenAI endpoint  | Separate fork maintained          |
| #57   | Disable sticky accounts               | Fixed by reducing cooldown to 10s |
| #52   | Claude thinking output abnormal       | Official Claude API issue         |

### Authentication & Setup

| Issue | Title                             | Resolution                      |
| ----- | --------------------------------- | ------------------------------- |
| #48   | 401 UNAUTHENTICATED errors        | Need Gemini Code Assist enabled |
| #23   | Token extraction failed (Windows) | sqlite3 not in PATH             |
| #19   | 404 error + Auth conflict         | Need to /logout first           |
| #9    | Missing .credentials.json step    | Added to README                 |

### API Errors

| Issue | Title                              | Resolution                     |
| ----- | ---------------------------------- | ------------------------------ |
| #52   | thinking.signature: Field required | Official Claude API issue      |
| #51   | 400 cache_control errors           | Fixed in proxy                 |
| #33   | 404 NOT_FOUND on all models        | Gemini Code Assist not enabled |
| #6    | Protobuf validation errors         | Fixed by schema normalizer     |
| #5    | 500 Unknown Error                  | Transient server issues        |

### Cross-Model Issues

| Issue | Title                                       | Resolution                                 |
| ----- | ------------------------------------------- | ------------------------------------------ |
| #18   | Corrupted thought signature on model switch | Fixed by stripping incompatible signatures |

---

## Related Projects & Features

### External Dashboards

| Project                                                                        | Stars | Features                       |
| ------------------------------------------------------------------------------ | ----- | ------------------------------ |
| [cliProxyAPI-Dashboard](https://github.com/0xAstroAlpha/cliProxyAPI-Dashboard) | 74    | Visual dashboard for CLI proxy |

### Forks with Extended Features

| Fork                                                                                        | Branch        | Features                            |
| ------------------------------------------------------------------------------------------- | ------------- | ----------------------------------- |
| [Wha1eChai/antigravity-claude-proxy](https://github.com/Wha1eChai/antigravity-claude-proxy) | feature/webui | Full Web UI implementation          |
| [johnneerdael/antigravity-gateway](https://github.com/johnneerdael/antigravity-gateway)     | main          | Docker + OpenAI-compatible endpoint |

### Community Contributions (Closed PRs Worth Reviewing)

| PR  | Title                                    | Author        | Notes                      |
| --- | ---------------------------------------- | ------------- | -------------------------- |
| #56 | TypeScript migration, Docker support     | @NikkeTryHard | Different TS approach      |
| #35 | Network error handling, OpenAI endpoints | @M2noa        | OpenAI compat was excluded |
| #30 | Schema flattening for Protobuf           | @Sahaj33-op   | Alternative approach       |

---

## Feature Gap Analysis

### Features We Have That Upstream Lacks

| Feature                   | Our Implementation                | Status   |
| ------------------------- | --------------------------------- | -------- |
| TypeScript codebase       | Full TypeScript                   | Complete |
| Comprehensive test suite  | Unit, fuzz, contract, chaos, etc. | Complete |
| SQLite quota snapshots    | quota-storage.ts                  | Complete |
| Burn rate calculation     | burn-rate.ts                      | Complete |
| Colored capacity renderer | capacity-renderer.ts              | Complete |

### Features Upstream Has That We Should Consider

| Feature                    | Upstream Location | Priority | Our Status                  |
| -------------------------- | ----------------- | -------- | --------------------------- |
| Native module auto-rebuild | PR #54            | LOW      | Not needed (TypeScript)     |
| --no-browser OAuth         | PR #50            | MEDIUM   | **IMPLEMENTED**             |
| Empty response retry       | PR #64            | HIGH     | **IMPLEMENTED**             |
| Gemini context_length      | Issue #53         | HIGH     | **IMPLEMENTED**             |
| Web UI                     | PR #47            | LOW      | TUI alternative implemented |
| Disable sticky accounts    | Issue #57         | MEDIUM   | **ALREADY ADDRESSED**       |
| Quota reset trigger        | PR #44            | LOW      | **IMPLEMENTED**             |
| Map 404s with context      | PR #15            | LOW      | Not implemented             |
| Idle hang fix              | Issue #68         | MEDIUM   | **INVESTIGATING**           |
| Tool schema conversion fix | Issue #67         | MEDIUM   | **INVESTIGATING**           |

---

## Recommendations

### Completed (v1.2.2)

1. **Empty Response Retry** (from PR #64) - **DONE**
   - Implemented in `streaming-handler.ts`
   - Configurable via `MAX_EMPTY_RETRIES` env var (default 2, max 10)
   - Emits fallback message after retries exhausted

2. **Quota Reset Trigger** (from PR #44) - **DONE**
   - API: `POST /trigger-reset?group=claude|geminiPro|geminiFlash|all`
   - CLI: `npm run trigger-reset`
   - Startup: `--trigger-reset` flag

3. **Gemini context_window** (from Issue #53) - **DONE**
   - Added `context_window: 1000000` to Gemini models in `/v1/models` response
   - Prevents Claude Code from triggering unnecessary auto-compaction
   - Implemented in `src/cloudcode/model-api.ts`

4. **WebSearch limitation** (from Issue #27) - **DOCUMENTED**
   - WebSearch is Anthropic-only, doesn't work on proxies
   - Documented workaround: deny in settings.json + use Brave Search MCP

5. **Sticky account optimization** (from Issue #57) - **ALREADY ADDRESSED**
   - Our `pickStickyAccount` logic already prioritizes switching to available accounts
   - No additional `--no-sticky` flag needed

### Investigating (New Bugs)

1. **First request hangs after idle** (Issue #68)
   - May be related to token refresh timeout
   - Need to add timeout to token refresh and/or connection health check

2. **Tool schema conversion fails** (Issue #67)
   - Need to reproduce with specific schema
   - May already be handled by our `schema-sanitizer.ts`

### Low Priority (Future)

3. **Map 404s with context** (PR #15)
   - Better error messages for model/project not found
   - Low priority, nice-to-have

4. **Consider lightweight dashboard**
   - We have TUI, but web UI could be useful for remote monitoring
   - Lower priority since TUI exists

---

## Sync Status

```
Current upstream bookmark: (run npm run upstream:status to check)
```

**Commands**:

```bash
npm run upstream:status     # Show bookmark position vs upstream HEAD
npm run upstream:log        # Show new commits since last bookmark
npm run upstream:diff       # File-level summary of changes
npm run upstream:mark       # Update bookmark after review
```
