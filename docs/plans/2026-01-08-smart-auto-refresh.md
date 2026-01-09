# Smart Auto-Refresh: Per-Account Quota Management

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix auto-refresh to trigger quota reset for ALL exhausted accounts, not just the first one, and only when actually needed.

**Architecture:** Replace the dumb 5-hour interval with a smart quota manager that: (1) checks actual quota status for all accounts, (2) triggers reset only for accounts that are exhausted AND have no pending reset timer, (3) tracks per-account state for UI display.

**Tech Stack:** TypeScript, Node.js, Vitest

**Root Cause:** `auto-refresh-scheduler.ts` line 33 uses `accounts.find()` which only returns the FIRST OAuth account. All other accounts are completely ignored.

---

## Task 1: Add Multi-Account Support to performRefresh

**Problem:** Current code only processes first OAuth account.

**Files:**

- Modify: `src/cloudcode/auto-refresh-scheduler.ts`
- Test: `tests/unit/cloudcode/auto-refresh-scheduler.test.ts`

**Step 1: Read current implementation**

Read `src/cloudcode/auto-refresh-scheduler.ts` to understand the current structure.

**Step 2: Update performRefresh to loop through ALL accounts**

Replace the `performRefresh` function (lines 22-61) with:

```typescript
/**
 * Perform quota refresh for ALL OAuth accounts
 * Sends minimal requests to Google to start the 5-hour countdown timer
 */
async function performRefresh(): Promise<void> {
  const logger = getLogger();

  try {
    if (!accountManager) {
      accountManager = new AccountManager();
      await accountManager.initialize();
    }

    // Get ALL OAuth accounts, not just the first one
    const accounts = accountManager.getAllAccounts();
    const oauthAccounts = accounts.filter((a: { source: string; refreshToken?: string }) => a.source === "oauth" && a.refreshToken);

    if (oauthAccounts.length === 0) {
      logger.warn("[AutoRefresh] No OAuth accounts available for quota refresh");
      return;
    }

    logger.info(`[AutoRefresh] Processing ${oauthAccounts.length} account(s)...`);

    let totalSuccess = 0;
    let totalFailed = 0;

    // Process each account
    for (const account of oauthAccounts) {
      try {
        const token = await accountManager.getTokenForAccount(account);
        const projectId = await accountManager.getProjectForAccount(account, token);

        // Trigger quota reset for all groups using this account's credentials
        const result = await triggerQuotaResetApi(token, projectId, "all");

        if (result.successCount > 0) {
          totalSuccess++;
          logger.info(`[AutoRefresh] ${account.email}: triggered ${result.successCount} group(s)`);
        } else {
          totalFailed++;
          logger.warn(`[AutoRefresh] ${account.email}: failed to trigger any groups`);
        }
      } catch (error) {
        totalFailed++;
        const err = error as Error;
        logger.error(`[AutoRefresh] ${account.email}: ${err.message}`);
      }
    }

    // Clear local rate limit flags for all accounts
    accountManager.triggerQuotaReset("all");

    if (totalSuccess > 0) {
      lastRefreshTime = Date.now();
      const nextReset = new Date(Date.now() + AUTO_REFRESH_INTERVAL_MS);
      logger.info(`[AutoRefresh] Completed: ${totalSuccess} succeeded, ${totalFailed} failed. Next refresh at ${nextReset.toLocaleTimeString()}`);
    } else {
      logger.warn(`[AutoRefresh] All ${totalFailed} account(s) failed to trigger quota reset`);
    }
  } catch (error) {
    const err = error as Error;
    logger.error(`[AutoRefresh] Error during quota refresh: ${err.message}`);
  }
}
```

**Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Run existing tests**

Run: `npm test -- tests/unit/cloudcode/auto-refresh-scheduler.test.ts --no-coverage`
Expected: Tests pass (or update mocks if needed)

**Step 5: Commit**

```bash
git add src/cloudcode/auto-refresh-scheduler.ts
git commit -m "fix(auto-refresh): process ALL OAuth accounts, not just first

Previously only the first OAuth account was processed due to using
accounts.find(). Now loops through all accounts and triggers quota
reset for each one independently."
```

---

## Task 2: Add Smart Quota Checking Before Trigger

**Problem:** Current code triggers blindly every 5 hours without checking if accounts actually need it.

