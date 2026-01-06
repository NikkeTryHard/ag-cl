/**
 * Test Fixture Utilities
 *
 * Helpers for loading test fixtures from the fixtures directory.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load a JSON fixture file
 * @param relativePath - Path relative to the fixtures directory
 * @returns Parsed JSON content
 */
export function loadFixture<T>(relativePath: string): T {
  const fullPath = join(__dirname, "../fixtures", relativePath);
  return JSON.parse(readFileSync(fullPath, "utf-8"));
}

/**
 * Load a fixture file as raw string
 * @param relativePath - Path relative to the fixtures directory
 * @returns Raw file content
 */
export function loadFixtureRaw(relativePath: string): string {
  const fullPath = join(__dirname, "../fixtures", relativePath);
  return readFileSync(fullPath, "utf-8");
}

/**
 * Check if a fixture file exists
 * @param relativePath - Path relative to the fixtures directory
 * @returns True if file exists
 */
export function fixtureExists(relativePath: string): boolean {
  const fullPath = join(__dirname, "../fixtures", relativePath);
  try {
    readFileSync(fullPath);
    return true;
  } catch {
    return false;
  }
}
