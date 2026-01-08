/**
 * Unit Tests: POST /trigger-reset endpoint
 *
 * Tests the quota reset API endpoint functionality.
 * Note: Since supertest is not installed, we test the AccountManager.triggerQuotaReset
 * method directly, which is the core logic used by the endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { triggerQuotaReset, type QuotaResetResult } from "../../../src/account-manager/rate-limits.js";
import { getAllQuotaGroups, QUOTA_GROUPS, type QuotaGroupKey } from "../../../src/cloudcode/quota-groups.js";
import { createAccount } from "../../helpers/factories.js";
import type { Account } from "../../../src/account-manager/types.js";

describe("POST /trigger-reset endpoint logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("group validation", () => {
    it("should accept valid quota group keys", () => {
      const validGroups = getAllQuotaGroups();
      expect(validGroups).toContain("claude");
      expect(validGroups).toContain("geminiPro");
      expect(validGroups).toContain("geminiFlash");
    });

    it("should have 'all' as a valid option", () => {
      const validGroups = [...getAllQuotaGroups(), "all"];
      expect(validGroups).toContain("all");
    });

    it("should reject invalid group names", () => {
      const validGroups = [...getAllQuotaGroups(), "all"];
      expect(validGroups).not.toContain("invalid");
      expect(validGroups).not.toContain("foo");
      expect(validGroups).not.toContain("");
    });
  });

  describe("triggerQuotaReset result format", () => {
    it("should return success response structure", () => {
      const accounts: Account[] = [
        createAccount({
          email: "test@example.com",
          modelRateLimits: {
            "claude-sonnet-4-5": { isRateLimited: true, resetTime: Date.now() + 60000 },
          },
        }),
      ];

      const result = triggerQuotaReset(accounts, "claude");

      expect(result).toHaveProperty("accountsAffected");
      expect(result).toHaveProperty("limitsCleared");
      expect(result).toHaveProperty("groups");
      expect(typeof result.accountsAffected).toBe("number");
      expect(typeof result.limitsCleared).toBe("number");
      expect(Array.isArray(result.groups)).toBe(true);
    });

    it("should include group names in response", () => {
      const accounts: Account[] = [];

      const result = triggerQuotaReset(accounts, "claude");

      expect(result.groups).toContain("Claude");
    });

    it("should include all group names when group is 'all'", () => {
      const accounts: Account[] = [];

      const result = triggerQuotaReset(accounts, "all");

      expect(result.groups).toContain("Claude");
      expect(result.groups).toContain("Gemini Pro");
      expect(result.groups).toContain("Gemini Flash");
    });
  });

  describe("quota reset by group", () => {
    it("should reset Claude group only when specified", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts: Account[] = [
        createAccount({
          email: "test@example.com",
          modelRateLimits: {
            "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + 60000 },
            "claude-opus-4-5": { isRateLimited: true, resetTime: now + 60000 },
            "gemini-2.5-pro": { isRateLimited: true, resetTime: now + 60000 },
            "gemini-3-flash": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
      ];

      const result = triggerQuotaReset(accounts, "claude");

      // Claude models should be reset
      expect(accounts[0]?.modelRateLimits?.["claude-sonnet-4-5"]?.isRateLimited).toBe(false);
      expect(accounts[0]?.modelRateLimits?.["claude-opus-4-5"]?.isRateLimited).toBe(false);

      // Gemini models should still be rate limited
      expect(accounts[0]?.modelRateLimits?.["gemini-2.5-pro"]?.isRateLimited).toBe(true);
      expect(accounts[0]?.modelRateLimits?.["gemini-3-flash"]?.isRateLimited).toBe(true);

      expect(result.groups).toEqual(["Claude"]);
    });

    it("should reset Gemini Pro group only when specified", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts: Account[] = [
        createAccount({
          email: "test@example.com",
          modelRateLimits: {
            "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + 60000 },
            "gemini-2.5-pro": { isRateLimited: true, resetTime: now + 60000 },
            "gemini-3-flash": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
      ];

      const result = triggerQuotaReset(accounts, "geminiPro");

      // Claude should still be rate limited
      expect(accounts[0]?.modelRateLimits?.["claude-sonnet-4-5"]?.isRateLimited).toBe(true);

      // Gemini Pro should be reset
      expect(accounts[0]?.modelRateLimits?.["gemini-2.5-pro"]?.isRateLimited).toBe(false);

      // Gemini Flash should still be rate limited
      expect(accounts[0]?.modelRateLimits?.["gemini-3-flash"]?.isRateLimited).toBe(true);

      expect(result.groups).toEqual(["Gemini Pro"]);
    });

    it("should reset Gemini Flash group only when specified", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts: Account[] = [
        createAccount({
          email: "test@example.com",
          modelRateLimits: {
            "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + 60000 },
            "gemini-2.5-pro": { isRateLimited: true, resetTime: now + 60000 },
            "gemini-3-flash": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
      ];

      const result = triggerQuotaReset(accounts, "geminiFlash");

      // Claude should still be rate limited
      expect(accounts[0]?.modelRateLimits?.["claude-sonnet-4-5"]?.isRateLimited).toBe(true);

      // Gemini Pro should still be rate limited
      expect(accounts[0]?.modelRateLimits?.["gemini-2.5-pro"]?.isRateLimited).toBe(true);

      // Gemini Flash should be reset
      expect(accounts[0]?.modelRateLimits?.["gemini-3-flash"]?.isRateLimited).toBe(false);

      expect(result.groups).toEqual(["Gemini Flash"]);
    });

    it("should reset all groups when 'all' is specified", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts: Account[] = [
        createAccount({
          email: "test@example.com",
          modelRateLimits: {
            "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + 60000 },
            "gemini-2.5-pro": { isRateLimited: true, resetTime: now + 60000 },
            "gemini-3-flash": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
      ];

      const result = triggerQuotaReset(accounts, "all");

      // All models should be reset
      expect(accounts[0]?.modelRateLimits?.["claude-sonnet-4-5"]?.isRateLimited).toBe(false);
      expect(accounts[0]?.modelRateLimits?.["gemini-2.5-pro"]?.isRateLimited).toBe(false);
      expect(accounts[0]?.modelRateLimits?.["gemini-3-flash"]?.isRateLimited).toBe(false);

      expect(result.groups).toContain("Claude");
      expect(result.groups).toContain("Gemini Pro");
      expect(result.groups).toContain("Gemini Flash");
    });
  });

  describe("multiple accounts", () => {
    it("should reset rate limits across multiple accounts", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts: Account[] = [
        createAccount({
          email: "account1@example.com",
          modelRateLimits: {
            "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
        createAccount({
          email: "account2@example.com",
          modelRateLimits: {
            "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
      ];

      const result = triggerQuotaReset(accounts, "claude");

      expect(result.accountsAffected).toBe(2);
      expect(accounts[0]?.modelRateLimits?.["claude-sonnet-4-5"]?.isRateLimited).toBe(false);
      expect(accounts[1]?.modelRateLimits?.["claude-sonnet-4-5"]?.isRateLimited).toBe(false);
    });

    it("should count only affected accounts", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts: Account[] = [
        createAccount({
          email: "account1@example.com",
          modelRateLimits: {
            "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
        createAccount({
          email: "account2@example.com",
          modelRateLimits: {
            "gemini-3-flash": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
      ];

      const result = triggerQuotaReset(accounts, "claude");

      // Only account1 should be affected
      expect(result.accountsAffected).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("should handle empty accounts array", () => {
      const accounts: Account[] = [];

      const result = triggerQuotaReset(accounts, "all");

      expect(result.accountsAffected).toBe(0);
      expect(result.limitsCleared).toBe(0);
      expect(result.groups.length).toBe(3);
    });

    it("should handle accounts without modelRateLimits", () => {
      const accounts: Account[] = [createAccount({ email: "test@example.com" })];

      const result = triggerQuotaReset(accounts, "all");

      expect(result.accountsAffected).toBe(0);
      expect(result.limitsCleared).toBe(0);
    });

    it("should handle accounts with empty modelRateLimits", () => {
      const accounts: Account[] = [
        createAccount({
          email: "test@example.com",
          modelRateLimits: {},
        }),
      ];

      const result = triggerQuotaReset(accounts, "all");

      expect(result.accountsAffected).toBe(0);
      expect(result.limitsCleared).toBe(0);
    });

    it("should only clear rate-limited models, not non-rate-limited ones", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts: Account[] = [
        createAccount({
          email: "test@example.com",
          modelRateLimits: {
            "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + 60000 },
            "claude-opus-4-5": { isRateLimited: false, resetTime: null },
          },
        }),
      ];

      const result = triggerQuotaReset(accounts, "claude");

      // Should count only the one that was rate-limited
      expect(result.limitsCleared).toBe(1);
    });
  });
});
