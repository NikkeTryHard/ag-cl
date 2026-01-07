/**
 * PortInputModal Component Tests
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { PortInputModal } from "../../../../src/tui/components/PortInputModal.js";

// Mock useTerminalSize
vi.mock("../../../../src/tui/hooks/useTerminalSize.js", () => ({
  useTerminalSize: () => ({ width: 80, height: 24 }),
}));

describe("PortInputModal", () => {
  it("renders with current port value", () => {
    const { lastFrame } = render(<PortInputModal currentPort={8080} serverRunning={false} onConfirm={() => {}} onClose={() => {}} />);

    expect(lastFrame()).toContain("Change Port");
    expect(lastFrame()).toContain("8080");
  });

  it("calls onClose when ESC is pressed", () => {
    const onClose = vi.fn();
    const { stdin } = render(<PortInputModal currentPort={8080} serverRunning={false} onConfirm={() => {}} onClose={onClose} />);

    stdin.write("\x1B"); // ESC key
    expect(onClose).toHaveBeenCalled();
  });
});
