/**
 * Auto-Refresh Scheduler
 *
 * Automatically triggers quota reset every 5 hours to ensure predictable quota cycles.
 * This starts the Google quota countdown timer so quota resets on a known schedule.
 */

import { AUTO_REFRESH_INTERVAL_MS, AUTO_REFRESH_CHECK_INTERVAL_MS } from "../constants.js";
import { triggerQuotaResetApi } from "./quota-reset-trigger.js";
import { fetchAccountCapacity } from "./quota-api.js";
import { AccountManager } from "../account-manager/index.js";
import { getLogger } from "../utils/logger.js";

let intervalId: ReturnType<typeof setInterval> | null = null;
let nextRefreshTime: number | null = null;
let accountManager: AccountManager | null = null;
let lastRefreshTime: number | null = null;

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

const accountStates = new Map<string, AccountRefreshState>();

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

        // Check if this account actually needs a refresh trigger
        const { needsRefresh, reason } = await checkAndUpdateAccountState(token, account.email);

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

/**
 * Start the auto-refresh scheduler
 * Triggers immediately, then checks every AUTO_REFRESH_CHECK_INTERVAL_MS (10 minutes)
 */
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

/**
 * Stop the auto-refresh scheduler
 */
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

/**
 * Check if auto-refresh is currently running
 */
export function isAutoRefreshRunning(): boolean {
  return intervalId !== null;
}

/**
 * Get the next scheduled refresh time
 * @returns Timestamp in milliseconds, or null if not running
 */
export function getNextRefreshTime(): number | null {
  return nextRefreshTime;
}

/**
 * Get the last refresh time
 * @returns Timestamp in milliseconds, or null if never refreshed
 */
export function getLastRefreshTime(): number | null {
  return lastRefreshTime;
}

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
