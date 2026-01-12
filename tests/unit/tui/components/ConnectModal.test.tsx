// tests/unit/tui/components/ConnectModal.test.tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { ConnectModal } from "../../../../src/tui/components/ConnectModal.js";

describe("ConnectModal", () => {
  const mockOnConnect = vi.fn();
  const mockOnClose = vi.fn();

  it("should render modal title", () => {
    const { lastFrame } = render(<ConnectModal onConnect={mockOnConnect} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("Connect to Remote");
  });

  it("should show URL input field", () => {
    const { lastFrame } = render(<ConnectModal onConnect={mockOnConnect} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("URL");
  });

  it("should show API Key input field", () => {
    const { lastFrame } = render(<ConnectModal onConnect={mockOnConnect} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("API Key");
  });

  it("should show nickname input field", () => {
    const { lastFrame } = render(<ConnectModal onConnect={mockOnConnect} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("Nickname");
  });

  it("should show close hint", () => {
    const { lastFrame } = render(<ConnectModal onConnect={mockOnConnect} onClose={mockOnClose} />);

    expect(lastFrame()).toContain("Esc");
  });

  it("should show error when provided", () => {
    const { lastFrame } = render(<ConnectModal onConnect={mockOnConnect} onClose={mockOnClose} error="Connection failed" />);

    expect(lastFrame()).toContain("Connection failed");
  });
});
