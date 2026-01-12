/**
 * Session Logger
 *
 * Appends session log entries to a file.
 */

import { appendFile, mkdir } from "fs/promises";
import { dirname } from "path";
import type { SessionLogEntry } from "./types.js";

/**
 * Format duration in human readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Format timestamp as ISO string
 */
function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString();
}

export class SessionLogger {
  private logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;
  }

  /**
   * Log a session entry
   */
  async log(entry: SessionLogEntry): Promise<void> {
    const duration = entry.disconnectedAt ? entry.disconnectedAt - entry.connectedAt : Date.now() - entry.connectedAt;

    const line = [formatTimestamp(entry.disconnectedAt ?? Date.now()), entry.nickname ?? entry.keyMasked, `key=${entry.keyMasked}`, `duration=${formatDuration(duration)}`, `polls=${entry.pollCount}`, `connected=${formatTimestamp(entry.connectedAt)}`].join(" | ");

    await mkdir(dirname(this.logPath), { recursive: true });
    await appendFile(this.logPath, line + "\n", "utf-8");
  }

  /**
   * Log multiple entries in a single write
   */
  async logAll(entries: SessionLogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const lines = entries.map((entry) => {
      const duration = entry.disconnectedAt ? entry.disconnectedAt - entry.connectedAt : Date.now() - entry.connectedAt;

      return [formatTimestamp(entry.disconnectedAt ?? Date.now()), entry.nickname ?? entry.keyMasked, `key=${entry.keyMasked}`, `duration=${formatDuration(duration)}`, `polls=${entry.pollCount}`, `connected=${formatTimestamp(entry.connectedAt)}`].join(" | ");
    });

    await mkdir(dirname(this.logPath), { recursive: true });
    await appendFile(this.logPath, lines.join("\n") + "\n", "utf-8");
  }
}
