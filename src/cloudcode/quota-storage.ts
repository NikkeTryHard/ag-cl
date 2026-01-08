/**
 * Quota Storage Module
 *
 * SQLite-based storage for quota snapshots enabling burn rate calculation.
 * Stores historical quota percentages to track consumption over time.
 *
 * Database schema:
 * - quota_snapshots: Stores percentage values at points in time
 * - Indexed by account_id and recorded_at for efficient retrieval
 */

import Database from "better-sqlite3";
import { homedir, platform } from "os";
import { join, dirname } from "path";
import { mkdirSync, existsSync } from "fs";

/**
 * Model family type for quota tracking
 */
export type QuotaModelFamily = "claude" | "gemini";

/**
 * Quota snapshot record
 */
export interface QuotaSnapshot {
  id: number;
  accountId: string;
  modelFamily: QuotaModelFamily;
  percentage: number;
  recordedAt: number; // Unix timestamp in milliseconds
}

// Singleton database instance
let db: Database.Database | null = null;

/**
 * Get the default storage path for the quota database.
 * Uses platform-specific conventions:
 * - macOS: ~/Library/Application Support/ag-cl/quota-snapshots.db
 * - Windows: ~/AppData/Roaming/ag-cl/quota-snapshots.db
 * - Linux/other: ~/.config/ag-cl/quota-snapshots.db
 */
export function getQuotaStoragePath(): string {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library/Application Support/ag-cl/quota-snapshots.db");
    case "win32":
      return join(home, "AppData/Roaming/ag-cl/quota-snapshots.db");
    default: // linux, freebsd, etc.
      return join(home, ".config/ag-cl/quota-snapshots.db");
  }
}

/**
 * Initialize the quota storage database.
 * Creates the database file and tables if they don't exist.
 *
 * @param dbPath - Optional custom database path (defaults to getQuotaStoragePath())
 *                 Use ":memory:" for in-memory testing
 */
export function initQuotaStorage(dbPath?: string): void {
  // If already initialized with the same path, skip
  if (db) {
    return;
  }

  const resolvedPath = dbPath ?? getQuotaStoragePath();

  // Create directory if needed (skip for in-memory)
  if (resolvedPath !== ":memory:") {
    const dir = dirname(resolvedPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // Open database (create if doesn't exist)
  db = new Database(resolvedPath);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS quota_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      model_family TEXT NOT NULL,
      percentage INTEGER NOT NULL,
      recorded_at INTEGER NOT NULL,
      UNIQUE(account_id, model_family, recorded_at)
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_account_time
      ON quota_snapshots(account_id, recorded_at DESC);
  `);

  // Clean up old snapshots (older than 7 days) to prevent database growth
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  cleanOldSnapshots(sevenDaysAgo);

  // Clean up invalid snapshots (percentage > 100, from old summed format)
  cleanInvalidSnapshots();
}

/**
 * Record a quota snapshot for an account.
 *
 * @param accountId - The account identifier (email or ID)
 * @param family - Model family ('claude' or 'gemini')
 * @param percentage - Current quota percentage (0-100)
 * @param timestamp - Optional timestamp (defaults to Date.now())
 */
export function recordSnapshot(accountId: string, family: QuotaModelFamily, percentage: number, timestamp?: number): void {
  if (!db) {
    throw new Error("Quota storage not initialized. Call initQuotaStorage() first.");
  }

  const recordedAt = timestamp ?? Date.now();

  const stmt = db.prepare(`
    INSERT INTO quota_snapshots (account_id, model_family, percentage, recorded_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(account_id, model_family, recorded_at) DO UPDATE SET
      percentage = excluded.percentage
  `);

  stmt.run(accountId, family, percentage, recordedAt);
}

/**
 * Get quota snapshots for an account since a given timestamp.
 *
 * @param accountId - The account identifier
 * @param family - Model family ('claude' or 'gemini')
 * @param since - Unix timestamp (milliseconds) to filter from
 * @returns Array of snapshots ordered by recordedAt descending (most recent first)
 */
export function getSnapshots(accountId: string, family: QuotaModelFamily, since: number): QuotaSnapshot[] {
  if (!db) {
    throw new Error("Quota storage not initialized. Call initQuotaStorage() first.");
  }

  const stmt = db.prepare(`
    SELECT id, account_id, model_family, percentage, recorded_at
    FROM quota_snapshots
    WHERE account_id = ? AND model_family = ? AND recorded_at > ?
    ORDER BY recorded_at DESC
  `);

  const rows = stmt.all(accountId, family, since) as {
    id: number;
    account_id: string;
    model_family: string;
    percentage: number;
    recorded_at: number;
  }[];

  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    modelFamily: row.model_family as QuotaModelFamily,
    percentage: row.percentage,
    recordedAt: row.recorded_at,
  }));
}

/**
 * Clean up old quota snapshots.
 *
 * @param olderThan - Unix timestamp (milliseconds); snapshots before this are deleted
 * @returns Number of deleted snapshots
 */
export function cleanOldSnapshots(olderThan: number): number {
  if (!db) {
    throw new Error("Quota storage not initialized. Call initQuotaStorage() first.");
  }

  const stmt = db.prepare(`
    DELETE FROM quota_snapshots
    WHERE recorded_at < ?
  `);

  const result = stmt.run(olderThan);
  return result.changes;
}

/**
 * Clean up invalid quota snapshots.
 * Removes snapshots with percentage > 100 (from old summed format).
 *
 * @returns Number of deleted snapshots
 */
export function cleanInvalidSnapshots(): number {
  if (!db) {
    throw new Error("Quota storage not initialized. Call initQuotaStorage() first.");
  }

  const stmt = db.prepare(`
    DELETE FROM quota_snapshots
    WHERE percentage > 100
  `);

  const result = stmt.run();
  return result.changes;
}

/**
 * Close the quota storage database connection.
 * Should be called during graceful shutdown or after tests.
 */
export function closeQuotaStorage(): void {
  if (db) {
    db.close();
    db = null;
  }
}
