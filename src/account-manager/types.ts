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
 * Log level for server output
 */
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

/**
 * Identity injection mode for account display
 * - "full": Show full email (e.g., "user@example.com")
 * - "short": Show abbreviated form (e.g., "user@...")
 * - "none": Don't inject identity into responses
 */
export type IdentityMode = "full" | "short" | "none";

/**
 * Scheduling mode for account selection
 * - "sticky": Stay on current account until rate-limited (default, current behavior)
 * - "refresh-priority": Pick account with soonest resetTime first
 * - "drain-highest": Pick account with highest quota % (100% first)
 * - "round-robin": Simple rotation through available accounts
 */
export type SchedulingMode = "sticky" | "refresh-priority" | "drain-highest" | "round-robin";

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
  /** Cooldown duration in milliseconds between account switches */
  cooldownDurationMs?: number | undefined;
  /** Identity injection mode for account display in responses */
  identityMode?: IdentityMode | undefined;
  /** Default server port */
  defaultPort?: number | undefined;
  /** Server log level */
  logLevel?: LogLevel | undefined;
  /** Enable model fallback on quota exhaustion */
  fallbackEnabled?: boolean | undefined;
  /** Enable auto-refresh of quota every 5 hours */
  autoRefreshEnabled?: boolean | undefined;
  /** Account selection scheduling mode */
  schedulingMode?: SchedulingMode | undefined;
  /** Allow additional unknown settings for extensibility */
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
