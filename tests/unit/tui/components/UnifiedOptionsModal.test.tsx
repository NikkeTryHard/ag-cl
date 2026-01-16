/**
 * UnifiedOptionsModal Component Tests
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "ink-testing-library";
import { UnifiedOptionsModal } from "../../../../src/tui/components/UnifiedOptionsModal.js";
import type { AccountSettings } from "../../../../src/account-manager/types.js";
import type { ShareConfig } from "../../../../src/share/types.js";

// Mock useTerminalSize
vi.mock("../../../../src/tui/hooks/useTerminalSize.js", () => ({
  useTerminalSize: () => ({ width: 80, height: 40 }),
}));

describe("UnifiedOptionsModal", () => {
  const defaultSettings: AccountSettings = {
    identityMode: "full",
    defaultPort: 8080,
    logLevel: "info",
    fallbackEnabled: false,
    autoRefreshEnabled: false,
    schedulingMode: "sticky",
  };

  const defaultShareConfig: ShareConfig = {
    auth: {
      enabled: true,
      mode: "single",
      masterKey: "test-key",
      friendKeys: [{ key: "friend1", nickname: "Bob", revoked: false, createdAt: Date.now() }],
    },
    visibility: {
      showAccountEmails: true,
      showIndividualAccounts: false,
      showModelBreakdown: true,
      showBurnRate: false,
    },
    limits: {
      maxClients: 5,
      pollIntervalSeconds: 10,
    },
    persistence: {
      resumeOnRestart: false,
    },
  };

  const mockOnUpdateSettings = vi.fn().mockResolvedValue(undefined);
  const mockOnUpdateShareConfig = vi.fn().mockResolvedValue(undefined);
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("section headers", () => {
    it("renders all section headers", () => {
      const { lastFrame } = render(<UnifiedOptionsModal settings={defaultSettings} shareConfig={defaultShareConfig} onUpdateSettings={mockOnUpdateSettings} onUpdateShareConfig={mockOnUpdateShareConfig} onClose={mockOnClose} />);

      expect(lastFrame()).toContain("General Settings");
      expect(lastFrame()).toContain("Share Options");
    });
  });

  describe("general settings values", () => {
    it("renders general settings labels and values", () => {
      const { lastFrame } = render(<UnifiedOptionsModal settings={defaultSettings} shareConfig={defaultShareConfig} onUpdateSettings={mockOnUpdateSettings} onUpdateShareConfig={mockOnUpdateShareConfig} onClose={mockOnClose} />);

      expect(lastFrame()).toContain("Identity Mode");
      expect(lastFrame()).toContain("[full]");
      expect(lastFrame()).toContain("Default Port");
      expect(lastFrame()).toContain("[8080]");
      expect(lastFrame()).toContain("Log Level");
      expect(lastFrame()).toContain("[info]");
      expect(lastFrame()).toContain("Model Fallback");
      expect(lastFrame()).toContain("[off]");
      expect(lastFrame()).toContain("Auto Refresh");
      expect(lastFrame()).toContain("Scheduling Mode");
      expect(lastFrame()).toContain("[sticky]");
    });
  });

  describe("share settings values", () => {
    it("renders share settings labels and values", () => {
      const { lastFrame } = render(<UnifiedOptionsModal settings={defaultSettings} shareConfig={defaultShareConfig} onUpdateSettings={mockOnUpdateSettings} onUpdateShareConfig={mockOnUpdateShareConfig} onClose={mockOnClose} />);

      // Auth section
      expect(lastFrame()).toContain("Enabled");
      expect(lastFrame()).toContain("[Y]");
      expect(lastFrame()).toContain("Mode");
      expect(lastFrame()).toContain("[single]");

      // Visibility section
      expect(lastFrame()).toContain("Show Emails");
      expect(lastFrame()).toContain("Show Accounts");
      expect(lastFrame()).toContain("Show Models");
      expect(lastFrame()).toContain("Show Burn Rate");

      // Limits section
      expect(lastFrame()).toContain("Max Clients");
      expect(lastFrame()).toContain("[5]");
      expect(lastFrame()).toContain("Poll Interval");
      expect(lastFrame()).toContain("[10s]");
    });
  });

  describe("modal indicator items", () => {
    it("renders Master Key and Friend Keys with sub-modal indicators", () => {
      const { lastFrame } = render(<UnifiedOptionsModal settings={defaultSettings} shareConfig={defaultShareConfig} onUpdateSettings={mockOnUpdateSettings} onUpdateShareConfig={mockOnUpdateShareConfig} onClose={mockOnClose} />);

      expect(lastFrame()).toContain("Master Key");
      expect(lastFrame()).toContain("[set]");
      expect(lastFrame()).toContain("Friend Keys");
      expect(lastFrame()).toContain("[1]");
    });

    it("shows not set when masterKey is null", () => {
      const configWithoutMasterKey: ShareConfig = {
        ...defaultShareConfig,
        auth: {
          ...defaultShareConfig.auth,
          masterKey: null,
        },
      };

      const { lastFrame } = render(<UnifiedOptionsModal settings={defaultSettings} shareConfig={configWithoutMasterKey} onUpdateSettings={mockOnUpdateSettings} onUpdateShareConfig={mockOnUpdateShareConfig} onClose={mockOnClose} />);

      expect(lastFrame()).toContain("[not set]");
    });
  });

  describe("navigation", () => {
    it("starts selection at first selectable item (skipping header)", () => {
      const { lastFrame } = render(<UnifiedOptionsModal settings={defaultSettings} shareConfig={defaultShareConfig} onUpdateSettings={mockOnUpdateSettings} onUpdateShareConfig={mockOnUpdateShareConfig} onClose={mockOnClose} />);

      // The selection indicator should be on Identity Mode, not the header
      const frame = lastFrame();
      expect(frame).toContain(">");
      expect(frame).toContain("Identity Mode");
    });
  });

  describe("keyboard interactions", () => {
    const ESCAPE = "\x1B";

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    it("calls onClose when ESC pressed", async () => {
      const { stdin } = render(<UnifiedOptionsModal settings={defaultSettings} shareConfig={defaultShareConfig} onUpdateSettings={mockOnUpdateSettings} onUpdateShareConfig={mockOnUpdateShareConfig} onClose={mockOnClose} />);

      await delay(10);
      stdin.write(ESCAPE);
      await delay(50);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("title and footer", () => {
    it("renders with title Options", () => {
      const { lastFrame } = render(<UnifiedOptionsModal settings={defaultSettings} shareConfig={defaultShareConfig} onUpdateSettings={mockOnUpdateSettings} onUpdateShareConfig={mockOnUpdateShareConfig} onClose={mockOnClose} />);

      expect(lastFrame()).toContain("Options");
    });

    it("displays navigation hints in footer", () => {
      const { lastFrame } = render(<UnifiedOptionsModal settings={defaultSettings} shareConfig={defaultShareConfig} onUpdateSettings={mockOnUpdateSettings} onUpdateShareConfig={mockOnUpdateShareConfig} onClose={mockOnClose} />);

      expect(lastFrame()).toContain("ESC");
      expect(lastFrame()).toContain("close");
      expect(lastFrame()).toContain("Enter");
      expect(lastFrame()).toContain("edit");
      expect(lastFrame()).toContain("Up/Down");
      expect(lastFrame()).toContain("navigate");
    });

    it("shows restart notice", () => {
      const { lastFrame } = render(<UnifiedOptionsModal settings={defaultSettings} shareConfig={defaultShareConfig} onUpdateSettings={mockOnUpdateSettings} onUpdateShareConfig={mockOnUpdateShareConfig} onClose={mockOnClose} />);

      expect(lastFrame()).toContain("Changes take effect after server restart");
    });
  });

  describe("callbacks", () => {
    it("accepts callback props without calling them initially", () => {
      render(<UnifiedOptionsModal settings={defaultSettings} shareConfig={defaultShareConfig} onUpdateSettings={mockOnUpdateSettings} onUpdateShareConfig={mockOnUpdateShareConfig} onClose={mockOnClose} />);

      expect(mockOnUpdateSettings).not.toHaveBeenCalled();
      expect(mockOnUpdateShareConfig).not.toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  /**
   * Tests for poll interval display logic.
   * The component should display "off" when pollIntervalSeconds is 0,
   * and display the value with "s" suffix otherwise.
   */
  describe("poll interval display", () => {
    it("should display 'off' when pollIntervalSeconds is 0", () => {
      // Enable fallback so [off] doesn't appear from Model Fallback
      const settingsWithFallback: AccountSettings = {
        ...defaultSettings,
        fallbackEnabled: true,
      };
      const configWithZeroPoll: ShareConfig = {
        ...defaultShareConfig,
        limits: {
          ...defaultShareConfig.limits,
          pollIntervalSeconds: 0,
        },
      };

      const { lastFrame } = render(<UnifiedOptionsModal settings={settingsWithFallback} shareConfig={configWithZeroPoll} onUpdateSettings={mockOnUpdateSettings} onUpdateShareConfig={mockOnUpdateShareConfig} onClose={mockOnClose} />);

      const frame = lastFrame();
      expect(frame).toContain("Poll Interval");
      // Should NOT display [0s]
      expect(frame).not.toContain("[0s]");
      // Should display [off] for Poll Interval
      expect(frame).toContain("[off]");
    });

    it("should display value with 's' suffix when pollIntervalSeconds > 0", () => {
      const configWithNonZeroPoll: ShareConfig = {
        ...defaultShareConfig,
        limits: {
          ...defaultShareConfig.limits,
          pollIntervalSeconds: 30,
        },
      };

      const { lastFrame } = render(<UnifiedOptionsModal settings={defaultSettings} shareConfig={configWithNonZeroPoll} onUpdateSettings={mockOnUpdateSettings} onUpdateShareConfig={mockOnUpdateShareConfig} onClose={mockOnClose} />);

      expect(lastFrame()).toContain("Poll Interval");
      expect(lastFrame()).toContain("[30s]");
    });
  });

  describe("poll interval cycling", () => {
    it("should cycle poll interval through all options including off", async () => {
      const ENTER = "\r";
      const DOWN = "\x1B[B";
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // Start with pollIntervalSeconds = 60 (last option)
      const configWith60: ShareConfig = {
        ...defaultShareConfig,
        limits: {
          ...defaultShareConfig.limits,
          pollIntervalSeconds: 60,
        },
      };

      const { stdin, lastFrame } = render(<UnifiedOptionsModal settings={defaultSettings} shareConfig={configWith60} onUpdateSettings={mockOnUpdateSettings} onUpdateShareConfig={mockOnUpdateShareConfig} onClose={mockOnClose} />);

      // Navigate to Poll Interval (it's in the Share Options section)
      await delay(10);

      // Navigate down 11 times to reach Poll Interval (12th selectable item, 0-indexed = 11)
      // Order: Identity Mode (0), Default Port (1), Log Level (2), Model Fallback (3), Auto Refresh (4), Scheduling Mode (5),
      //        Enabled (6), Auth Mode (7), Master Key (8), Friend Keys (9), Max Clients (10), Poll Interval (11)
      // Note: Headers are skipped by navigation
      for (let i = 0; i < 11; i++) {
        stdin.write(DOWN);
        await delay(10);
      }

      // Verify we're on Poll Interval
      expect(lastFrame()).toContain("Poll Interval");
      expect(lastFrame()).toContain("[60s]");

      // Press Enter to cycle to next value (should wrap to 0 = "off")
      stdin.write(ENTER);
      await delay(50);

      // Verify onUpdateShareConfig was called with pollIntervalSeconds: 0
      expect(mockOnUpdateShareConfig).toHaveBeenCalledWith({
        limits: expect.objectContaining({
          pollIntervalSeconds: 0,
        }),
      });
    });
  });
});
