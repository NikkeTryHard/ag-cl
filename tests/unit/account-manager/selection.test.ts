/**
 * Unit tests for selection.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { pickNext, getCurrentStickyAccount, shouldWaitForCurrentAccount, pickStickyAccount } from "../../../src/account-manager/selection.js";
import { createAccount } from "../../helpers/factories.js";

describe("selection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe("pickNext", () => {
    it("returns null for empty accounts array", () => {
      const { account, newIndex } = pickNext([], 0, undefined, "model-1");
      expect(account).toBeNull();
      expect(newIndex).toBe(0);
    });

    it("picks the next available account in round-robin order", () => {
      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" }), createAccount({ email: "c@example.com" })];

      // Starting at index 0, should pick index 1 (next)
      const { account, newIndex } = pickNext(accounts, 0, undefined, "model-1");
      expect(account?.email).toBe("b@example.com");
      expect(newIndex).toBe(1);
    });

    it("wraps around to first account", () => {
      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

      // Starting at index 1, should wrap to index 0
      const { account, newIndex } = pickNext(accounts, 1, undefined, "model-1");
      expect(account?.email).toBe("a@example.com");
      expect(newIndex).toBe(0);
    });

    it("skips rate-limited accounts", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [
        createAccount({ email: "a@example.com" }),
        createAccount({
          email: "b@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
        createAccount({ email: "c@example.com" }),
      ];

      // Starting at index 0, should skip b (index 1) and pick c (index 2)
      const { account, newIndex } = pickNext(accounts, 0, undefined, "model-1");
      expect(account?.email).toBe("c@example.com");
      expect(newIndex).toBe(2);
    });

    it("skips invalid accounts", () => {
      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com", isInvalid: true }), createAccount({ email: "c@example.com" })];

      const { account, newIndex } = pickNext(accounts, 0, undefined, "model-1");
      expect(account?.email).toBe("c@example.com");
      expect(newIndex).toBe(2);
    });

    it("returns null when all accounts are unavailable", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
        createAccount({ email: "b@example.com", isInvalid: true }),
      ];

      const { account, newIndex } = pickNext(accounts, 0, undefined, "model-1");
      expect(account).toBeNull();
      expect(newIndex).toBe(0);
    });

    it("clamps index to valid range when out of bounds", () => {
      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

      // Index 10 is out of bounds, should clamp to 0 and pick next (index 1)
      const { account, newIndex } = pickNext(accounts, 10, undefined, "model-1");
      expect(account?.email).toBe("b@example.com");
      expect(newIndex).toBe(1);
    });

    it("updates lastUsed timestamp on selected account", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

      pickNext(accounts, 0, undefined, "model-1");
      expect(accounts[1]?.lastUsed).toBe(now);
    });

    it("calls onSave callback when account is selected", () => {
      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];
      const onSave = vi.fn();

      pickNext(accounts, 0, onSave, "model-1");
      expect(onSave).toHaveBeenCalled();
    });

    it("works with single account", () => {
      const accounts = [createAccount({ email: "a@example.com" })];

      const { account, newIndex } = pickNext(accounts, 0, undefined, "model-1");
      expect(account?.email).toBe("a@example.com");
      expect(newIndex).toBe(0);
    });
  });

  describe("getCurrentStickyAccount", () => {
    it("returns null for empty accounts array", () => {
      const { account, newIndex } = getCurrentStickyAccount([], 0, undefined, "model-1");
      expect(account).toBeNull();
      expect(newIndex).toBe(0);
    });

    it("returns the current account when available", () => {
      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

      const { account, newIndex } = getCurrentStickyAccount(accounts, 1, undefined, "model-1");
      expect(account?.email).toBe("b@example.com");
      expect(newIndex).toBe(1);
    });

    it("returns null when current account is rate-limited", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
        createAccount({ email: "b@example.com" }),
      ];

      const { account, newIndex } = getCurrentStickyAccount(accounts, 0, undefined, "model-1");
      expect(account).toBeNull();
      expect(newIndex).toBe(0);
    });

    it("returns null when current account is invalid", () => {
      const accounts = [createAccount({ email: "a@example.com", isInvalid: true }), createAccount({ email: "b@example.com" })];

      const { account, newIndex } = getCurrentStickyAccount(accounts, 0, undefined, "model-1");
      expect(account).toBeNull();
      expect(newIndex).toBe(0);
    });

    it("clamps index to valid range", () => {
      const accounts = [createAccount({ email: "a@example.com" })];

      // Index 10 is out of bounds, should clamp to 0
      const { account, newIndex } = getCurrentStickyAccount(accounts, 10, undefined, "model-1");
      expect(account?.email).toBe("a@example.com");
      expect(newIndex).toBe(0);
    });

    it("updates lastUsed timestamp", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [createAccount({ email: "a@example.com" })];

      getCurrentStickyAccount(accounts, 0, undefined, "model-1");
      expect(accounts[0]?.lastUsed).toBe(now);
    });
  });

  describe("shouldWaitForCurrentAccount", () => {
    it("returns shouldWait=false for empty accounts array", () => {
      const result = shouldWaitForCurrentAccount([], 0, "model-1");
      expect(result.shouldWait).toBe(false);
      expect(result.waitMs).toBe(0);
      expect(result.account).toBeNull();
    });

    it("returns shouldWait=false when account is not rate-limited", () => {
      const accounts = [createAccount({ email: "a@example.com" })];

      const result = shouldWaitForCurrentAccount(accounts, 0, "model-1");
      expect(result.shouldWait).toBe(false);
    });

    it("returns shouldWait=false when account is invalid", () => {
      const accounts = [createAccount({ email: "a@example.com", isInvalid: true })];

      const result = shouldWaitForCurrentAccount(accounts, 0, "model-1");
      expect(result.shouldWait).toBe(false);
      expect(result.account).toBeNull();
    });

    it("returns shouldWait=true when rate limit is within threshold", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // MAX_WAIT_BEFORE_ERROR_MS is 120000 (2 minutes)
      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
      ];

      const result = shouldWaitForCurrentAccount(accounts, 0, "model-1");
      expect(result.shouldWait).toBe(true);
      expect(result.waitMs).toBe(60000);
      expect(result.account?.email).toBe("a@example.com");
    });

    it("returns shouldWait=false when rate limit exceeds threshold", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Wait time exceeds MAX_WAIT_BEFORE_ERROR_MS (120000)
      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now + 180000 },
          },
        }),
      ];

      const result = shouldWaitForCurrentAccount(accounts, 0, "model-1");
      expect(result.shouldWait).toBe(false);
      expect(result.waitMs).toBe(0);
    });

    it("clamps index to valid range", () => {
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

      // Index 10 is out of bounds, should clamp to 0
      const result = shouldWaitForCurrentAccount(accounts, 10, "model-1");
      expect(result.shouldWait).toBe(true);
      expect(result.account?.email).toBe("a@example.com");
    });
  });

  describe("pickStickyAccount", () => {
    it("returns current account when available", () => {
      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

      const { account, waitMs, newIndex } = pickStickyAccount(accounts, 1, undefined, "model-1");
      expect(account?.email).toBe("b@example.com");
      expect(waitMs).toBe(0);
      expect(newIndex).toBe(1);
    });

    it("switches to available account when current is rate-limited", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now + 180000 },
          },
        }),
        createAccount({ email: "b@example.com" }),
      ];

      const { account, waitMs, newIndex } = pickStickyAccount(accounts, 0, undefined, "model-1");
      expect(account?.email).toBe("b@example.com");
      expect(waitMs).toBe(0);
      expect(newIndex).toBe(1);
    });

    it("waits for current account when wait time is within threshold and no others available", () => {
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

      const { account, waitMs, newIndex } = pickStickyAccount(accounts, 0, undefined, "model-1");
      expect(account).toBeNull();
      expect(waitMs).toBe(60000);
      expect(newIndex).toBe(0);
    });

    it("prefers failover to waiting when other accounts are available", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now + 60000 },
          },
        }),
        createAccount({ email: "b@example.com" }),
      ];

      const { account, waitMs, newIndex } = pickStickyAccount(accounts, 0, undefined, "model-1");
      // Should switch to b instead of waiting
      expect(account?.email).toBe("b@example.com");
      expect(waitMs).toBe(0);
      expect(newIndex).toBe(1);
    });

    it("returns null when all accounts unavailable and wait exceeds threshold", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now + 180000 },
          },
        }),
        createAccount({ email: "b@example.com", isInvalid: true }),
      ];

      const { account, waitMs, newIndex } = pickStickyAccount(accounts, 0, undefined, "model-1");
      expect(account).toBeNull();
      expect(waitMs).toBe(0);
      expect(newIndex).toBe(0);
    });

    it("handles single account case", () => {
      const accounts = [createAccount({ email: "a@example.com" })];

      const { account, waitMs, newIndex } = pickStickyAccount(accounts, 0, undefined, "model-1");
      expect(account?.email).toBe("a@example.com");
      expect(waitMs).toBe(0);
      expect(newIndex).toBe(0);
    });
  });
});
