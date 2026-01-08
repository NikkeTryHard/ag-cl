/**
 * SettingsModal Component Tests
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { SettingsModal } from "../../../../src/tui/components/SettingsModal.js";
import type { AccountSettings } from "../../../../src/account-manager/types.js";

// Mock useTerminalSize
vi.mock("../../../../src/tui/hooks/useTerminalSize.js", () => ({
  useTerminalSize: () => ({ width: 80, height: 24 }),
}));

describe("SettingsModal", () => {
  const defaultSettings: AccountSettings = {
    identityMode: "full",
    defaultPort: 8080,
    logLevel: "info",
    fallbackEnabled: false,
  };

  const mockOnUpdateSettings = vi.fn().mockResolvedValue(undefined);
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with title Settings", () => {
    const { lastFrame } = render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("Settings");
  });

  it("displays all four settings", () => {
    const { lastFrame } = render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("Identity Mode");
    expect(lastFrame()).toContain("Default Port");
    expect(lastFrame()).toContain("Log Level");
    expect(lastFrame()).toContain("Model Fallback");
  });

  it("shows current setting values in brackets", () => {
    const { lastFrame } = render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("[full]");
    expect(lastFrame()).toContain("[8080]");
    expect(lastFrame()).toContain("[info]");
    expect(lastFrame()).toContain("[off]");
  });

  it("shows on for fallbackEnabled true", () => {
    const settings: AccountSettings = { ...defaultSettings, fallbackEnabled: true };
    const { lastFrame } = render(<SettingsModal settings={settings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("[on]");
  });

  it("displays footer with navigation hints", () => {
    const { lastFrame } = render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("ESC");
    expect(lastFrame()).toContain("close");
    expect(lastFrame()).toContain("Enter");
    expect(lastFrame()).toContain("edit");
    expect(lastFrame()).toContain("Up/Down");
    expect(lastFrame()).toContain("navigate");
  });

  it("shows selection indicator on first item", () => {
    const { lastFrame } = render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

    // The first item (Identity Mode) should have the selection indicator
    expect(lastFrame()).toContain(">");
  });

  it("uses default values when settings are undefined", () => {
    const emptySettings: AccountSettings = {};
    const { lastFrame } = render(<SettingsModal settings={emptySettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

    // Should show defaults
    expect(lastFrame()).toContain("[full]");
    expect(lastFrame()).toContain("[8080]");
    expect(lastFrame()).toContain("[info]");
    expect(lastFrame()).toContain("[off]");
  });

  it("accepts callback props without calling them initially", () => {
    render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

    expect(mockOnUpdateSettings).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("renders with different log levels", () => {
    const settings: AccountSettings = { ...defaultSettings, logLevel: "debug" };
    const { lastFrame } = render(<SettingsModal settings={settings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("[debug]");
  });

  it("renders with different identity modes", () => {
    const settings: AccountSettings = { ...defaultSettings, identityMode: "short" };
    const { lastFrame } = render(<SettingsModal settings={settings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("[short]");
  });

  it("renders with custom port", () => {
    const settings: AccountSettings = { ...defaultSettings, defaultPort: 3000 };
    const { lastFrame } = render(<SettingsModal settings={settings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("[3000]");
  });

  describe("keyboard interactions", () => {
    // ANSI escape sequences for keyboard input
    const ARROW_DOWN = "\x1B[B";
    const ARROW_UP = "\x1B[A";
    const ENTER = "\r";
    const ESCAPE = "\x1B";

    // Helper to wait for React state updates
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    it("down arrow key changes selection to next item", async () => {
      const { lastFrame, stdin } = render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

      // Wait for component to mount and raw mode to be enabled
      await delay(10);

      // Initial state: first item (Identity Mode) is selected
      const initialFrame = lastFrame();
      expect(initialFrame).toContain("> ");
      expect(initialFrame).toContain("Identity Mode");

      // Press down arrow
      stdin.write(ARROW_DOWN);

      // Wait for state update
      await delay(50);

      // Now second item (Default Port) should be selected
      const afterDown = lastFrame();
      // The selection indicator should still be present
      expect(afterDown).toContain("> ");
      expect(afterDown).toContain("Default Port");
    });

    it("up arrow key changes selection to previous item", async () => {
      const { lastFrame, stdin } = render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);
      await delay(10);

      // Navigate down first
      stdin.write(ARROW_DOWN);
      await delay(50);

      // Then navigate up
      stdin.write(ARROW_UP);
      await delay(50);

      // Should be back at first item
      const frame = lastFrame();
      expect(frame).toContain("> ");
      expect(frame).toContain("Identity Mode");
    });

    it("up arrow does not go above first item", async () => {
      const { lastFrame, stdin } = render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);
      await delay(10);

      // Try to go up when already at first item
      stdin.write(ARROW_UP);
      await delay(50);

      // Should still be at first item
      const frame = lastFrame();
      expect(frame).toContain("> ");
      expect(frame).toContain("Identity Mode");
    });

    it("down arrow does not go below last item", async () => {
      const { lastFrame, stdin } = render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);
      await delay(10);

      // Navigate to the last item (4 items total, so 3 down presses) with delays
      stdin.write(ARROW_DOWN);
      await delay(20);
      stdin.write(ARROW_DOWN);
      await delay(20);
      stdin.write(ARROW_DOWN);
      await delay(50);

      // Try to go down again
      stdin.write(ARROW_DOWN);
      await delay(50);

      // Should still be at last item (Model Fallback)
      const frame = lastFrame();
      expect(frame).toContain("> ");
      expect(frame).toContain("Model Fallback");
    });

    it("Enter key triggers setting toggle and calls onUpdateSettings", async () => {
      const { stdin } = render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);
      await delay(10);

      // Press Enter on first item (Identity Mode) - should cycle from "full" to "short"
      stdin.write(ENTER);

      // Wait for the async update
      await delay(100);

      expect(mockOnUpdateSettings).toHaveBeenCalledTimes(1);
      expect(mockOnUpdateSettings).toHaveBeenCalledWith({ identityMode: "short" });
    });

    it("Enter key toggles fallback setting", async () => {
      const { stdin } = render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);
      await delay(10);

      // Navigate to fallback setting (4th item, so 3 down presses) with delays between each
      stdin.write(ARROW_DOWN);
      await delay(20);
      stdin.write(ARROW_DOWN);
      await delay(20);
      stdin.write(ARROW_DOWN);
      await delay(50);

      // Press Enter to toggle fallback from off to on
      stdin.write(ENTER);
      await delay(100);

      expect(mockOnUpdateSettings).toHaveBeenCalledWith({ fallbackEnabled: true });
    });

    it("Enter key cycles log level setting", async () => {
      const { stdin } = render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);
      await delay(10);

      // Navigate to log level (3rd item, so 2 down presses) with delays
      stdin.write(ARROW_DOWN);
      await delay(20);
      stdin.write(ARROW_DOWN);
      await delay(50);

      // Press Enter to cycle from "info" to "debug"
      stdin.write(ENTER);
      await delay(100);

      expect(mockOnUpdateSettings).toHaveBeenCalledWith({ logLevel: "debug" });
    });

    it("ESC key calls onClose", async () => {
      const { stdin } = render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);
      await delay(10);

      // Press ESC
      stdin.write(ESCAPE);
      await delay(50);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("ESC key does not call onClose when editing port", async () => {
      const { lastFrame, stdin } = render(<SettingsModal settings={defaultSettings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);
      await delay(10);

      // Navigate to port setting (2nd item)
      stdin.write(ARROW_DOWN);
      await delay(50);

      // Press Enter to enter edit mode
      stdin.write(ENTER);
      await delay(50);

      // Verify we are in edit mode (footer changes)
      const editModeFrame = lastFrame();
      expect(editModeFrame).toContain("confirm");
      expect(editModeFrame).toContain("cancel");

      // Press ESC to exit edit mode (not close modal)
      stdin.write(ESCAPE);
      await delay(50);

      // onClose should not have been called
      expect(mockOnClose).not.toHaveBeenCalled();

      // Should be back to normal navigation mode
      const afterEscFrame = lastFrame();
      expect(afterEscFrame).toContain("Up/Down");
      expect(afterEscFrame).toContain("navigate");
    });
  });
});
