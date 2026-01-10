/**
 * Account Selection
 *
 * Handles account picking logic (round-robin, sticky, refresh-priority, drain-highest)
 * for cache continuity and quota optimization.
 * All rate limit checks are model-specific.
 */

import { MAX_WAIT_BEFORE_ERROR_MS } from "../constants.js";
import { formatDuration } from "../utils/helpers.js";
import { getLogger } from "../utils/logger.js";
import { clearExpiredLimits, getAvailableAccounts } from "./rate-limits.js";
import { getAccountRefreshStates, type AccountRefreshState } from "../cloudcode/auto-refresh-scheduler.js";
import { getQuotaGroup } from "../cloudcode/quota-groups.js";
import type { Account, OnSaveCallback, AccountSelectionResult, ShouldWaitResult, StickyAccountResult, SchedulingMode } from "./types.js";

/** Module-level index for round-robin rotation */

let roundRobinIndex = 0;

/**
 * Check if an account is usable for a specific model
 * @param account - Account object
 * @param modelId - Model ID to check
 * @returns True if account is usable
 */
function isAccountUsable(account: Account | undefined, modelId: string | null): boolean {
  if (!account || account.isInvalid) return false;

  if (modelId && account.modelRateLimits?.[modelId]) {
    const limit = account.modelRateLimits[modelId];
    if (limit.isRateLimited && limit.resetTime !== null && limit.resetTime > Date.now()) {
      return false;
    }
  }

  return true;
}

/**
 * Pick the next available account (fallback when current is unavailable).
 *
 * @param accounts - Array of account objects
 * @param currentIndex - Current account index
 * @param onSave - Callback to save changes
 * @param modelId - Model ID to check rate limits for
 * @returns The next available account and new index
 */
export function pickNext(accounts: Account[], currentIndex: number, onSave: OnSaveCallback | undefined, modelId: string | null = null): AccountSelectionResult {
  clearExpiredLimits(accounts);

  const available = getAvailableAccounts(accounts, modelId);
  if (available.length === 0) {
    return { account: null, newIndex: currentIndex };
  }

  // Clamp index to valid range
  let index = currentIndex;
  if (index >= accounts.length) {
    index = 0;
  }

  // Find next available account starting from index AFTER current
  for (let i = 1; i <= accounts.length; i++) {
    const idx = (index + i) % accounts.length;
    const account = accounts[idx];

    if (account && isAccountUsable(account, modelId)) {
      account.lastUsed = Date.now();

      const position = idx + 1;
      const total = accounts.length;
      getLogger().info(`[AccountManager] Using account: ${account.email} (${position}/${total})`);

      // Trigger save (don't await to avoid blocking)
      if (onSave) void onSave();

      return { account, newIndex: idx };
    }
  }

  return { account: null, newIndex: currentIndex };
}

/**
 * Get the current account without advancing the index (sticky selection).
 *
 * @param accounts - Array of account objects
 * @param currentIndex - Current account index
 * @param onSave - Callback to save changes
 * @param modelId - Model ID to check rate limits for
 * @returns The current account and index
 */
export function getCurrentStickyAccount(accounts: Account[], currentIndex: number, onSave: OnSaveCallback | undefined, modelId: string | null = null): AccountSelectionResult {
  clearExpiredLimits(accounts);

  if (accounts.length === 0) {
    return { account: null, newIndex: currentIndex };
  }

  // Clamp index to valid range
  let index = currentIndex;
  if (index >= accounts.length) {
    index = 0;
  }

  // Get current account directly (activeIndex = current account)
  const account = accounts[index];

  if (account && isAccountUsable(account, modelId)) {
    account.lastUsed = Date.now();
    // Trigger save (don't await to avoid blocking)
    if (onSave) void onSave();
    return { account, newIndex: index };
  }

  return { account: null, newIndex: index };
}

/**
 * Check if we should wait for the current account's rate limit to reset.
 *
 * @param accounts - Array of account objects
 * @param currentIndex - Current account index
 * @param modelId - Model ID to check rate limits for
 * @returns Whether to wait, how long, and which account
 */
