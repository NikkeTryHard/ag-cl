/**
 * Time constants for tests.
 * Centralized to avoid magic numbers and ensure consistency.
 */

/** 1 minute in milliseconds */
export const ONE_MINUTE_MS = 60 * 1000;

/** 30 minutes in milliseconds */
export const THIRTY_MINUTES_MS = 30 * 60 * 1000;

/** 1 hour in milliseconds */
export const ONE_HOUR_MS = 60 * 60 * 1000;

/** 3 minutes in milliseconds */
export const THREE_MINUTES_MS = 3 * 60 * 1000;

// Re-export from constants for test use
export { MAX_WAIT_BEFORE_ERROR_MS } from "../../src/constants.js";
