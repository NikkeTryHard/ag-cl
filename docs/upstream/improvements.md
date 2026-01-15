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