export function shouldWaitForCurrentAccount(accounts: Account[], currentIndex: number, modelId: string | null = null): ShouldWaitResult {
  if (accounts.length === 0) {
    return { shouldWait: false, waitMs: 0, account: null };
  }

  // Clamp index to valid range
  let index = currentIndex;
  if (index >= accounts.length) {
    index = 0;
  }

  // Get current account directly (activeIndex = current account)
  const account = accounts[index];

  if (!account || account.isInvalid) {
    return { shouldWait: false, waitMs: 0, account: null };
  }

  let waitMs = 0;

  // Check model-specific limit
  if (modelId && account.modelRateLimits?.[modelId]) {
    const limit = account.modelRateLimits[modelId];
    if (limit.isRateLimited && limit.resetTime !== null) {
      waitMs = limit.resetTime - Date.now();
    }
  }

  // If wait time is within threshold, recommend waiting
  if (waitMs > 0 && waitMs <= MAX_WAIT_BEFORE_ERROR_MS) {
    return { shouldWait: true, waitMs, account };
  }

  return { shouldWait: false, waitMs: 0, account };
}

/**
 * Pick an account with sticky selection preference.
 * Prefers the current account for cache continuity.
 *
 * @param accounts - Array of account objects
 * @param currentIndex - Current account index
 * @param onSave - Callback to save changes
 * @param modelId - Model ID to check rate limits for
 * @returns Account to use, optional wait time, and new index
 */
export function pickStickyAccount(accounts: Account[], currentIndex: number, onSave: OnSaveCallback | undefined, modelId: string | null = null): StickyAccountResult {
  // First try to get the current sticky account
  const { account: stickyAccount, newIndex: stickyIndex } = getCurrentStickyAccount(accounts, currentIndex, onSave, modelId);
  if (stickyAccount) {
    return { account: stickyAccount, waitMs: 0, newIndex: stickyIndex };
  }

  // Current account is rate-limited or invalid.
  // CHECK IF OTHERS ARE AVAILABLE before deciding to wait.
  const available = getAvailableAccounts(accounts, modelId);
  if (available.length > 0) {
    // Found a free account! Switch immediately.
    const { account: nextAccount, newIndex } = pickNext(accounts, currentIndex, onSave, modelId);
    if (nextAccount) {
      getLogger().info(`[AccountManager] Switched to new account (failover): ${nextAccount.email}`);
      return { account: nextAccount, waitMs: 0, newIndex };
    }
  }

  // No other accounts available. Now checking if we should wait for current account.
  const waitInfo = shouldWaitForCurrentAccount(accounts, currentIndex, modelId);
  if (waitInfo.shouldWait) {
    getLogger().info(`[AccountManager] Waiting ${formatDuration(waitInfo.waitMs)} for sticky account: ${waitInfo.account?.email}`);
    return { account: null, waitMs: waitInfo.waitMs, newIndex: currentIndex };
  }

  // Current account unavailable for too long/invalid, and no others available?
  const { account: nextAccount, newIndex } = pickNext(accounts, currentIndex, onSave, modelId);
  if (nextAccount) {
    getLogger().info(`[AccountManager] Switched to new account for cache: ${nextAccount.email}`);
  }
  return { account: nextAccount, waitMs: 0, newIndex };
}

/**
 * Get quota percentage and reset time for a model's quota group
 * @param state - Account refresh state from auto-refresh scheduler
 * @param modelId - Model ID to get quota for
 * @returns Quota percentage (0-100) and reset time (ISO string or null)
 */
function getQuotaForModel(state: AccountRefreshState, modelId: string): { percentage: number; resetTime: string | null } {
  const group = getQuotaGroup(modelId);
  switch (group) {
    case "claude":
      return { percentage: state.claudePercentage, resetTime: state.claudeResetTime };
    case "geminiPro":
      return { percentage: state.geminiProPercentage, resetTime: state.geminiProResetTime };
    case "geminiFlash":
      return { percentage: state.geminiFlashPercentage, resetTime: state.geminiFlashResetTime };
    default:
      return { percentage: 0, resetTime: null };
  }
}

