/**
 * Pino-based Logger Utility
 *
 * Provides structured logging with pretty printing and dynamic level control.
 * Uses Pino for high-performance logging with pino-pretty for development output.
 */

import pino, { type Logger as PinoLogger } from "pino";

/**
 * Supported log levels
 */
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  level?: LogLevel;
}

// Singleton logger instance
let loggerInstance: PinoLogger | null = null;

/**
 * Create or get the Pino logger instance
 */
function createLogger(options: LoggerOptions = {}): PinoLogger {
  const level = options.level ?? "info";

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
 * Initialize the logger with custom options.
 * Can be called multiple times to reconfigure.
 */
export function initLogger(options: LoggerOptions = {}): void {
  if (loggerInstance) {
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
