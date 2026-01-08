/**
 * TUI Layout Constants
 *
 * Shared constants for terminal UI layout calculations.
 */

/**
 * Reserved lines for AccountListModal layout.
 * Accounts for: header(2) + totals(4) + next reset(1) + footer hints(2) + scroll indicator(2) + note(1) + borders/padding(4)
 */
export const ACCOUNT_LIST_RESERVED_LINES = 16;

/**
 * Reserved lines for ServerLogsModal layout.
 * Accounts for: header(2) + footer hints(2) + scroll indicator(2) + borders/padding(4)
 */
export const SERVER_LOGS_RESERVED_LINES = 10;

/**
 * Minimum visible items in scrollable lists
 */
export const MIN_VISIBLE_ITEMS = 3;

/**
 * Minimum visible lines in log viewer
 */
export const MIN_VISIBLE_LOG_LINES = 5;