**Files:**

- Modify: `src/cloudcode/auto-refresh-scheduler.ts`
- Modify: Add import for `fetchAccountCapacity`

**Step 1: Add import for fetchAccountCapacity**

Add to imports at top of file:

```typescript
import { fetchAccountCapacity } from "./quota-api.js";
```

**Step 2: Create helper function to check if account needs refresh**

Add before `performRefresh` function:

```typescript
/**
 * Check if an account needs quota refresh trigger
 * @returns true if account is exhausted and has no pending reset timer
 */
async function accountNeedsRefresh(token: string, email: string): Promise<{ needsRefresh: boolean; reason: string }> {
  try {
    const capacity = await fetchAccountCapacity(token, email);

    // Check Claude pool
    const claudeExhausted = capacity.claudePool.aggregatedPercentage === 0;
    const claudeHasReset = capacity.claudePool.earliestReset !== null;

    // Check Gemini pool (use minimum percentage across models)
    const geminiExhausted = capacity.geminiPool.aggregatedPercentage === 0;
    const geminiHasReset = capacity.geminiPool.earliestReset !== null;

    // Need refresh if exhausted AND no reset timer running
    if (claudeExhausted && !claudeHasReset) {
      return { needsRefresh: true, reason: "Claude exhausted, no reset timer" };
    }
    if (geminiExhausted && !geminiHasReset) {
      return { needsRefresh: true, reason: "Gemini exhausted, no reset timer" };
    }

    // Already has capacity or reset timer is running
    if (claudeHasReset || geminiHasReset) {
      return { needsRefresh: false, reason: "Reset timer already running" };
    }

    return { needsRefresh: false, reason: "Has remaining quota" };
  } catch (error) {
    // If we can't check, trigger anyway to be safe
    return { needsRefresh: true, reason: "Could not check quota status" };
  }
}
```

**Step 3: Update performRefresh to use smart checking**

Update the account processing loop inside `performRefresh`:

```typescript
// Process each account
for (const account of oauthAccounts) {
  try {
    const token = await accountManager.getTokenForAccount(account);

    // Check if this account actually needs a refresh trigger
    const { needsRefresh, reason } = await accountNeedsRefresh(token, account.email);

    if (!needsRefresh) {
      logger.debug(`[AutoRefresh] ${account.email}: skipped - ${reason}`);
      continue;
    }

    logger.info(`[AutoRefresh] ${account.email}: triggering - ${reason}`);

    const projectId = await accountManager.getProjectForAccount(account, token);

    // Trigger quota reset for all groups using this account's credentials
    const result = await triggerQuotaResetApi(token, projectId, "all");

    if (result.successCount > 0) {
      totalSuccess++;
      logger.info(`[AutoRefresh] ${account.email}: triggered ${result.successCount} group(s)`);
    } else {
      totalFailed++;
      logger.warn(`[AutoRefresh] ${account.email}: failed to trigger any groups`);
    }
  } catch (error) {
    totalFailed++;
    const err = error as Error;
    logger.error(`[AutoRefresh] ${account.email}: ${err.message}`);
  }
}
```

**Step 4: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/cloudcode/auto-refresh-scheduler.ts
git commit -m "feat(auto-refresh): add smart quota checking before trigger

Only triggers quota reset for accounts that are:
- Exhausted (0% remaining) AND
- Have no reset timer already running

