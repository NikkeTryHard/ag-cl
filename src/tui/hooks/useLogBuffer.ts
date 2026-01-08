/**
 * Log Buffer Module
 *
 * Provides a global ring buffer for storing recent log entries
 * and allows TUI components to subscribe to new logs.
 *
 * Note: This intentionally uses module-level state (not React context)
 * because:
 * 1. Logs need to persist across component remounts
 * 2. The server's pino logger writes here from outside React
 * 3. Multiple components may subscribe independently
 */

export interface LogEntry {
  time: Date;
  level: string;
  message: string;
}

type LogSubscriber = (logs: LogEntry[]) => void;

const MAX_LOG_ENTRIES = 500;
let logBuffer: LogEntry[] = [];
let subscribers: LogSubscriber[] = [];

/**
 * Add a log entry to the buffer
 */
export function addLogEntry(level: string, message: string): void {
  const entry: LogEntry = {
    time: new Date(),
    level,
    message,
  };

  logBuffer.push(entry);

  // Trim if over max
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer = logBuffer.slice(-MAX_LOG_ENTRIES);
  }

  // Notify subscribers
  for (const subscriber of subscribers) {
    subscriber(logBuffer);
  }
}

/**
 * Get the current log buffer contents
 */
export function getLogBuffer(): LogEntry[] {
  return [...logBuffer];
}

/**
 * Clear the log buffer
 */
export function clearLogBuffer(): void {
  logBuffer = [];
  for (const subscriber of subscribers) {
    subscriber(logBuffer);
  }
}

/**
 * Subscribe to log updates
 * @returns Unsubscribe function
 */
export function subscribeToLogs(callback: LogSubscriber): () => void {
  subscribers.push(callback);
  return () => {
    subscribers = subscribers.filter((s) => s !== callback);
  };
}

/**
 * Create a Pino destination that writes to our buffer
 * This can be used to intercept pino logs
 */
export function createLogBufferDestination(): { write: (chunk: string) => void } {
  return {
    write(chunk: string): void {
      try {
        const parsed = JSON.parse(chunk) as { level: number; msg?: string; time?: number };
        const levelNames: Record<number, string> = {
          10: "trace",
          20: "debug",
          30: "info",
          40: "warn",
          50: "error",
          60: "fatal",
        };
        addLogEntry(levelNames[parsed.level] ?? "info", parsed.msg ?? chunk);
      } catch {
        // If not JSON, just log as-is
        addLogEntry("info", chunk.trim());
      }
    },
  };
}
