/**
 * Snapshot tests for SettingsModal component
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import React from "react";
import { SettingsModal } from "../../src/tui/components/SettingsModal.js";
import type { AccountSettings } from "../../src/account-manager/types.js";

// Mock ink-text-input to avoid issues in test environment
vi.mock("ink-text-input", () => ({
  default: ({ value }: { value: string }) => React.createElement("ink-text-input", {}, value),
}));

describe("SettingsModal snapshots", () => {
  const mockOnUpdateSettings = vi.fn();
  const mockOnClose = vi.fn();

  it("renders with default settings", () => {
    const settings: AccountSettings = {};
    const { lastFrame } = render(<SettingsModal settings={settings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

    expect(lastFrame()).toMatchSnapshot();
  });

  it("renders with all settings configured", () => {
    const settings: AccountSettings = {
      identityMode: "short",
      defaultPort: 3000,
      logLevel: "debug",
      fallbackEnabled: true,
    };
    const { lastFrame } = render(<SettingsModal settings={settings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

    expect(lastFrame()).toMatchSnapshot();
  });

  it("renders with identity mode none", () => {
    const settings: AccountSettings = {
      identityMode: "none",
    };
    const { lastFrame } = render(<SettingsModal settings={settings} onUpdateSettings={mockOnUpdateSettings} onClose={mockOnClose} />);

    expect(lastFrame()).toMatchSnapshot();
  });
});
