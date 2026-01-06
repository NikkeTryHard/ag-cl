/**
 * Tests for src/auth/database.ts
 * SQLite database access for Antigravity authentication data
 *
 * Note: These tests mock the better-sqlite3 module.
 * The mocking approach uses a class-based mock that properly handles the 'new' keyword.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared mock state
const mockState = {
  get: vi.fn(),
  prepare: vi.fn(),
  close: vi.fn(),
  shouldThrow: null as Error | null,
};

// Reset mock state helper
function resetMocks() {
  mockState.get.mockReset();
  mockState.prepare.mockReset();
  mockState.close.mockReset();
  mockState.shouldThrow = null;
  mockState.prepare.mockReturnValue({ get: mockState.get });
}

// Mock better-sqlite3 with a class
vi.mock("better-sqlite3", () => {
  class MockDatabase {
    constructor(_path: string, _options: unknown) {
      if (mockState.shouldThrow) {
        throw mockState.shouldThrow;
      }
    }
    prepare(sql: string) {
      return mockState.prepare(sql);
    }
    close() {
      return mockState.close();
    }
  }
  return { default: MockDatabase };
});

// Import after mocking
import { getAuthStatus, isDatabaseAccessible } from "../../../src/auth/database.js";

describe("auth/database", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("getAuthStatus", () => {
    it("returns auth data when database contains valid auth status", () => {
      const authData = { apiKey: "test-api-key-12345", email: "test@example.com", name: "Test User" };
      mockState.get.mockReturnValue({ value: JSON.stringify(authData) });

      const result = getAuthStatus("/test/path/db.sqlite");

      expect(result).toEqual(authData);
      expect(mockState.prepare).toHaveBeenCalledWith("SELECT value FROM ItemTable WHERE key = 'antigravityAuthStatus'");
      expect(mockState.close).toHaveBeenCalled();
    });

    it("uses default ANTIGRAVITY_DB_PATH when no path provided", () => {
      const authData = { apiKey: "default-key" };
      mockState.get.mockReturnValue({ value: JSON.stringify(authData) });

      const result = getAuthStatus();

      expect(result.apiKey).toBe("default-key");
    });

    it("throws when no auth status found in database", () => {
      mockState.get.mockReturnValue(undefined);

      expect(() => getAuthStatus("/test/db.sqlite")).toThrow("No auth status found in database");
      expect(mockState.close).toHaveBeenCalled();
    });

    it("throws when auth status value is null", () => {
      mockState.get.mockReturnValue({ value: null });

      expect(() => getAuthStatus("/test/db.sqlite")).toThrow("No auth status found in database");
    });

    it("throws when auth status value is empty string", () => {
      mockState.get.mockReturnValue({ value: "" });

      expect(() => getAuthStatus("/test/db.sqlite")).toThrow("No auth status found in database");
    });

    it("throws when auth data is missing apiKey field", () => {
      mockState.get.mockReturnValue({ value: JSON.stringify({ email: "test@example.com" }) });

      expect(() => getAuthStatus("/test/db.sqlite")).toThrow("Auth data missing apiKey field");
      expect(mockState.close).toHaveBeenCalled();
    });

    it("throws enhanced error for SQLITE_CANTOPEN error code", () => {
      const cantOpenError = new Error("Cannot open database") as NodeJS.ErrnoException;
      cantOpenError.code = "SQLITE_CANTOPEN";
      mockState.shouldThrow = cantOpenError;

      expect(() => getAuthStatus("/nonexistent/db.sqlite")).toThrow(/Database not found at \/nonexistent\/db\.sqlite/);
    });

    it("wraps generic database errors with context", () => {
      mockState.shouldThrow = new Error("Some SQLite error");

      expect(() => getAuthStatus("/test/db.sqlite")).toThrow("Failed to read Antigravity database: Some SQLite error");
    });

    it("re-throws auth-related errors without wrapping", () => {
      mockState.get.mockReturnValue({ value: JSON.stringify({}) });

      expect(() => getAuthStatus("/test/db.sqlite")).toThrow("Auth data missing apiKey field");
    });

    it("closes database connection even when error occurs", () => {
      mockState.get.mockReturnValue(undefined);

      try {
        getAuthStatus("/test/db.sqlite");
      } catch {
        // Expected
      }

      expect(mockState.close).toHaveBeenCalled();
    });

    it("handles JSON parse errors gracefully", () => {
      mockState.get.mockReturnValue({ value: "not-valid-json" });

      expect(() => getAuthStatus("/test/db.sqlite")).toThrow(/Failed to read Antigravity database/);
      expect(mockState.close).toHaveBeenCalled();
    });

    it("returns full auth data with all optional fields", () => {
      const fullAuthData = {
        apiKey: "full-api-key",
        email: "user@domain.com",
        name: "Full User",
        customField: "custom-value",
        numericField: 123,
      };
      mockState.get.mockReturnValue({ value: JSON.stringify(fullAuthData) });

      const result = getAuthStatus("/test/db.sqlite");

      expect(result).toEqual(fullAuthData);
      expect(result.apiKey).toBe("full-api-key");
      expect(result.email).toBe("user@domain.com");
      expect(result.name).toBe("Full User");
      expect(result.customField).toBe("custom-value");
    });

    it("returns auth data with only required apiKey field", () => {
      const minimalAuthData = { apiKey: "minimal-key" };
      mockState.get.mockReturnValue({ value: JSON.stringify(minimalAuthData) });

      const result = getAuthStatus("/test/db.sqlite");

      expect(result).toEqual(minimalAuthData);
      expect(result.email).toBeUndefined();
      expect(result.name).toBeUndefined();
    });
  });

  describe("isDatabaseAccessible", () => {
    it("returns true when database can be opened", () => {
      const result = isDatabaseAccessible("/accessible/db.sqlite");

      expect(result).toBe(true);
      expect(mockState.close).toHaveBeenCalled();
    });

    it("returns false when database cannot be opened", () => {
      mockState.shouldThrow = new Error("Cannot open database");

      const result = isDatabaseAccessible("/nonexistent/db.sqlite");

      expect(result).toBe(false);
    });

    it("uses default path when not provided", () => {
      const result = isDatabaseAccessible();

      expect(result).toBe(true);
    });

    it("closes database connection on success", () => {
      isDatabaseAccessible("/test/db.sqlite");

      expect(mockState.close).toHaveBeenCalled();
    });

    it("does not throw when database open fails", () => {
      mockState.shouldThrow = new Error("Permission denied");

      expect(() => isDatabaseAccessible("/test/db.sqlite")).not.toThrow();
    });

    it("handles SQLITE_CANTOPEN error gracefully", () => {
      const cantOpenError = new Error("Cannot open") as NodeJS.ErrnoException;
      cantOpenError.code = "SQLITE_CANTOPEN";
      mockState.shouldThrow = cantOpenError;

      expect(isDatabaseAccessible("/missing/db.sqlite")).toBe(false);
    });
  });
});
