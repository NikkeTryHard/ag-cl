/**
 * Unit tests for accounts-clear command
 *
 * Tests the accountsClearCommand function including:
 * - Server running check
 * - Empty accounts case
 * - Warning display with account list
 * - First confirmation flow
 * - Double confirmation (DELETE typing)
 * - Successful clearing
 * - Cancellation at each step
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => ({
  intro: vi.fn(),
  outro: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  logMessage: vi.fn(),
  spinnerStart: vi.fn(),
  spinnerStop: vi.fn(),
  spinner: vi.fn(),
  confirm: vi.fn(),
  text: vi.fn(),
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
    message: mocks.logMessage,
    info: vi.fn(),
    success: vi.fn(),
  },
  spinner: mocks.spinner,
  confirm: mocks.confirm,
  text: mocks.text,
  cancel: mocks.cancel,
  isCancel: mocks.isCancel,
}));

vi.mock("picocolors", () => ({
  default: {
    red: (text: string) => `RED:${text}`,
    green: (text: string) => `GREEN:${text}`,
    yellow: (text: string) => `YELLOW:${text}`,
    dim: (text: string) => `DIM:${text}`,
  },
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
    bullet: "*",
  },
}));

// Must import after mocks are set up
import { accountsClearCommand } from "../../../../src/cli/commands/accounts-clear.js";

describe("accountsClearCommand", () => {
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

      await expect(accountsClearCommand()).rejects.toThrow("process.exit called");

      expect(mocks.intro).toHaveBeenCalledWith("Clear All Accounts");
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

      await accountsClearCommand();

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

      await accountsClearCommand();

      expect(mocks.logWarn).toHaveBeenCalledWith("[W] No accounts configured.");
      expect(mocks.outro).toHaveBeenCalledWith("Nothing to clear.");
      expect(mocks.confirm).not.toHaveBeenCalled();
    });
  });

  describe("Warning display with account list", () => {
    it("should display warning with account count and list all accounts", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          { email: "acc1@example.com", source: "oauth" },
          { email: "acc2@example.com", source: "oauth" },
          { email: "acc3@example.com", source: "database" },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.confirm.mockResolvedValue(false);

      await accountsClearCommand();

      expect(mocks.logWarn).toHaveBeenCalledWith("RED:This will remove 3 account(s):");
      expect(mocks.logMessage).toHaveBeenCalledWith("* acc1@example.com");
      expect(mocks.logMessage).toHaveBeenCalledWith("* acc2@example.com");
      expect(mocks.logMessage).toHaveBeenCalledWith("* acc3@example.com");
    });
  });

  describe("First confirmation flow", () => {
    it("should prompt for first confirmation", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [{ email: "test@example.com", source: "oauth" }],
        settings: {},
        activeIndex: 0,
      });
      mocks.confirm.mockResolvedValue(false);

      await accountsClearCommand();

      expect(mocks.confirm).toHaveBeenCalledWith({
        message: "Are you sure you want to remove ALL accounts?",
        initialValue: false,
      });
    });

    it("should handle first confirmation cancellation", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [{ email: "test@example.com", source: "oauth" }],
        settings: {},
        activeIndex: 0,
      });
      mocks.confirm.mockResolvedValue(Symbol("cancel"));
      mocks.isCancel.mockImplementation((value) => typeof value === "symbol");

      await expect(accountsClearCommand()).rejects.toThrow("process.exit called");

      expect(mocks.cancel).toHaveBeenCalledWith("Operation cancelled.");
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it("should exit when first confirmation is declined", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [{ email: "test@example.com", source: "oauth" }],
        settings: {},
        activeIndex: 0,
      });
      mocks.confirm.mockResolvedValue(false);

      await accountsClearCommand();

      expect(mocks.outro).toHaveBeenCalledWith("Clear cancelled.");
      expect(mocks.text).not.toHaveBeenCalled();
      expect(mocks.saveAccounts).not.toHaveBeenCalled();
    });
  });

  describe("Double confirmation (DELETE typing)", () => {
    it("should prompt to type DELETE after first confirmation", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [{ email: "test@example.com", source: "oauth" }],
        settings: {},
        activeIndex: 0,
      });
      mocks.confirm.mockResolvedValue(true);
      mocks.text.mockResolvedValue("DELETE");
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsClearCommand();

      expect(mocks.text).toHaveBeenCalledWith({
        message: expect.stringContaining("DELETE"),
        validate: expect.any(Function),
      });
    });

    it("should validate DELETE input", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [{ email: "test@example.com", source: "oauth" }],
        settings: {},
        activeIndex: 0,
      });
      mocks.confirm.mockResolvedValue(true);

      mocks.text.mockImplementation(async (options: { validate: (value: string) => string | undefined }) => {
        const validateFn = options.validate;

        // Test invalid input
        expect(validateFn("delete")).toBe('You must type exactly "DELETE" to confirm.');
        expect(validateFn("DELET")).toBe('You must type exactly "DELETE" to confirm.');
        expect(validateFn("")).toBe('You must type exactly "DELETE" to confirm.');

        // Test valid input
        expect(validateFn("DELETE")).toBeUndefined();

        return "DELETE";
      });

      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsClearCommand();

      expect(mocks.text).toHaveBeenCalled();
    });

    it("should handle DELETE input cancellation", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [{ email: "test@example.com", source: "oauth" }],
        settings: {},
        activeIndex: 0,
      });
      mocks.confirm.mockResolvedValue(true);
      mocks.text.mockResolvedValue(Symbol("cancel"));
      mocks.isCancel.mockImplementation((value) => typeof value === "symbol");

      await expect(accountsClearCommand()).rejects.toThrow("process.exit called");

      expect(mocks.cancel).toHaveBeenCalledWith("Operation cancelled.");
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe("Successful clearing", () => {
    it("should clear all accounts and save empty array", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          { email: "acc1@example.com", source: "oauth" },
          { email: "acc2@example.com", source: "oauth" },
        ],
        settings: { someSetting: true },
        activeIndex: 1,
      });
      mocks.confirm.mockResolvedValue(true);
      mocks.text.mockResolvedValue("DELETE");
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsClearCommand();

      expect(mocks.spinnerStart).toHaveBeenCalledWith("Clearing all accounts...");
      expect(mocks.saveAccounts).toHaveBeenCalledWith("/mock/config/path", [], { someSetting: true }, 0);
      expect(mocks.spinnerStop).toHaveBeenCalledWith("[S] Cleared 2 account(s)");
      expect(mocks.outro).toHaveBeenCalledWith("All accounts have been removed.");
    });

    it("should preserve settings while clearing accounts", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [{ email: "test@example.com", source: "oauth" }],
        settings: { cooldownDurationMs: 30000, customSetting: "value" },
        activeIndex: 0,
      });
      mocks.confirm.mockResolvedValue(true);
      mocks.text.mockResolvedValue("DELETE");
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsClearCommand();

      expect(mocks.saveAccounts).toHaveBeenCalledWith(
        "/mock/config/path",
        [],
        { cooldownDurationMs: 30000, customSetting: "value" },
        0
      );
    });
  });

  describe("Single account clearing", () => {
    it("should correctly handle clearing single account", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.loadAccounts.mockResolvedValue({
        accounts: [{ email: "only@example.com", source: "oauth" }],
        settings: {},
        activeIndex: 0,
      });
      mocks.confirm.mockResolvedValue(true);
      mocks.text.mockResolvedValue("DELETE");
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsClearCommand();

      expect(mocks.logWarn).toHaveBeenCalledWith("RED:This will remove 1 account(s):");
      expect(mocks.logMessage).toHaveBeenCalledWith("* only@example.com");
      expect(mocks.spinnerStop).toHaveBeenCalledWith("[S] Cleared 1 account(s)");
    });
  });
});
