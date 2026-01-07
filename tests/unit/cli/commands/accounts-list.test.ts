/**
 * Unit tests for accounts-list command
 *
 * Tests the accountsListCommand function including:
 * - Empty accounts case
 * - OAuth account capacity fetching
 * - Non-OAuth account handling
 * - Error handling (token refresh failures, API failures)
 * - JSON output mode
 * - Snapshot recording and burn rate calculation
 * - Summary display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => ({
  // ora spinner mocks
  spinnerStart: vi.fn(),
  spinnerSucceed: vi.fn(),
  spinnerFail: vi.fn(),
  ora: vi.fn(),

  // Storage mocks
  loadAccounts: vi.fn(),

  // OAuth mocks
  refreshAccessToken: vi.fn(),

  // Quota API mocks
  fetchAccountCapacity: vi.fn(),

  // Quota storage mocks
  initQuotaStorage: vi.fn(),
  recordSnapshot: vi.fn(),
  closeQuotaStorage: vi.fn(),

  // Burn rate mocks
  calculateBurnRate: vi.fn(),

  // Renderer mocks
  renderAccountCapacity: vi.fn(),
  renderCapacitySummary: vi.fn(),

  // UI mocks
  sectionHeader: vi.fn(),
}));

// Set up ora mock - returns a spinner instance
mocks.ora.mockReturnValue({
  start: mocks.spinnerStart.mockReturnThis(),
  succeed: mocks.spinnerSucceed.mockReturnThis(),
  fail: mocks.spinnerFail.mockReturnThis(),
});

vi.mock("ora", () => ({
  default: mocks.ora,
}));

vi.mock("picocolors", () => ({
  default: {
    green: (text: string) => `GREEN:${text}`,
    yellow: (text: string) => `YELLOW:${text}`,
    red: (text: string) => `RED:${text}`,
    bold: (text: string) => `BOLD:${text}`,
    dim: (text: string) => `DIM:${text}`,
    cyan: (text: string) => `CYAN:${text}`,
    magenta: (text: string) => `MAGENTA:${text}`,
  },
}));

vi.mock("../../../../src/account-manager/storage.js", () => ({
  loadAccounts: mocks.loadAccounts,
}));

vi.mock("../../../../src/auth/oauth.js", () => ({
  refreshAccessToken: mocks.refreshAccessToken,
}));

vi.mock("../../../../src/cloudcode/quota-api.js", () => ({
  fetchAccountCapacity: mocks.fetchAccountCapacity,
}));

vi.mock("../../../../src/cloudcode/quota-storage.js", () => ({
  initQuotaStorage: mocks.initQuotaStorage,
  recordSnapshot: mocks.recordSnapshot,
  closeQuotaStorage: mocks.closeQuotaStorage,
}));

vi.mock("../../../../src/cloudcode/burn-rate.js", () => ({
  calculateBurnRate: mocks.calculateBurnRate,
}));

vi.mock("../../../../src/cli/capacity-renderer.js", () => ({
  renderAccountCapacity: mocks.renderAccountCapacity,
  renderCapacitySummary: mocks.renderCapacitySummary,
}));

vi.mock("../../../../src/constants.js", () => ({
  ACCOUNT_CONFIG_PATH: "/mock/config/path",
}));

vi.mock("../../../../src/cli/ui.js", () => ({
  symbols: {
    error: "[E]",
    success: "[S]",
    warning: "[W]",
    info: "[I]",
  },
  sectionHeader: mocks.sectionHeader,
}));

// Mock console.log for output capture
const originalConsoleLog = console.log;
const mockConsoleLog = vi.fn();

// Must import after mocks are set up
import { accountsListCommand } from "../../../../src/cli/commands/accounts-list.js";

describe("accountsListCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.log = mockConsoleLog;

    // Reset ora mock
    mocks.ora.mockReturnValue({
      start: mocks.spinnerStart.mockReturnThis(),
      succeed: mocks.spinnerSucceed.mockReturnThis(),
      fail: mocks.spinnerFail.mockReturnThis(),
    });

    // Default mock implementations
    mocks.sectionHeader.mockReturnValue("=== Account Capacity ===");
    mocks.renderAccountCapacity.mockReturnValue("RENDERED_ACCOUNT");
    mocks.renderCapacitySummary.mockReturnValue("RENDERED_SUMMARY");
    mocks.calculateBurnRate.mockReturnValue({
      ratePerHour: null,
      hoursToExhaustion: null,
      status: "calculating",
    });
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  describe("Empty accounts case", () => {
    it("should display warning and exit when no accounts configured", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });

      await accountsListCommand();

      expect(mocks.sectionHeader).toHaveBeenCalledWith("Account Capacity");
      expect(mockConsoleLog).toHaveBeenCalledWith("[W] No accounts configured. Run 'accounts add' to add an account.");
      expect(mockConsoleLog).toHaveBeenCalledWith("DIM:Nothing to display");
      expect(mocks.closeQuotaStorage).toHaveBeenCalled();
      expect(mocks.fetchAccountCapacity).not.toHaveBeenCalled();
    });

    it("should output JSON structure when no accounts and --json flag", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });

      await accountsListCommand({ json: true });

      expect(mocks.sectionHeader).not.toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalled();

      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(jsonOutput).toEqual({
        accounts: [],
        summary: {
          total: 0,
          successful: 0,
          failed: 0,
          combinedClaudeCapacity: 0,
          combinedGeminiCapacity: 0,
        },
      });
    });
  });

  describe("Quota storage initialization", () => {
    it("should initialize quota storage at startup", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });

      await accountsListCommand();

      expect(mocks.initQuotaStorage).toHaveBeenCalled();
    });

    it("should continue if quota storage initialization fails", async () => {
      // Also need to mock console.error for this test
      const originalConsoleError = console.error;
      const mockConsoleError = vi.fn();
      console.error = mockConsoleError;

      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });
      mocks.initQuotaStorage.mockImplementation(() => {
        throw new Error("SQLite error");
      });

      await expect(accountsListCommand()).resolves.not.toThrow();

      expect(mockConsoleError).toHaveBeenCalledWith("[E] Failed to initialize quota storage: SQLite error");

      console.error = originalConsoleError;
    });

    it("should close quota storage on exit", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });

      await accountsListCommand();

      expect(mocks.closeQuotaStorage).toHaveBeenCalled();
    });
  });

  describe("OAuth account capacity fetching", () => {
    const mockCapacity = {
      email: "test@example.com",
      tier: "PRO" as const,
      claudePool: {
        models: [{ name: "claude-sonnet-4-5", percentage: 75, resetTime: null }],
        aggregatedPercentage: 75,
        earliestReset: null,
      },
      geminiPool: {
        models: [{ name: "gemini-3-flash", percentage: 50, resetTime: null }],
        aggregatedPercentage: 50,
        earliestReset: null,
      },
      projectId: "project-123",
      lastUpdated: Date.now(),
      isForbidden: false,
    };

    it("should fetch capacity for OAuth accounts", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "test@example.com",
            source: "oauth",
            refreshToken: "1//valid-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockResolvedValue({ accessToken: "access-token", expiresIn: 3600 });
      mocks.fetchAccountCapacity.mockResolvedValue(mockCapacity);

      await accountsListCommand();

      expect(mocks.spinnerStart).toHaveBeenCalledWith("Fetching capacity for test@example.com...");
      expect(mocks.refreshAccessToken).toHaveBeenCalledWith("1//valid-token");
      expect(mocks.fetchAccountCapacity).toHaveBeenCalledWith("access-token", "test@example.com");
      expect(mocks.spinnerSucceed).toHaveBeenCalledWith("test@example.com");
    });

    it("should record snapshots for burn rate tracking", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "test@example.com",
            source: "oauth",
            refreshToken: "1//valid-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockResolvedValue({ accessToken: "access-token", expiresIn: 3600 });
      mocks.fetchAccountCapacity.mockResolvedValue(mockCapacity);

      await accountsListCommand();

      expect(mocks.recordSnapshot).toHaveBeenCalledWith("test@example.com", "claude", 75);
      expect(mocks.recordSnapshot).toHaveBeenCalledWith("test@example.com", "gemini", 50);
    });

    it("should calculate burn rates for each pool", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "test@example.com",
            source: "oauth",
            refreshToken: "1//valid-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockResolvedValue({ accessToken: "access-token", expiresIn: 3600 });
      mocks.fetchAccountCapacity.mockResolvedValue(mockCapacity);

      await accountsListCommand();

      expect(mocks.calculateBurnRate).toHaveBeenCalledWith("test@example.com", "claude", 75, null);
      expect(mocks.calculateBurnRate).toHaveBeenCalledWith("test@example.com", "gemini", 50, null);
    });

    it("should render account capacity with burn rates", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "test@example.com",
            source: "oauth",
            refreshToken: "1//valid-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockResolvedValue({ accessToken: "access-token", expiresIn: 3600 });
      mocks.fetchAccountCapacity.mockResolvedValue(mockCapacity);
      mocks.calculateBurnRate.mockReturnValue({
        ratePerHour: 5,
        hoursToExhaustion: 15,
        status: "burning",
      });

      await accountsListCommand();

      expect(mocks.renderAccountCapacity).toHaveBeenCalledWith(mockCapacity, {
        claude: expect.objectContaining({ status: "burning" }),
        gemini: expect.objectContaining({ status: "burning" }),
      });
    });
  });

  describe("Non-OAuth account handling", () => {
    it("should skip non-OAuth accounts", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "database@example.com",
            source: "database",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });

      await accountsListCommand();

      expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
      expect(mocks.fetchAccountCapacity).not.toHaveBeenCalled();
      // Should still show error for non-OAuth account
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining("database@example.com"));
    });

    it("should skip OAuth accounts without refresh token", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "notoken@example.com",
            source: "oauth",
            // No refreshToken
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });

      await accountsListCommand();

      expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
      expect(mocks.fetchAccountCapacity).not.toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    it("should handle token refresh failure", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "expired@example.com",
            source: "oauth",
            refreshToken: "1//expired-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockRejectedValue(new Error("invalid_grant: Token revoked"));

      await accountsListCommand();

      expect(mocks.spinnerFail).toHaveBeenCalledWith("expired@example.com - Token expired or revoked");
      expect(mocks.fetchAccountCapacity).not.toHaveBeenCalled();
    });

    it("should handle API fetch failure", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "test@example.com",
            source: "oauth",
            refreshToken: "1//valid-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockResolvedValue({ accessToken: "access-token", expiresIn: 3600 });
      mocks.fetchAccountCapacity.mockRejectedValue(new Error("API error"));

      await accountsListCommand();

      expect(mocks.spinnerFail).toHaveBeenCalledWith("test@example.com - API error");
    });

    it("should continue processing other accounts after failure", async () => {
      const mockCapacity = {
        email: "valid@example.com",
        tier: "PRO" as const,
        claudePool: { models: [], aggregatedPercentage: 100, earliestReset: null },
        geminiPool: { models: [], aggregatedPercentage: 100, earliestReset: null },
        projectId: null,
        lastUpdated: Date.now(),
        isForbidden: false,
      };

      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "expired@example.com",
            source: "oauth",
            refreshToken: "1//expired-token",
            modelRateLimits: {},
            lastUsed: null,
          },
          {
            email: "valid@example.com",
            source: "oauth",
            refreshToken: "1//valid-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockRejectedValueOnce(new Error("invalid_grant")).mockResolvedValueOnce({ accessToken: "access-token", expiresIn: 3600 });
      mocks.fetchAccountCapacity.mockResolvedValue(mockCapacity);

      await accountsListCommand();

      expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(2);
      expect(mocks.fetchAccountCapacity).toHaveBeenCalledTimes(1);
      expect(mocks.fetchAccountCapacity).toHaveBeenCalledWith("access-token", "valid@example.com");
    });

    it("should ignore snapshot recording errors", async () => {
      const mockCapacity = {
        email: "test@example.com",
        tier: "PRO" as const,
        claudePool: { models: [], aggregatedPercentage: 100, earliestReset: null },
        geminiPool: { models: [], aggregatedPercentage: 100, earliestReset: null },
        projectId: null,
        lastUpdated: Date.now(),
        isForbidden: false,
      };

      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "test@example.com",
            source: "oauth",
            refreshToken: "1//valid-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockResolvedValue({ accessToken: "access-token", expiresIn: 3600 });
      mocks.fetchAccountCapacity.mockResolvedValue(mockCapacity);
      mocks.recordSnapshot.mockImplementation(() => {
        throw new Error("SQLite error");
      });

      await expect(accountsListCommand()).resolves.not.toThrow();

      // Should still render the account despite snapshot error
      expect(mocks.renderAccountCapacity).toHaveBeenCalled();
    });
  });

  describe("JSON output mode", () => {
    const mockCapacity = {
      email: "test@example.com",
      tier: "PRO" as const,
      claudePool: {
        models: [{ name: "claude-sonnet-4-5", percentage: 75, resetTime: null }],
        aggregatedPercentage: 75,
        earliestReset: null,
      },
      geminiPool: {
        models: [{ name: "gemini-3-flash", percentage: 50, resetTime: null }],
        aggregatedPercentage: 50,
        earliestReset: null,
      },
      projectId: "project-123",
      lastUpdated: Date.now(),
      isForbidden: false,
    };

    it("should not use prompts/spinners in JSON mode", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "test@example.com",
            source: "oauth",
            refreshToken: "1//valid-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockResolvedValue({ accessToken: "access-token", expiresIn: 3600 });
      mocks.fetchAccountCapacity.mockResolvedValue(mockCapacity);

      await accountsListCommand({ json: true });

      expect(mocks.sectionHeader).not.toHaveBeenCalled();
      expect(mocks.ora).not.toHaveBeenCalled();
      expect(mocks.spinnerStart).not.toHaveBeenCalled();
      expect(mocks.spinnerSucceed).not.toHaveBeenCalled();
    });

    it("should output valid JSON with account capacities", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "test@example.com",
            source: "oauth",
            refreshToken: "1//valid-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockResolvedValue({ accessToken: "access-token", expiresIn: 3600 });
      mocks.fetchAccountCapacity.mockResolvedValue(mockCapacity);

      await accountsListCommand({ json: true });

      expect(mockConsoleLog).toHaveBeenCalled();
      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);

      expect(jsonOutput.accounts).toHaveLength(1);
      expect(jsonOutput.accounts[0].email).toBe("test@example.com");
      expect(jsonOutput.accounts[0].capacity).toEqual(mockCapacity);
      expect(jsonOutput.accounts[0].burnRates).toBeDefined();
      expect(jsonOutput.accounts[0].error).toBeNull();
    });

    it("should include summary in JSON output", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "test@example.com",
            source: "oauth",
            refreshToken: "1//valid-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockResolvedValue({ accessToken: "access-token", expiresIn: 3600 });
      mocks.fetchAccountCapacity.mockResolvedValue(mockCapacity);

      await accountsListCommand({ json: true });

      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);

      expect(jsonOutput.summary).toEqual({
        total: 1,
        successful: 1,
        failed: 0,
        combinedClaudeCapacity: 75,
        combinedGeminiCapacity: 50,
      });
    });

    it("should include errors in JSON output", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "expired@example.com",
            source: "oauth",
            refreshToken: "1//expired-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockRejectedValue(new Error("invalid_grant: Token revoked"));

      await accountsListCommand({ json: true });

      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);

      expect(jsonOutput.accounts[0].email).toBe("expired@example.com");
      expect(jsonOutput.accounts[0].capacity).toBeNull();
      expect(jsonOutput.accounts[0].error).toBe("Token expired or revoked");
      expect(jsonOutput.summary.failed).toBe(1);
    });
  });

  describe("Summary display", () => {
    const mockCapacity = {
      email: "test@example.com",
      tier: "PRO" as const,
      claudePool: { models: [], aggregatedPercentage: 100, earliestReset: null },
      geminiPool: { models: [], aggregatedPercentage: 100, earliestReset: null },
      projectId: null,
      lastUpdated: Date.now(),
      isForbidden: false,
    };

    it("should render summary at the end", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "test@example.com",
            source: "oauth",
            refreshToken: "1//valid-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockResolvedValue({ accessToken: "access-token", expiresIn: 3600 });
      mocks.fetchAccountCapacity.mockResolvedValue(mockCapacity);

      await accountsListCommand();

      // renderCapacitySummary now takes both capacities and burn rates
      expect(mocks.renderCapacitySummary).toHaveBeenCalledWith(
        [mockCapacity],
        expect.arrayContaining([
          expect.objectContaining({
            claude: expect.any(Object),
            gemini: expect.any(Object),
          }),
        ]),
      );
    });

    it("should display success count in footer", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "test@example.com",
            source: "oauth",
            refreshToken: "1//valid-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockResolvedValue({ accessToken: "access-token", expiresIn: 3600 });
      mocks.fetchAccountCapacity.mockResolvedValue(mockCapacity);

      await accountsListCommand();

      expect(mockConsoleLog).toHaveBeenCalledWith("DIM:1/1 accounts fetched successfully");
    });

    it("should warn about errors and suggest verify command", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "expired@example.com",
            source: "oauth",
            refreshToken: "1//expired-token",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockRejectedValue(new Error("invalid_grant"));

      await accountsListCommand();

      expect(mockConsoleLog).toHaveBeenCalledWith("[W] 1 account(s) had errors. Run 'accounts verify' to check token status.");
    });
  });

  describe("Multiple accounts", () => {
    it("should process all accounts and aggregate capacities", async () => {
      const mockCapacity1 = {
        email: "user1@example.com",
        tier: "PRO" as const,
        claudePool: { models: [], aggregatedPercentage: 100, earliestReset: null },
        geminiPool: { models: [], aggregatedPercentage: 50, earliestReset: null },
        projectId: null,
        lastUpdated: Date.now(),
        isForbidden: false,
      };
      const mockCapacity2 = {
        email: "user2@example.com",
        tier: "ULTRA" as const,
        claudePool: { models: [], aggregatedPercentage: 75, earliestReset: null },
        geminiPool: { models: [], aggregatedPercentage: 100, earliestReset: null },
        projectId: null,
        lastUpdated: Date.now(),
        isForbidden: false,
      };

      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "user1@example.com",
            source: "oauth",
            refreshToken: "1//token1",
            modelRateLimits: {},
            lastUsed: null,
          },
          {
            email: "user2@example.com",
            source: "oauth",
            refreshToken: "1//token2",
            modelRateLimits: {},
            lastUsed: null,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.refreshAccessToken.mockResolvedValue({ accessToken: "access-token", expiresIn: 3600 });
      mocks.fetchAccountCapacity.mockResolvedValueOnce(mockCapacity1).mockResolvedValueOnce(mockCapacity2);

      await accountsListCommand({ json: true });

      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);

      expect(jsonOutput.summary.total).toBe(2);
      expect(jsonOutput.summary.successful).toBe(2);
      expect(jsonOutput.summary.combinedClaudeCapacity).toBe(175); // 100 + 75
      expect(jsonOutput.summary.combinedGeminiCapacity).toBe(150); // 50 + 100
    });
  });
});
