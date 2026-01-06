/**
 * Unit tests for storage.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadAccounts, loadDefaultAccount, saveAccounts } from "../../../src/account-manager/storage.js";
import type { Account, AccountSettings } from "../../../src/account-manager/types.js";

// Mock fs/promises
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}));

// Mock the database module
vi.mock("../../../src/auth/database.js", () => ({
  getAuthStatus: vi.fn(),
}));

describe("storage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadAccounts", () => {
    it("loads accounts from existing config file", async () => {
      const { access, readFile } = await import("fs/promises");

      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          accounts: [
            {
              email: "a@example.com",
              source: "oauth",
              refreshToken: "token-a",
              modelRateLimits: { "model-1": { isRateLimited: true, resetTime: 123456 } },
              lastUsed: 1000,
            },
            {
              email: "b@example.com",
              source: "database",
              lastUsed: null,
            },
          ],
          settings: { cooldownDurationMs: 120000 },
          activeIndex: 1,
        }),
      );

      const result = await loadAccounts("/path/to/config.json");

      expect(result.accounts).toHaveLength(2);
      expect(result.accounts[0]?.email).toBe("a@example.com");
      expect(result.accounts[0]?.source).toBe("oauth");
      // Invalid flag should be reset on load
      expect(result.accounts[0]?.isInvalid).toBe(false);
      expect(result.accounts[0]?.invalidReason).toBeNull();
      expect(result.accounts[0]?.modelRateLimits).toEqual({ "model-1": { isRateLimited: true, resetTime: 123456 } });
      expect(result.accounts[1]?.email).toBe("b@example.com");
      expect(result.settings.cooldownDurationMs).toBe(120000);
      expect(result.activeIndex).toBe(1);
    });

    it("returns empty accounts when config file does not exist", async () => {
      const { access } = await import("fs/promises");

      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      vi.mocked(access).mockRejectedValue(error);

      const result = await loadAccounts("/path/to/missing.json");

      expect(result.accounts).toHaveLength(0);
      expect(result.settings).toEqual({});
      expect(result.activeIndex).toBe(0);
    });

    it("returns empty accounts on parse error", async () => {
      const { access, readFile } = await import("fs/promises");

      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue("invalid json {{{");

      const result = await loadAccounts("/path/to/config.json");

      expect(result.accounts).toHaveLength(0);
      expect(result.settings).toEqual({});
    });

    it("clamps activeIndex to valid range", async () => {
      const { access, readFile } = await import("fs/promises");

      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          accounts: [{ email: "a@example.com", source: "oauth" }],
          settings: {},
          activeIndex: 10, // Out of bounds
        }),
      );

      const result = await loadAccounts("/path/to/config.json");

      expect(result.activeIndex).toBe(0);
    });

    it("initializes modelRateLimits to empty object when not present", async () => {
      const { access, readFile } = await import("fs/promises");

      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          accounts: [{ email: "a@example.com", source: "oauth" }],
          settings: {},
          activeIndex: 0,
        }),
      );

      const result = await loadAccounts("/path/to/config.json");

      expect(result.accounts[0]?.modelRateLimits).toEqual({});
    });

    it("handles empty accounts array in config", async () => {
      const { access, readFile } = await import("fs/promises");

      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          accounts: [],
          settings: {},
          activeIndex: 0,
        }),
      );

      const result = await loadAccounts("/path/to/config.json");

      expect(result.accounts).toHaveLength(0);
    });
  });

  describe("loadDefaultAccount", () => {
    it("loads account from database when auth data exists", async () => {
      const { getAuthStatus } = await import("../../../src/auth/database.js");

      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "db-api-key", email: "db@example.com" });

      const result = loadDefaultAccount();

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0]?.email).toBe("db@example.com");
      expect(result.accounts[0]?.source).toBe("database");
      expect(result.tokenCache.get("db@example.com")?.token).toBe("db-api-key");
    });

    it("uses default email when not available in database", async () => {
      const { getAuthStatus } = await import("../../../src/auth/database.js");

      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "db-api-key", email: undefined });

      const result = loadDefaultAccount();

      expect(result.accounts[0]?.email).toBe("default@antigravity");
    });

    it("returns empty when database has no auth data", async () => {
      const { getAuthStatus } = await import("../../../src/auth/database.js");

      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: null, email: null });

      const result = loadDefaultAccount();

      expect(result.accounts).toHaveLength(0);
      expect(result.tokenCache.size).toBe(0);
    });

    it("returns empty when database throws error", async () => {
      const { getAuthStatus } = await import("../../../src/auth/database.js");

      vi.mocked(getAuthStatus).mockImplementation(() => {
        throw new Error("Database error");
      });

      const result = loadDefaultAccount();

      expect(result.accounts).toHaveLength(0);
    });

    it("uses custom dbPath when provided", async () => {
      const { getAuthStatus } = await import("../../../src/auth/database.js");

      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "api-key", email: "user@example.com" });

      loadDefaultAccount("/custom/db/path");

      expect(getAuthStatus).toHaveBeenCalledWith("/custom/db/path");
    });
  });

  describe("saveAccounts", () => {
    it("writes correct JSON to file", async () => {
      const { mkdir, writeFile } = await import("fs/promises");

      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const accounts: Account[] = [
        {
          email: "a@example.com",
          source: "oauth",
          refreshToken: "token-a",
          lastUsed: 1000,
          modelRateLimits: { "model-1": { isRateLimited: true, resetTime: 123456 } },
          addedAt: 500,
          projectId: "project-a",
        },
        {
          email: "b@example.com",
          source: "manual",
          apiKey: "api-key-b",
          lastUsed: null,
          modelRateLimits: {},
          isInvalid: true,
          invalidReason: "Expired",
        },
      ];
      const settings: AccountSettings = { cooldownDurationMs: 60000 };

      await saveAccounts("/path/to/config.json", accounts, settings, 1);

      expect(mkdir).toHaveBeenCalledWith("/path/to", { recursive: true });
      expect(writeFile).toHaveBeenCalledTimes(1);

      const writtenJson = vi.mocked(writeFile).mock.calls[0]?.[1] as string;
      const parsed = JSON.parse(writtenJson);

      expect(parsed.accounts).toHaveLength(2);
      expect(parsed.accounts[0].email).toBe("a@example.com");
      expect(parsed.accounts[0].refreshToken).toBe("token-a");
      expect(parsed.accounts[0].projectId).toBe("project-a");
      expect(parsed.accounts[1].email).toBe("b@example.com");
      expect(parsed.accounts[1].apiKey).toBe("api-key-b");
      expect(parsed.accounts[1].refreshToken).toBeUndefined();
      expect(parsed.settings.cooldownDurationMs).toBe(60000);
      expect(parsed.activeIndex).toBe(1);
    });

    it("handles mkdir failure gracefully", async () => {
      const { mkdir, writeFile } = await import("fs/promises");

      vi.mocked(mkdir).mockRejectedValue(new Error("Permission denied"));

      // Should not throw
      await expect(saveAccounts("/path/to/config.json", [], {}, 0)).resolves.toBeUndefined();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it("handles writeFile failure gracefully", async () => {
      const { mkdir, writeFile } = await import("fs/promises");

      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockRejectedValue(new Error("Disk full"));

      // Should not throw
      await expect(saveAccounts("/path/to/config.json", [], {}, 0)).resolves.toBeUndefined();
    });

    it("excludes refreshToken for non-oauth accounts", async () => {
      const { mkdir, writeFile } = await import("fs/promises");

      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const accounts: Account[] = [
        {
          email: "db@example.com",
          source: "database",
          lastUsed: null,
          modelRateLimits: {},
        },
      ];

      await saveAccounts("/path/to/config.json", accounts, {}, 0);

      const writtenJson = vi.mocked(writeFile).mock.calls[0]?.[1] as string;
      const parsed = JSON.parse(writtenJson);

      expect(parsed.accounts[0].refreshToken).toBeUndefined();
    });

    it("excludes apiKey for non-manual accounts", async () => {
      const { mkdir, writeFile } = await import("fs/promises");

      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const accounts: Account[] = [
        {
          email: "oauth@example.com",
          source: "oauth",
          refreshToken: "token",
          lastUsed: null,
          modelRateLimits: {},
        },
      ];

      await saveAccounts("/path/to/config.json", accounts, {}, 0);

      const writtenJson = vi.mocked(writeFile).mock.calls[0]?.[1] as string;
      const parsed = JSON.parse(writtenJson);

      expect(parsed.accounts[0].apiKey).toBeUndefined();
    });

    it("preserves modelRateLimits in saved config", async () => {
      const { mkdir, writeFile } = await import("fs/promises");

      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const accounts: Account[] = [
        {
          email: "a@example.com",
          source: "oauth",
          refreshToken: "token",
          lastUsed: null,
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: 123456 },
            "model-2": { isRateLimited: false, resetTime: null },
          },
        },
      ];

      await saveAccounts("/path/to/config.json", accounts, {}, 0);

      const writtenJson = vi.mocked(writeFile).mock.calls[0]?.[1] as string;
      const parsed = JSON.parse(writtenJson);

      expect(parsed.accounts[0].modelRateLimits).toEqual({
        "model-1": { isRateLimited: true, resetTime: 123456 },
        "model-2": { isRateLimited: false, resetTime: null },
      });
    });
  });
});
