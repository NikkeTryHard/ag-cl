### 4.29 Rate Limit Backoff with Time-Window Deduplication

**Source**: `opencode-antigravity-auth/src/plugin.ts`

Sophisticated rate limit handling that prevents concurrent requests from causing incorrect exponential backoff.

**The Problem**: When multiple subagents hit 429 simultaneously, each would increment the consecutive counter, causing incorrect backoff (5 concurrent 429s = 2^5 instead of 2^1).

**The Solution**: Track per account+quota with deduplication window.

```typescript
const RATE_LIMIT_DEDUP_WINDOW_MS = 2000; // Concurrent requests within 2s are deduplicated
const RATE_LIMIT_STATE_RESET_MS = 120_000; // Reset after 2 minutes of no 429s

interface RateLimitState {
  consecutive429: number;
  lastAt: number;
  quotaKey: string;
}

// Key format: `${accountIndex}:${quotaKey}` for per-account-per-quota tracking
const rateLimitStateByAccountQuota = new Map<string, RateLimitState>();

function getRateLimitBackoff(accountIndex: number, quotaKey: string, serverRetryAfterMs: number | null): { attempt: number; delayMs: number; isDuplicate: boolean } {
  const now = Date.now();
  const stateKey = `${accountIndex}:${quotaKey}`;
  const previous = rateLimitStateByAccountQuota.get(stateKey);

  // Check if duplicate 429 within dedup window
  if (previous && now - previous.lastAt < RATE_LIMIT_DEDUP_WINDOW_MS) {
    const baseDelay = serverRetryAfterMs ?? 1000;
    const backoffDelay = Math.min(baseDelay * Math.pow(2, previous.consecutive429 - 1), 60_000);
    return {
      attempt: previous.consecutive429,
      delayMs: Math.max(baseDelay, backoffDelay),
      isDuplicate: true,
    };
  }

  // Reset if no 429 for 2 minutes, otherwise increment
  const attempt = previous && now - previous.lastAt < RATE_LIMIT_STATE_RESET_MS ? previous.consecutive429 + 1 : 1;

  rateLimitStateByAccountQuota.set(stateKey, {
    consecutive429: attempt,
    lastAt: now,
    quotaKey,
  });

  const baseDelay = serverRetryAfterMs ?? 1000;
  const backoffDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), 60_000);
  return { attempt, delayMs: Math.max(baseDelay, backoffDelay), isDuplicate: false };
}
```

**Key Design Decisions**:

| Aspect          | Implementation                                   |
| --------------- | ------------------------------------------------ |
| State key       | `accountIndex:quotaKey` for per-quota tracking   |
| Dedup window    | 2 seconds (concurrent requests treated as one)   |
| Reset threshold | 2 minutes without 429 resets counter             |
| Backoff formula | `baseDelay * 2^(attempt-1)`, max 60s             |
| Server respect  | Uses server `retry-after` as base when available |

---

### 4.30 Capacity Exhausted Tiered Backoff

**Source**: `opencode-antigravity-auth/src/plugin.ts`

Special handling for "MODEL_CAPACITY_EXHAUSTED" errors with progressive delays.

```typescript
const CAPACITY_BACKOFF_TIERS_MS = [5000, 10000, 20000, 30000, 60000];

function getCapacityBackoffDelay(consecutiveFailures: number): number {
  const index = Math.min(consecutiveFailures, CAPACITY_BACKOFF_TIERS_MS.length - 1);
  return CAPACITY_BACKOFF_TIERS_MS[Math.max(0, index)] ?? 5000;
}

// In request handler:
if (isCapacityExhausted) {
  const failures = account.consecutiveFailures ?? 0;
  const capacityBackoffMs = getCapacityBackoffDelay(failures);
  account.consecutiveFailures = failures + 1;

  await showToast(`⏳ Server at capacity. Waiting ${backoffFormatted}... (attempt ${failures + 1})`, "warning");
  await sleep(capacityBackoffMs, abortSignal);
  continue; // Retry same account
}
```

**Backoff Progression**:

| Attempt | Delay |
| ------- | ----- |
| 1       | 5s    |
| 2       | 10s   |
| 3       | 20s   |
| 4       | 30s   |
| 5+      | 60s   |

**Detection Pattern**:

