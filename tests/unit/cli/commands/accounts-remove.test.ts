/**
 * Unit tests for accounts-remove command
 *
 * Tests the accountsRemoveCommand function including:
 * - Server running check
 * - Empty accounts case
 * - Multi-select with rate-limited display
 * - Empty selection handling
 * - Confirmation flow
 * - Partial selection removal
 * - Active index recalculation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => ({
  intro: vi.fn(),
  outro: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  logSuccess: vi.fn(),
  spinnerStart: vi.fn(),
  spinnerStop: vi.fn(),
  spinner: vi.fn(),
  multiselect: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(),
  isServerRunning: vi.fn(),
  loadAccounts: vi.fn(),
  saveAccounts: vi.fn(),
}));

// Set up spinner mock
mocks.spinner.mockReturnValue({
  start: mocks.spinnerStart,
  stop: mocks.spinnerStop,
});

vi.mock("@clack/prompts", () => ({
  intro: mocks.intro,
  outro: mocks.outro,
  log: {
    error: mocks.logError,
    warn: mocks.logWarn,
    success: mocks.logSuccess,
    info: vi.fn(),
    message: vi.fn(),
  },
  spinner: mocks.spinner,
  multiselect: mocks.multiselect,
  confirm: mocks.confirm,
  cancel: mocks.cancel,
  isCancel: mocks.isCancel,
}));

vi.mock("../../../../src/cli/utils.js", () => ({
  isServerRunning: mocks.isServerRunning,
}));

vi.mock("../../../../src/account-manager/storage.js", () => ({
  loadAccounts: mocks.loadAccounts,
  saveAccounts: mocks.saveAccounts,
}));

vi.mock("../../../../src/constants.js", () => ({
  ACCOUNT_CONFIG_PATH: "/mock/config/path",
  DEFAULT_PORT: 8080,
}));

vi.mock("../../../../src/cli/ui.js", () => ({
  symbols: {
    error: "[E]",
    success: "[S]",
    warning: "[W]",
    info: "[I]",
    arrow: "->",
    bullet: "*",
  },
  warn: (text: string) => `WARN:${text}`,
}));

// Must import after mocks are set up
import { accountsRemoveCommand } from "../../../../src/cli/commands/accounts-remove.js";

describe("accountsRemoveCommand", () => {
  let mockExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    mocks.isCancel.mockReturnValue(false);
    // Reset spinner mock
    mocks.spinner.mockReturnValue({
      start: mocks.spinnerStart,
      stop: mocks.spinnerStop,
    });
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  describe("Server running check", () => {
    it("should exit if server is running", async () => {
      mocks.isServerRunning.mockResolvedValue(true);

      await expect(accountsRemoveCommand()).rejects.toThrow("process.exit called");

      expect(mocks.intro).toHaveBeenCalledWith("Remove Accounts");
      expect(mocks.logError).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("should continue if server is not running", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });

      await accountsRemoveCommand();

      expect(mocks.isServerRunning).toHaveBeenCalledWith(8080);
      expect(mocks.loadAccounts).toHaveBeenCalled();
    });
  });

  describe("Empty accounts case", () => {
    it("should display warning and exit when no accounts configured", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });

      await accountsRemoveCommand();

      expect(mocks.logWarn).toHaveBeenCalledWith("[W] No accounts configured.");
      expect(mocks.outro).toHaveBeenCalledWith("Nothing to remove.");
      expect(mocks.multiselect).not.toHaveBeenCalled();
    });
  });

  describe("Multi-select with rate-limited display", () => {
    it("should display accounts with rate-limited hint", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "healthy@example.com",
            source: "oauth",
            modelRateLimits: {},
          },
          {
            email: "ratelimited@example.com",
            source: "oauth",
            modelRateLimits: {
              "claude-3-opus": { isRateLimited: true, resetTime: Date.now() + 60000 },
            },
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.multiselect.mockResolvedValue([]);

      await accountsRemoveCommand();

      expect(mocks.multiselect).toHaveBeenCalledWith({
        message: "Select accounts to remove:",
        options: [
          { value: "healthy@example.com", label: "healthy@example.com", hint: undefined },
          { value: "ratelimited@example.com", label: "ratelimited@example.com", hint: "WARN:rate-limited" },
        ],
        required: false,
      });
    });
  });

  describe("Empty selection handling", () => {
    it("should exit gracefully when no accounts selected", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [{ email: "test@example.com", source: "oauth", modelRateLimits: {} }],
        settings: {},
        activeIndex: 0,
      });
      mocks.multiselect.mockResolvedValue([]);

      await accountsRemoveCommand();

      expect(mocks.outro).toHaveBeenCalledWith("No accounts selected.");
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(mocks.saveAccounts).not.toHaveBeenCalled();
    });

    it("should handle multiselect cancellation", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [{ email: "test@example.com", source: "oauth", modelRateLimits: {} }],
        settings: {},
        activeIndex: 0,
      });
      mocks.multiselect.mockResolvedValue(Symbol("cancel"));
      mocks.isCancel.mockImplementation((value) => typeof value === "symbol");

      await expect(accountsRemoveCommand()).rejects.toThrow("process.exit called");

      expect(mocks.cancel).toHaveBeenCalledWith("Operation cancelled.");
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe("Confirmation flow", () => {
    it("should prompt for confirmation after selection", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          { email: "test1@example.com", source: "oauth", modelRateLimits: {} },
          { email: "test2@example.com", source: "oauth", modelRateLimits: {} },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.multiselect.mockResolvedValue(["test1@example.com"]);
      mocks.confirm.mockResolvedValue(true);
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsRemoveCommand();

      expect(mocks.confirm).toHaveBeenCalledWith({
        message: "Remove 1 account(s)?",
      });
    });

    it("should handle confirmation cancellation", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [{ email: "test@example.com", source: "oauth", modelRateLimits: {} }],
        settings: {},
        activeIndex: 0,
      });
      mocks.multiselect.mockResolvedValue(["test@example.com"]);
      mocks.confirm.mockResolvedValue(Symbol("cancel"));
      mocks.isCancel.mockImplementation((value) => typeof value === "symbol");

      await expect(accountsRemoveCommand()).rejects.toThrow("process.exit called");

      expect(mocks.cancel).toHaveBeenCalledWith("Operation cancelled.");
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it("should exit when confirmation is declined", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [{ email: "test@example.com", source: "oauth", modelRateLimits: {} }],
        settings: {},
        activeIndex: 0,
      });
      mocks.multiselect.mockResolvedValue(["test@example.com"]);
      mocks.confirm.mockResolvedValue(false);

      await accountsRemoveCommand();

      expect(mocks.outro).toHaveBeenCalledWith("Removal cancelled.");
      expect(mocks.saveAccounts).not.toHaveBeenCalled();
    });
  });

  describe("Partial selection removal", () => {
    it("should remove only selected accounts", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          { email: "keep@example.com", source: "oauth", modelRateLimits: {} },
          { email: "remove1@example.com", source: "oauth", modelRateLimits: {} },
          { email: "remove2@example.com", source: "oauth", modelRateLimits: {} },
        ],
        settings: { setting1: true },
        activeIndex: 0,
      });
      mocks.multiselect.mockResolvedValue(["remove1@example.com", "remove2@example.com"]);
      mocks.confirm.mockResolvedValue(true);
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsRemoveCommand();

      expect(mocks.saveAccounts).toHaveBeenCalledWith(
        "/mock/config/path",
        [expect.objectContaining({ email: "keep@example.com" })],
        { setting1: true },
        0
      );
      expect(mocks.spinnerStop).toHaveBeenCalledWith("[S] Removed 2 account(s)");
      expect(mocks.logSuccess).toHaveBeenCalledWith("[S] Removed: remove1@example.com");
      expect(mocks.logSuccess).toHaveBeenCalledWith("[S] Removed: remove2@example.com");
      expect(mocks.outro).toHaveBeenCalledWith("1 account(s) remaining.");
    });

    it("should remove all accounts when all selected", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          { email: "acc1@example.com", source: "oauth", modelRateLimits: {} },
          { email: "acc2@example.com", source: "oauth", modelRateLimits: {} },
        ],
        settings: {},
        activeIndex: 1,
      });
      mocks.multiselect.mockResolvedValue(["acc1@example.com", "acc2@example.com"]);
      mocks.confirm.mockResolvedValue(true);
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsRemoveCommand();

      expect(mocks.saveAccounts).toHaveBeenCalledWith("/mock/config/path", [], {}, 0);
      expect(mocks.outro).toHaveBeenCalledWith("0 account(s) remaining.");
    });
  });

  describe("Active index recalculation", () => {
    it("should recalculate active index when it exceeds remaining accounts", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          { email: "acc1@example.com", source: "oauth", modelRateLimits: {} },
          { email: "acc2@example.com", source: "oauth", modelRateLimits: {} },
          { email: "acc3@example.com", source: "oauth", modelRateLimits: {} },
        ],
        settings: {},
        activeIndex: 2, // Points to acc3
      });
      mocks.multiselect.mockResolvedValue(["acc2@example.com", "acc3@example.com"]);
      mocks.confirm.mockResolvedValue(true);
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsRemoveCommand();

      // After removing acc2 and acc3, only acc1 remains
      // activeIndex was 2, now should be clamped to 0
      expect(mocks.saveAccounts).toHaveBeenCalledWith(
        "/mock/config/path",
        [expect.objectContaining({ email: "acc1@example.com" })],
        {},
        0
      );
    });

    it("should preserve active index when still valid", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          { email: "acc1@example.com", source: "oauth", modelRateLimits: {} },
          { email: "acc2@example.com", source: "oauth", modelRateLimits: {} },
          { email: "acc3@example.com", source: "oauth", modelRateLimits: {} },
        ],
        settings: {},
        activeIndex: 0, // Points to acc1
      });
      mocks.multiselect.mockResolvedValue(["acc3@example.com"]);
      mocks.confirm.mockResolvedValue(true);
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsRemoveCommand();

      // After removing acc3, acc1 and acc2 remain
      // activeIndex 0 is still valid
      expect(mocks.saveAccounts).toHaveBeenCalledWith(
        "/mock/config/path",
        expect.arrayContaining([
          expect.objectContaining({ email: "acc1@example.com" }),
          expect.objectContaining({ email: "acc2@example.com" }),
        ]),
        {},
        0
      );
    });
  });

  describe("Rate-limited account detection", () => {
    it("should detect accounts with any model rate-limited", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "partial@example.com",
            source: "oauth",
            modelRateLimits: {
              "claude-3-opus": { isRateLimited: false, resetTime: null },
              "gemini-pro": { isRateLimited: true, resetTime: Date.now() + 60000 },
            },
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.multiselect.mockResolvedValue([]);

      await accountsRemoveCommand();

      expect(mocks.multiselect).toHaveBeenCalledWith({
        message: "Select accounts to remove:",
        options: [{ value: "partial@example.com", label: "partial@example.com", hint: "WARN:rate-limited" }],
        required: false,
      });
    });

    it("should not show hint when no models are rate-limited", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "healthy@example.com",
            source: "oauth",
            modelRateLimits: {
              "claude-3-opus": { isRateLimited: false, resetTime: null },
              "gemini-pro": { isRateLimited: false, resetTime: null },
            },
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.multiselect.mockResolvedValue([]);

      await accountsRemoveCommand();

      expect(mocks.multiselect).toHaveBeenCalledWith({
        message: "Select accounts to remove:",
        options: [{ value: "healthy@example.com", label: "healthy@example.com", hint: undefined }],
        required: false,
      });
    });
  });
});
