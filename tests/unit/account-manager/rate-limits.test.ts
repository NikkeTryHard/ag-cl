/**
 * Unit tests for rate-limits.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { isAllRateLimited, getAvailableAccounts, getInvalidAccounts, clearExpiredLimits, resetAllRateLimits, markRateLimited, markInvalid, getMinWaitTimeMs } from "../../../src/account-manager/rate-limits.js";
import { createAccount } from "../../helpers/factories.js";
import type { Account } from "../../../src/account-manager/types.js";

describe("rate-limits", () => {
  describe("isAllRateLimited", () => {
    it("returns true for empty accounts array", () => {
      expect(isAllRateLimited([], "model-1")).toBe(true);
    });

    it("returns false when no modelId specified", () => {
      const accounts = [createAccount({ email: "test@example.com" })];
      expect(isAllRateLimited(accounts, null)).toBe(false);
    });

    it("returns false when no accounts are rate-limited", () => {
      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];
      expect(isAllRateLimited(accounts, "model-1")).toBe(false);
    });

    it("returns false when some accounts are not rate-limited", () => {
      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: Date.now() + 60000 },
          },
        }),
        createAccount({ email: "b@example.com" }),
      ];
      expect(isAllRateLimited(accounts, "model-1")).toBe(false);
    });

    it("returns true when all accounts are rate-limited for the model", () => {
      const futureTime = Date.now() + 60000;
      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: futureTime },
          },
        }),
        createAccount({
          email: "b@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: futureTime },
          },
        }),
      ];
      expect(isAllRateLimited(accounts, "model-1")).toBe(true);
    });

    it("treats invalid accounts as unavailable", () => {
      const accounts = [createAccount({ email: "a@example.com", isInvalid: true })];
      expect(isAllRateLimited(accounts, "model-1")).toBe(true);
    });

    it("returns false when rate limit has expired", () => {
      const pastTime = Date.now() - 1000;
      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: pastTime },
          },
        }),
      ];
      expect(isAllRateLimited(accounts, "model-1")).toBe(false);
    });

    it("handles different models independently", () => {
      const futureTime = Date.now() + 60000;
      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: futureTime },
          },
        }),
      ];
      expect(isAllRateLimited(accounts, "model-1")).toBe(true);
      expect(isAllRateLimited(accounts, "model-2")).toBe(false);
    });
  });

  describe("getAvailableAccounts", () => {
    it("returns all accounts when none are rate-limited", () => {
      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];
      const available = getAvailableAccounts(accounts, "model-1");
      expect(available).toHaveLength(2);
    });

    it("excludes invalid accounts", () => {
      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com", isInvalid: true })];
      const available = getAvailableAccounts(accounts, "model-1");
      expect(available).toHaveLength(1);
      expect(available[0]?.email).toBe("a@example.com");
    });

    it("excludes rate-limited accounts for the specified model", () => {
      const futureTime = Date.now() + 60000;
      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: futureTime },
          },
        }),
        createAccount({ email: "b@example.com" }),
      ];
      const available = getAvailableAccounts(accounts, "model-1");
      expect(available).toHaveLength(1);
      expect(available[0]?.email).toBe("b@example.com");
    });

    it("includes accounts with expired rate limits", () => {
      const pastTime = Date.now() - 1000;
      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: pastTime },
          },
        }),
      ];
      const available = getAvailableAccounts(accounts, "model-1");
      expect(available).toHaveLength(1);
    });

    it("returns all non-invalid accounts when modelId is null", () => {
      const futureTime = Date.now() + 60000;
      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: futureTime },
          },
        }),
        createAccount({ email: "b@example.com" }),
        createAccount({ email: "c@example.com", isInvalid: true }),
      ];
      const available = getAvailableAccounts(accounts, null);
      expect(available).toHaveLength(2);
    });
  });

  describe("getInvalidAccounts", () => {
    it("returns empty array when no accounts are invalid", () => {
      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];
      expect(getInvalidAccounts(accounts)).toHaveLength(0);
    });

    it("returns only invalid accounts", () => {
      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com", isInvalid: true }), createAccount({ email: "c@example.com", isInvalid: true })];
      const invalid = getInvalidAccounts(accounts);
      expect(invalid).toHaveLength(2);
      expect(invalid.map((a) => a.email)).toEqual(["b@example.com", "c@example.com"]);
    });
  });

  describe("clearExpiredLimits", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("clears rate limits that have expired", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now - 1000 },
          },
        }),
      ];

      const cleared = clearExpiredLimits(accounts);
      expect(cleared).toBe(1);
      expect(accounts[0]?.modelRateLimits["model-1"]?.isRateLimited).toBe(false);
      expect(accounts[0]?.modelRateLimits["model-1"]?.resetTime).toBeNull();
    });

    it("does not clear rate limits that have not expired", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
      ];

      const cleared = clearExpiredLimits(accounts);
      expect(cleared).toBe(0);
      expect(accounts[0]?.modelRateLimits["model-1"]?.isRateLimited).toBe(true);
    });

    it("clears multiple expired limits across accounts and models", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now - 1000 },
            "model-2": { isRateLimited: true, resetTime: now - 500 },
          },
        }),
        createAccount({
          email: "b@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now - 2000 },
          },
        }),
      ];

      const cleared = clearExpiredLimits(accounts);
      expect(cleared).toBe(3);
    });

    it("returns 0 when no accounts have rate limits", () => {
      const accounts = [createAccount({ email: "a@example.com" })];
      expect(clearExpiredLimits(accounts)).toBe(0);
    });
  });

  describe("resetAllRateLimits", () => {
    it("clears all rate limits on all accounts", () => {
      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: Date.now() + 60000 },
            "model-2": { isRateLimited: true, resetTime: Date.now() + 60000 },
          },
        }),
        createAccount({
          email: "b@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: Date.now() + 60000 },
          },
        }),
      ];

      resetAllRateLimits(accounts);

      expect(accounts[0]?.modelRateLimits["model-1"]?.isRateLimited).toBe(false);
      expect(accounts[0]?.modelRateLimits["model-1"]?.resetTime).toBeNull();
      expect(accounts[0]?.modelRateLimits["model-2"]?.isRateLimited).toBe(false);
      expect(accounts[1]?.modelRateLimits["model-1"]?.isRateLimited).toBe(false);
    });

    it("handles accounts without rate limits", () => {
      const accounts = [createAccount({ email: "a@example.com" })];
      expect(() => resetAllRateLimits(accounts)).not.toThrow();
    });
  });

  describe("markRateLimited", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("marks an account as rate-limited for a specific model", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [createAccount({ email: "a@example.com" })];

      const result = markRateLimited(accounts, "a@example.com", 60000, {}, "model-1");

      expect(result).toBe(true);
      expect(accounts[0]?.modelRateLimits["model-1"]?.isRateLimited).toBe(true);
      expect(accounts[0]?.modelRateLimits["model-1"]?.resetTime).toBe(now + 60000);
    });

    it("returns false for non-existent account", () => {
      const accounts = [createAccount({ email: "a@example.com" })];
      const result = markRateLimited(accounts, "nonexistent@example.com", 60000, {}, "model-1");
      expect(result).toBe(false);
    });

    it("uses default cooldown when resetMs is null", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [createAccount({ email: "a@example.com" })];

      // DEFAULT_COOLDOWN_MS is 60000 (1 minute)
      markRateLimited(accounts, "a@example.com", null, {}, "model-1");

      expect(accounts[0]?.modelRateLimits["model-1"]?.isRateLimited).toBe(true);
      expect(accounts[0]?.modelRateLimits["model-1"]?.resetTime).toBe(now + 60000);
    });

    it("uses settings.cooldownDurationMs when available", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [createAccount({ email: "a@example.com" })];
      const settings = { cooldownDurationMs: 120000 };

      markRateLimited(accounts, "a@example.com", null, settings, "model-1");

      expect(accounts[0]?.modelRateLimits["model-1"]?.resetTime).toBe(now + 120000);
    });

    it("initializes modelRateLimits if not present", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const account: Account = {
        email: "a@example.com",
        source: "oauth",
        lastUsed: null,
        modelRateLimits: undefined as unknown as Record<string, { isRateLimited: boolean; resetTime: number | null }>,
      };
      const accounts = [account];

      markRateLimited(accounts, "a@example.com", 60000, {}, "model-1");

      expect(accounts[0]?.modelRateLimits).toBeDefined();
      expect(accounts[0]?.modelRateLimits["model-1"]?.isRateLimited).toBe(true);
    });
  });

  describe("markInvalid", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("marks an account as invalid", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [createAccount({ email: "a@example.com" })];

      const result = markInvalid(accounts, "a@example.com", "Token expired");

      expect(result).toBe(true);
      expect(accounts[0]?.isInvalid).toBe(true);
      expect(accounts[0]?.invalidReason).toBe("Token expired");
      expect(accounts[0]?.invalidAt).toBe(now);
    });

    it("returns false for non-existent account", () => {
      const accounts = [createAccount({ email: "a@example.com" })];
      const result = markInvalid(accounts, "nonexistent@example.com", "Error");
      expect(result).toBe(false);
    });

    it("uses default reason when not provided", () => {
      const accounts = [createAccount({ email: "a@example.com" })];
      markInvalid(accounts, "a@example.com");
      expect(accounts[0]?.invalidReason).toBe("Unknown error");
    });
  });

  describe("getMinWaitTimeMs", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("returns 0 when not all accounts are rate-limited", () => {
      const accounts = [
        createAccount({ email: "a@example.com" }),
        createAccount({
          email: "b@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: Date.now() + 60000 },
          },
        }),
      ];
      expect(getMinWaitTimeMs(accounts, "model-1")).toBe(0);
    });

    it("returns the minimum wait time across all accounts", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
        createAccount({
          email: "b@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now + 30000 },
          },
        }),
      ];

      expect(getMinWaitTimeMs(accounts, "model-1")).toBe(30000);
    });

    it("returns default cooldown when no valid reset times", () => {
      const accounts = [createAccount({ email: "a@example.com", isInvalid: true })];
      // DEFAULT_COOLDOWN_MS is 60000
      expect(getMinWaitTimeMs(accounts, "model-1")).toBe(60000);
    });

    it("returns 0 when modelId is null and accounts exist", () => {
      const accounts = [createAccount({ email: "a@example.com" })];
      expect(getMinWaitTimeMs(accounts, null)).toBe(0);
    });
  });
});
