/**
 * Unit tests for accounts-add command
 *
 * Tests the accountsAddCommand function including:
 * - Server running check
 * - Auth method selection
 * - Refresh token flow (with env var and prompt input)
 * - OAuth flow (with browser and no-browser modes)
 * - Duplicate account handling
 * - Error handling (invalid_grant, etc.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => ({
  intro: vi.fn(),
  outro: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
  logMessage: vi.fn(),
  spinnerStart: vi.fn(),
  spinnerStop: vi.fn(),
  spinnerMessage: vi.fn(),
  spinner: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(),
  open: vi.fn(),
  isServerRunning: vi.fn(),
  loadAccounts: vi.fn(),
  saveAccounts: vi.fn(),
  getAuthorizationUrl: vi.fn(),
  startCallbackServer: vi.fn(),
  completeOAuthFlow: vi.fn(),
  validateRefreshToken: vi.fn(),
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
    error: mocks.logError,
    info: mocks.logInfo,
    message: mocks.logMessage,
    success: vi.fn(),
    warn: vi.fn(),
  },
  spinner: mocks.spinner,
  select: mocks.select,
  text: mocks.text,
  cancel: mocks.cancel,
  isCancel: mocks.isCancel,
}));

vi.mock("open", () => ({
  default: mocks.open,
}));

vi.mock("../../../../src/cli/utils.js", () => ({
  isServerRunning: mocks.isServerRunning,
}));

vi.mock("../../../../src/account-manager/storage.js", () => ({
  loadAccounts: mocks.loadAccounts,
  saveAccounts: mocks.saveAccounts,
}));

vi.mock("../../../../src/auth/oauth.js", () => ({
  getAuthorizationUrl: mocks.getAuthorizationUrl,
  startCallbackServer: mocks.startCallbackServer,
  completeOAuthFlow: mocks.completeOAuthFlow,
  validateRefreshToken: mocks.validateRefreshToken,
}));

vi.mock("../../../../src/constants.js", () => ({
  ACCOUNT_CONFIG_PATH: "/mock/config/path",
  DEFAULT_PORT: 8080,
}));

vi.mock("../../../../src/cli/ui.js", () => ({
  symbols: {
    error: "[E]",
    success: "[S]",
    info: "[I]",
    warning: "[W]",
    arrow: "->",
    bullet: "*",
  },
  error: (text: string) => `ERROR:${text}`,
  success: (text: string) => `SUCCESS:${text}`,
  dim: (text: string) => `DIM:${text}`,
}));

// Must import after mocks are set up
import { accountsAddCommand } from "../../../../src/cli/commands/accounts-add.js";

describe("accountsAddCommand", () => {
  const originalEnv = process.env;
  let mockExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.REFRESH_TOKEN;
    mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    mocks.isCancel.mockReturnValue(false);
    // Reset spinner mock
    mocks.spinner.mockReturnValue({
      start: mocks.spinnerStart,
      stop: mocks.spinnerStop,
      message: mocks.spinnerMessage,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    mockExit.mockRestore();
  });

  describe("Server running check", () => {
    it("should exit if server is running", async () => {
      mocks.isServerRunning.mockResolvedValue(true);

      await expect(accountsAddCommand({})).rejects.toThrow("process.exit called");

      expect(mocks.intro).toHaveBeenCalledWith("Add Account");
      expect(mocks.logError).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("should continue if server is not running", async () => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.select.mockResolvedValue("refresh-token");
      mocks.text.mockResolvedValue("1//valid-token");
      mocks.validateRefreshToken.mockResolvedValue({
        email: "test@example.com",
        refreshToken: "1//valid-token",
        accessToken: "access-token",
        projectId: "project-123",
      });
      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsAddCommand({});

      expect(mocks.isServerRunning).toHaveBeenCalledWith(8080);
      expect(mocks.select).toHaveBeenCalled();
    });
  });

  describe("Auth method selection", () => {
    beforeEach(() => {
      mocks.isServerRunning.mockResolvedValue(false);
    });

    it("should skip selection when --refreshToken option is provided", async () => {
      mocks.text.mockResolvedValue("1//valid-token");
      mocks.validateRefreshToken.mockResolvedValue({
        email: "test@example.com",
        refreshToken: "1//valid-token",
        accessToken: "access-token",
        projectId: "project-123",
      });
      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsAddCommand({ refreshToken: true });

      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.text).toHaveBeenCalled();
    });

    it("should show method selection when no option is provided", async () => {
      mocks.select.mockResolvedValue("refresh-token");
      mocks.text.mockResolvedValue("1//valid-token");
      mocks.validateRefreshToken.mockResolvedValue({
        email: "test@example.com",
        refreshToken: "1//valid-token",
        accessToken: "access-token",
        projectId: "project-123",
      });
      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsAddCommand({});

      expect(mocks.select).toHaveBeenCalledWith({
        message: "Select authentication method:",
        options: expect.any(Array),
      });
    });

    it("should exit when method selection is cancelled", async () => {
      mocks.isCancel.mockReturnValue(true);
      mocks.select.mockResolvedValue(Symbol("cancel"));

      await expect(accountsAddCommand({})).rejects.toThrow("process.exit called");

      expect(mocks.cancel).toHaveBeenCalledWith("Operation cancelled.");
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe("Refresh token flow", () => {
    beforeEach(() => {
      mocks.isServerRunning.mockResolvedValue(false);
    });

    it("should use REFRESH_TOKEN from environment", async () => {
      process.env.REFRESH_TOKEN = "1//env-refresh-token";
      mocks.select.mockResolvedValue("refresh-token");
      mocks.validateRefreshToken.mockResolvedValue({
        email: "env@example.com",
        refreshToken: "1//env-refresh-token",
        accessToken: "access-token",
        projectId: "project-123",
      });
      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsAddCommand({});

      expect(mocks.text).not.toHaveBeenCalled();
      expect(mocks.logInfo).toHaveBeenCalledWith("[I] Using REFRESH_TOKEN from environment");
      expect(mocks.validateRefreshToken).toHaveBeenCalledWith("1//env-refresh-token");
    });

    it("should prompt for token when env var is not set", async () => {
      mocks.select.mockResolvedValue("refresh-token");
      mocks.text.mockResolvedValue("1//prompted-token");
      mocks.validateRefreshToken.mockResolvedValue({
        email: "prompt@example.com",
        refreshToken: "1//prompted-token",
        accessToken: "access-token",
        projectId: null,
      });
      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsAddCommand({});

      expect(mocks.text).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Enter your refresh token:",
          placeholder: "1//...",
        })
      );
    });

    it("should exit when token input is cancelled", async () => {
      mocks.select.mockResolvedValue("refresh-token");
      mocks.text.mockResolvedValue(Symbol("cancel"));
      mocks.isCancel.mockImplementation((value) => typeof value === "symbol");

      await expect(accountsAddCommand({})).rejects.toThrow("process.exit called");

      expect(mocks.cancel).toHaveBeenCalledWith("Operation cancelled.");
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it("should add new account when email is not duplicate", async () => {
      mocks.select.mockResolvedValue("refresh-token");
      mocks.text.mockResolvedValue("1//new-token");
      mocks.validateRefreshToken.mockResolvedValue({
        email: "new@example.com",
        refreshToken: "1//new-token",
        accessToken: "access-token",
        projectId: "project-456",
      });
      mocks.loadAccounts.mockResolvedValue({
        accounts: [{ email: "existing@example.com", source: "oauth" }],
        settings: {},
        activeIndex: 0,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsAddCommand({});

      expect(mocks.saveAccounts).toHaveBeenCalledWith(
        "/mock/config/path",
        expect.arrayContaining([
          expect.objectContaining({ email: "existing@example.com" }),
          expect.objectContaining({
            email: "new@example.com",
            source: "oauth",
            refreshToken: "1//new-token",
            projectId: "project-456",
          }),
        ]),
        {},
        0
      );
      expect(mocks.outro).toHaveBeenCalled();
    });

    it("should update existing account when email is duplicate", async () => {
      mocks.select.mockResolvedValue("refresh-token");
      mocks.text.mockResolvedValue("1//updated-token");
      mocks.validateRefreshToken.mockResolvedValue({
        email: "existing@example.com",
        refreshToken: "1//updated-token",
        accessToken: "access-token",
        projectId: "new-project",
      });
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "existing@example.com",
            source: "oauth",
            refreshToken: "1//old-token",
            projectId: "old-project",
          },
        ],
        settings: {},
        activeIndex: 0,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsAddCommand({});

      expect(mocks.saveAccounts).toHaveBeenCalledWith(
        "/mock/config/path",
        expect.arrayContaining([
          expect.objectContaining({
            email: "existing@example.com",
            refreshToken: "1//updated-token",
            projectId: "new-project",
          }),
        ]),
        {},
        0
      );
      expect(mocks.logInfo).toHaveBeenCalledWith("[I] Updated existing account: existing@example.com");
    });

    it("should handle invalid_grant error", async () => {
      mocks.select.mockResolvedValue("refresh-token");
      mocks.text.mockResolvedValue("1//expired-token");
      mocks.validateRefreshToken.mockRejectedValue(new Error("invalid_grant: Token has been revoked"));

      await expect(accountsAddCommand({})).rejects.toThrow("process.exit called");

      expect(mocks.spinnerStop).toHaveBeenCalledWith("[E] Validation failed");
      expect(mocks.logError).toHaveBeenCalledWith("ERROR:Token has been revoked or expired. Please re-authenticate.");
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("should handle generic validation error", async () => {
      mocks.select.mockResolvedValue("refresh-token");
      mocks.text.mockResolvedValue("1//bad-token");
      mocks.validateRefreshToken.mockRejectedValue(new Error("Network error"));

      await expect(accountsAddCommand({})).rejects.toThrow("process.exit called");

      expect(mocks.spinnerStop).toHaveBeenCalledWith("[E] Validation failed");
      expect(mocks.logError).toHaveBeenCalledWith("ERROR:Network error");
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe("OAuth flow", () => {
    beforeEach(() => {
      mocks.isServerRunning.mockResolvedValue(false);
    });

    it("should open browser when noBrowser is false", async () => {
      mocks.select.mockResolvedValue("oauth");
      mocks.getAuthorizationUrl.mockReturnValue({
        url: "https://accounts.google.com/oauth?...",
        verifier: "test-verifier",
        state: "test-state",
      });
      mocks.startCallbackServer.mockResolvedValue("auth-code-123");
      mocks.completeOAuthFlow.mockResolvedValue({
        email: "oauth@example.com",
        refreshToken: "1//oauth-token",
        accessToken: "access-token",
        projectId: "oauth-project",
      });
      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsAddCommand({});

      expect(mocks.open).toHaveBeenCalledWith("https://accounts.google.com/oauth?...");
      expect(mocks.startCallbackServer).toHaveBeenCalledWith("test-state");
      expect(mocks.completeOAuthFlow).toHaveBeenCalledWith("auth-code-123", "test-verifier");
    });

    it("should display URL when noBrowser is true", async () => {
      mocks.select.mockResolvedValue("oauth");
      mocks.getAuthorizationUrl.mockReturnValue({
        url: "https://accounts.google.com/oauth?...",
        verifier: "test-verifier",
        state: "test-state",
      });
      mocks.startCallbackServer.mockResolvedValue("auth-code-123");
      mocks.completeOAuthFlow.mockResolvedValue({
        email: "oauth@example.com",
        refreshToken: "1//oauth-token",
        accessToken: "access-token",
        projectId: null,
      });
      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsAddCommand({ noBrowser: true });

      expect(mocks.open).not.toHaveBeenCalled();
      expect(mocks.logInfo).toHaveBeenCalledWith("Open this URL in your browser to sign in:");
      expect(mocks.logMessage).toHaveBeenCalledWith("DIM:https://accounts.google.com/oauth?...");
    });

    it("should handle OAuth callback error", async () => {
      mocks.select.mockResolvedValue("oauth");
      mocks.getAuthorizationUrl.mockReturnValue({
        url: "https://accounts.google.com/oauth?...",
        verifier: "test-verifier",
        state: "test-state",
      });
      mocks.startCallbackServer.mockRejectedValue(new Error("OAuth callback timeout"));

      await expect(accountsAddCommand({})).rejects.toThrow("process.exit called");

      expect(mocks.spinnerStop).toHaveBeenCalledWith("[E] Authentication failed");
      expect(mocks.logError).toHaveBeenCalledWith("ERROR:OAuth callback timeout");
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("should handle invalid_grant in OAuth flow", async () => {
      mocks.select.mockResolvedValue("oauth");
      mocks.getAuthorizationUrl.mockReturnValue({
        url: "https://accounts.google.com/oauth?...",
        verifier: "test-verifier",
        state: "test-state",
      });
      mocks.startCallbackServer.mockResolvedValue("auth-code-123");
      mocks.completeOAuthFlow.mockRejectedValue(new Error("invalid_grant: Code has expired"));

      await expect(accountsAddCommand({})).rejects.toThrow("process.exit called");

      expect(mocks.logError).toHaveBeenCalledWith("ERROR:Authorization code has expired. Please try again.");
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("should update existing account during OAuth flow", async () => {
      mocks.select.mockResolvedValue("oauth");
      mocks.getAuthorizationUrl.mockReturnValue({
        url: "https://accounts.google.com/oauth?...",
        verifier: "test-verifier",
        state: "test-state",
      });
      mocks.startCallbackServer.mockResolvedValue("auth-code-123");
      mocks.completeOAuthFlow.mockResolvedValue({
        email: "existing@example.com",
        refreshToken: "1//new-oauth-token",
        accessToken: "access-token",
        projectId: "oauth-project",
      });
      mocks.loadAccounts.mockResolvedValue({
        accounts: [
          {
            email: "existing@example.com",
            source: "oauth",
            refreshToken: "1//old-token",
            projectId: "old-project",
          },
        ],
        settings: { someSetting: true },
        activeIndex: 0,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsAddCommand({});

      expect(mocks.saveAccounts).toHaveBeenCalledWith(
        "/mock/config/path",
        expect.arrayContaining([
          expect.objectContaining({
            email: "existing@example.com",
            refreshToken: "1//new-oauth-token",
            projectId: "oauth-project",
          }),
        ]),
        { someSetting: true },
        0
      );
      expect(mocks.logInfo).toHaveBeenCalledWith("[I] Updated existing account: existing@example.com");
    });

    it("should show account count in success message", async () => {
      mocks.select.mockResolvedValue("oauth");
      mocks.getAuthorizationUrl.mockReturnValue({
        url: "https://accounts.google.com/oauth?...",
        verifier: "test-verifier",
        state: "test-state",
      });
      mocks.startCallbackServer.mockResolvedValue("auth-code-123");
      mocks.completeOAuthFlow.mockResolvedValue({
        email: "new@example.com",
        refreshToken: "1//new-token",
        accessToken: "access-token",
        projectId: null,
      });
      mocks.loadAccounts.mockResolvedValue({
        accounts: [{ email: "existing@example.com", source: "oauth" }],
        settings: {},
        activeIndex: 0,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsAddCommand({});

      expect(mocks.outro).toHaveBeenCalledWith(expect.stringContaining("2 total"));
    });
  });

  describe("Token validation", () => {
    beforeEach(() => {
      mocks.isServerRunning.mockResolvedValue(false);
      mocks.select.mockResolvedValue("refresh-token");
    });

    it("should validate token format starts with 1//", async () => {
      // Get the validate function from the text call
      mocks.text.mockImplementation(async (options: { validate: (value: string) => string | undefined }) => {
        const validateFn = options.validate;

        // Test empty token
        expect(validateFn("")).toBe("Refresh token is required");

        // Test invalid format
        expect(validateFn("invalid-token")).toBe('Refresh token must start with "1//"');

        // Test valid format
        expect(validateFn("1//valid-token")).toBeUndefined();

        return "1//valid-token";
      });

      mocks.validateRefreshToken.mockResolvedValue({
        email: "test@example.com",
        refreshToken: "1//valid-token",
        accessToken: "access-token",
        projectId: null,
      });
      mocks.loadAccounts.mockResolvedValue({
        accounts: [],
        settings: {},
        activeIndex: 0,
      });
      mocks.saveAccounts.mockResolvedValue(undefined);

      await accountsAddCommand({});

      expect(mocks.text).toHaveBeenCalled();
    });
  });
});