Skips accounts that have remaining quota or already have a
countdown timer, reducing unnecessary API calls."
```

---

## Task 3: Reduce Check Interval for Faster Response

**Problem:** 5-hour interval is too long - exhausted accounts sit idle for hours.

**Files:**

- Modify: `src/constants.ts`
- Modify: `src/cloudcode/auto-refresh-scheduler.ts`

**Step 1: Add new constant for check interval**

Add to `src/constants.ts` after line 117:

```typescript
// Smart auto-refresh check interval (10 minutes)
// Checks quota status frequently, but only triggers reset when needed
export const AUTO_REFRESH_CHECK_INTERVAL_MS = 10 * 60 * 1000;
```

**Step 2: Update scheduler to use check interval**

Update imports in `auto-refresh-scheduler.ts`:

```typescript
import { AUTO_REFRESH_INTERVAL_MS, AUTO_REFRESH_CHECK_INTERVAL_MS } from "../constants.js";
```

**Step 3: Update startAutoRefresh to use check interval**

Update the interval in `startAutoRefresh`:

```typescript
export async function startAutoRefresh(): Promise<void> {
  const logger = getLogger();

  if (intervalId !== null) {
    logger.debug("[AutoRefresh] Already running, skipping start");
    return;
  }

  logger.info(`[AutoRefresh] Starting smart auto-refresh (check every 10 minutes)`);

  // Trigger immediately
  await performRefresh();

  // Schedule frequent checks (smart refresh only triggers when needed)
  nextRefreshTime = Date.now() + AUTO_REFRESH_CHECK_INTERVAL_MS;
  intervalId = setInterval(() => {
    void performRefresh().then(() => {
      nextRefreshTime = Date.now() + AUTO_REFRESH_CHECK_INTERVAL_MS;
    });
  }, AUTO_REFRESH_CHECK_INTERVAL_MS);

  logger.info(`[AutoRefresh] Next check scheduled for ${new Date(nextRefreshTime).toLocaleTimeString()}`);
}
```

**Step 4: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/constants.ts src/cloudcode/auto-refresh-scheduler.ts
git commit -m "feat(auto-refresh): reduce check interval to 10 minutes

Since we now check actual quota status before triggering, we can
check more frequently without wasting API calls. This ensures
exhausted accounts get their reset timer started within 10 minutes
instead of waiting up to 5 hours."
```

---

## Task 4: Track Per-Account Refresh State

**Problem:** No visibility into which accounts have been refreshed and when.

**Files:**

- Modify: `src/cloudcode/auto-refresh-scheduler.ts`

**Step 1: Add per-account state tracking**

Add after the module-level variables (after line 16):

```typescript
/** Per-account refresh state */
export interface AccountRefreshState {
  email: string;
  lastChecked: number | null;
  lastTriggered: number | null;
  claudePercentage: number;
  geminiPercentage: number;
  claudeResetTime: string | null;
  geminiResetTime: string | null;
  status: "ok" | "exhausted" | "pending_reset" | "error";
}

let accountStates: Map<string, AccountRefreshState> = new Map();
```

**Step 2: Update accountNeedsRefresh to also update state**

Replace `accountNeedsRefresh` function:

```typescript
/**
 * Check if an account needs quota refresh trigger and update state
 * @returns true if account is exhausted and has no pending reset timer
 */
async function checkAndUpdateAccountState(token: string, email: string): Promise<{ needsRefresh: boolean; reason: string }> {
  const now = Date.now();

  try {
    const capacity = await fetchAccountCapacity(token, email);

    const claudePct = capacity.claudePool.aggregatedPercentage;
    const geminiPct = capacity.geminiPool.aggregatedPercentage;
    const claudeReset = capacity.claudePool.earliestReset;
    const geminiReset = capacity.geminiPool.earliestReset;

    // Determine status
    let status: AccountRefreshState["status"] = "ok";
    let needsRefresh = false;
    let reason = "Has remaining quota";

    const claudeExhausted = claudePct === 0;
    const geminiExhausted = geminiPct === 0;

    if (claudeExhausted && !claudeReset) {
      needsRefresh = true;
      status = "exhausted";
      reason = "Claude exhausted, no reset timer";
    } else if (geminiExhausted && !geminiReset) {
      needsRefresh = true;
      status = "exhausted";
      reason = "Gemini exhausted, no reset timer";
    } else if (claudeReset || geminiReset) {
      status = claudeExhausted || geminiExhausted ? "pending_reset" : "ok";
      reason = "Reset timer already running";
    }

    // Update state
    accountStates.set(email, {
      email,
      lastChecked: now,
      lastTriggered: accountStates.get(email)?.lastTriggered ?? null,
      claudePercentage: claudePct,
      geminiPercentage: geminiPct,
      claudeResetTime: claudeReset,
      geminiResetTime: geminiReset,
      status,
    });

    return { needsRefresh, reason };
  } catch (error) {
    // Update state with error
    const existing = accountStates.get(email);
    accountStates.set(email, {
      email,
      lastChecked: now,
      lastTriggered: existing?.lastTriggered ?? null,
      claudePercentage: existing?.claudePercentage ?? 0,
      geminiPercentage: existing?.geminiPercentage ?? 0,
      claudeResetTime: existing?.claudeResetTime ?? null,
      geminiResetTime: existing?.geminiResetTime ?? null,
      status: "error",
    });

    // If we can't check, trigger anyway to be safe
    return { needsRefresh: true, reason: "Could not check quota status" };
  }
}
```

