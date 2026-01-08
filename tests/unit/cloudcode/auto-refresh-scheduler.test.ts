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

import { startAutoRefresh, stopAutoRefresh, isAutoRefreshRunning, getNextRefreshTime } from "../../../src/cloudcode/auto-refresh-scheduler.js";
import { triggerQuotaResetApi } from "../../../src/cloudcode/quota-reset-trigger.js";

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

      // Advance time by 5 hours
      await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000);

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

      await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000);

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
});