/**
 * Pick account with soonest reset time (refresh-priority mode).
 * Accounts with soonest resetTime are preferred to optimize quota refresh cycles.
 * Fresh accounts (no resetTime, 100% quota) are sorted last.
 *
 * @param accounts - Array of account objects
 * @param quotaStates - Map of email to AccountRefreshState
 * @param modelId - Model ID to check rate limits and quota for
 * @returns Selected account or null if none available
 */
function pickRefreshPriority(accounts: Account[], quotaStates: Map<string, AccountRefreshState>, modelId: string): Account | null {
  clearExpiredLimits(accounts);

  // Filter to available accounts (not rate-limited, not invalid)
  const available = getAvailableAccounts(accounts, modelId);
  if (available.length === 0) {
    return null;
  }

  // Sort by resetTime ascending (soonest first), fresh accounts last
  const sorted = [...available].sort((a, b) => {
    const stateA = quotaStates.get(a.email);
    const stateB = quotaStates.get(b.email);

    // No state means treat as fresh (sort last)
    if (!stateA && !stateB) return 0;
    if (!stateA) return 1;
    if (!stateB) return -1;

    const quotaA = getQuotaForModel(stateA, modelId);
    const quotaB = getQuotaForModel(stateB, modelId);

    // Fresh accounts (no resetTime) sort last
    if (!quotaA.resetTime && !quotaB.resetTime) return 0;
    if (!quotaA.resetTime) return 1;
    if (!quotaB.resetTime) return -1;

    // Sort by resetTime ascending (soonest first)
    const timeA = new Date(quotaA.resetTime).getTime();
    const timeB = new Date(quotaB.resetTime).getTime();
    return timeA - timeB;
  });

  const selected = sorted[0];
  if (selected) {
    selected.lastUsed = Date.now();
    const state = quotaStates.get(selected.email);
    const quota = state ? getQuotaForModel(state, modelId) : null;
    getLogger().info(`[AccountManager] refresh-priority: ${selected.email} (reset: ${quota?.resetTime ?? "none"})`);
  }
  return selected;
}

/**
 * Pick account with highest quota percentage (drain-highest mode).
 * Accounts with 100% quota are preferred, then 99%, etc.
 * Drains the fullest accounts first for efficient quota usage.
 *
 * @param accounts - Array of account objects
 * @param quotaStates - Map of email to AccountRefreshState
 * @param modelId - Model ID to check rate limits and quota for
 * @returns Selected account or null if none available
 */
function pickDrainHighest(accounts: Account[], quotaStates: Map<string, AccountRefreshState>, modelId: string): Account | null {
  clearExpiredLimits(accounts);

  // Filter to available accounts (not rate-limited, not invalid)
  const available = getAvailableAccounts(accounts, modelId);
  if (available.length === 0) {
    return null;
  }

  // Sort by quota percentage descending (100% first, then 99%, etc.)
  const sorted = [...available].sort((a, b) => {
    const stateA = quotaStates.get(a.email);
    const stateB = quotaStates.get(b.email);

    // No state means treat as 0% (sort last)
    if (!stateA && !stateB) return 0;
    if (!stateA) return 1;
    if (!stateB) return -1;

    const quotaA = getQuotaForModel(stateA, modelId);
    const quotaB = getQuotaForModel(stateB, modelId);

    // Sort by percentage descending
    return quotaB.percentage - quotaA.percentage;
  });

  const selected = sorted[0];
  if (selected) {
    selected.lastUsed = Date.now();
    const state = quotaStates.get(selected.email);
    const quota = state ? getQuotaForModel(state, modelId) : null;
    getLogger().info(`[AccountManager] drain-highest: ${selected.email} (quota: ${quota?.percentage ?? 0}%)`);
  }
  return selected;
}

/**
 * Pick next available account using round-robin rotation.
 * Cycles through available accounts in order, advancing index each call.
 *
 * @param accounts - Array of account objects
 * @param modelId - Model ID to check rate limits for
 * @returns Selected account or null if none available
 */
