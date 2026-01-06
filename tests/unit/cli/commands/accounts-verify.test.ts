/**
 * Unit tests for accounts-verify command
 *
 * Tests the accountsVerifyCommand function including:
 * - Empty accounts case
 * - Valid/expired/error result tracking
 * - Non-OAuth account handling
 * - Account state updates
 * - Summary display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => ({
  intro: vi.fn(),
  outro: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  spinnerStart: vi.fn(),
  spinnerStop: vi.fn(),
  spinnerMessage: vi.fn(),
  spinner: vi.fn(),
  loadAccounts: vi.fn(),
  saveAccounts: vi.fn(),
  validateRefreshToken: vi.fn(),
  accountTable: vi.fn(() => "MOCK_TABLE"),
}));

// Set up spinner mock
mocks.spinner.mockReturnValue({
  start: mocks.spinnerStart,
  stop: mocks.spinnerStop,
  message: mocks.spinnerMessage,
});

vi.mock("@clack/prompts", () => ({
  intro: mocks.intro,
  outro: mocks.outro,
  log: {
    info: mocks.logInfo,
    warn: mocks.logWarn,
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  },
  spinner: mocks.spinner,
}));

vi.mock("picocolors", () => ({
  default: {
    green: (text: string) => `GREEN:${text}`,
    yellow: (text: string) => `YELLOW:${text}`,
    red: (text: string) => `RED:${text}`,
  },
}));

vi.mock("../../../../src/account-manager/storage.js", () => ({
  loadAccounts: mocks.loadAccounts,
  saveAccounts: mocks.saveAccounts,
}));

vi.mock("../../../../src/auth/oauth.js", () => ({
  validateRefreshToken: mocks.validateRefreshToken,
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
  accountTable: mocks.accountTable,
}));

// Mock console.log for table output
const originalConsoleLog = console.log;
const mockConsoleLog = vi.fn();

// Must import after mocks are set up
import { accountsVerifyCommand } from "../../../../src/cli/commands/accounts-verify.js";

describe("accountsVerifyCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.log = mockConsoleLog;
    // Reset spinner mock
    mocks.spinner.mockReturnValue({
      start: mocks.spinnerStart,
      stop: mocks.spinnerStop,
      message: mocks.spinnerMessage,
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

      await accountsVerifyCommand();

      expect(mocks.intro).toHaveBeenCalledWith("Verify Accounts");
      expect(mocks.logWarn).toHaveBeenCalledWith("[W] No accounts configured. Run 'accounts add' to add an account.");
      expect(mocks.outro).toHaveBeenCalledWith("Nothing to verify");
      expect(mocks.validateRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe("Valid account verification", () => {
    it("should verify valid OAuth account and mark as valid", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "valid@example.com",
            source: "oauth",
            refreshToken: "1//valid-token",
            modelRateLimits: {},
            lastUsed: Date.now() - 86400000,
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.validateRefreshToken.mockResolvedValue({
        email: "valid@example.com",
        accessToken: "new-access-token",
        refreshToken: "1//valid-token",
        projectId: null,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsVerifyCommand();

      expect(mocks.spinnerStart).toHaveBeenCalledWith("Checking valid@example.com...");
      expect(mocks.validateRefreshToken).toHaveBeenCalledWith("1//valid-token");
      expect(mocks.spinnerStop).toHaveBeenCalledWith("[S] valid@example.com - valid");
      expect(mocks.saveAccounts).toHaveBeenCalled();

      // Check that the account was updated with isInvalid: false
      const savedAccounts = mocks.saveAccounts.mock.calls[0][1];
      expect(savedAccounts[0].isInvalid).toBe(false);
      expect(savedAccounts[0].invalidReason).toBeNull();
    });

    it("should display summary with valid count", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          { email: "valid@example.com", source: "oauth", refreshToken: "1//token", modelRateLimits: {} },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.validateRefreshToken.mockResolvedValue({
        email: "valid@example.com",
        accessToken: "access-token",
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsVerifyCommand();

      expect(mocks.logInfo).toHaveBeenCalledWith(expect.stringContaining("Valid: 1"));
    });
  });

  describe("Expired account verification", () => {
    it("should handle invalid_grant error and mark as expired", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "expired@example.com",
            source: "oauth",
            refreshToken: "1//expired-token",
            modelRateLimits: {},
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.validateRefreshToken.mockRejectedValue(new Error("invalid_grant: Token has been revoked"));
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsVerifyCommand();

      expect(mocks.spinnerStop).toHaveBeenCalledWith("[E] expired@example.com - expired");

      // Check that the account was marked as invalid
      const savedAccounts = mocks.saveAccounts.mock.calls[0][1];
      expect(savedAccounts[0].isInvalid).toBe(true);
      expect(savedAccounts[0].invalidReason).toBe("Token expired or revoked");
      expect(savedAccounts[0].invalidAt).toBeDefined();
    });

    it("should display summary with expired count and hint", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          { email: "expired@example.com", source: "oauth", refreshToken: "1//token", modelRateLimits: {} },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.validateRefreshToken.mockRejectedValue(new Error("invalid_grant"));
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsVerifyCommand();

      expect(mocks.logInfo).toHaveBeenCalledWith(expect.stringContaining("Expired: 1"));
      expect(mocks.logWarn).toHaveBeenCalledWith("[W] Run 'accounts add' to re-authenticate expired accounts.");
    });
  });

  describe("Error account verification", () => {
    it("should handle generic error and mark as error", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "error@example.com",
            source: "oauth",
            refreshToken: "1//error-token",
            modelRateLimits: {},
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.validateRefreshToken.mockRejectedValue(new Error("Network error"));
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsVerifyCommand();

      expect(mocks.spinnerStop).toHaveBeenCalledWith("[E] error@example.com - error");

      // Check that the account was marked as invalid with error reason
      const savedAccounts = mocks.saveAccounts.mock.calls[0][1];
      expect(savedAccounts[0].isInvalid).toBe(true);
      expect(savedAccounts[0].invalidReason).toBe("Network error");
    });

    it("should display summary with error count", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          { email: "error@example.com", source: "oauth", refreshToken: "1//token", modelRateLimits: {} },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.validateRefreshToken.mockRejectedValue(new Error("Network error"));
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsVerifyCommand();

      expect(mocks.logInfo).toHaveBeenCalledWith(expect.stringContaining("Errors: 1"));
    });
  });

  describe("Non-OAuth account handling", () => {
    it("should skip non-OAuth accounts without refresh token", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "database@example.com",
            source: "database",
            modelRateLimits: {},
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsVerifyCommand();

      expect(mocks.validateRefreshToken).not.toHaveBeenCalled();
      expect(mocks.spinnerStart).not.toHaveBeenCalled();

      // Account should still be in results with error status
      expect(mocks.accountTable).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            email: "database@example.com",
            status: "unknown",
          }),
        ])
      );
    });

    it("should skip OAuth accounts without refresh token", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "notoken@example.com",
            source: "oauth",
            // No refreshToken
            modelRateLimits: {},
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsVerifyCommand();

      expect(mocks.validateRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe("Multiple accounts verification", () => {
    it("should verify all accounts and track results", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          { email: "valid@example.com", source: "oauth", refreshToken: "1//valid", modelRateLimits: {} },
          { email: "expired@example.com", source: "oauth", refreshToken: "1//expired", modelRateLimits: {} },
          { email: "error@example.com", source: "oauth", refreshToken: "1//error", modelRateLimits: {} },
          { email: "database@example.com", source: "database", modelRateLimits: {} },
        ],
        settings: {},
        activeIndex: 0,
      });

      mocks.validateRefreshToken
        .mockResolvedValueOnce({ email: "valid@example.com", accessToken: "token" })
        .mockRejectedValueOnce(new Error("invalid_grant"))
        .mockRejectedValueOnce(new Error("Network error"));

      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsVerifyCommand();

      expect(mocks.logInfo).toHaveBeenCalledWith("Found 4 account(s) to verify");
      expect(mocks.validateRefreshToken).toHaveBeenCalledTimes(3);

      // Check summary includes all counts
      expect(mocks.logInfo).toHaveBeenCalledWith(expect.stringMatching(/Valid: 1.*Expired: 1.*Errors: 2/));
    });
  });

  describe("Table display", () => {
    it("should display account table with correct status mapping", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          { email: "valid@example.com", source: "oauth", refreshToken: "1//valid", modelRateLimits: {}, lastUsed: Date.now() },
          { email: "expired@example.com", source: "oauth", refreshToken: "1//expired", modelRateLimits: {}, lastUsed: null },
        ],
        settings: {},
        activeIndex: 0,
      });

      mocks.validateRefreshToken
        .mockResolvedValueOnce({ email: "valid@example.com", accessToken: "token" })
        .mockRejectedValueOnce(new Error("invalid_grant"));

      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsVerifyCommand();

      expect(mocks.accountTable).toHaveBeenCalled();
      const tableData = mocks.accountTable.mock.calls[0][0];

      expect(tableData).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: "valid@example.com", status: "valid" }),
          expect.objectContaining({ email: "expired@example.com", status: "expired" }),
        ])
      );
    });

    it("should include lastUsed date in table data when available", async () => {
      const lastUsedTime = Date.now() - 86400000;
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          { email: "test@example.com", source: "oauth", refreshToken: "1//token", modelRateLimits: {}, lastUsed: lastUsedTime },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.validateRefreshToken.mockResolvedValue({ email: "test@example.com", accessToken: "token" });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsVerifyCommand();

      const tableData = mocks.accountTable.mock.calls[0][0];
      expect(tableData[0].lastUsed).toBeInstanceOf(Date);
      expect(tableData[0].lastUsed.getTime()).toBe(lastUsedTime);
    });
  });

  describe("Account state persistence", () => {
    it("should save updated account states after verification", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "test@example.com",
            source: "oauth",
            refreshToken: "1//token",
            isInvalid: true,
            invalidReason: "Previous error",
            modelRateLimits: {},
          },
        ],
        settings: { someSetting: true },
        activeIndex: 0,
      });
      mocks.validateRefreshToken.mockResolvedValue({
        email: "test@example.com",
        accessToken: "new-token",
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsVerifyCommand();

      expect(mocks.saveAccounts).toHaveBeenCalledWith(
        "/mock/config/path",
        expect.arrayContaining([
          expect.objectContaining({
            email: "test@example.com",
            isInvalid: false,
            invalidReason: null,
          }),
        ]),
        { someSetting: true },
        0
      );
    });
  });

  describe("No expired accounts hint", () => {
    it("should not show re-authenticate hint when no accounts are expired", async () => {
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          { email: "valid@example.com", source: "oauth", refreshToken: "1//token", modelRateLimits: {} },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.validateRefreshToken.mockResolvedValue({ email: "valid@example.com", accessToken: "token" });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsVerifyCommand();

      // Should not show the re-authenticate hint
      expect(mocks.logWarn).not.toHaveBeenCalledWith(expect.stringContaining("Run 'accounts add'"));
    });
  });
});
