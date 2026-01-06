/**
 * Custom Error Classes
 *
 * Provides structured error types for better error handling and classification.
 * Replaces string-based error detection with proper error class checking.
 */

/**
 * Error metadata type for additional context
 */
export interface ErrorMetadata {
  resetMs?: number | null;
  accountEmail?: string | null;
  reason?: string | null;
  allRateLimited?: boolean;
  attempts?: number;
  statusCode?: number;
  errorType?: string;
  [key: string]: unknown;
}

/**
 * Base error class for Antigravity proxy errors
 */
export class AntigravityError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly metadata: ErrorMetadata;

  /**
   * @param message - Error message
   * @param code - Error code for programmatic handling
   * @param retryable - Whether the error is retryable
   * @param metadata - Additional error metadata
   */
  constructor(message: string, code: string, retryable = false, metadata: ErrorMetadata = {}) {
    super(message);
    this.name = "AntigravityError";
    this.code = code;
    this.retryable = retryable;
    this.metadata = metadata;
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...this.metadata,
    };
  }
}

/**
 * Rate limit error (429 / RESOURCE_EXHAUSTED)
 */
export class RateLimitError extends AntigravityError {
  readonly resetMs: number | null;
  readonly accountEmail: string | null;

  /**
   * @param message - Error message
   * @param resetMs - Time in ms until rate limit resets
   * @param accountEmail - Email of the rate-limited account
   */
  constructor(message: string, resetMs: number | null = null, accountEmail: string | null = null) {
    super(message, "RATE_LIMITED", true, { resetMs, accountEmail });
    this.name = "RateLimitError";
    this.resetMs = resetMs;
    this.accountEmail = accountEmail;
  }
}

/**
 * Authentication error (invalid credentials, token expired, etc.)
 */
export class AuthError extends AntigravityError {
  readonly accountEmail: string | null;
  readonly reason: string | null;

  /**
   * @param message - Error message
   * @param accountEmail - Email of the account with auth issues
   * @param reason - Specific reason for auth failure
   */
  constructor(message: string, accountEmail: string | null = null, reason: string | null = null) {
    super(message, "AUTH_INVALID", false, { accountEmail, reason });
    this.name = "AuthError";
    this.accountEmail = accountEmail;
    this.reason = reason;
  }
}

/**
 * No accounts available error
 */
export class NoAccountsError extends AntigravityError {
  readonly allRateLimited: boolean;

  /**
   * @param message - Error message
   * @param allRateLimited - Whether all accounts are rate limited
   */
  constructor(message = "No accounts available", allRateLimited = false) {
    super(message, "NO_ACCOUNTS", allRateLimited, { allRateLimited });
    this.name = "NoAccountsError";
    this.allRateLimited = allRateLimited;
  }
}

/**
 * Max retries exceeded error
 */
export class MaxRetriesError extends AntigravityError {
  readonly attempts: number;

  /**
   * @param message - Error message
   * @param attempts - Number of attempts made
   */
  constructor(message = "Max retries exceeded", attempts = 0) {
    super(message, "MAX_RETRIES", false, { attempts });
    this.name = "MaxRetriesError";
    this.attempts = attempts;
  }
}

/**
 * API error from upstream service
 */
export class ApiError extends AntigravityError {
  readonly statusCode: number;
  readonly errorType: string;

  /**
   * @param message - Error message
   * @param statusCode - HTTP status code
   * @param errorType - Type of API error
   */
  constructor(message: string, statusCode = 500, errorType = "api_error") {
    super(message, errorType.toUpperCase(), statusCode >= 500, { statusCode, errorType });
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errorType = errorType;
  }
}

/**
 * Check if an error is a rate limit error
 * Works with both custom error classes and legacy string-based errors
 * @param error - Error to check
 * @returns True if it is a rate limit error
 */
export function isRateLimitError(error: Error): boolean {
  if (error instanceof RateLimitError) return true;
  const msg = error.message.toLowerCase();
  return msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota_exhausted") || msg.includes("rate limit");
}

/**
 * Check if an error is an authentication error
 * Works with both custom error classes and legacy string-based errors
 * @param error - Error to check
 * @returns True if it is an auth error
 */
export function isAuthError(error: Error): boolean {
  if (error instanceof AuthError) return true;
  const msg = error.message.toUpperCase();
  return msg.includes("AUTH_INVALID") || msg.includes("INVALID_GRANT") || msg.includes("TOKEN REFRESH FAILED");
}
