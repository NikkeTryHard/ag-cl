/**
 * Auto-Refresh Scheduler
 *
 * Smart auto-refresh that checks quota status every 5 minutes (clock-aligned to
 * :00, :05, :10, etc.) and triggers reset for accounts that need it. Uses
 * pre-warming strategy to start fresh 5-hour reset timers proactively when
 * quota is at 100%. Processes ALL OAuth accounts, not just the first one.
 */

import { AUTO_REFRESH_CHECK_INTERVAL_MS } from "../constants.js";
import { triggerQuotaResetApi } from "./quota-reset-trigger.js";
import { fetchAccountCapacity } from "./quota-api.js";
import { AccountManager } from "../account-manager/index.js";
import { getLogger } from "../utils/logger.js";

let intervalId: ReturnType<typeof setInterval> | null = null;

let timeoutId: ReturnType<typeof setTimeout> | null = null;
let nextRefreshTime: number | null = null;
let accountManager: AccountManager | null = null;
let lastRefreshTime: number | null = null;

/**
 * Calculate milliseconds until the next clock-aligned interval.
 *
 * Aligns intervals to wall-clock times (e.g., :00, :05, :10, etc. for 5-minute intervals).
 * This ensures all instances check at predictable times regardless of when they started.
 *
 * @param intervalMs - The interval in milliseconds (e.g., 5 * 60 * 1000 for 5 minutes)
 * @returns Milliseconds until the next aligned interval (0 if already at aligned time)
 */
export function getMillisUntilNextAligned(intervalMs: number): number {
  const now = Date.now();
  // Calculate milliseconds since the start of the current hour
  const msIntoHour = now % (60 * 60 * 1000);

  // Find the next aligned time within the hour
  const remainder = msIntoHour % intervalMs;

  // If remainder is 0, we're already at an aligned time
  if (remainder === 0) return 0;

  // Otherwise, return time until next aligned interval
  return intervalMs - remainder;
}

/** Per-account refresh state */
export interface AccountRefreshState {
  email: string;
  lastChecked: number | null;
  lastTriggered: number | null;
  /** Timestamp when quota data was fetched (for stale timer detection) */
  fetchedAt: number | null;
  claudePercentage: number;
  geminiProPercentage: number;
  geminiFlashPercentage: number;
  claudeResetTime: string | null;
  geminiProResetTime: string | null;
  geminiFlashResetTime: string | null;
  /** Previous reset times for stale detection */
  prevClaudeResetTime: string | null;
  prevGeminiProResetTime: string | null;
  prevGeminiFlashResetTime: string | null;
  prevFetchedAt: number | null;
  /** Whether the reset timer appears stale (not actively ticking) */
  isClaudeTimerStale: boolean;
  isGeminiProTimerStale: boolean;
  isGeminiFlashTimerStale: boolean;
  status: "ok" | "exhausted" | "pending_reset" | "error";
}

const accountStates = new Map<string, AccountRefreshState>();

/**
 * Tolerance in milliseconds for timer staleness detection.
 * Allows for API latency and timing differences between refreshes.
 */
const STALE_TOLERANCE_MS = 60 * 1000; // 60 seconds

/**
 * Detect if a reset timer is stale (not actively ticking down).
 *
 * A stale timer means the resetTime is left over from a completed reset cycle.
 * The quota is at 100% but the old resetTime hasn't been cleared by the API.
 *
 * Detection strategy:
 * - Calculate time remaining at each fetch point (resetTime - fetchedAt)
 * - If timer is ticking: time remaining should decrease by approximately the elapsed time
 * - If timer is stale: the time remaining won't decrease as expected (absolute resetTime may have changed/jumped)
 *
 * @param currentResetTime - The current reset time from the API (ISO string)
 * @param prevResetTime - The previous reset time from the last check (ISO string)
 * @param currentFetchedAt - Timestamp when we fetched the current data
 * @param prevFetchedAt - Timestamp when we fetched the previous data
 * @returns true if the timer appears stale, false otherwise
 */
export function isTimerStale(currentResetTime: string | null, prevResetTime: string | null, currentFetchedAt: number, prevFetchedAt: number | null): boolean {
  // Cannot determine staleness without both reset times and previous fetch time
  if (!currentResetTime || !prevResetTime || !prevFetchedAt) return false;

  const expectedElapsedMs = currentFetchedAt - prevFetchedAt;
  const currentResetMs = new Date(currentResetTime).getTime();
  const previousResetMs = new Date(prevResetTime).getTime();

  // Calculate time remaining at each fetch point
  // For an active timer, time remaining should decrease by the elapsed time
  const prevTimeRemaining = previousResetMs - prevFetchedAt;
  const currentTimeRemaining = currentResetMs - currentFetchedAt;
  const actualDecreaseMs = prevTimeRemaining - currentTimeRemaining;

  // If timer is ticking, time remaining should decrease by ~expectedElapsedMs
  // Allow tolerance for API latency and timing differences
  return Math.abs(actualDecreaseMs - expectedElapsedMs) > STALE_TOLERANCE_MS;
}

