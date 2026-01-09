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
 * Perform a single quota refresh trigger
 * Sends minimal requests to Google to start the 5-hour countdown timer
 */
async function performRefresh(): Promise<void> {
  const logger = getLogger();

  try {
    if (!accountManager) {
      accountManager = new AccountManager();
      await accountManager.initialize();
    }

    // Get first available OAuth account
    const accounts = accountManager.getAllAccounts();
    const oauthAccount = accounts.find((a: { source: string; refreshToken?: string }) => a.source === "oauth" && a.refreshToken);

    if (!oauthAccount) {
      logger.warn("[AutoRefresh] No OAuth accounts available for quota refresh");
      return;
    }

    // Get token and project
    const token = await accountManager.getTokenForAccount(oauthAccount);
    const projectId = await accountManager.getProjectForAccount(oauthAccount, token);

    // Trigger quota reset for all groups
    const result = await triggerQuotaResetApi(token, projectId, "all");

    // Also clear local rate limit flags
    accountManager.triggerQuotaReset("all");

    if (result.successCount > 0) {
      lastRefreshTime = Date.now();
      const nextReset = new Date(Date.now() + AUTO_REFRESH_INTERVAL_MS);
      logger.info(`[AutoRefresh] Quota timer started for ${result.successCount} group(s). Quota will reset at ${nextReset.toLocaleTimeString()}`);
    } else {
      logger.warn(`[AutoRefresh] Failed to trigger quota reset for any group`);
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
