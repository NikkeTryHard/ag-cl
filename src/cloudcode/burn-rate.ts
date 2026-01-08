/**
 * Burn Rate Calculation Module
 *
 * Calculates quota consumption rate from historical snapshots
 * and predicts when quota will be exhausted.
 *
 * Algorithm:
 * 1. Query snapshots within the reset window (default 24h)
 * 2. Calculate delta: (oldest_percentage - current_percentage)
 * 3. Calculate time delta: (now - oldest_recorded_at)
 * 4. Burn rate: delta / time_delta (percentage per hour)
 * 5. Time to exhaustion: current_percentage / burn_rate
 */

import { getSnapshots, type QuotaModelFamily } from "./quota-storage.js";

/**
 * Burn rate status types
 */
export type BurnRateStatus = "burning" | "stable" | "recovering" | "exhausted" | "calculating";

/**
 * Burn rate information returned by calculateBurnRate
 */
export interface BurnRateInfo {
  /** Percentage consumed per hour, null if insufficient data */
  ratePerHour: number | null;
  /** Hours until quota reaches 0%, null if stable/recovering/insufficient/exhausted */
  hoursToExhaustion: number | null;
  /** Current burn status */
  status: BurnRateStatus;
}

/**
 * Default window size in milliseconds (24 hours)
 * This is the typical quota reset window
 */
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Milliseconds per hour for conversion
 */
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Minimum time delta in milliseconds (1 minute)
 * Required to avoid division by zero for very recent snapshots
 */
const MIN_TIME_DELTA_MS = 60 * 1000;

/**
 * Maximum sane burn rate (percentage per hour)
 * Rates higher than this are likely due to stale/invalid snapshot data
 * (e.g., old snapshots used summed model percentages, new ones use averaged)
 */
const MAX_SANE_BURN_RATE = 100;

/**
 * Calculate burn rate from quota snapshots.
 *
 * Uses historical snapshot data to determine how fast quota is being consumed
 * and predict when it will be exhausted.
 *
 * @param accountId - The account identifier (email or ID)
 * @param family - Model family ('claude' or 'gemini')
 * @param currentPercentage - Current quota percentage (0-100)
 * @param resetTime - Optional ISO timestamp for next quota reset
 * @returns Burn rate information with status, rate, and time to exhaustion
 */
export function calculateBurnRate(accountId: string, family: QuotaModelFamily, currentPercentage: number, resetTime: string | null): BurnRateInfo {
  const now = Date.now();

  // Handle exhausted state immediately
  if (currentPercentage === 0) {
    // Try to calculate the burn rate from history even if exhausted
    const burnRateFromHistory = calculateBurnRateFromSnapshots(accountId, family, currentPercentage, resetTime, now);
    return {
      ratePerHour: burnRateFromHistory.ratePerHour,
      hoursToExhaustion: null, // Already exhausted
      status: "exhausted",
    };
  }

  return calculateBurnRateFromSnapshots(accountId, family, currentPercentage, resetTime, now);
}

/**
 * Internal function to calculate burn rate from snapshots
 */
function calculateBurnRateFromSnapshots(accountId: string, family: QuotaModelFamily, currentPercentage: number, resetTime: string | null, now: number): BurnRateInfo {
  // Calculate window size based on reset time
  // If reset time is provided and in the future, use time until reset as window
  // This ensures we only look at snapshots from the current reset period
  let windowMs = DEFAULT_WINDOW_MS;

  if (resetTime) {
    const resetMs = new Date(resetTime).getTime();
    const timeUntilResetMs = resetMs - now;

    // Only adjust window if reset is in the future and less than 24h away
    if (timeUntilResetMs > 0 && timeUntilResetMs < DEFAULT_WINDOW_MS) {
      // Use time until reset as window, plus 1ms to include boundary snapshots
      // (getSnapshots uses > not >= for the since parameter)
      windowMs = timeUntilResetMs + 1;
    }
  }

  // Get snapshots within window
  const since = now - windowMs;
  const snapshots = getSnapshots(accountId, family, since);

  // Need at least one snapshot to calculate rate
  // (we compare oldest snapshot against current value)
  if (snapshots.length === 0) {
    return {
      ratePerHour: null,
      hoursToExhaustion: null,
      status: "calculating",
    };
  }

  // Snapshots are ordered by recordedAt descending (most recent first)
  // Get the oldest snapshot in our window
  const oldestSnapshot = snapshots[snapshots.length - 1];

  // Calculate time delta in hours
  const timeDeltaMs = now - oldestSnapshot.recordedAt;
  const timeDeltaHours = timeDeltaMs / MS_PER_HOUR;

  // Avoid division by zero for very recent snapshots
  // Require at least 1 minute of data
  if (timeDeltaMs < MIN_TIME_DELTA_MS) {
    return {
      ratePerHour: null,
      hoursToExhaustion: null,
      status: "calculating",
    };
  }

  // Calculate percentage delta
  // Delta is how much percentage has been consumed (positive = burning)
  const percentageDelta = oldestSnapshot.percentage - currentPercentage;

  // Calculate burn rate (percentage per hour)
  const ratePerHour = percentageDelta / timeDeltaHours;

  // Validate burn rate - rates > 100%/h are likely stale/invalid data
  // (e.g., old snapshots used summed percentages, new ones use averaged)
  if (Math.abs(ratePerHour) > MAX_SANE_BURN_RATE) {
    return {
      ratePerHour: null,
      hoursToExhaustion: null,
      status: "calculating",
    };
  }

  // Determine status based on burn rate
  if (ratePerHour > 0) {
    // Active consumption
    const hoursToExhaustion = currentPercentage / ratePerHour;
    return {
      ratePerHour,
      hoursToExhaustion,
      status: "burning",
    };
  } else if (ratePerHour < 0) {
    // Quota is increasing (likely reset occurred)
    return {
      ratePerHour,
      hoursToExhaustion: null,
      status: "recovering",
    };
  } else {
    // No change (stable)
    return {
      ratePerHour: 0,
      hoursToExhaustion: null,
      status: "stable",
    };
  }
}
