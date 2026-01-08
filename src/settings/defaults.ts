/**
 * Settings Defaults
 *
 * Default values and getter functions for account settings.
 * Getters check settings object first, then fall back to environment variables,
 * then fall back to hardcoded defaults.
 */

import { DEFAULT_PORT, DEFAULT_COOLDOWN_MS } from "../constants.js";
import type { AccountSettings, IdentityMode, LogLevel } from "../account-manager/types.js";

/**
 * Default values for account settings
 */
export const DEFAULTS = {
  /** Default identity injection mode */
  identityMode: "full" as IdentityMode,
  /** Default server port - imported from constants.ts */
  defaultPort: DEFAULT_PORT,
  /** Default log level */
  logLevel: "info" as LogLevel,
  /** Default fallback enabled state */
  fallbackEnabled: false,
  /** Default cooldown duration - imported from constants.ts */
  cooldownDurationMs: DEFAULT_COOLDOWN_MS,
} as const;

/**
 * Get the identity injection mode.
 *
 * Priority:
 * 1. settings.identityMode (if provided)
 * 2. AG_INJECT_IDENTITY environment variable
 * 3. Default: "full"
 *
 * @param settings - Optional account settings object
 * @returns The identity mode to use
 */
export function getIdentityMode(settings?: AccountSettings): IdentityMode {
  // Check settings object first
  if (settings?.identityMode !== undefined) {
    return settings.identityMode;
  }

  // Fall back to environment variable
  const envMode = process.env.AG_INJECT_IDENTITY?.toLowerCase();
  if (envMode === "none") return "none";
  if (envMode === "short") return "short";
  if (envMode === "full") return "full";

  // Fall back to default
  return DEFAULTS.identityMode;
}

/**
 * Get the default server port.
 *
 * Priority:
 * 1. settings.defaultPort (if provided)
 * 2. Default: DEFAULT_PORT from constants.ts (8080)
 *
 * Note: No environment variable for port - CLI argument takes precedence anyway.
 *
 * @param settings - Optional account settings object
 * @returns The port to use
 */
export function getDefaultPort(settings?: AccountSettings): number {
  // Check settings object first
  if (settings?.defaultPort !== undefined) {
    return settings.defaultPort;
  }

  // Fall back to default
  return DEFAULTS.defaultPort;
}

/**
 * Get the log level.
 *
 * Priority:
 * 1. settings.logLevel (if provided)
 * 2. Default: "info"
 *
 * Note: No environment variable - CLI argument takes precedence anyway.
 *
 * @param settings - Optional account settings object
 * @returns The log level to use
 */
export function getLogLevel(settings?: AccountSettings): LogLevel {
  // Check settings object first
  if (settings?.logLevel !== undefined) {
    return settings.logLevel;
  }

  // Fall back to default
  return DEFAULTS.logLevel;
}

/**
 * Get whether model fallback is enabled.
 *
 * Priority:
 * 1. settings.fallbackEnabled (if provided)
 * 2. Default: false
 *
 * Note: No environment variable - CLI argument takes precedence anyway.
 *
 * @param settings - Optional account settings object
 * @returns Whether fallback is enabled
 */
export function getFallbackEnabled(settings?: AccountSettings): boolean {
  // Check settings object first
  if (settings?.fallbackEnabled !== undefined) {
    return settings.fallbackEnabled;
  }

  // Fall back to default
  return DEFAULTS.fallbackEnabled;
}

/**
 * Get the cooldown duration in milliseconds.
 *
 * Priority:
 * 1. settings.cooldownDurationMs (if provided)
 * 2. Default: DEFAULT_COOLDOWN_MS from constants.ts (10000ms)
 *
 * @param settings - Optional account settings object
 * @returns The cooldown duration in milliseconds
 */
export function getCooldownDurationMs(settings?: AccountSettings): number {
  // Check settings object first
  if (settings?.cooldownDurationMs !== undefined) {
    return settings.cooldownDurationMs;
  }

  // Fall back to default
  return DEFAULTS.cooldownDurationMs;
}