```typescript
const isCapacityExhausted = bodyInfo.reason === "MODEL_CAPACITY_EXHAUSTED" || (typeof bodyInfo.message === "string" && bodyInfo.message.toLowerCase().includes("no capacity"));
```

---

### 4.31 Proactive Token Refresh Queue

**Source**: `opencode-antigravity-auth/src/plugin/refresh-queue.ts`

Background token refresh to ensure OAuth tokens remain valid without blocking requests.

```typescript
export interface ProactiveRefreshConfig {
  enabled: boolean;
  bufferSeconds: number; // Default: 1800 (30 minutes before expiry)
  checkIntervalSeconds: number; // Default: 300 (5 minutes between checks)
}

interface RefreshQueueState {
  isRunning: boolean;
  intervalHandle: ReturnType<typeof setInterval> | null;
  isRefreshing: boolean; // Prevents concurrent refresh operations
  lastCheckTime: number;
  lastRefreshTime: number;
  refreshCount: number;
  errorCount: number;
}

export class ProactiveRefreshQueue {
  needsRefresh(account: ManagedAccount): boolean {
    if (!account.expires) return false;
    const now = Date.now();
    const bufferMs = this.config.bufferSeconds * 1000;
    const refreshThreshold = now + bufferMs;
    return account.expires <= refreshThreshold;
  }

  private async runRefreshCheck(): Promise<void> {
    if (this.state.isRefreshing) return; // Skip if already refreshing
    if (!this.accountManager) return;

    this.state.isRefreshing = true;
    this.state.lastCheckTime = Date.now();

    try {
      const accountsToRefresh = this.getAccountsNeedingRefresh();

      // Refresh accounts serially to avoid concurrent refresh storms
      for (const account of accountsToRefresh) {
        if (!this.state.isRunning) break; // Queue was stopped

        try {
          const auth = this.accountManager.toAuthDetails(account);
          const refreshed = await this.refreshToken(auth, account);

          if (refreshed) {
            this.accountManager.updateFromAuth(account, refreshed);
            this.state.refreshCount++;
            await this.accountManager.saveToDisk();
          }
        } catch (error) {
          this.state.errorCount++;
          log.warn("Failed to refresh account", { accountIndex: account.index });
        }
      }
    } finally {
      this.state.isRefreshing = false;
    }
  }

  start(): void {
    if (this.state.isRunning || !this.config.enabled) return;

    this.state.isRunning = true;
    const intervalMs = this.config.checkIntervalSeconds * 1000;

    // Initial check after 5 seconds (let things settle)
    setTimeout(() => {
      if (this.state.isRunning) this.runRefreshCheck();
    }, 5000);

    // Periodic checks
    this.state.intervalHandle = setInterval(() => {
      this.runRefreshCheck();
    }, intervalMs);
  }
}
```

**Key Design Features**:

| Feature             | Purpose                                  |
| ------------------- | ---------------------------------------- |
| Serial refresh      | Prevents refresh storms                  |
| isRefreshing guard  | Skips overlapping checks                 |
| 5s initial delay    | Lets initialization settle               |
| Non-blocking errors | Continues with other accounts on failure |
| Statistics tracking | refreshCount, errorCount for debugging   |

---

### 4.32 Auth Cache with Signature Persistence

**Source**: `opencode-antigravity-auth/src/plugin/cache.ts`

Two-tier caching: OAuth tokens and thinking signatures with memory + disk persistence.

**OAuth Token Cache**:

```typescript
const authCache = new Map<string, OAuthAuthDetails>();

function normalizeRefreshKey(refresh?: string): string | undefined {
  const key = refresh?.trim();
  return key ? key : undefined;
}

export function resolveCachedAuth(auth: OAuthAuthDetails): OAuthAuthDetails {
  const key = normalizeRefreshKey(auth.refresh);
  if (!key) return auth;

  const cached = authCache.get(key);
  if (!cached) {
    authCache.set(key, auth);
    return auth;
  }

  // Prefer unexpired tokens
  if (!accessTokenExpired(auth)) {
    authCache.set(key, auth);
    return auth;
  }
  if (!accessTokenExpired(cached)) {
    return cached;
  }

  authCache.set(key, auth);
  return auth;
}
```

