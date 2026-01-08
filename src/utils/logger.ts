/**
 * Pino-based Logger Utility
 *
 * Provides structured logging with pretty printing and dynamic level control.
 * Uses Pino for high-performance logging with pino-pretty for development output.
 */

import pino, { type Logger as PinoLogger, type DestinationStream } from "pino";

/**
 * Supported log levels
 */
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  level?: LogLevel;
  tuiMode?: boolean;
  tuiDestination?: DestinationStream;
}

// Singleton logger instance
let loggerInstance: PinoLogger | null = null;
let isTuiMode = false;

/**
 * Create or get the Pino logger instance
 */
function createLogger(options: LoggerOptions = {}): PinoLogger {
  const level = options.level ?? "info";

  // In TUI mode, write to the provided destination (buffer) instead of stdout
  if (options.tuiMode && options.tuiDestination) {
    isTuiMode = true;
    return pino({ level }, options.tuiDestination);
  }

  return pino({
    level,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    },
  });
}

/**
 * Check if logger is in TUI mode
 */
export function isLoggerInTuiMode(): boolean {
  return isTuiMode;
}

/**
 * Initialize the logger with custom options.
 * Can be called multiple times to reconfigure.
 * Note: TUI mode requires recreation of the logger instance.
 */
export function initLogger(options: LoggerOptions = {}): void {
  // If switching to/from TUI mode, we need to recreate the logger
  const needsRecreation = options.tuiMode !== undefined && options.tuiMode !== isTuiMode;

  if (loggerInstance && !needsRecreation) {
    // Reconfigure existing logger by changing level
    loggerInstance.level = options.level ?? "info";
  } else {
    loggerInstance = createLogger(options);
  }
}

/**
 * Get the singleton logger instance.
 * Creates a default logger if not initialized.
 */
export function getLogger(): PinoLogger {
  loggerInstance ??= createLogger();
  return loggerInstance;
}

/**
 * Change the log level dynamically.
 */
export function setLogLevel(level: LogLevel): void {
  const logger = getLogger();
  logger.level = level;
}
