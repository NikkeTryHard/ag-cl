/**
 * Unit tests for selection.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pickNext, getCurrentStickyAccount, shouldWaitForCurrentAccount, pickStickyAccount, pickByMode, resetRoundRobinIndex, getRoundRobinIndex } from "../../../src/account-manager/selection.js";
import { createAccount } from "../../helpers/factories.js";
import { ONE_MINUTE_MS, THREE_MINUTES_MS, THIRTY_MINUTES_MS, ONE_HOUR_MS } from "../../helpers/time-constants.js";
import type { AccountRefreshState } from "../../../src/cloudcode/auto-refresh-scheduler.js";

// Mock the auto-refresh-scheduler module
vi.mock("../../../src/cloudcode/auto-refresh-scheduler.js", () => ({
  getAccountRefreshStates: vi.fn(() => []),
}));

// Import the mocked function
import { getAccountRefreshStates } from "../../../src/cloudcode/auto-refresh-scheduler.js";
const mockGetAccountRefreshStates = vi.mocked(getAccountRefreshStates);

/**
 * Helper to create an AccountRefreshState for testing
 */
function createRefreshState(overrides: Partial<AccountRefreshState> = {}): AccountRefreshState {
  return {
    email: "test@example.com",
    lastChecked: Date.now(),
    lastTriggered: null,
    fetchedAt: Date.now(),
    claudePercentage: 100,
    geminiProPercentage: 100,
    geminiFlashPercentage: 100,
    claudeResetTime: null,
    geminiProResetTime: null,
    geminiFlashResetTime: null,
    prevClaudeResetTime: null,
    prevGeminiProResetTime: null,
    prevGeminiFlashResetTime: null,
    prevFetchedAt: null,
    isClaudeTimerStale: false,
    isGeminiProTimerStale: false,
    isGeminiFlashTimerStale: false,
    status: "ok",
    ...overrides,
  };
}

