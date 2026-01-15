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

