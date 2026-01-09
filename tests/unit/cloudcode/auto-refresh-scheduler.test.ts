/**
 * Tests for auto-refresh scheduler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the dependencies before importing
vi.mock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
  triggerQuotaResetApi: vi.fn().mockResolvedValue({
    successCount: 3,
    failureCount: 0,
    groupsTriggered: [],
  }),
}));

vi.mock("../../../src/cloudcode/quota-api.js", () => ({
  fetchAccountCapacity: vi.fn().mockResolvedValue({
    claudePool: { aggregatedPercentage: 0, earliestReset: null },
    geminiProPool: { aggregatedPercentage: 100, earliestReset: null },
    geminiFlashPool: { aggregatedPercentage: 100, earliestReset: null },
  }),
}));

vi.mock("../../../src/account-manager/index.js", () => {
  class MockAccountManager {
    initialize = vi.fn().mockResolvedValue(undefined);
    getAllAccounts = vi.fn().mockReturnValue([{ email: "test@example.com", source: "oauth", refreshToken: "token123" }]);
    getTokenForAccount = vi.fn().mockResolvedValue("access_token");
    getProjectForAccount = vi.fn().mockResolvedValue("project-123");
    triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
  }
  return { AccountManager: MockAccountManager };
});

vi.mock("../../../src/utils/logger.js", () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { startAutoRefresh, stopAutoRefresh, isAutoRefreshRunning, getNextRefreshTime, getLastRefreshTime, getAccountRefreshStates, isTimerStale, getMillisUntilNextAligned } from "../../../src/cloudcode/auto-refresh-scheduler.js";
import { triggerQuotaResetApi } from "../../../src/cloudcode/quota-reset-trigger.js";
import { fetchAccountCapacity } from "../../../src/cloudcode/quota-api.js";
import { AccountManager } from "../../../src/account-manager/index.js";

const mockTriggerQuotaResetApi = vi.mocked(triggerQuotaResetApi);
const mockFetchAccountCapacity = vi.mocked(fetchAccountCapacity);
const MockAccountManager = vi.mocked(AccountManager);

describe("cloudcode/auto-refresh-scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopAutoRefresh(); // Ensure clean state
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopAutoRefresh();
    vi.useRealTimers();
  });

  describe("startAutoRefresh", () => {
    it("triggers immediately on start", async () => {
      await startAutoRefresh();

      expect(triggerQuotaResetApi).toHaveBeenCalledTimes(1);
      expect(isAutoRefreshRunning()).toBe(true);
    });

    it("triggers again after interval", async () => {
      // Set time to an aligned time (3:00) so interval starts immediately
      vi.setSystemTime(new Date("2026-01-09T03:00:00.000Z"));

      await startAutoRefresh();
      expect(triggerQuotaResetApi).toHaveBeenCalledTimes(1);

      // Advance time by 5 minutes (the check interval)
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(triggerQuotaResetApi).toHaveBeenCalledTimes(2);
    });

    it("does not start twice if already running", async () => {
      await startAutoRefresh();
      await startAutoRefresh();

      expect(triggerQuotaResetApi).toHaveBeenCalledTimes(1);
    });
  });

  describe("stopAutoRefresh", () => {
    it("stops the scheduler", async () => {
      await startAutoRefresh();
      expect(isAutoRefreshRunning()).toBe(true);

      stopAutoRefresh();
      expect(isAutoRefreshRunning()).toBe(false);
    });

    it("prevents future triggers after stop", async () => {
      // Set time to an aligned time (3:00) so interval starts immediately
      vi.setSystemTime(new Date("2026-01-09T03:00:00.000Z"));

      await startAutoRefresh();
      stopAutoRefresh();

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      // Should only have the initial trigger, not the interval one
      expect(triggerQuotaResetApi).toHaveBeenCalledTimes(1);
    });
  });

  describe("getNextRefreshTime", () => {
    it("returns null when not running", () => {
      expect(getNextRefreshTime()).toBeNull();
    });

    it("returns next refresh time when running", async () => {
      const startTime = Date.now();
      await startAutoRefresh();

      const nextRefresh = getNextRefreshTime();
      expect(nextRefresh).not.toBeNull();
      expect(nextRefresh).toBeGreaterThan(startTime);
    });
  });

  describe("error handling", () => {
    it("logs warning when no OAuth accounts available", async () => {
      // Reset modules to get fresh state with different mock
      vi.resetModules();

      // Re-mock with empty accounts
      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([]); // No accounts
          getTokenForAccount = vi.fn();
          getProjectForAccount = vi.fn();
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      // Re-mock logger to capture calls
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };
      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue(mockLogger),
      }));

      // Re-mock quota-reset-trigger
      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: vi.fn().mockResolvedValue({
          successCount: 3,
          failureCount: 0,
          groupsTriggered: [],
        }),
      }));

      // Dynamic import to get fresh module with new mocks
      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      await startAutoRefreshFresh();

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("No OAuth accounts"));

      stopAutoRefreshFresh();
    });

    it("logs warning when quota trigger fails for all groups", async () => {
      // Reset modules to get fresh state
      vi.resetModules();

      // Re-mock logger to capture calls
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };
      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue(mockLogger),
      }));

      // Re-mock account manager with OAuth account
      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([{ email: "test@example.com", source: "oauth", refreshToken: "token123" }]);
          getTokenForAccount = vi.fn().mockResolvedValue("access_token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-123");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      // Re-mock quota-reset-trigger to return 0 successes
      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: vi.fn().mockResolvedValue({
          successCount: 0,
          failureCount: 3,
          groupsTriggered: [],
        }),
      }));

      // Dynamic import to get fresh module with new mocks
      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      await startAutoRefreshFresh();

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("failed to trigger"));

      stopAutoRefreshFresh();
    });

    it("logs error and continues when performRefresh throws", async () => {
      // Reset modules to get fresh state
      vi.resetModules();

      // Re-mock logger to capture calls
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };
      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue(mockLogger),
      }));

      // Re-mock account manager with OAuth account
      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([{ email: "test@example.com", source: "oauth", refreshToken: "token123" }]);
          getTokenForAccount = vi.fn().mockResolvedValue("access_token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-123");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      // Re-mock quota-reset-trigger to throw
      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: vi.fn().mockRejectedValue(new Error("API Error")),
      }));

      // Dynamic import to get fresh module with new mocks
      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh, isAutoRefreshRunning: isAutoRefreshRunningFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      await startAutoRefreshFresh();

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("API Error"));
      expect(isAutoRefreshRunningFresh()).toBe(true); // Should still be running

      stopAutoRefreshFresh();
    });
  });

  describe("multi-account support", () => {
    it("processes all OAuth accounts, not just the first", async () => {
      // Reset modules to get fresh state with new mocks
      vi.resetModules();

      // Re-mock logger
      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      // Re-mock account manager with 3 OAuth accounts
      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([
            { email: "first@test.com", source: "oauth", refreshToken: "token1" },
            { email: "second@test.com", source: "oauth", refreshToken: "token2" },
            { email: "third@test.com", source: "oauth", refreshToken: "token3" },
          ]);
          getTokenForAccount = vi.fn().mockResolvedValue("access-token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-id");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      // All accounts are exhausted with no reset timer
      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn().mockResolvedValue({
          claudePool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
          geminiProPool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
          geminiFlashPool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
        }),
      }));

      // Track triggerQuotaResetApi calls
      const mockTriggerQuotaResetApiLocal = vi.fn().mockResolvedValue({
        successCount: 3,
        failureCount: 0,
        groupsTriggered: [],
      });
      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: mockTriggerQuotaResetApiLocal,
      }));

      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh, getAccountRefreshStates: getAccountRefreshStatesFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      await startAutoRefreshFresh();

      // Should have triggered for all 3 accounts (all exhausted, no reset timer)
      expect(mockTriggerQuotaResetApiLocal).toHaveBeenCalledTimes(3);

      // Verify all 3 accounts were tracked
      const states = getAccountRefreshStatesFresh();
      expect(states).toHaveLength(3);
      expect(states.map((s) => s.email)).toEqual(["first@test.com", "second@test.com", "third@test.com"]);

      stopAutoRefreshFresh();
    });

    it("skips accounts that have remaining quota", async () => {
      vi.resetModules();

      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([
            { email: "exhausted@test.com", source: "oauth", refreshToken: "token1" },
            { email: "has-quota@test.com", source: "oauth", refreshToken: "token2" },
          ]);
          getTokenForAccount = vi.fn().mockResolvedValue("access-token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-id");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      // First account exhausted, second has quota
      let callCount = 0;
      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              claudePool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
              geminiProPool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
              geminiFlashPool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
            });
          }
          return Promise.resolve({
            claudePool: { aggregatedPercentage: 80, earliestReset: null, models: [] },
            geminiProPool: { aggregatedPercentage: 50, earliestReset: null, models: [] },
            geminiFlashPool: { aggregatedPercentage: 50, earliestReset: null, models: [] },
          });
        }),
      }));

      const mockTriggerQuotaResetApiLocal = vi.fn().mockResolvedValue({
        successCount: 3,
        failureCount: 0,
        groupsTriggered: [],
      });
      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: mockTriggerQuotaResetApiLocal,
      }));

      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh, getAccountRefreshStates: getAccountRefreshStatesFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      await startAutoRefreshFresh();

      // Should only trigger for the exhausted account
      expect(mockTriggerQuotaResetApiLocal).toHaveBeenCalledTimes(1);

      // Verify account states - one exhausted (pending_reset after trigger), one ok
      const states = getAccountRefreshStatesFresh();
      expect(states).toHaveLength(2);

      const exhaustedState = states.find((s) => s.email === "exhausted@test.com");
      const quotaState = states.find((s) => s.email === "has-quota@test.com");

      expect(exhaustedState?.status).toBe("pending_reset");
      expect(quotaState?.status).toBe("ok");
      expect(quotaState?.claudePercentage).toBe(80);

      stopAutoRefreshFresh();
    });

    it("skips accounts that already have reset timer running", async () => {
      vi.resetModules();

      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([{ email: "pending@test.com", source: "oauth", refreshToken: "token1" }]);
          getTokenForAccount = vi.fn().mockResolvedValue("access-token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-id");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      // Account exhausted but has reset timer running
      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn().mockResolvedValue({
          claudePool: { aggregatedPercentage: 0, earliestReset: "2025-01-01T10:00:00Z", models: [] },
          geminiProPool: { aggregatedPercentage: 0, earliestReset: "2025-01-01T10:00:00Z", models: [] },
          geminiFlashPool: { aggregatedPercentage: 0, earliestReset: "2025-01-01T10:00:00Z", models: [] },
        }),
      }));

      const mockTriggerQuotaResetApiLocal = vi.fn().mockResolvedValue({
        successCount: 3,
        failureCount: 0,
        groupsTriggered: [],
      });
      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: mockTriggerQuotaResetApiLocal,
      }));

      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh, getAccountRefreshStates: getAccountRefreshStatesFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      await startAutoRefreshFresh();

      // Should NOT trigger - reset timer already running
      expect(mockTriggerQuotaResetApiLocal).not.toHaveBeenCalled();

      // Verify account state reflects pending_reset
      const states = getAccountRefreshStatesFresh();
      expect(states).toHaveLength(1);
      expect(states[0].status).toBe("pending_reset");
      expect(states[0].claudeResetTime).toBe("2025-01-01T10:00:00Z");

      stopAutoRefreshFresh();
    });

    it("triggers pre-warming when account is at 100% quota with stale reset timer", async () => {
      vi.resetModules();

      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([{ email: "prewarm@test.com", source: "oauth", refreshToken: "token1" }]);
          getTokenForAccount = vi.fn().mockResolvedValue("access-token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-id");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      // Account at 100% with stale reset timers (previous cycle completed)
      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn().mockResolvedValue({
          claudePool: { aggregatedPercentage: 100, earliestReset: "2026-01-09T09:00:00Z", models: [] },
          geminiProPool: { aggregatedPercentage: 100, earliestReset: "2026-01-09T09:00:00Z", models: [] },
          geminiFlashPool: { aggregatedPercentage: 100, earliestReset: "2026-01-09T09:00:00Z", models: [] },
        }),
      }));

      const mockTriggerQuotaResetApiLocal = vi.fn().mockResolvedValue({
        successCount: 3,
        failureCount: 0,
        groupsTriggered: [],
      });
      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: mockTriggerQuotaResetApiLocal,
      }));

      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh, getAccountRefreshStates: getAccountRefreshStatesFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      await startAutoRefreshFresh();

      // Should TRIGGER - pre-warming at 100% even though reset timer shows
      expect(mockTriggerQuotaResetApiLocal).toHaveBeenCalledTimes(1);

      // Verify account state
      const states = getAccountRefreshStatesFresh();
      expect(states).toHaveLength(1);
      expect(states[0].claudePercentage).toBe(100);
      expect(states[0].geminiProPercentage).toBe(100);
      expect(states[0].geminiFlashPercentage).toBe(100);

      stopAutoRefreshFresh();
    });

    it("triggers pre-warming when one pool at 100% while other is in use", async () => {
      vi.resetModules();

      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([{ email: "partial@test.com", source: "oauth", refreshToken: "token1" }]);
          getTokenForAccount = vi.fn().mockResolvedValue("access-token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-id");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      // Claude at 100%, Gemini pools at 50%
      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn().mockResolvedValue({
          claudePool: { aggregatedPercentage: 100, earliestReset: null, models: [] },
          geminiProPool: { aggregatedPercentage: 50, earliestReset: null, models: [] },
          geminiFlashPool: { aggregatedPercentage: 50, earliestReset: null, models: [] },
        }),
      }));

      const mockTriggerQuotaResetApiLocal = vi.fn().mockResolvedValue({
        successCount: 3,
        failureCount: 0,
        groupsTriggered: [],
      });
      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: mockTriggerQuotaResetApiLocal,
      }));

      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      await startAutoRefreshFresh();

      // Should TRIGGER - Claude at 100% needs pre-warming
      expect(mockTriggerQuotaResetApiLocal).toHaveBeenCalledTimes(1);

      stopAutoRefreshFresh();
    });

    it("triggers pre-warming when one pool at 100% while other is waiting for reset", async () => {
      vi.resetModules();

      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([{ email: "mixed@test.com", source: "oauth", refreshToken: "token1" }]);
          getTokenForAccount = vi.fn().mockResolvedValue("access-token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-id");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      // Claude at 0% waiting for reset, Gemini pools at 100% (fresh)
      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn().mockResolvedValue({
          claudePool: { aggregatedPercentage: 0, earliestReset: "2026-01-09T12:00:00Z", models: [] },
          geminiProPool: { aggregatedPercentage: 100, earliestReset: null, models: [] },
          geminiFlashPool: { aggregatedPercentage: 100, earliestReset: null, models: [] },
        }),
      }));

      const mockTriggerQuotaResetApiLocal = vi.fn().mockResolvedValue({
        successCount: 3,
        failureCount: 0,
        groupsTriggered: [],
      });
      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: mockTriggerQuotaResetApiLocal,
      }));

      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh, getAccountRefreshStates: getAccountRefreshStatesFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      await startAutoRefreshFresh();

      // Should TRIGGER - Gemini at 100% needs pre-warming even though Claude is waiting
      expect(mockTriggerQuotaResetApiLocal).toHaveBeenCalledTimes(1);

      // Status should be pending_reset (Claude is waiting)
      const states = getAccountRefreshStatesFresh();
      expect(states[0].status).toBe("pending_reset");

      stopAutoRefreshFresh();
    });
  });

  describe("getAccountRefreshStates", () => {
    it("returns tracked account states after refresh", async () => {
      vi.resetModules();

      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([{ email: "test@example.com", source: "oauth", refreshToken: "token" }]);
          getTokenForAccount = vi.fn().mockResolvedValue("access-token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-id");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: vi.fn().mockResolvedValue({
          successCount: 3,
          failureCount: 0,
          groupsTriggered: [],
        }),
      }));

      // Account has remaining quota
      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn().mockResolvedValue({
          claudePool: { aggregatedPercentage: 50, earliestReset: null, models: [] },
          geminiProPool: { aggregatedPercentage: 75, earliestReset: null, models: [] },
          geminiFlashPool: { aggregatedPercentage: 80, earliestReset: null, models: [] },
        }),
      }));

      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh, getAccountRefreshStates: getAccountRefreshStatesFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      await startAutoRefreshFresh();

      const states = getAccountRefreshStatesFresh();
      expect(states).toHaveLength(1);
      expect(states[0].email).toBe("test@example.com");
      expect(states[0].claudePercentage).toBe(50);
      expect(states[0].geminiProPercentage).toBe(75);
      expect(states[0].geminiFlashPercentage).toBe(80);
      expect(states[0].status).toBe("ok");

      stopAutoRefreshFresh();
    });

    it("returns empty array when not started", async () => {
      vi.resetModules();

      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([]);
          getTokenForAccount = vi.fn();
          getProjectForAccount = vi.fn();
          triggerQuotaReset = vi.fn();
        }
        return { AccountManager: MockAccountManager };
      });

      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: vi.fn(),
      }));

      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn(),
      }));

      const { getAccountRefreshStates: getAccountRefreshStatesFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      const states = getAccountRefreshStatesFresh();
      expect(states).toHaveLength(0);
    });
  });

  describe("getLastRefreshTime", () => {
    it("returns null when no successful refresh has occurred", async () => {
      vi.resetModules();

      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([]);
          getTokenForAccount = vi.fn();
          getProjectForAccount = vi.fn();
          triggerQuotaReset = vi.fn();
        }
        return { AccountManager: MockAccountManager };
      });

      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: vi.fn(),
      }));

      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn(),
      }));

      const { getLastRefreshTime: getLastRefreshTimeFresh, stopAutoRefresh: stopAutoRefreshFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      expect(getLastRefreshTimeFresh()).toBeNull();

      stopAutoRefreshFresh();
    });

    it("returns timestamp after successful refresh", async () => {
      vi.resetModules();

      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([{ email: "test@example.com", source: "oauth", refreshToken: "token" }]);
          getTokenForAccount = vi.fn().mockResolvedValue("access-token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-id");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: vi.fn().mockResolvedValue({
          successCount: 3,
          failureCount: 0,
          groupsTriggered: [],
        }),
      }));

      // Account exhausted, needs refresh
      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn().mockResolvedValue({
          claudePool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
          geminiProPool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
          geminiFlashPool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
        }),
      }));

      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh, getLastRefreshTime: getLastRefreshTimeFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      const beforeStart = Date.now();
      await startAutoRefreshFresh();

      const lastRefresh = getLastRefreshTimeFresh();
      expect(lastRefresh).not.toBeNull();
      expect(lastRefresh).toBeGreaterThanOrEqual(beforeStart);

      stopAutoRefreshFresh();
    });
  });

  describe("getMillisUntilNextAligned", () => {
    it("returns 0 when already at aligned time (:00)", () => {
      // Set time to exactly 3:00:00.000
      vi.setSystemTime(new Date("2026-01-09T03:00:00.000Z"));
      const intervalMs = 5 * 60 * 1000; // 5 minutes

      expect(getMillisUntilNextAligned(intervalMs)).toBe(0);
    });

    it("returns 0 when already at aligned time (:05)", () => {
      vi.setSystemTime(new Date("2026-01-09T03:05:00.000Z"));
      const intervalMs = 5 * 60 * 1000;

      expect(getMillisUntilNextAligned(intervalMs)).toBe(0);
    });

    it("returns 0 when already at aligned time (:55)", () => {
      vi.setSystemTime(new Date("2026-01-09T03:55:00.000Z"));
      const intervalMs = 5 * 60 * 1000;

      expect(getMillisUntilNextAligned(intervalMs)).toBe(0);
    });

    it("returns time until next :05 when at :03", () => {
      vi.setSystemTime(new Date("2026-01-09T03:03:00.000Z"));
      const intervalMs = 5 * 60 * 1000;

      // At 3:03, next aligned is 3:05 = 2 minutes away
      expect(getMillisUntilNextAligned(intervalMs)).toBe(2 * 60 * 1000);
    });

    it("returns time until next :10 when at :07", () => {
      vi.setSystemTime(new Date("2026-01-09T03:07:00.000Z"));
      const intervalMs = 5 * 60 * 1000;

      // At 3:07, next aligned is 3:10 = 3 minutes away
      expect(getMillisUntilNextAligned(intervalMs)).toBe(3 * 60 * 1000);
    });

    it("returns time until next :00 (hour boundary) when at :58", () => {
      vi.setSystemTime(new Date("2026-01-09T03:58:00.000Z"));
      const intervalMs = 5 * 60 * 1000;

      // At 3:58, next aligned is 4:00 = 2 minutes away
      expect(getMillisUntilNextAligned(intervalMs)).toBe(2 * 60 * 1000);
    });

    it("handles seconds and milliseconds correctly", () => {
      // At 3:03:30.500
      vi.setSystemTime(new Date("2026-01-09T03:03:30.500Z"));
      const intervalMs = 5 * 60 * 1000;

      // Next aligned is 3:05:00.000 = 1 min 29.5 seconds away
      expect(getMillisUntilNextAligned(intervalMs)).toBe(1 * 60 * 1000 + 29 * 1000 + 500);
    });

    it("works with 10-minute interval", () => {
      vi.setSystemTime(new Date("2026-01-09T03:17:00.000Z"));
      const intervalMs = 10 * 60 * 1000;

      // At 3:17, next aligned is 3:20 = 3 minutes away
      expect(getMillisUntilNextAligned(intervalMs)).toBe(3 * 60 * 1000);
    });

    it("returns 0 for 10-minute interval at aligned time", () => {
      vi.setSystemTime(new Date("2026-01-09T03:20:00.000Z"));
      const intervalMs = 10 * 60 * 1000;

      expect(getMillisUntilNextAligned(intervalMs)).toBe(0);
    });
  });

  describe("clock-aligned scheduling", () => {
    it("waits until next aligned time before first interval check", async () => {
      vi.resetModules();

      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([{ email: "test@example.com", source: "oauth", refreshToken: "token" }]);
          getTokenForAccount = vi.fn().mockResolvedValue("access-token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-id");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn().mockResolvedValue({
          claudePool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
          geminiProPool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
          geminiFlashPool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
        }),
      }));

      const mockTrigger = vi.fn().mockResolvedValue({
        successCount: 3,
        failureCount: 0,
        groupsTriggered: [],
      });
      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: mockTrigger,
      }));

      // Set time to 3:17 - next aligned 5-min interval is 3:20 (3 minutes away)
      vi.setSystemTime(new Date("2026-01-09T03:17:00.000Z"));

      const { startAutoRefresh: startFresh, stopAutoRefresh: stopFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      await startFresh();

      // Initial trigger happens immediately
      expect(mockTrigger).toHaveBeenCalledTimes(1);

      // Advance 2 minutes - still before aligned time
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
      expect(mockTrigger).toHaveBeenCalledTimes(1);

      // Advance 1 more minute to reach 3:20 (aligned time)
      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(mockTrigger).toHaveBeenCalledTimes(2);

      // Then advance another 5 minutes to 3:25
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockTrigger).toHaveBeenCalledTimes(3);

      stopFresh();
    });

    it("starts interval immediately when already at aligned time", async () => {
      vi.resetModules();

      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([{ email: "test@example.com", source: "oauth", refreshToken: "token" }]);
          getTokenForAccount = vi.fn().mockResolvedValue("access-token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-id");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn().mockResolvedValue({
          claudePool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
          geminiProPool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
          geminiFlashPool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
        }),
      }));

      const mockTrigger = vi.fn().mockResolvedValue({
        successCount: 3,
        failureCount: 0,
        groupsTriggered: [],
      });
      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: mockTrigger,
      }));

      // Set time to exactly 3:15 - already at aligned time
      vi.setSystemTime(new Date("2026-01-09T03:15:00.000Z"));

      const { startAutoRefresh: startFresh, stopAutoRefresh: stopFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      await startFresh();

      // Initial trigger
      expect(mockTrigger).toHaveBeenCalledTimes(1);

      // Advance 5 minutes to 3:20
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockTrigger).toHaveBeenCalledTimes(2);

      // Advance another 5 minutes to 3:25
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockTrigger).toHaveBeenCalledTimes(3);

      stopFresh();
    });
  });

  describe("isTimerStale", () => {
    it("returns false when currentResetTime is null", () => {
      const now = Date.now();
      const prevFetchedAt = now - 10 * 60 * 1000; // 10 minutes ago

      expect(isTimerStale(null, "2026-01-09T10:00:00Z", now, prevFetchedAt)).toBe(false);
    });

    it("returns false when prevResetTime is null", () => {
      const now = Date.now();
      const prevFetchedAt = now - 10 * 60 * 1000;

      expect(isTimerStale("2026-01-09T10:00:00Z", null, now, prevFetchedAt)).toBe(false);
    });

    it("returns false when prevFetchedAt is null", () => {
      const now = Date.now();

      expect(isTimerStale("2026-01-09T10:00:00Z", "2026-01-09T10:10:00Z", now, null)).toBe(false);
    });

    it("returns false when timer is actively ticking (same absolute resetTime, time remaining decreases)", () => {
      const now = Date.now();
      const elapsed = 10 * 60 * 1000; // 10 minutes
      const prevFetchedAt = now - elapsed;

      // Active timer: absolute resetTime is the SAME at both fetch points
      // At prevFetchedAt: reset in 5 hours
      // At now (10 min later): reset in 4:50 (same absolute time)
      const resetTime = new Date(now + 5 * 60 * 60 * 1000).toISOString();

      // Both fetches return the same absolute resetTime
      expect(isTimerStale(resetTime, resetTime, now, prevFetchedAt)).toBe(false);
    });

    it("returns true when timer is stale (absolute resetTime jumped forward, indicating new cycle)", () => {
      const now = Date.now();
      const elapsed = 10 * 60 * 1000; // 10 minutes
      const prevFetchedAt = now - elapsed;

      // Stale scenario: resetTime jumped forward (new timer started)
      // This means the previous timer was stale/completed
      const prevResetTime = new Date(now + 2 * 60 * 60 * 1000).toISOString(); // 2 hours from now
      const currentResetTime = new Date(now + 5 * 60 * 60 * 1000).toISOString(); // 5 hours from now (jumped 3 hours)

      expect(isTimerStale(currentResetTime, prevResetTime, now, prevFetchedAt)).toBe(true);
    });

    it("returns true when timer is stale (absolute resetTime changed unexpectedly)", () => {
      const now = Date.now();
      const elapsed = 10 * 60 * 1000; // 10 minutes
      const prevFetchedAt = now - elapsed;

      // Previous timer showed 5 hours remaining at prevFetchedAt
      const prevResetTime = new Date(prevFetchedAt + 5 * 60 * 60 * 1000).toISOString();
      // Current timer shows a completely different time (jumped back 2 hours)
      const currentResetTime = new Date(prevFetchedAt + 3 * 60 * 60 * 1000).toISOString();

      expect(isTimerStale(currentResetTime, prevResetTime, now, prevFetchedAt)).toBe(true);
    });

    it("returns false when time remaining decrease is within tolerance (60s)", () => {
      const now = Date.now();
      const elapsed = 10 * 60 * 1000; // 10 minutes
      const prevFetchedAt = now - elapsed;

      // Same absolute reset time = time remaining decreases by exactly elapsed time
      const resetTime = new Date(now + 4 * 60 * 60 * 1000).toISOString();

      expect(isTimerStale(resetTime, resetTime, now, prevFetchedAt)).toBe(false);
    });

    it("returns true when time remaining decrease differs by more than tolerance", () => {
      const now = Date.now();
      const elapsed = 10 * 60 * 1000; // 10 minutes
      const prevFetchedAt = now - elapsed;

      // Previous: reset in 5 hours from prevFetchedAt = (prevFetchedAt + 5h)
      const prevResetTime = new Date(prevFetchedAt + 5 * 60 * 60 * 1000).toISOString();
      // Current: reset time moved 3 minutes forward (not expected for active timer)
      const currentResetTime = new Date(prevFetchedAt + 5 * 60 * 60 * 1000 + 3 * 60 * 1000).toISOString();

      // prevTimeRemaining = 5 hours
      // currentTimeRemaining = (prevFetchedAt + 5h + 3min) - now = (prevFetchedAt + 5h + 3min) - (prevFetchedAt + 10min) = 5h - 7min
      // actualDecrease = 5h - (5h - 7min) = 7min
      // expectedDecrease = 10min
      // diff = |7min - 10min| = 3min > 60s tolerance => stale

      expect(isTimerStale(currentResetTime, prevResetTime, now, prevFetchedAt)).toBe(true);
    });
  });

  describe("stale timer detection integration", () => {
    it("detects stale timer when absolute resetTime jumps unexpectedly", async () => {
      vi.resetModules();

      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([{ email: "stale@test.com", source: "oauth", refreshToken: "token1" }]);
          getTokenForAccount = vi.fn().mockResolvedValue("access-token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-id");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      // Stale scenario: reset time jumps forward by 3 hours between fetches
      // This indicates the old timer completed and a new one started
      let fetchCount = 0;
      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn().mockImplementation(() => {
          fetchCount++;
          if (fetchCount === 1) {
            // First fetch: timer shows 2 hours remaining
            return Promise.resolve({
              claudePool: { aggregatedPercentage: 100, earliestReset: "2026-01-09T12:00:00Z", models: [] },
              geminiProPool: { aggregatedPercentage: 100, earliestReset: "2026-01-09T12:00:00Z", models: [] },
              geminiFlashPool: { aggregatedPercentage: 100, earliestReset: "2026-01-09T12:00:00Z", models: [] },
            });
          }
          // Second fetch: timer jumped to 5 hours (new timer started, old was stale)
          return Promise.resolve({
            claudePool: { aggregatedPercentage: 100, earliestReset: "2026-01-09T15:00:00Z", models: [] },
            geminiProPool: { aggregatedPercentage: 100, earliestReset: "2026-01-09T15:00:00Z", models: [] },
            geminiFlashPool: { aggregatedPercentage: 100, earliestReset: "2026-01-09T15:00:00Z", models: [] },
          });
        }),
      }));

      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: vi.fn().mockResolvedValue({
          successCount: 3,
          failureCount: 0,
          groupsTriggered: [],
        }),
      }));

      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh, getAccountRefreshStates: getAccountRefreshStatesFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      // Set time to an aligned time so interval starts immediately
      vi.setSystemTime(new Date("2026-01-09T10:00:00.000Z"));

      // First refresh
      await startAutoRefreshFresh();

      // Advance time and trigger second refresh (5-minute interval)
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      // Check states - after second refresh, stale detection should kick in
      const states = getAccountRefreshStatesFresh();
      expect(states).toHaveLength(1);

      // After second refresh with jumped resetTime, timer should be detected as stale
      expect(states[0].isClaudeTimerStale).toBe(true);
      expect(states[0].isGeminiProTimerStale).toBe(true);
      expect(states[0].isGeminiFlashTimerStale).toBe(true);

      stopAutoRefreshFresh();
    });

    it("does not mark timer as stale when absolute resetTime stays same (active countdown)", async () => {
      vi.resetModules();

      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([{ email: "active@test.com", source: "oauth", refreshToken: "token1" }]);
          getTokenForAccount = vi.fn().mockResolvedValue("access-token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-id");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      // Active countdown: absolute reset time stays the SAME
      // Time remaining decreases naturally as time passes
      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn().mockResolvedValue({
          claudePool: { aggregatedPercentage: 0, earliestReset: "2026-01-09T15:00:00Z", models: [] },
          geminiProPool: { aggregatedPercentage: 0, earliestReset: "2026-01-09T15:00:00Z", models: [] },
          geminiFlashPool: { aggregatedPercentage: 0, earliestReset: "2026-01-09T15:00:00Z", models: [] },
        }),
      }));

      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: vi.fn().mockResolvedValue({
          successCount: 3,
          failureCount: 0,
          groupsTriggered: [],
        }),
      }));

      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh, getAccountRefreshStates: getAccountRefreshStatesFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      // Set time to an aligned time so interval starts immediately
      vi.setSystemTime(new Date("2026-01-09T10:00:00.000Z"));

      // First refresh
      await startAutoRefreshFresh();

      // Advance time and trigger second refresh (5-minute interval)
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      // Check states - timer should NOT be stale because absolute time stayed same
      const states = getAccountRefreshStatesFresh();
      expect(states).toHaveLength(1);
      expect(states[0].isClaudeTimerStale).toBe(false);
      expect(states[0].isGeminiProTimerStale).toBe(false);
      expect(states[0].isGeminiFlashTimerStale).toBe(false);

      stopAutoRefreshFresh();
    });

    it("tracks previous reset times and fetchedAt correctly", async () => {
      vi.resetModules();

      vi.doMock("../../../src/utils/logger.js", () => ({
        getLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock("../../../src/account-manager/index.js", () => {
        class MockAccountManager {
          initialize = vi.fn().mockResolvedValue(undefined);
          getAllAccounts = vi.fn().mockReturnValue([{ email: "tracking@test.com", source: "oauth", refreshToken: "token1" }]);
          getTokenForAccount = vi.fn().mockResolvedValue("access-token");
          getProjectForAccount = vi.fn().mockResolvedValue("project-id");
          triggerQuotaReset = vi.fn().mockReturnValue({ limitsCleared: 0, accountsAffected: 0 });
        }
        return { AccountManager: MockAccountManager };
      });

      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn().mockResolvedValue({
          claudePool: { aggregatedPercentage: 50, earliestReset: "2026-01-09T15:00:00Z", models: [] },
          geminiProPool: { aggregatedPercentage: 50, earliestReset: "2026-01-09T16:00:00Z", models: [] },
          geminiFlashPool: { aggregatedPercentage: 50, earliestReset: null, models: [] },
        }),
      }));

      vi.doMock("../../../src/cloudcode/quota-reset-trigger.js", () => ({
        triggerQuotaResetApi: vi.fn().mockResolvedValue({
          successCount: 0,
          failureCount: 0,
          groupsTriggered: [],
        }),
      }));

      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh, getAccountRefreshStates: getAccountRefreshStatesFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      // Set time to an aligned time so interval starts immediately
      vi.setSystemTime(new Date("2026-01-09T10:00:00.000Z"));

      await startAutoRefreshFresh();

      // First refresh - should have current data but no previous
      let states = getAccountRefreshStatesFresh();
      expect(states).toHaveLength(1);
      expect(states[0].fetchedAt).not.toBeNull();
      expect(states[0].claudeResetTime).toBe("2026-01-09T15:00:00Z");
      expect(states[0].prevClaudeResetTime).toBeNull(); // No previous on first fetch
      expect(states[0].prevFetchedAt).toBeNull();

      const firstFetchedAt = states[0].fetchedAt;

      // Advance time and trigger second refresh (5-minute interval)
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      // Second refresh - should have previous data populated
      states = getAccountRefreshStatesFresh();
      expect(states[0].fetchedAt).toBeGreaterThan(firstFetchedAt!);
      expect(states[0].prevClaudeResetTime).toBe("2026-01-09T15:00:00Z");
      expect(states[0].prevGeminiProResetTime).toBe("2026-01-09T16:00:00Z");
      expect(states[0].prevGeminiFlashResetTime).toBeNull();
      expect(states[0].prevFetchedAt).toBe(firstFetchedAt);

      stopAutoRefreshFresh();
    });
  });
});
