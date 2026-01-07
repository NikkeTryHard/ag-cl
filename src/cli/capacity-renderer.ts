/**
 * CLI Capacity Renderer Module
 *
 * Creates beautiful colored CLI output for displaying account capacity information.
 * Includes progress bars, tier badges, and burn rate warnings.
 */

import pc from "picocolors";
import type { AccountCapacity, AccountTier, ModelPoolInfo, ModelQuotaInfo } from "../cloudcode/quota-api.js";
import type { BurnRateInfo } from "../cloudcode/burn-rate.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for rendering capacity output
 */
export interface RenderOptions {
  /** Disable color output (for CI/testing) */
  noColor?: boolean;
}

/**
 * Burn rates for both model pools
 */
export interface PoolBurnRates {
  claude: BurnRateInfo;
  gemini: BurnRateInfo;
}

// ============================================================================
// Constants
// ============================================================================

/** Width of progress bar in characters */
const PROGRESS_BAR_WIDTH = 20;

/** Model name padding for alignment */
const MODEL_NAME_WIDTH = 28;

// ============================================================================
// Color Helpers
// ============================================================================

/**
 * Apply color function or return plain text if noColor is set
 */
function colorize(text: string, colorFn: (s: string) => string, options?: RenderOptions): string {
  return options?.noColor ? text : colorFn(text);
}

// ============================================================================
// Tier Badge Formatting
// ============================================================================

/**
 * Format tier badge with appropriate color.
 *
 * Color coding:
 * - ULTRA: Purple/Magenta
 * - PRO: Blue
 * - FREE: Gray/Dim
 * - UNKNOWN: Gray/Dim
 *
 * @param tier - Account tier
 * @param options - Render options
 * @returns Colored tier badge string
 */
export function formatTierBadge(tier: AccountTier, options?: RenderOptions): string {
  switch (tier) {
    case "ULTRA":
      return colorize(tier, pc.magenta, options);
    case "PRO":
      return colorize(tier, pc.blue, options);
    case "FREE":
    case "UNKNOWN":
    default:
      return colorize(tier, pc.dim, options);
  }
}

// ============================================================================
// Progress Bar Formatting
// ============================================================================

/**
 * Get color function based on percentage.
 *
 * Color coding:
 * - >= 50%: Green (healthy)
 * - 20-49%: Yellow (warning)
 * - < 20%: Red (critical)
 */
function getPercentageColor(percentage: number): (s: string) => string {
  if (percentage >= 50) return pc.green;
  if (percentage >= 20) return pc.yellow;
  return pc.red;
}

/**
 * Format a progress bar for capacity display.
 *
 * Creates a visual bar like: [==========>         ]
 *
 * The bar is always PROGRESS_BAR_WIDTH characters inside the brackets.
 * The arrow (>) marks the current position.
 *
 * Color coding based on percentage:
 * - >= 50%: Green (healthy)
 * - 20-49%: Yellow (warning)
 * - < 20%: Red (critical)
 *
 * @param percentage - Capacity percentage (0-100)
 * @param options - Render options
 * @returns Formatted progress bar string
 */
export function formatProgressBar(percentage: number, options?: RenderOptions): string {
  // Clamp percentage to 0-100
  const clamped = Math.max(0, Math.min(100, percentage));

  // Calculate filled portion (including the arrow position)
  // Total bar width is PROGRESS_BAR_WIDTH + 1 to account for the '>' arrow character
  // that marks the current position at the end of the filled section
  const barWidth = PROGRESS_BAR_WIDTH + 1;
  const filledCount = Math.round((clamped / 100) * PROGRESS_BAR_WIDTH);

  // Build bar components
  // The filled part is equals signs, arrow marks the end position
  const filled = "=".repeat(filledCount);
  const arrow = ">";
  const emptyCount = barWidth - filledCount - 1; // -1 for the arrow
  const empty = " ".repeat(Math.max(0, emptyCount));

  // Apply color if enabled
  if (options?.noColor) {
    return `[${filled}${arrow}${empty}]`;
  }

  const colorFn = getPercentageColor(clamped);
  return `[${colorFn(filled + arrow)}${empty}]`;
}

