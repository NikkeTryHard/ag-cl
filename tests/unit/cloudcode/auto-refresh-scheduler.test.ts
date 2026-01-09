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
    geminiPool: { aggregatedPercentage: 100, earliestReset: null },
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

import { startAutoRefresh, stopAutoRefresh, isAutoRefreshRunning, getNextRefreshTime, getLastRefreshTime, getAccountRefreshStates } from "../../../src/cloudcode/auto-refresh-scheduler.js";
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
      await startAutoRefresh();
      expect(triggerQuotaResetApi).toHaveBeenCalledTimes(1);

      // Advance time by 10 minutes (the new check interval)
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

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
      await startAutoRefresh();
      stopAutoRefresh();

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

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
          geminiPool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
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
              geminiPool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
            });
          }
          return Promise.resolve({
            claudePool: { aggregatedPercentage: 80, earliestReset: null, models: [] },
            geminiPool: { aggregatedPercentage: 50, earliestReset: null, models: [] },
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
          geminiPool: { aggregatedPercentage: 0, earliestReset: "2025-01-01T10:00:00Z", models: [] },
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
          geminiPool: { aggregatedPercentage: 100, earliestReset: "2026-01-09T09:00:00Z", models: [] },
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
      expect(states[0].geminiPercentage).toBe(100);

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

      // Claude at 100%, Gemini at 50%
      vi.doMock("../../../src/cloudcode/quota-api.js", () => ({
        fetchAccountCapacity: vi.fn().mockResolvedValue({
          claudePool: { aggregatedPercentage: 100, earliestReset: null, models: [] },
          geminiPool: { aggregatedPercentage: 50, earliestReset: null, models: [] },
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
          geminiPool: { aggregatedPercentage: 75, earliestReset: null, models: [] },
        }),
      }));

      const { startAutoRefresh: startAutoRefreshFresh, stopAutoRefresh: stopAutoRefreshFresh, getAccountRefreshStates: getAccountRefreshStatesFresh } = await import("../../../src/cloudcode/auto-refresh-scheduler.js");

      await startAutoRefreshFresh();

      const states = getAccountRefreshStatesFresh();
      expect(states).toHaveLength(1);
      expect(states[0].email).toBe("test@example.com");
      expect(states[0].claudePercentage).toBe(50);
      expect(states[0].geminiPercentage).toBe(75);
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
          geminiPool: { aggregatedPercentage: 0, earliestReset: null, models: [] },
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
});