describe("selection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetAccountRefreshStates.mockReturnValue([]);
    resetRoundRobinIndex();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
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
            "model-1": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS },
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
            "model-1": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS },
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
            "model-1": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS },
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
            "model-1": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS },
          },
        }),
      ];

      const result = shouldWaitForCurrentAccount(accounts, 0, "model-1");
      expect(result.shouldWait).toBe(true);
      expect(result.waitMs).toBe(ONE_MINUTE_MS);
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
            "model-1": { isRateLimited: true, resetTime: now + THREE_MINUTES_MS },
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
            "model-1": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS },
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
            "model-1": { isRateLimited: true, resetTime: now + THREE_MINUTES_MS },
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
            "model-1": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS },
          },
        }),
      ];

      const { account, waitMs, newIndex } = pickStickyAccount(accounts, 0, undefined, "model-1");
      expect(account).toBeNull();
      expect(waitMs).toBe(ONE_MINUTE_MS);
      expect(newIndex).toBe(0);
    });

    it("prefers failover to waiting when other accounts are available", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const accounts = [
        createAccount({
          email: "a@example.com",
          modelRateLimits: {
            "model-1": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS },
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
            "model-1": { isRateLimited: true, resetTime: now + THREE_MINUTES_MS },
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

  describe("pickByMode", () => {
    describe("sticky mode", () => {
      it("returns current account when available", () => {
        const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

        const account = pickByMode("sticky", accounts, "claude-sonnet-4-5", "a@example.com");
        expect(account?.email).toBe("a@example.com");
      });

      it("fails over to first available account when current is unavailable", () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const accounts = [
          createAccount({
            email: "a@example.com",
            modelRateLimits: {
              "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS },
            },
          }),
          createAccount({ email: "b@example.com" }),
        ];

        const account = pickByMode("sticky", accounts, "claude-sonnet-4-5", "a@example.com");
        expect(account?.email).toBe("b@example.com");
      });

      it("returns first available account when no current account specified", () => {
        const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

        const account = pickByMode("sticky", accounts, "claude-sonnet-4-5");
        expect(account?.email).toBe("a@example.com");
      });

      it("returns null when all accounts unavailable", () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const accounts = [
          createAccount({
            email: "a@example.com",
            modelRateLimits: {
              "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS },
            },
          }),
        ];

        const account = pickByMode("sticky", accounts, "claude-sonnet-4-5");
        expect(account).toBeNull();
      });
    });

    describe("refresh-priority mode", () => {
      it("selects account with soonest resetTime", () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" }), createAccount({ email: "c@example.com" })];

        // Set up quota states: b has soonest reset, a has later reset, c has no reset (fresh)
        mockGetAccountRefreshStates.mockReturnValue([
          createRefreshState({
            email: "a@example.com",
            claudePercentage: 50,
            claudeResetTime: new Date(now + ONE_HOUR_MS).toISOString(), // 1 hour
          }),
          createRefreshState({
            email: "b@example.com",
            claudePercentage: 30,
            claudeResetTime: new Date(now + THIRTY_MINUTES_MS).toISOString(), // 30 minutes (soonest)
          }),
          createRefreshState({
            email: "c@example.com",
            claudePercentage: 100,
            claudeResetTime: null, // Fresh account
          }),
        ]);

        const account = pickByMode("refresh-priority", accounts, "claude-sonnet-4-5");
        expect(account?.email).toBe("b@example.com");
      });

      it("sorts fresh accounts (no resetTime) last", () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

        // a is fresh (no resetTime), b has a reset time
        mockGetAccountRefreshStates.mockReturnValue([
          createRefreshState({
            email: "a@example.com",
            claudePercentage: 100,
            claudeResetTime: null,
          }),
          createRefreshState({
            email: "b@example.com",
            claudePercentage: 50,
            claudeResetTime: new Date(now + ONE_HOUR_MS).toISOString(),
          }),
        ]);

        const account = pickByMode("refresh-priority", accounts, "claude-sonnet-4-5");
        expect(account?.email).toBe("b@example.com");
      });

      it("returns first available when no quota states exist", () => {
        const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

        mockGetAccountRefreshStates.mockReturnValue([]);

        const account = pickByMode("refresh-priority", accounts, "claude-sonnet-4-5");
        expect(account?.email).toBe("a@example.com");
      });

      it("skips rate-limited accounts", () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const accounts = [
          createAccount({
            email: "a@example.com",
            modelRateLimits: {
              "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS },
            },
          }),
          createAccount({ email: "b@example.com" }),
        ];

        mockGetAccountRefreshStates.mockReturnValue([
          createRefreshState({
            email: "a@example.com",
            claudePercentage: 30,
            claudeResetTime: new Date(now + THIRTY_MINUTES_MS).toISOString(), // Soonest but rate-limited
          }),
          createRefreshState({
            email: "b@example.com",
            claudePercentage: 50,
            claudeResetTime: new Date(now + ONE_HOUR_MS).toISOString(),
          }),
        ]);

        const account = pickByMode("refresh-priority", accounts, "claude-sonnet-4-5");
        expect(account?.email).toBe("b@example.com");
      });

      it("uses correct quota group for gemini models", () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

        // For gemini-2.5-pro (geminiPro group), b has soonest reset
        mockGetAccountRefreshStates.mockReturnValue([
          createRefreshState({
            email: "a@example.com",
            geminiProPercentage: 50,
            geminiProResetTime: new Date(now + ONE_HOUR_MS).toISOString(),
          }),
          createRefreshState({
            email: "b@example.com",
            geminiProPercentage: 30,
            geminiProResetTime: new Date(now + THIRTY_MINUTES_MS).toISOString(), // Soonest
          }),
        ]);

        const account = pickByMode("refresh-priority", accounts, "gemini-2.5-pro");
        expect(account?.email).toBe("b@example.com");
      });
    });

    describe("drain-highest mode", () => {
      it("selects account with highest quota percentage", () => {
        const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" }), createAccount({ email: "c@example.com" })];

        mockGetAccountRefreshStates.mockReturnValue([
          createRefreshState({
            email: "a@example.com",
            claudePercentage: 50,
          }),
          createRefreshState({
            email: "b@example.com",
            claudePercentage: 100, // Highest
          }),
          createRefreshState({
            email: "c@example.com",
            claudePercentage: 25,
          }),
        ]);

        const account = pickByMode("drain-highest", accounts, "claude-sonnet-4-5");
        expect(account?.email).toBe("b@example.com");
      });

      it("treats accounts without state as 0%", () => {
        const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

        // Only a has state, b should be treated as 0%
        mockGetAccountRefreshStates.mockReturnValue([
          createRefreshState({
            email: "a@example.com",
            claudePercentage: 50,
          }),
        ]);

        const account = pickByMode("drain-highest", accounts, "claude-sonnet-4-5");
        expect(account?.email).toBe("a@example.com");
      });

      it("skips rate-limited accounts", () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const accounts = [
          createAccount({
            email: "a@example.com",
            modelRateLimits: {
              "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS },
            },
          }),
          createAccount({ email: "b@example.com" }),
        ];

        mockGetAccountRefreshStates.mockReturnValue([
          createRefreshState({
            email: "a@example.com",
            claudePercentage: 100, // Highest but rate-limited
          }),
          createRefreshState({
            email: "b@example.com",
            claudePercentage: 50,
          }),
        ]);

        const account = pickByMode("drain-highest", accounts, "claude-sonnet-4-5");
        expect(account?.email).toBe("b@example.com");
      });

      it("uses correct quota group for gemini flash models", () => {
        const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

        mockGetAccountRefreshStates.mockReturnValue([
          createRefreshState({
            email: "a@example.com",
            geminiFlashPercentage: 100, // Highest for flash
          }),
          createRefreshState({
            email: "b@example.com",
            geminiFlashPercentage: 50,
          }),
        ]);

        const account = pickByMode("drain-highest", accounts, "gemini-3-flash");
        expect(account?.email).toBe("a@example.com");
      });

      it("returns first available when all have no state", () => {
        const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

        mockGetAccountRefreshStates.mockReturnValue([]);

        const account = pickByMode("drain-highest", accounts, "claude-sonnet-4-5");
        expect(account?.email).toBe("a@example.com");
      });
    });

    describe("round-robin mode", () => {
      it("cycles through available accounts in order", () => {
        const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" }), createAccount({ email: "c@example.com" })];

        const first = pickByMode("round-robin", accounts, "claude-sonnet-4-5");
        expect(first?.email).toBe("a@example.com");

        const second = pickByMode("round-robin", accounts, "claude-sonnet-4-5");
        expect(second?.email).toBe("b@example.com");

        const third = pickByMode("round-robin", accounts, "claude-sonnet-4-5");
        expect(third?.email).toBe("c@example.com");

        const fourth = pickByMode("round-robin", accounts, "claude-sonnet-4-5");
        expect(fourth?.email).toBe("a@example.com"); // Wraps around
      });

      it("skips rate-limited accounts in rotation", () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const accounts = [
          createAccount({ email: "a@example.com" }),
          createAccount({
            email: "b@example.com",
            modelRateLimits: {
              "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS },
            },
          }),
          createAccount({ email: "c@example.com" }),
        ];

        // Available accounts are [a, c] (b is rate-limited)
        const first = pickByMode("round-robin", accounts, "claude-sonnet-4-5");
        expect(first?.email).toBe("a@example.com");

        const second = pickByMode("round-robin", accounts, "claude-sonnet-4-5");
        expect(second?.email).toBe("c@example.com");

        const third = pickByMode("round-robin", accounts, "claude-sonnet-4-5");
        expect(third?.email).toBe("a@example.com"); // Wraps around to a
      });

      it("clamps index when available accounts change", () => {
        // Start with 3 accounts
        const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" }), createAccount({ email: "c@example.com" })];

        // Pick twice to advance index to 2
        pickByMode("round-robin", accounts, "claude-sonnet-4-5"); // returns a, index -> 1
        pickByMode("round-robin", accounts, "claude-sonnet-4-5"); // returns b, index -> 2

        expect(getRoundRobinIndex()).toBe(2);

        // Now remove c and b (simulate them becoming rate-limited)
        const now = Date.now();
        vi.setSystemTime(now);
        accounts[1]!.modelRateLimits = { "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS } };
        accounts[2]!.modelRateLimits = { "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS } };

        // Available is now just [a], index should clamp to 0
        const next = pickByMode("round-robin", accounts, "claude-sonnet-4-5");
        expect(next?.email).toBe("a@example.com");
      });

      it("returns null when no accounts available", () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const accounts = [
          createAccount({
            email: "a@example.com",
            modelRateLimits: {
              "claude-sonnet-4-5": { isRateLimited: true, resetTime: now + ONE_MINUTE_MS },
            },
          }),
        ];

        const account = pickByMode("round-robin", accounts, "claude-sonnet-4-5");
        expect(account).toBeNull();
      });
    });

    describe("unknown mode", () => {
      it("defaults to sticky mode for unknown mode", () => {
        const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

        // Using type assertion to test unknown mode behavior
        const account = pickByMode("unknown-mode" as never, accounts, "claude-sonnet-4-5", "b@example.com");
        expect(account?.email).toBe("b@example.com");
      });
    });

    describe("edge cases", () => {
      it("returns null for empty accounts array", () => {
        const account = pickByMode("sticky", [], "claude-sonnet-4-5");
        expect(account).toBeNull();
      });

      it("handles single account correctly in all modes", () => {
        const accounts = [createAccount({ email: "a@example.com" })];

        mockGetAccountRefreshStates.mockReturnValue([
          createRefreshState({
            email: "a@example.com",
            claudePercentage: 50,
            claudeResetTime: new Date(Date.now() + ONE_HOUR_MS).toISOString(),
          }),
        ]);

        expect(pickByMode("sticky", accounts, "claude-sonnet-4-5")?.email).toBe("a@example.com");
        expect(pickByMode("refresh-priority", accounts, "claude-sonnet-4-5")?.email).toBe("a@example.com");
        expect(pickByMode("drain-highest", accounts, "claude-sonnet-4-5")?.email).toBe("a@example.com");
        expect(pickByMode("round-robin", accounts, "claude-sonnet-4-5")?.email).toBe("a@example.com");
      });

      it("updates lastUsed timestamp on selected account", () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const accounts = [createAccount({ email: "a@example.com", lastUsed: null })];

        pickByMode("sticky", accounts, "claude-sonnet-4-5");
        expect(accounts[0]?.lastUsed).toBe(now);
      });
    });
  });

  describe("round-robin index management", () => {
    it("resetRoundRobinIndex resets the index to 0", () => {
      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" })];

      pickByMode("round-robin", accounts, "claude-sonnet-4-5");
      expect(getRoundRobinIndex()).toBe(1);

      resetRoundRobinIndex();
      expect(getRoundRobinIndex()).toBe(0);
    });

    it("getRoundRobinIndex returns current index", () => {
      expect(getRoundRobinIndex()).toBe(0);

      const accounts = [createAccount({ email: "a@example.com" }), createAccount({ email: "b@example.com" }), createAccount({ email: "c@example.com" })];

      pickByMode("round-robin", accounts, "claude-sonnet-4-5");
      expect(getRoundRobinIndex()).toBe(1);

      pickByMode("round-robin", accounts, "claude-sonnet-4-5");
      expect(getRoundRobinIndex()).toBe(2);

      pickByMode("round-robin", accounts, "claude-sonnet-4-5");
      expect(getRoundRobinIndex()).toBe(0); // Wrapped around
    });
  });
});
