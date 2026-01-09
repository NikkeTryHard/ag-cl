/**
 * Auto-Refresh Scheduler
 *
 * Automatically triggers quota reset every 5 hours to ensure predictable quota cycles.
 * This starts the Google quota countdown timer so quota resets on a known schedule.
 */

import { AUTO_REFRESH_INTERVAL_MS } from "../constants.js";
import { triggerQuotaResetApi } from "./quota-reset-trigger.js";
import { AccountManager } from "../account-manager/index.js";
import { getLogger } from "../utils/logger.js";

let intervalId: ReturnType<typeof setInterval> | null = null;
let nextRefreshTime: number | null = null;
let accountManager: AccountManager | null = null;
let lastRefreshTime: number | null = null;

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

/**
 * Start the auto-refresh scheduler
 * Triggers immediately, then every AUTO_REFRESH_INTERVAL_MS (5 hours)
 */
export async function startAutoRefresh(): Promise<void> {
  const logger = getLogger();

  if (intervalId !== null) {
    logger.debug("[AutoRefresh] Already running, skipping start");
    return;
  }

  logger.info(`[AutoRefresh] Starting auto-refresh scheduler (interval: 5 hours)`);

  // Trigger immediately
  await performRefresh();

  // Schedule future triggers
  nextRefreshTime = Date.now() + AUTO_REFRESH_INTERVAL_MS;
  intervalId = setInterval(() => {
    void performRefresh().then(() => {
      nextRefreshTime = Date.now() + AUTO_REFRESH_INTERVAL_MS;
    });
  }, AUTO_REFRESH_INTERVAL_MS);

  logger.info(`[AutoRefresh] Next refresh scheduled for ${new Date(nextRefreshTime).toLocaleTimeString()}`);
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
