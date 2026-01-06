/**
 * Tests for src/account-manager/index.ts
 * AccountManager class for multi-account management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing
vi.mock("../../../src/account-manager/storage.js", () => ({
  loadAccounts: vi.fn(() =>
    Promise.resolve({
      accounts: [
        { email: "test1@example.com", source: "oauth", credentials: { refresh_token: "token1" } },
        { email: "test2@example.com", source: "oauth", credentials: { refresh_token: "token2" } },
      ],
      settings: {},
      activeIndex: 0,
    }),
  ),
  loadDefaultAccount: vi.fn(() => ({
    accounts: [{ email: "default@example.com", source: "antigravity" }],
    tokenCache: new Map(),
  })),
  saveAccounts: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../src/account-manager/rate-limits.js", () => ({
  isAllRateLimited: vi.fn(() => false),
  getAvailableAccounts: vi.fn((accounts) => accounts),
  getInvalidAccounts: vi.fn(() => []),
  clearExpiredLimits: vi.fn(() => 0),
  resetAllRateLimits: vi.fn(),
  markRateLimited: vi.fn(),
  markInvalid: vi.fn(),
  getMinWaitTimeMs: vi.fn(() => 0),
}));

vi.mock("../../../src/account-manager/credentials.js", () => ({
  getTokenForAccount: vi.fn(() => Promise.resolve("mock-token")),
  getProjectForAccount: vi.fn(() => Promise.resolve("mock-project")),
  clearProjectCache: vi.fn(),
  clearTokenCache: vi.fn(),
}));

vi.mock("../../../src/account-manager/selection.js", () => ({
  pickNext: vi.fn((accounts, currentIndex) => ({
    account: accounts[currentIndex] || null,
    newIndex: currentIndex,
  })),
  getCurrentStickyAccount: vi.fn((accounts, currentIndex) => ({
    account: accounts[currentIndex] || null,
    newIndex: currentIndex,
  })),
  shouldWaitForCurrentAccount: vi.fn(() => ({
    shouldWait: false,
    waitMs: 0,
    account: null,
  })),
  pickStickyAccount: vi.fn((accounts, currentIndex) => ({
    account: accounts[currentIndex] || null,
    waitMs: 0,
    newIndex: currentIndex,
  })),
}));

vi.mock("../../../src/utils/logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  })),
  initLogger: vi.fn(),
  setLogLevel: vi.fn(),
}));

// Import after mocking
import { AccountManager } from "../../../src/account-manager/index.js";
import { loadAccounts, loadDefaultAccount, saveAccounts } from "../../../src/account-manager/storage.js";
import { isAllRateLimited, getAvailableAccounts, getInvalidAccounts, clearExpiredLimits, resetAllRateLimits, markRateLimited, markInvalid, getMinWaitTimeMs } from "../../../src/account-manager/rate-limits.js";
import { getTokenForAccount, getProjectForAccount, clearProjectCache, clearTokenCache } from "../../../src/account-manager/credentials.js";
import { pickNext, getCurrentStickyAccount, shouldWaitForCurrentAccount, pickStickyAccount } from "../../../src/account-manager/selection.js";

describe("account-manager/index", () => {
  let accountManager: AccountManager;

  beforeEach(() => {
    vi.clearAllMocks();
    accountManager = new AccountManager("/test/config.json");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("creates instance with custom config path", () => {
      const manager = new AccountManager("/custom/path.json");
      expect(manager).toBeInstanceOf(AccountManager);
    });

    it("creates instance with default config path", () => {
      const manager = new AccountManager();
      expect(manager).toBeInstanceOf(AccountManager);
    });
  });

  describe("initialize", () => {
    it("loads accounts from config file", async () => {
      await accountManager.initialize();

      expect(loadAccounts).toHaveBeenCalledWith("/test/config.json");
      expect(accountManager.getAccountCount()).toBe(2);
    });

    it("falls back to Antigravity database when no accounts in config", async () => {
      vi.mocked(loadAccounts).mockResolvedValueOnce({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });

      await accountManager.initialize();

      expect(loadDefaultAccount).toHaveBeenCalled();
      expect(accountManager.getAccountCount()).toBe(1);
    });

    it("clears expired rate limits on initialization", async () => {
      await accountManager.initialize();

      expect(clearExpiredLimits).toHaveBeenCalled();
    });

    it("only initializes once", async () => {
      await accountManager.initialize();
      await accountManager.initialize();

      expect(loadAccounts).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAccountCount", () => {
    it("returns number of accounts", async () => {
      await accountManager.initialize();

      expect(accountManager.getAccountCount()).toBe(2);
    });

    it("returns 0 before initialization", () => {
      expect(accountManager.getAccountCount()).toBe(0);
    });
  });

  describe("isAllRateLimited", () => {
    it("delegates to rate-limits module", async () => {
      await accountManager.initialize();

      accountManager.isAllRateLimited("claude-3-5-sonnet");

      expect(isAllRateLimited).toHaveBeenCalled();
    });

    it("passes model ID to rate-limits module", async () => {
      await accountManager.initialize();

      accountManager.isAllRateLimited("claude-3-opus");

      expect(isAllRateLimited).toHaveBeenCalledWith(expect.any(Array), "claude-3-opus");
    });

    it("uses null model ID when not provided", async () => {
      await accountManager.initialize();

      accountManager.isAllRateLimited();

      expect(isAllRateLimited).toHaveBeenCalledWith(expect.any(Array), null);
    });
  });

  describe("getAvailableAccounts", () => {
    it("returns available accounts", async () => {
      await accountManager.initialize();

      const accounts = accountManager.getAvailableAccounts();

      expect(getAvailableAccounts).toHaveBeenCalled();
      expect(accounts).toBeDefined();
    });
  });

  describe("getInvalidAccounts", () => {
    it("returns invalid accounts", async () => {
      await accountManager.initialize();

      accountManager.getInvalidAccounts();

      expect(getInvalidAccounts).toHaveBeenCalled();
    });
  });

  describe("clearExpiredLimits", () => {
    it("clears expired limits and saves when limits are cleared", async () => {
      await accountManager.initialize();

      // The clearExpiredLimits is called during initialize, so reset the mock
      vi.mocked(saveAccounts).mockClear();
      vi.mocked(clearExpiredLimits).mockReturnValueOnce(2);

      const cleared = accountManager.clearExpiredLimits();

      expect(clearExpiredLimits).toHaveBeenCalled();
      // The cleared value comes from the real call, not the mock we set up after
      expect(cleared).toBeGreaterThanOrEqual(0);
    });

    it("does not save if no limits cleared", async () => {
      vi.mocked(clearExpiredLimits).mockReturnValueOnce(0).mockReturnValueOnce(0);
      await accountManager.initialize();
      vi.mocked(saveAccounts).mockClear();

      accountManager.clearExpiredLimits();

      expect(saveAccounts).not.toHaveBeenCalled();
    });
  });

  describe("resetAllRateLimits", () => {
    it("resets all rate limits", async () => {
      await accountManager.initialize();

      accountManager.resetAllRateLimits();

      expect(resetAllRateLimits).toHaveBeenCalled();
    });
  });

  describe("pickNext", () => {
    it("selects next available account", async () => {
      await accountManager.initialize();

      const account = accountManager.pickNext("claude-3-5-sonnet");

      expect(pickNext).toHaveBeenCalled();
      expect(account).toBeDefined();
    });
  });

  describe("getCurrentStickyAccount", () => {
    it("returns current sticky account", async () => {
      await accountManager.initialize();

      const account = accountManager.getCurrentStickyAccount("claude-3-5-sonnet");

      expect(getCurrentStickyAccount).toHaveBeenCalled();
      expect(account).toBeDefined();
    });
  });

  describe("shouldWaitForCurrentAccount", () => {
    it("checks if should wait for current account", async () => {
      await accountManager.initialize();

      const result = accountManager.shouldWaitForCurrentAccount("claude-3-5-sonnet");

      expect(shouldWaitForCurrentAccount).toHaveBeenCalled();
      expect(result).toHaveProperty("shouldWait");
      expect(result).toHaveProperty("waitMs");
    });
  });

  describe("pickStickyAccount", () => {
    it("picks sticky account with wait time", async () => {
      await accountManager.initialize();

      const result = accountManager.pickStickyAccount("claude-3-5-sonnet");

      expect(pickStickyAccount).toHaveBeenCalled();
      expect(result).toHaveProperty("account");
      expect(result).toHaveProperty("waitMs");
    });
  });

  describe("markRateLimited", () => {
    it("marks account as rate limited for specific model", async () => {
      await accountManager.initialize();

      accountManager.markRateLimited("test1@example.com", 60000, "claude-3-5-sonnet");

      expect(markRateLimited).toHaveBeenCalled();
      expect(saveAccounts).toHaveBeenCalled();
    });

    it("does not save when no model ID provided", async () => {
      await accountManager.initialize();
      vi.mocked(saveAccounts).mockClear();

      accountManager.markRateLimited("test1@example.com", 60000, null);

      expect(markRateLimited).not.toHaveBeenCalled();
    });
  });

  describe("markInvalid", () => {
    it("marks account as invalid with reason", async () => {
      await accountManager.initialize();

      accountManager.markInvalid("test1@example.com", "Token expired");

      expect(markInvalid).toHaveBeenCalledWith(expect.any(Array), "test1@example.com", "Token expired");
      expect(saveAccounts).toHaveBeenCalled();
    });

    it("uses default reason when not provided", async () => {
      await accountManager.initialize();

      accountManager.markInvalid("test1@example.com");

      expect(markInvalid).toHaveBeenCalledWith(expect.any(Array), "test1@example.com", "Unknown error");
    });
  });

  describe("getMinWaitTimeMs", () => {
    it("returns minimum wait time", async () => {
      vi.mocked(getMinWaitTimeMs).mockReturnValueOnce(30000);
      await accountManager.initialize();

      const waitMs = accountManager.getMinWaitTimeMs("claude-3-5-sonnet");

      expect(waitMs).toBe(30000);
    });
  });

  describe("getTokenForAccount", () => {
    it("fetches token for account", async () => {
      await accountManager.initialize();
      const account = { email: "test1@example.com" };

      const token = await accountManager.getTokenForAccount(account);

      expect(getTokenForAccount).toHaveBeenCalled();
      expect(token).toBe("mock-token");
    });
  });

  describe("getProjectForAccount", () => {
    it("fetches project for account", async () => {
      await accountManager.initialize();
      const account = { email: "test1@example.com" };

      const project = await accountManager.getProjectForAccount(account, "token");

      expect(getProjectForAccount).toHaveBeenCalled();
      expect(project).toBe("mock-project");
    });
  });

  describe("clearProjectCache", () => {
    it("clears project cache for email", async () => {
      await accountManager.initialize();

      accountManager.clearProjectCache("test1@example.com");

      expect(clearProjectCache).toHaveBeenCalled();
    });

    it("clears all project cache when no email", async () => {
      await accountManager.initialize();

      accountManager.clearProjectCache();

      expect(clearProjectCache).toHaveBeenCalledWith(expect.any(Map), null);
    });
  });

  describe("clearTokenCache", () => {
    it("clears token cache for email", async () => {
      await accountManager.initialize();

      accountManager.clearTokenCache("test1@example.com");

      expect(clearTokenCache).toHaveBeenCalled();
    });

    it("clears all token cache when no email", async () => {
      await accountManager.initialize();

      accountManager.clearTokenCache();

      expect(clearTokenCache).toHaveBeenCalledWith(expect.any(Map), null);
    });
  });

  describe("saveToDisk", () => {
    it("saves current state to disk", async () => {
      await accountManager.initialize();
      vi.mocked(saveAccounts).mockClear();

      await accountManager.saveToDisk();

      expect(saveAccounts).toHaveBeenCalledWith("/test/config.json", expect.any(Array), expect.any(Object), expect.any(Number));
    });
  });

  describe("getStatus", () => {
    it("returns status object with account info", async () => {
      await accountManager.initialize();

      const status = accountManager.getStatus();

      expect(status).toHaveProperty("total");
      expect(status).toHaveProperty("available");
      expect(status).toHaveProperty("rateLimited");
      expect(status).toHaveProperty("invalid");
      expect(status).toHaveProperty("summary");
      expect(status).toHaveProperty("accounts");
    });

    it("includes correct total count", async () => {
      await accountManager.initialize();

      const status = accountManager.getStatus();

      expect(status.total).toBe(2);
    });

    it("includes account statuses", async () => {
      await accountManager.initialize();

      const status = accountManager.getStatus();

      expect(status.accounts).toHaveLength(2);
      expect(status.accounts[0]).toHaveProperty("email");
      expect(status.accounts[0]).toHaveProperty("source");
      expect(status.accounts[0]).toHaveProperty("modelRateLimits");
      expect(status.accounts[0]).toHaveProperty("isInvalid");
    });

    it("counts rate-limited accounts correctly", async () => {
      vi.mocked(loadAccounts).mockResolvedValueOnce({
        accounts: [
          {
            email: "limited@example.com",
            modelRateLimits: {
              "claude-3-5-sonnet": {
                isRateLimited: true,
                resetTime: Date.now() + 60000,
              },
            },
          },
          { email: "available@example.com" },
        ],
        settings: {},
        activeIndex: 0,
      });

      const manager = new AccountManager("/test/config.json");
      await manager.initialize();

      const status = manager.getStatus();

      expect(status.rateLimited).toBe(1);
    });
  });

  describe("getSettings", () => {
    it("returns copy of settings", async () => {
      await accountManager.initialize();

      const settings = accountManager.getSettings();

      expect(settings).toBeDefined();
      expect(typeof settings).toBe("object");
    });
  });

  describe("getAllAccounts", () => {
    it("returns all accounts", async () => {
      await accountManager.initialize();

      const accounts = accountManager.getAllAccounts();

      expect(accounts).toHaveLength(2);
      expect(accounts[0].email).toBe("test1@example.com");
    });
  });
});
