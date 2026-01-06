/**
 * SQLite Database Access Module
 * Provides cross-platform database operations for Antigravity state.
 *
 * Uses better-sqlite3 for:
 * - Windows compatibility (no CLI dependency)
 * - Native performance
 * - Synchronous API (simple error handling)
 */

import Database from "better-sqlite3";
import { ANTIGRAVITY_DB_PATH } from "../constants.js";

/**
 * Auth data structure from Antigravity database
 */
export interface AuthData {
  apiKey: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * Query Antigravity database for authentication status
 * @param dbPath - Optional custom database path
 * @returns Parsed auth data with apiKey, email, name, etc.
 * @throws If database doesn't exist, query fails, or no auth status found
 */
export function getAuthStatus(dbPath = ANTIGRAVITY_DB_PATH): AuthData {
  let db: Database.Database | undefined;
  try {
    // Open database in read-only mode
    db = new Database(dbPath, {
      readonly: true,
      fileMustExist: true,
    });

    // Prepare and execute query
    const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = 'antigravityAuthStatus'");
    const row = stmt.get() as { value: string } | undefined;

    if (!row?.value) {
      throw new Error("No auth status found in database");
    }

    // Parse JSON value
    const authData = JSON.parse(row.value) as AuthData;

    if (!authData.apiKey) {
      throw new Error("Auth data missing apiKey field");
    }

    return authData;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    // Enhance error messages for common issues
    if (err.code === "SQLITE_CANTOPEN") {
      throw new Error(`Database not found at ${dbPath}. ` + "Make sure Antigravity is installed and you are logged in.");
    }
    // Re-throw with context if not already our error
    if (err.message.includes("No auth status") || err.message.includes("missing apiKey")) {
      throw error;
    }
    throw new Error(`Failed to read Antigravity database: ${err.message}`);
  } finally {
    // Always close database connection
    if (db) {
      db.close();
    }
  }
}

/**
 * Check if database exists and is accessible
 * @param dbPath - Optional custom database path
 * @returns True if database exists and can be opened
 */
export function isDatabaseAccessible(dbPath = ANTIGRAVITY_DB_PATH): boolean {
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, {
      readonly: true,
      fileMustExist: true,
    });
    return true;
  } catch {
    return false;
  } finally {
    if (db) {
      db.close();
    }
  }
}
