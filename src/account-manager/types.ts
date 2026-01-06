/**
 * Account Manager Types
 *
 * Shared type definitions for the account-manager module.
 */

/**
 * Account source type
 */
export type AccountSource = "oauth" | "database" | "manual";

/**
 * Model-specific rate limit state
 */
export interface ModelRateLimit {
  isRateLimited: boolean;
  resetTime: number | null;
}

/**
 * Map of model ID to rate limit state
 */
export type ModelRateLimits = Record<string, ModelRateLimit>;

/**
 * Account object representing a single Google account
 */
export interface Account {
  email: string;
  source: AccountSource;
  dbPath?: string | null | undefined;
  refreshToken?: string | undefined;
  apiKey?: string | undefined;
  projectId?: string | undefined;
  addedAt?: number | undefined;
  lastUsed: number | null;
  isInvalid?: boolean | undefined;
  invalidReason?: string | null | undefined;
  invalidAt?: number | undefined;
  modelRateLimits: ModelRateLimits;
}

/**
 * Account settings stored in config
 */
export interface AccountSettings {
  cooldownDurationMs?: number | undefined;
  [key: string]: unknown;
}

/**
 * Account configuration file structure
 */
export interface AccountConfig {
  accounts: Account[];
  settings: AccountSettings;
  activeIndex: number;
}

/**
 * Token cache entry
 */
export interface TokenCacheEntry {
  token: string;
  extractedAt: number;
}

/**
 * Callback type for marking an account as invalid
 */
export type OnInvalidCallback = (email: string, reason: string) => void;

/**
 * Callback type for saving changes
 */
export type OnSaveCallback = () => void | Promise<void>;

/**
 * Result of sticky account selection
 */
export interface StickyAccountResult {
  account: Account | null;
  waitMs: number;
  newIndex: number;
}

/**
 * Result of account selection
 */
export interface AccountSelectionResult {
  account: Account | null;
  newIndex: number;
}

/**
 * Result of should-wait check
 */
export interface ShouldWaitResult {
  shouldWait: boolean;
  waitMs: number;
  account: Account | null;
}

/**
 * Account status for API responses
 */
export interface AccountStatus {
  email: string;
  source: AccountSource;
  modelRateLimits: ModelRateLimits;
  isInvalid: boolean;
  invalidReason: string | null;
  lastUsed: number | null;
}

/**
 * Status object returned by AccountManager.getStatus()
 */
export interface AccountManagerStatus {
  total: number;
  available: number;
  rateLimited: number;
  invalid: number;
  summary: string;
  accounts: AccountStatus[];
}