/**
 * Check if an account needs quota refresh trigger and update state
 * @returns true if account is exhausted and has no pending reset timer
 */
async function checkAndUpdateAccountState(token: string, email: string): Promise<{ needsRefresh: boolean; reason: string }> {
  const now = Date.now();

  try {
    const capacity = await fetchAccountCapacity(token, email);

    const claudePct = capacity.claudePool.aggregatedPercentage;
    const geminiProPct = capacity.geminiProPool.aggregatedPercentage;
    const geminiFlashPct = capacity.geminiFlashPool.aggregatedPercentage;
    const claudeReset = capacity.claudePool.earliestReset;
    const geminiProReset = capacity.geminiProPool.earliestReset;
    const geminiFlashReset = capacity.geminiFlashPool.earliestReset;

    // Get existing state for stale timer detection
    const existing = accountStates.get(email);
    const prevFetchedAt = existing?.fetchedAt ?? null;

    // Calculate stale status for each pool
    const isClaudeTimerStale = isTimerStale(claudeReset, existing?.claudeResetTime ?? null, now, prevFetchedAt);
    const isGeminiProTimerStale = isTimerStale(geminiProReset, existing?.geminiProResetTime ?? null, now, prevFetchedAt);
    const isGeminiFlashTimerStale = isTimerStale(geminiFlashReset, existing?.geminiFlashResetTime ?? null, now, prevFetchedAt);

    // Log quota status for this account
    getLogger().info(`[AutoRefresh] ${email}: Claude ${claudePct}% (reset: ${claudeReset ?? "none"}${isClaudeTimerStale ? ", stale" : ""}), Gemini Pro ${geminiProPct}% (reset: ${geminiProReset ?? "none"}${isGeminiProTimerStale ? ", stale" : ""}), Gemini Flash ${geminiFlashPct}% (reset: ${geminiFlashReset ?? "none"}${isGeminiFlashTimerStale ? ", stale" : ""})`);

    // Determine status using pre-warming strategy:
    // 1. At 100% quota: reset timer is stale (from completed cycle) → trigger to pre-warm
    // 2. At 0% with timer: actively waiting for reset → skip
    // 3. At 0% without timer: need to start timer → trigger
    // 4. Partial quota (1-99%): in use → skip
    let status: AccountRefreshState["status"] = "ok";
    let needsRefresh = false;
    let reason = "Has remaining quota";

    const claudeExhausted = claudePct === 0;
    const geminiProExhausted = geminiProPct === 0;
    const geminiFlashExhausted = geminiFlashPct === 0;
    const claudeFresh = claudePct === 100;
    const geminiProFresh = geminiProPct === 100;
    const geminiFlashFresh = geminiFlashPct === 100;
    const anyFresh = claudeFresh || geminiProFresh || geminiFlashFresh;
    const anyExhaustedWithoutTimer = (claudeExhausted && !claudeReset) || (geminiProExhausted && !geminiProReset) || (geminiFlashExhausted && !geminiFlashReset);
    const allExhaustedWithTimer = claudeExhausted && geminiProExhausted && geminiFlashExhausted && !!claudeReset && !!geminiProReset && !!geminiFlashReset;

    if (anyExhaustedWithoutTimer) {
      // Priority 1: Must trigger - need to start a reset timer
      needsRefresh = true;
      status = "exhausted";
      if (claudeExhausted && !claudeReset) {
        reason = "Claude exhausted, no reset timer";
      } else if (geminiProExhausted && !geminiProReset) {
        reason = "Gemini Pro exhausted, no reset timer";
      } else {
        reason = "Gemini Flash exhausted, no reset timer";
      }
    } else if (allExhaustedWithTimer) {
      // Priority 2: All waiting for reset - skip
      needsRefresh = false;
      status = "pending_reset";
      reason = "Waiting for reset timers";
    } else if (anyFresh) {
      // Priority 3: Pre-warm - at least one pool at 100% (stale timer)
      needsRefresh = true;
      status = claudeExhausted || geminiProExhausted || geminiFlashExhausted ? "pending_reset" : "ok";
      reason = "Pre-warming: refreshing reset timer";
    } else {
      // Priority 4: Partial quota or one waiting + one in use
      needsRefresh = false;
      status = claudeExhausted || geminiProExhausted || geminiFlashExhausted ? "pending_reset" : "ok";
      reason = claudeExhausted || geminiProExhausted || geminiFlashExhausted ? "Waiting for reset timer" : "Has remaining quota";
    }

    // Update state
    accountStates.set(email, {
      email,
      lastChecked: now,
      lastTriggered: existing?.lastTriggered ?? null,
      fetchedAt: now,
      claudePercentage: claudePct,
      geminiProPercentage: geminiProPct,
      geminiFlashPercentage: geminiFlashPct,
      claudeResetTime: claudeReset,
      geminiProResetTime: geminiProReset,
      geminiFlashResetTime: geminiFlashReset,
      // Store current values as previous for next stale detection
      prevClaudeResetTime: existing?.claudeResetTime ?? null,
      prevGeminiProResetTime: existing?.geminiProResetTime ?? null,
      prevGeminiFlashResetTime: existing?.geminiFlashResetTime ?? null,
      prevFetchedAt: existing?.fetchedAt ?? null,
      isClaudeTimerStale,
      isGeminiProTimerStale,
      isGeminiFlashTimerStale,
      status,
    });

    return { needsRefresh, reason };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    getLogger().debug(`[AutoRefresh] ${email}: quota check failed - ${errorMessage}`);
    // Update state with error
    const existing = accountStates.get(email);
    accountStates.set(email, {
      email,
      lastChecked: now,
      lastTriggered: existing?.lastTriggered ?? null,
      fetchedAt: existing?.fetchedAt ?? null,
      claudePercentage: existing?.claudePercentage ?? 0,
      geminiProPercentage: existing?.geminiProPercentage ?? 0,
      geminiFlashPercentage: existing?.geminiFlashPercentage ?? 0,
      claudeResetTime: existing?.claudeResetTime ?? null,
      geminiProResetTime: existing?.geminiProResetTime ?? null,
      geminiFlashResetTime: existing?.geminiFlashResetTime ?? null,
      prevClaudeResetTime: existing?.prevClaudeResetTime ?? null,
      prevGeminiProResetTime: existing?.prevGeminiProResetTime ?? null,
      prevGeminiFlashResetTime: existing?.prevGeminiFlashResetTime ?? null,
      prevFetchedAt: existing?.prevFetchedAt ?? null,
      isClaudeTimerStale: existing?.isClaudeTimerStale ?? false,
      isGeminiProTimerStale: existing?.isGeminiProTimerStale ?? false,
      isGeminiFlashTimerStale: existing?.isGeminiFlashTimerStale ?? false,
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
    const oauthAccounts = accounts.filter((a) => a.source === "oauth" && a.refreshToken);

    if (oauthAccounts.length === 0) {
      logger.warn("[AutoRefresh] No OAuth accounts available for quota refresh");
      return;
    }

    logger.info(`[AutoRefresh] Processing ${oauthAccounts.length} account(s)...`);

    let totalSuccess = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    // Process each account
    for (const account of oauthAccounts) {
      try {
        const token = await accountManager.getTokenForAccount(account);

        // Check if this account actually needs a refresh trigger
        const { needsRefresh, reason } = await checkAndUpdateAccountState(token, account.email);

        if (!needsRefresh) {
          logger.info(`[AutoRefresh] ${account.email}: skipped - ${reason}`);
          totalSkipped++;
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
      const nextCheck = new Date(Date.now() + AUTO_REFRESH_CHECK_INTERVAL_MS);
      logger.info(`[AutoRefresh] Completed: ${totalSuccess} triggered, ${totalSkipped} skipped, ${totalFailed} failed. Next check at ${nextCheck.toLocaleTimeString()}`);
    } else if (totalSkipped > 0) {
      logger.info(`[AutoRefresh] No accounts needed refresh (${totalSkipped} skipped - already have reset timers or quota remaining)`);
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
 * Triggers immediately, then aligns to clock times (every 5 minutes at :00, :05, :10, etc.)
 */
export async function startAutoRefresh(): Promise<void> {
  const logger = getLogger();

  if (intervalId !== null || timeoutId !== null) {
    logger.debug("[AutoRefresh] Already running, skipping start");
    return;
  }

  const intervalMinutes = AUTO_REFRESH_CHECK_INTERVAL_MS / 60000;
  logger.info(`[AutoRefresh] Starting smart auto-refresh (check every ${intervalMinutes} minutes, clock-aligned)`);

  // Trigger immediately
  await performRefresh();

  // Calculate time until next clock-aligned interval
  const msUntilAligned = getMillisUntilNextAligned(AUTO_REFRESH_CHECK_INTERVAL_MS);

  if (msUntilAligned === 0) {
    // Already at aligned time, start interval immediately
    nextRefreshTime = Date.now() + AUTO_REFRESH_CHECK_INTERVAL_MS;
    intervalId = setInterval(() => {
      void performRefresh().then(() => {
        nextRefreshTime = Date.now() + AUTO_REFRESH_CHECK_INTERVAL_MS;
      });
    }, AUTO_REFRESH_CHECK_INTERVAL_MS);
  } else {
    // Wait until next aligned time, then start regular interval
    nextRefreshTime = Date.now() + msUntilAligned;
    timeoutId = setTimeout(() => {
      void performRefresh().then(() => {
        nextRefreshTime = Date.now() + AUTO_REFRESH_CHECK_INTERVAL_MS;
        intervalId = setInterval(() => {
          void performRefresh().then(() => {
            nextRefreshTime = Date.now() + AUTO_REFRESH_CHECK_INTERVAL_MS;
          });
        }, AUTO_REFRESH_CHECK_INTERVAL_MS);
      });
    }, msUntilAligned);
  }

  logger.info(`[AutoRefresh] Next check scheduled for ${new Date(nextRefreshTime).toLocaleTimeString()}`);
}

/**
 * Stop the auto-refresh scheduler
 */
export function stopAutoRefresh(): void {
  if (intervalId !== null || timeoutId !== null) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
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
  return intervalId !== null || timeoutId !== null;
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
