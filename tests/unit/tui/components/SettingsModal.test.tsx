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
});