**Signature Cache with TTL and LRU**:

```typescript
const SIGNATURE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES_PER_SESSION = 100;
const SIGNATURE_TEXT_HASH_HEX_LEN = 16; // 64-bit key space

// Map: sessionId -> Map<textHash, SignatureEntry>
const signatureCache = new Map<string, Map<string, SignatureEntry>>();
let diskCache: SignatureCache | null = null;

function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, SIGNATURE_TEXT_HASH_HEX_LEN);
}

export function cacheSignature(sessionId: string, text: string, signature: string): void {
  if (!sessionId || !text || !signature) return;

  const textHash = hashText(text);

  // Write to memory cache
  let sessionMemCache = signatureCache.get(sessionId);
  if (!sessionMemCache) {
    sessionMemCache = new Map();
    signatureCache.set(sessionId, sessionMemCache);
  }

  // Evict old entries if at capacity (LRU-style)
  if (sessionMemCache.size >= MAX_ENTRIES_PER_SESSION) {
    const now = Date.now();
    // First: evict expired entries
    for (const [key, entry] of sessionMemCache.entries()) {
      if (now - entry.timestamp > SIGNATURE_CACHE_TTL_MS) {
        sessionMemCache.delete(key);
      }
    }
    // If still at capacity: remove oldest 25%
    if (sessionMemCache.size >= MAX_ENTRIES_PER_SESSION) {
      const entries = Array.from(sessionMemCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, Math.floor(MAX_ENTRIES_PER_SESSION / 4));
      for (const [key] of toRemove) {
        sessionMemCache.delete(key);
      }
    }
  }

  sessionMemCache.set(textHash, { signature, timestamp: Date.now() });

  // Write to disk cache if enabled
  if (diskCache) {
    const diskKey = `${sessionId}:${textHash}`;
    diskCache.store(diskKey, signature);
  }
}

export function getCachedSignature(sessionId: string, text: string): string | undefined {
  const textHash = hashText(text);

  // Check memory first
  const sessionMemCache = signatureCache.get(sessionId);
  if (sessionMemCache) {
    const entry = sessionMemCache.get(textHash);
    if (entry) {
      if (Date.now() - entry.timestamp > SIGNATURE_CACHE_TTL_MS) {
        sessionMemCache.delete(textHash);
      } else {
        return entry.signature;
      }
    }
  }

  // Fall back to disk cache (with promotion to memory)
  if (diskCache) {
    const diskKey = `${sessionId}:${textHash}`;
    const diskValue = diskCache.retrieve(diskKey);
    if (diskValue) {
      // Promote to memory for faster subsequent access
      let memCache = signatureCache.get(sessionId);
      if (!memCache) {
        memCache = new Map();
        signatureCache.set(sessionId, memCache);
      }
      memCache.set(textHash, { signature: diskValue, timestamp: Date.now() });
      return diskValue;
    }
  }

  return undefined;
}
```

**Cache Architecture**:

```
┌─────────────────────────────────────────────────────────┐
│                    Memory Cache                          │
│  sessionId → Map<textHash, {signature, timestamp}>      │
│  - Max 100 entries per session                          │
│  - 1 hour TTL                                           │
│  - LRU eviction (oldest 25%)                            │
├─────────────────────────────────────────────────────────┤
│                    Disk Cache                            │
│  key: `${sessionId}:${textHash}`                        │
│  - Survives restarts                                    │
│  - Read promotion to memory                             │
│  - Natural TTL expiration                               │
└─────────────────────────────────────────────────────────┘
```

---

### 4.33 Account Failure Tracking with Cooldown

**Source**: `opencode-antigravity-auth/src/plugin.ts`

Prevents infinite retry loops by tracking non-429 failures per account.

