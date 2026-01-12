// tests/unit/tui/components/ShareSettingsModal.test.tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { ShareSettingsModal } from "../../../../src/tui/components/ShareSettingsModal.js";
import { getDefaultShareConfig } from "../../../../src/share/config-storage.js";

describe("ShareSettingsModal", () => {
  const mockConfig = getDefaultShareConfig();
  const mockOnUpdate = vi.fn();
  const mockOnClose = vi.fn();

  it("should render modal title", () => {
    const { lastFrame } = render(<ShareSettingsModal config={mockConfig} onUpdate={mockOnUpdate} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("Share Settings");
  });

  it("should show auth section", () => {
    const { lastFrame } = render(<ShareSettingsModal config={mockConfig} onUpdate={mockOnUpdate} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("Authentication");
  });

  it("should show visibility section", () => {
    const { lastFrame } = render(<ShareSettingsModal config={mockConfig} onUpdate={mockOnUpdate} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("Visibility");
  });

  it("should show limits section", () => {
    const { lastFrame } = render(<ShareSettingsModal config={mockConfig} onUpdate={mockOnUpdate} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("Limits");
  });

  it("should show close hint", () => {
    const { lastFrame } = render(<ShareSettingsModal config={mockConfig} onUpdate={mockOnUpdate} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("Esc");
  });
});