**Step 3: Update performRefresh to use new function and track triggers**

Update the account processing loop to use `checkAndUpdateAccountState` and update `lastTriggered`:

```typescript
// Check if this account actually needs a refresh trigger
const { needsRefresh, reason } = await checkAndUpdateAccountState(token, account.email);

if (!needsRefresh) {
  logger.debug(`[AutoRefresh] ${account.email}: skipped - ${reason}`);
  continue;
}

logger.info(`[AutoRefresh] ${account.email}: triggering - ${reason}`);

const projectId = await accountManager.getProjectForAccount(account, token);
const result = await triggerQuotaResetApi(token, projectId, "all");

if (result.successCount > 0) {
  totalSuccess++;
  // Update lastTriggered timestamp
  const state = accountStates.get(account.email);
  if (state) {
    state.lastTriggered = Date.now();
    state.status = "pending_reset";
  }
  logger.info(`[AutoRefresh] ${account.email}: triggered ${result.successCount} group(s)`);
} else {
  totalFailed++;
  logger.warn(`[AutoRefresh] ${account.email}: failed to trigger any groups`);
}
```

**Step 4: Add getter for account states**

Add before the closing of the file:

```typescript
/**
 * Get the current state of all tracked accounts
 * @returns Array of account refresh states
 */
export function getAccountRefreshStates(): AccountRefreshState[] {
  return Array.from(accountStates.values());
}

/**
 * Get state for a specific account
 * @param email - Account email
 * @returns Account state or undefined if not tracked
 */
export function getAccountRefreshState(email: string): AccountRefreshState | undefined {
  return accountStates.get(email);
}
```

**Step 5: Clear state on stop**

Update `stopAutoRefresh`:

```typescript
export function stopAutoRefresh(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
    nextRefreshTime = null;
    lastRefreshTime = null;
    accountStates.clear();
    getLogger().info("[AutoRefresh] Scheduler stopped");
  }
}
```

**Step 6: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add src/cloudcode/auto-refresh-scheduler.ts
git commit -m "feat(auto-refresh): track per-account refresh state

Tracks for each account:
- Last checked timestamp
- Last triggered timestamp
- Current quota percentages
- Reset times
- Status (ok/exhausted/pending_reset/error)