```typescript
const accountFailureState = new Map<
  number,
  {
    consecutiveFailures: number;
    lastFailureAt: number;
  }
>();

const MAX_CONSECUTIVE_FAILURES = 5;
const FAILURE_COOLDOWN_MS = 30_000; // 30 seconds cooldown after max failures
const FAILURE_STATE_RESET_MS = 120_000; // Reset after 2 minutes of no failures

function trackAccountFailure(accountIndex: number): {
  failures: number;
  shouldCooldown: boolean;
  cooldownMs: number;
} {
  const now = Date.now();
  const previous = accountFailureState.get(accountIndex);

  // Reset if last failure was more than 2 minutes ago
  const failures = previous && now - previous.lastFailureAt < FAILURE_STATE_RESET_MS ? previous.consecutiveFailures + 1 : 1;

  accountFailureState.set(accountIndex, {
    consecutiveFailures: failures,
    lastFailureAt: now,
  });

  const shouldCooldown = failures >= MAX_CONSECUTIVE_FAILURES;
  const cooldownMs = shouldCooldown ? FAILURE_COOLDOWN_MS : 0;

  return { failures, shouldCooldown, cooldownMs };
}

function resetAccountFailureState(accountIndex: number): void {
  accountFailureState.delete(accountIndex);
}
```

**Usage Pattern**:

```typescript
// After token refresh failure
const { failures, shouldCooldown, cooldownMs } = trackAccountFailure(account.index);
if (shouldCooldown) {
  accountManager.markAccountCoolingDown(account, cooldownMs, "auth-failure");
  accountManager.markRateLimited(account, cooldownMs, family, "antigravity", model);
}

// After successful operation
resetAccountFailureState(account.index);
```

**Failure Tracking Matrix**:

| Error Type            | Action                     |
| --------------------- | -------------------------- |
| Token refresh failed  | Track + potential cooldown |
| invalid_grant         | Remove account from pool   |
| Project context error | Track + potential cooldown |
| Network error         | Track + potential cooldown |
| Success (any)         | Reset failure state        |

---

### 4.34 Quota Fallback Strategy

**Source**: `opencode-antigravity-auth/src/plugin.ts`

Automatic fallback between Antigravity and Gemini CLI quotas for Gemini models.

```typescript
// Check if header style is rate-limited for this account
if (accountManager.isRateLimitedForHeaderStyle(account, family, headerStyle, model)) {
  // Quota fallback: try alternate quota on same account (if enabled and not explicit)
  if (config.quota_fallback && !explicitQuota && family === "gemini") {
    const alternateStyle = accountManager.getAvailableHeaderStyle(account, family, model);
    if (alternateStyle && alternateStyle !== headerStyle) {
      const quotaName = headerStyle === "gemini-cli" ? "Gemini CLI" : "Antigravity";
      const altQuotaName = alternateStyle === "gemini-cli" ? "Gemini CLI" : "Antigravity";
      if (!quietMode) {
        await showToast(`${quotaName} quota exhausted, using ${altQuotaName} quota`, "warning");
      }
      headerStyle = alternateStyle;
    } else {
      shouldSwitchAccount = true;
    }
  } else {
    shouldSwitchAccount = true;
  }
}

// Prioritized Antigravity across ALL accounts first
if (family === "gemini") {
  if (headerStyle === "antigravity") {
    // Check if any other account has Antigravity quota
    if (hasOtherAccountWithAntigravity(account)) {
      await showToast(`Rate limited again. Switching account in 5s...`, "warning");
      await sleep(SWITCH_ACCOUNT_DELAY_MS, abortSignal);
      shouldSwitchAccount = true;
      break;
    }

    // All accounts exhausted for Antigravity - fall back to gemini-cli
    if (config.quota_fallback && !explicitQuota) {
      const alternateStyle = accountManager.getAvailableHeaderStyle(account, family, model);
      if (alternateStyle && alternateStyle !== headerStyle) {
        await showToast(`Antigravity quota exhausted for ${model}. Switching to Gemini CLI quota...`, "warning");
        headerStyle = alternateStyle;
        continue;
      }
    }
  }
}
```

**Fallback Priority Order**:

```
1. Same account, same quota (retry)
       ↓ (rate limited)
2. Same account, alternate quota (if quota_fallback enabled)
       ↓ (also rate limited)
3. Other accounts, Antigravity quota first
       ↓ (all antigravity exhausted)
4. Other accounts, Gemini CLI quota
       ↓ (all exhausted)
5. Wait for quota reset
```

**Quota Key Mapping**:

```typescript
function headerStyleToQuotaKey(headerStyle: HeaderStyle, family: ModelFamily): string {
  if (family === "claude") return "claude";
  return headerStyle === "antigravity" ? "gemini-antigravity" : "gemini-cli";
}
```

---
