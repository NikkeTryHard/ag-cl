/**
 * MasterKeyModal Tests
 * @vitest-environment jsdom
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "ink-testing-library";
import { MasterKeyModal } from "../../../../src/tui/components/MasterKeyModal.js";

// Mock useTerminalSize
vi.mock("../../../../src/tui/hooks/useTerminalSize.js", () => ({
  useTerminalSize: () => ({ width: 80, height: 24 }),
}));

describe("MasterKeyModal", () => {
  const mockOnClose = vi.fn();
  const mockOnRegenerate = vi.fn();
  const mockOnCopy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays the full master key when provided", () => {
    const { lastFrame } = render(<MasterKeyModal masterKey="abc123-def456-ghi789" onClose={mockOnClose} onRegenerate={mockOnRegenerate} onCopy={mockOnCopy} />);

    expect(lastFrame()).toContain("Master Key");
    expect(lastFrame()).toContain("abc123-def456-ghi789");
  });

  it("shows 'Not generated' when masterKey is null", () => {
    const { lastFrame } = render(<MasterKeyModal masterKey={null} onClose={mockOnClose} onRegenerate={mockOnRegenerate} onCopy={mockOnCopy} />);

    expect(lastFrame()).toContain("Not generated");
  });

  it("shows hotkey hints", () => {
    const { lastFrame } = render(<MasterKeyModal masterKey="test-key" onClose={mockOnClose} onRegenerate={mockOnRegenerate} onCopy={mockOnCopy} />);

    expect(lastFrame()).toMatch(/Y.*copy/i);
    expect(lastFrame()).toMatch(/R.*regenerate/i);
    expect(lastFrame()).toMatch(/ESC/i);
  });

  it("shows copied feedback", () => {
    const { lastFrame } = render(<MasterKeyModal masterKey="test-key" onClose={mockOnClose} onRegenerate={mockOnRegenerate} onCopy={mockOnCopy} copied={true} />);

    expect(lastFrame()).toContain("Copied!");
  });
});