function pickRoundRobin(accounts: Account[], modelId: string): Account | null {
  clearExpiredLimits(accounts);

  // Filter to available accounts (not rate-limited, not invalid)
  const available = getAvailableAccounts(accounts, modelId);
  if (available.length === 0) {
    return null;
  }

  // Clamp index to valid range
  if (roundRobinIndex >= available.length) {
    roundRobinIndex = 0;
  }

  const selected = available[roundRobinIndex];

  // Advance index for next call
  roundRobinIndex = (roundRobinIndex + 1) % available.length;

  if (selected) {
    selected.lastUsed = Date.now();
    const position = accounts.indexOf(selected) + 1;
    const total = accounts.length;
    getLogger().info(`[AccountManager] round-robin: ${selected.email} (${position}/${total})`);
  }
  return selected;
}

/**
 * Pick an account using sticky mode (simplified version for pickByMode).
 * Uses current account if available, otherwise fails over to next available.
 *
 * @param accounts - Array of account objects
 * @param modelId - Model ID to check rate limits for
 * @param currentAccountEmail - Email of the current account (for sticky preference)
 * @returns Selected account or null if none available
 */
function pickSticky(accounts: Account[], modelId: string, currentAccountEmail?: string): Account | null {
  clearExpiredLimits(accounts);

  // Try to use the current account if specified and available
  if (currentAccountEmail) {
    const currentAccount = accounts.find((a) => a.email === currentAccountEmail);
    if (currentAccount && isAccountUsable(currentAccount, modelId)) {
      currentAccount.lastUsed = Date.now();
      return currentAccount;
    }
  }

  // Current account unavailable, find any available account
  const available = getAvailableAccounts(accounts, modelId);
  if (available.length === 0) {
    return null;
  }

  // Return the first available account
  const selected = available[0];
  if (selected) {
    selected.lastUsed = Date.now();
    getLogger().info(`[AccountManager] sticky (failover): ${selected.email}`);
  }
  return selected;
}

/**
 * Pick an account based on the configured scheduling mode.
 * Main dispatcher function for account selection strategies.
 *
 * @param mode - Scheduling mode (sticky, refresh-priority, drain-highest, round-robin)
 * @param accounts - Array of account objects
 * @param modelId - Model ID to check rate limits and quota for
 * @param currentAccountEmail - Email of the current account (for sticky mode)
 * @param onSave - Optional callback to persist changes after selection
 * @returns Selected account or null if none available
 */
export function pickByMode(mode: SchedulingMode, accounts: Account[], modelId: string, currentAccountEmail?: string, onSave?: OnSaveCallback): Account | null {
  // Build quota states map from auto-refresh scheduler
  const quotaStates = new Map(getAccountRefreshStates().map((s) => [s.email, s]));

  let selected: Account | null;

  switch (mode) {
    case "sticky":
      selected = pickSticky(accounts, modelId, currentAccountEmail);
      break;
    case "refresh-priority":
      selected = pickRefreshPriority(accounts, quotaStates, modelId);
      break;
    case "drain-highest":
      selected = pickDrainHighest(accounts, quotaStates, modelId);
      break;
    case "round-robin":
      selected = pickRoundRobin(accounts, modelId);
      break;
    default:
      // Default to sticky mode for unknown modes
      selected = pickSticky(accounts, modelId, currentAccountEmail);
  }

  // Persist lastUsed change after selection
  if (selected && onSave) {
    const result = onSave();
    if (result instanceof Promise) {
      result.catch((err) => {
        // Log but don't fail selection - use the logger
        getLogger().error("Failed to save after account selection:", err);
      });
    }
  }

  return selected;
}

/**
 * Reset the round-robin index (for testing purposes).
 */
export function resetRoundRobinIndex(): void {
  roundRobinIndex = 0;
}

/**
 * Get the current round-robin index (for testing purposes).
 * @returns The current round-robin index
 */
export function getRoundRobinIndex(): number {
  return roundRobinIndex;
}