Exposes getAccountRefreshStates() and getAccountRefreshState(email)
for UI consumption."
```

---

## Task 5: Write Unit Tests for Smart Auto-Refresh

**Files:**

- Modify: `tests/unit/cloudcode/auto-refresh-scheduler.test.ts`

**Step 1: Read existing tests**

Read `tests/unit/cloudcode/auto-refresh-scheduler.test.ts` to understand structure.

**Step 2: Add tests for multi-account processing**

Add new test cases:

```typescript
describe("multi-account support", () => {
  it("processes all OAuth accounts, not just the first", async () => {
    // Setup: 3 OAuth accounts
    mockAccountManager.getAllAccounts.mockReturnValue([
      { email: "first@test.com", source: "oauth", refreshToken: "token1" },
      { email: "second@test.com", source: "oauth", refreshToken: "token2" },
      { email: "third@test.com", source: "oauth", refreshToken: "token3" },
    ]);

    mockAccountManager.getTokenForAccount.mockResolvedValue("access-token");
    mockAccountManager.getProjectForAccount.mockResolvedValue("project-id");
    mockTriggerQuotaResetApi.mockResolvedValue({ successCount: 3, failureCount: 0, groupsTriggered: [] });
    mockFetchAccountCapacity.mockResolvedValue({
      claudePool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
      geminiPool: { aggregatedPercentage: 50, earliestReset: null, models: [] },
    });

    await startAutoRefresh();

    // Should have called getTokenForAccount for all 3 accounts
    expect(mockAccountManager.getTokenForAccount).toHaveBeenCalledTimes(3);
    expect(mockTriggerQuotaResetApi).toHaveBeenCalledTimes(3);

    stopAutoRefresh();
  });

  it("skips accounts that have remaining quota", async () => {
    mockAccountManager.getAllAccounts.mockReturnValue([
      { email: "exhausted@test.com", source: "oauth", refreshToken: "token1" },
      { email: "has-quota@test.com", source: "oauth", refreshToken: "token2" },
    ]);

    mockAccountManager.getTokenForAccount.mockResolvedValue("access-token");
    mockAccountManager.getProjectForAccount.mockResolvedValue("project-id");

    // First account exhausted, second has quota
    mockFetchAccountCapacity
      .mockResolvedValueOnce({
        claudePool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
        geminiPool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
      })
      .mockResolvedValueOnce({
        claudePool: { aggregatedPercentage: 80, earliestReset: null, models: [] },
        geminiPool: { aggregatedPercentage: 50, earliestReset: null, models: [] },
      });

    mockTriggerQuotaResetApi.mockResolvedValue({ successCount: 3, failureCount: 0, groupsTriggered: [] });

    await startAutoRefresh();

    // Should only trigger for the exhausted account
    expect(mockTriggerQuotaResetApi).toHaveBeenCalledTimes(1);

    stopAutoRefresh();
  });

  it("skips accounts that already have reset timer running", async () => {
    mockAccountManager.getAllAccounts.mockReturnValue([{ email: "pending@test.com", source: "oauth", refreshToken: "token1" }]);

    mockAccountManager.getTokenForAccount.mockResolvedValue("access-token");

    // Account exhausted but has reset timer
    mockFetchAccountCapacity.mockResolvedValue({
      claudePool: { aggregatedPercentage: 0, earliestReset: "2025-01-01T10:00:00Z", models: [] },
      geminiPool: { aggregatedPercentage: 0, earliestReset: "2025-01-01T10:00:00Z", models: [] },
    });

    await startAutoRefresh();

    // Should NOT trigger - reset timer already running
    expect(mockTriggerQuotaResetApi).not.toHaveBeenCalled();

    stopAutoRefresh();
  });
});

describe("getAccountRefreshStates", () => {
  it("returns tracked account states after refresh", async () => {
    mockAccountManager.getAllAccounts.mockReturnValue([{ email: "test@example.com", source: "oauth", refreshToken: "token" }]);

    mockAccountManager.getTokenForAccount.mockResolvedValue("access-token");
    mockFetchAccountCapacity.mockResolvedValue({
      claudePool: { aggregatedPercentage: 50, earliestReset: null, models: [] },
      geminiPool: { aggregatedPercentage: 75, earliestReset: null, models: [] },
    });

    await startAutoRefresh();

    const states = getAccountRefreshStates();
    expect(states).toHaveLength(1);
    expect(states[0].email).toBe("test@example.com");
    expect(states[0].claudePercentage).toBe(50);
    expect(states[0].geminiPercentage).toBe(75);
    expect(states[0].status).toBe("ok");

    stopAutoRefresh();
  });
});
```

**Step 3: Update mocks at top of test file**

Add mock for fetchAccountCapacity:

```typescript
vi.mock("../../../src/cloudcode/quota-api.js", () => ({
  fetchAccountCapacity: vi.fn(),
}));

import { fetchAccountCapacity } from "../../../src/cloudcode/quota-api.js";
const mockFetchAccountCapacity = vi.mocked(fetchAccountCapacity);
```

**Step 4: Run tests**

Run: `npm test -- tests/unit/cloudcode/auto-refresh-scheduler.test.ts --no-coverage`
Expected: All tests pass

**Step 5: Commit**

```bash
git add tests/unit/cloudcode/auto-refresh-scheduler.test.ts
git commit -m "test(auto-refresh): add tests for multi-account smart refresh