// ============================================================================
// Reset Time Formatting
// ============================================================================

/**
 * Calculate hours and minutes until a timestamp.
 *
 * @param isoTimestamp - ISO timestamp string
 * @returns Object with hours and minutes, or null if past
 */
function getTimeUntil(isoTimestamp: string): { hours: number; minutes: number } | null {
  const resetMs = new Date(isoTimestamp).getTime();
  const nowMs = Date.now();
  const deltaMs = resetMs - nowMs;

  if (deltaMs <= 0) return null;

  const totalMinutes = Math.floor(deltaMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return { hours, minutes };
}

/**
 * Get color function based on time remaining.
 *
 * Color coding:
 * - < 1h: Green (reset soon)
 * - 1-6h: Yellow
 * - > 6h: Gray/Dim
 */
function getResetTimeColor(hours: number): (s: string) => string {
  if (hours < 1) return pc.green;
  if (hours <= 6) return pc.yellow;
  return pc.dim;
}

/**
 * Format reset time for display.
 *
 * Color coding based on time remaining:
 * - < 1h: Green (reset soon)
 * - 1-6h: Yellow
 * - > 6h: Gray/Dim
 *
 * @param resetTime - ISO timestamp or null
 * @param options - Render options
 * @returns Formatted reset time string
 */
export function formatResetTime(resetTime: string | null, options?: RenderOptions): string {
  if (!resetTime) {
    return options?.noColor ? "-" : pc.dim("-");
  }

  const timeUntil = getTimeUntil(resetTime);
  if (!timeUntil) {
    return options?.noColor ? "now" : pc.green("now");
  }

  const { hours, minutes } = timeUntil;

  // Format time string
  let timeStr: string;
  if (hours > 0) {
    timeStr = `${hours}h ${minutes}m`;
  } else {
    timeStr = `${minutes}m`;
  }

  // Apply color if enabled
  if (options?.noColor) {
    return timeStr;
  }

  const colorFn = getResetTimeColor(hours);
  return colorFn(timeStr);
}

// ============================================================================
// Burn Rate Formatting
// ============================================================================

/**
 * Format exhaustion time for display.
 *
 * @param hours - Hours to exhaustion
 * @returns Formatted string like "~3h" or "~30m"
 */
function formatExhaustionTime(hours: number): string {
  if (hours >= 1) {
    return `~${Math.round(hours)}h`;
  } else {
    const minutes = Math.round(hours * 60);
    return `~${minutes}m`;
  }
}

/**
 * Check if exhaustion happens before reset.
 *
 * @param hoursToExhaustion - Hours until exhausted
 * @param resetTime - ISO timestamp for reset
 * @returns True if exhausts before reset
 */
function exhaustsBeforeReset(hoursToExhaustion: number | null, resetTime: string | null): boolean {
  if (hoursToExhaustion === null || !resetTime) return false;

  const timeUntil = getTimeUntil(resetTime);
  if (!timeUntil) return false;

  const hoursToReset = timeUntil.hours + timeUntil.minutes / 60;
  return hoursToExhaustion < hoursToReset;
}

/**
 * Format burn rate information for display.
 *
 * Shows burn rate status with appropriate indicators:
 * - burning: "Burn Rate: X%/hr | Exhausted in: ~Nh"
 * - stable: "Stable"
 * - recovering: "Recovering"
 * - exhausted: "EXHAUSTED"
 * - calculating: "Calculating..."
 *
 * Includes warning when exhaustion happens before reset.
 *
 * @param burnRate - Burn rate info
 * @param resetTime - Pool reset time for warning calculation
 * @param options - Render options
 * @returns Formatted burn rate string
 */
export function formatBurnRate(burnRate: BurnRateInfo, resetTime: string | null, options?: RenderOptions): string {
  switch (burnRate.status) {
    case "burning": {
      const rate = Math.round(burnRate.ratePerHour ?? 0);
      const exhaustion = burnRate.hoursToExhaustion;

      let result = `Burn Rate: ${rate}%/hr`;

      if (exhaustion !== null) {
        result += ` | Exhausted in: ${formatExhaustionTime(exhaustion)}`;

        // Check for before-reset warning
        if (exhaustsBeforeReset(exhaustion, resetTime)) {
          const warning = options?.noColor ? " BEFORE RESET" : ` ${pc.red("BEFORE RESET")}`;
          result += warning;
        }
      }

      return result;
    }

    case "stable":
      return colorize("Stable", pc.dim, options);

    case "recovering":
      return colorize("Recovering", pc.green, options);

    case "exhausted":
      return colorize("EXHAUSTED", pc.red, options);

    case "calculating":
    default:
      return colorize("Calculating...", pc.dim, options);
  }
}

// ============================================================================
// Model Row Formatting
// ============================================================================

/**
 * Format a single model quota row.
 *
 * @param model - Model quota info
 * @param options - Render options
 * @returns Formatted model row string
 */
function formatModelRow(model: ModelQuotaInfo, options?: RenderOptions): string {
  const name = model.name.padEnd(MODEL_NAME_WIDTH);
  const bar = formatProgressBar(model.percentage, options);
  const pct = `${model.percentage}%`.padStart(4);
  const reset = `Resets: ${formatResetTime(model.resetTime, options)}`;

  return `    ${name} ${bar} ${pct}  ${reset}`;
}

// ============================================================================
// Pool Section Formatting
// ============================================================================

/**
 * Format a model pool section (Claude or Gemini).
 *
 * @param poolName - Name of the pool (e.g., "Claude Pool")
 * @param pool - Pool info
 * @param burnRate - Burn rate for this pool
 * @param options - Render options
 * @returns Formatted pool section string or empty string if no models
 */
function formatPoolSection(poolName: string, pool: ModelPoolInfo, burnRate: BurnRateInfo, options?: RenderOptions): string {
  if (pool.models.length === 0) {
    return "";
  }

  const lines: string[] = [];

  // Pool header
  lines.push("");
  const header = options?.noColor ? poolName : pc.cyan(poolName);
  lines.push(`    ${header}`);
  lines.push(`    ${"-".repeat(poolName.length)}`);

  // Model rows
  for (const model of pool.models) {
    lines.push(formatModelRow(model, options));
  }

  // Burn rate info
  const burnRateStr = formatBurnRate(burnRate, pool.earliestReset, options);
  lines.push(`    ${burnRateStr}`);

  return lines.join("\n");
}

// ============================================================================
// Account Capacity Rendering
// ============================================================================

/**
 * Render account capacity information with colors.
 *
 * Creates formatted output showing:
 * - Account email and tier badge
 * - Claude pool with model quotas and progress bars
 * - Gemini pool with model quotas and progress bars
 * - Burn rate information for each pool
 *
 * @param capacity - Account capacity data
 * @param burnRates - Burn rates for both pools
 * @param options - Render options
 * @returns Formatted multi-line string for terminal display
 */
export function renderAccountCapacity(capacity: AccountCapacity, burnRates: PoolBurnRates, options?: RenderOptions): string {
  const lines: string[] = [];

  // Account header
  const email = options?.noColor ? capacity.email : pc.bold(capacity.email);
  lines.push(email);

  // Tier badge
  const tierBadge = formatTierBadge(capacity.tier, options);
  lines.push(`    Tier: ${tierBadge}`);

  // Forbidden warning
  if (capacity.isForbidden) {
    const warning = options?.noColor ? "ACCESS FORBIDDEN" : pc.red("ACCESS FORBIDDEN");
    lines.push(`    ${warning}`);
  }

  // Claude pool section
  const claudeSection = formatPoolSection("Claude Pool", capacity.claudePool, burnRates.claude, options);
  if (claudeSection) {
    lines.push(claudeSection);
  }

  // Gemini pool section
  const geminiSection = formatPoolSection("Gemini Pool", capacity.geminiPool, burnRates.gemini, options);
  if (geminiSection) {
    lines.push(geminiSection);
  }

  return lines.join("\n");
}

/**
 * Overall burn rate info for a model family across all accounts
 */
export interface OverallBurnRateInfo {
  /** Weighted average burn rate per hour */
  ratePerHour: number | null;
  /** Hours until combined capacity reaches 0% */
  hoursToExhaustion: number | null;
  /** Combined current capacity percentage */
  currentCapacity: number;
  /** Number of accounts actively burning */
  burningAccountCount: number;
}

/**
 * Calculate overall burn rate across all accounts for a model family.
 *
 * @param burnRates - Array of burn rate info from each account
 * @param capacities - Array of account capacities
 * @param family - 'claude' or 'gemini'
 * @returns Overall burn rate info
 */
export function calculateOverallBurnRate(burnRates: PoolBurnRates[], capacities: AccountCapacity[], family: "claude" | "gemini"): OverallBurnRateInfo {
  // Calculate combined capacity
  const currentCapacity = capacities.reduce((sum, cap) => {
    const pool = family === "claude" ? cap.claudePool : cap.geminiPool;
    return sum + pool.aggregatedPercentage;
  }, 0);

  // Collect all burning accounts with their rates
  const burningAccounts: { rate: number; capacity: number }[] = [];

  for (let i = 0; i < burnRates.length; i++) {
    const br = family === "claude" ? burnRates[i].claude : burnRates[i].gemini;
    const cap = family === "claude" ? capacities[i].claudePool.aggregatedPercentage : capacities[i].geminiPool.aggregatedPercentage;

    if (br.status === "burning" && br.ratePerHour !== null && br.ratePerHour > 0) {
      burningAccounts.push({ rate: br.ratePerHour, capacity: cap });
    }
  }

  if (burningAccounts.length === 0) {
    return {
      ratePerHour: null,
      hoursToExhaustion: null,
      currentCapacity,
      burningAccountCount: 0,
    };
  }

  // Sum of all burn rates (since we're consuming from multiple accounts)
  const totalBurnRate = burningAccounts.reduce((sum, b) => sum + b.rate, 0);

  // Time to exhaustion: combined capacity / total burn rate
  const hoursToExhaustion = currentCapacity / totalBurnRate;

  return {
    ratePerHour: totalBurnRate,
    hoursToExhaustion,
    currentCapacity,
    burningAccountCount: burningAccounts.length,
  };
}

/**
 * Format overall burn rate for display.
 *
 * @param info - Overall burn rate info
 * @param familyName - Display name like "Claude" or "Gemini"
 * @returns Formatted string
 */
export function formatOverallBurnRate(info: OverallBurnRateInfo, familyName: string): string {
  if (info.ratePerHour === null || info.burningAccountCount === 0) {
    return `${familyName}: ${info.currentCapacity}% capacity (Stable)`;
  }

  const rate = Math.round(info.ratePerHour);
  let result = `${familyName}: ${info.currentCapacity}% capacity | Burn Rate: ${rate}%/hr`;

  if (info.hoursToExhaustion !== null) {
    result += ` | Exhausted in: ${formatExhaustionTime(info.hoursToExhaustion)}`;
  }

  result += ` (${info.burningAccountCount} account${info.burningAccountCount > 1 ? "s" : ""} active)`;

  return result;
}

// ============================================================================
// Summary Rendering
// ============================================================================

/**
 * Count accounts by tier.
 *
 * @param capacities - Array of account capacities
 * @returns Map of tier to count
 */
function countByTier(capacities: AccountCapacity[]): Map<AccountTier, number> {
  const counts = new Map<AccountTier, number>();
  for (const cap of capacities) {
    counts.set(cap.tier, (counts.get(cap.tier) ?? 0) + 1);
  }
  return counts;
}

/**
 * Format tier breakdown string.
 *
 * @param counts - Map of tier to count
 * @returns Formatted tier breakdown like "(2 PRO, 1 FREE, 1 ULTRA)"
 */
function formatTierBreakdown(counts: Map<AccountTier, number>): string {
  const parts: string[] = [];

  // Order: ULTRA, PRO, FREE, UNKNOWN
  const tierOrder: AccountTier[] = ["ULTRA", "PRO", "FREE", "UNKNOWN"];

  for (const tier of tierOrder) {
    const count = counts.get(tier);
    if (count && count > 0) {
      parts.push(`${count} ${tier}`);
    }
  }

  return parts.join(", ");
}

/**
 * Find the soonest reset across all accounts.
 *
 * @param capacities - Array of account capacities
 * @returns Object with reset time, email, and pool name, or null if none
 */
function findSoonestReset(capacities: AccountCapacity[]): { resetTime: string; email: string; pool: string } | null {
  let soonest: { resetTime: string; email: string; pool: string } | null = null;
  let soonestMs = Infinity;

  for (const cap of capacities) {
    // Check Claude pool
    if (cap.claudePool.earliestReset) {
      const resetMs = new Date(cap.claudePool.earliestReset).getTime();
      if (resetMs < soonestMs) {
        soonestMs = resetMs;
        soonest = { resetTime: cap.claudePool.earliestReset, email: cap.email, pool: "Claude" };
      }
    }

    // Check Gemini pool
    if (cap.geminiPool.earliestReset) {
      const resetMs = new Date(cap.geminiPool.earliestReset).getTime();
      if (resetMs < soonestMs) {
        soonestMs = resetMs;
        soonest = { resetTime: cap.geminiPool.earliestReset, email: cap.email, pool: "Gemini" };
      }
    }
  }

  return soonest;
}

/**
 * Render summary of all account capacities.
 *
 * Creates formatted output showing:
 * - Total account count with tier breakdown
 * - Combined Claude capacity with overall burn rate
 * - Combined Gemini capacity with overall burn rate
 * - Soonest reset time across all accounts
 *
 * @param capacities - Array of account capacity data
 * @param burnRates - Optional array of burn rates for each account (parallel to capacities)
 * @param options - Render options
 * @returns Formatted multi-line string for terminal display
 */
export function renderCapacitySummary(capacities: AccountCapacity[], burnRates?: PoolBurnRates[], options?: RenderOptions): string {
  const lines: string[] = [];

  // Summary header
  const divider = "=".repeat(25);
  lines.push(options?.noColor ? divider : pc.dim(divider));
  const title = options?.noColor ? "Summary" : pc.bold("Summary");
  lines.push(title);
  lines.push(options?.noColor ? divider : pc.dim(divider));

  // Empty state
  if (capacities.length === 0) {
    lines.push("No accounts configured.");
    return lines.join("\n");
  }

  // Total accounts with tier breakdown
  const tierCounts = countByTier(capacities);
  const tierBreakdown = formatTierBreakdown(tierCounts);
  lines.push(`Total Accounts: ${capacities.length} (${tierBreakdown})`);

  // If burn rates are provided, calculate and show overall burn rates
  if (burnRates?.length === capacities.length) {
    // Overall Claude burn rate
    const claudeOverall = calculateOverallBurnRate(burnRates, capacities, "claude");
    lines.push(formatOverallBurnRate(claudeOverall, "Claude"));

    // Overall Gemini burn rate
    const geminiOverall = calculateOverallBurnRate(burnRates, capacities, "gemini");
    lines.push(formatOverallBurnRate(geminiOverall, "Gemini"));
  } else {
    // Fallback to simple capacity sums without burn rate
    const combinedClaude = capacities.reduce((sum, cap) => sum + cap.claudePool.aggregatedPercentage, 0);
    lines.push(`Combined Claude Capacity: ${combinedClaude}%`);

    const combinedGemini = capacities.reduce((sum, cap) => sum + cap.geminiPool.aggregatedPercentage, 0);
    lines.push(`Combined Gemini Capacity: ${combinedGemini}%`);
  }

  // Soonest reset
  const soonest = findSoonestReset(capacities);
  if (soonest) {
    const timeStr = formatResetTime(soonest.resetTime, options);
    lines.push(`Soonest Reset: ${timeStr} (${soonest.email} ${soonest.pool})`);
  }

  return lines.join("\n");
}