Tests verify:
- All OAuth accounts are processed, not just first
- Accounts with remaining quota are skipped
- Accounts with pending reset timer are skipped
- Account states are tracked correctly"
```

---

## Task 6: Update CLI Startup Trigger to Handle All Accounts

**Problem:** The CLI `--trigger-reset` flag also only processes first account.

**Files:**

- Modify: `src/cli/index.ts`

**Step 1: Find and update the trigger-reset startup code**

Update lines 102-126 in `src/cli/index.ts`:

```typescript
// Trigger quota reset on startup if requested (FIXED: now processes ALL accounts)
if (opts.triggerReset || process.env.TRIGGER_RESET === "true") {
  const { default: chalk } = await import("chalk");
  const { AccountManager } = await import("../account-manager/index.js");
  const { triggerQuotaResetApi } = await import("../cloudcode/quota-reset-trigger.js");

  try {
    const accountManager = new AccountManager();
    await accountManager.initialize();

    // Get ALL OAuth accounts
    const accounts = accountManager.getAllAccounts();
    const oauthAccounts = accounts.filter((a: { source: string; refreshToken?: string }) => a.source === "oauth" && a.refreshToken);

    if (oauthAccounts.length === 0) {
      console.log(chalk.yellow("No OAuth accounts found for quota reset"));
    } else {
      console.log(chalk.blue(`Triggering quota reset for ${oauthAccounts.length} account(s)...`));

      let successCount = 0;
      let failCount = 0;

      for (const account of oauthAccounts) {
        try {
          const token = await accountManager.getTokenForAccount(account);
          const projectId = await accountManager.getProjectForAccount(account, token);
          const apiResult = await triggerQuotaResetApi(token, projectId, "all");

          if (apiResult.successCount > 0) {
            successCount++;
            console.log(chalk.green(`  ${account.email}: ${apiResult.successCount} group(s) triggered`));
          } else {
            failCount++;
            console.log(chalk.yellow(`  ${account.email}: failed to trigger`));
          }
        } catch (err) {
          failCount++;
          console.log(chalk.red(`  ${account.email}: ${(err as Error).message}`));
        }
      }

      // Clear local flags for all accounts
      const localResult = accountManager.triggerQuotaReset("all");

      console.log(chalk.green(`Startup quota reset: ${successCount} succeeded, ${failCount} failed, ${localResult.limitsCleared} local limit(s) cleared`));
    }
  } catch (e) {
    console.error(chalk.red(`Startup quota reset failed: ${(e as Error).message}`));
  }
}
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/cli/index.ts
git commit -m "fix(cli): trigger-reset startup flag now processes all accounts

Previously only the first OAuth account was processed. Now loops
through all OAuth accounts and triggers quota reset for each."
```

---

## Task 7: Full Test Suite and Manual Verification

**Step 1: Run full test suite**

Run: `npm test -- --no-coverage`
Expected: All tests pass

**Step 2: Build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Manual verification with TUI**

Run: `npm run tui`

Manual checks:

1. Enable "Auto Refresh" in settings (`o` key)
2. Check logs (`l` key) - should see "Processing X account(s)..."
3. Check accounts (`a` key) - should see per-account quota status
4. Wait 10 minutes - should see another check in logs
5. Verify exhausted accounts get triggered, accounts with quota are skipped

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(auto-refresh): complete smart per-account quota management

Summary of changes:
- Auto-refresh now processes ALL OAuth accounts, not just first
- Smart checking: only triggers for exhausted accounts without reset timer
- Check interval reduced to 10 minutes for faster response
- Per-account state tracking exposed for UI
- CLI --trigger-reset also fixed for all accounts

Fixes: Accounts at 100% usage were being ignored because only
the first account was ever processed."
```

---

## Summary

| Task | Description                              | Files                                       |
| ---- | ---------------------------------------- | ------------------------------------------- |
| 1    | Multi-account support in performRefresh  | `auto-refresh-scheduler.ts`                 |
| 2    | Smart quota checking before trigger      | `auto-refresh-scheduler.ts`                 |
| 3    | Reduce check interval to 10 minutes      | `constants.ts`, `auto-refresh-scheduler.ts` |
| 4    | Per-account state tracking               | `auto-refresh-scheduler.ts`                 |
| 5    | Unit tests for smart auto-refresh        | `auto-refresh-scheduler.test.ts`            |
| 6    | Fix CLI startup trigger for all accounts | `cli/index.ts`                              |
| 7    | Full test suite and manual verification  | N/A                                         |

**Key Behavior Changes:**

- Checks ALL accounts every 10 minutes (was: only first account every 5 hours)
- Only triggers reset for accounts that actually need it
- Skips accounts with remaining quota
- Skips accounts with reset timer already running
- Tracks per-account state for UI visibility

**Estimated commits:** 7
