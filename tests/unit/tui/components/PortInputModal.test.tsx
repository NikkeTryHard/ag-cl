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

  it("shows input mode initially with hint text", () => {
    const { lastFrame } = render(<PortInputModal currentPort={8080} serverRunning={false} onConfirm={() => {}} onClose={() => {}} />);

    expect(lastFrame()).toContain("Port:");
    expect(lastFrame()).toContain("Enter to confirm, ESC to cancel");
  });

  it("shows validation error for invalid port 0", () => {
    const { lastFrame } = render(<PortInputModal currentPort={0} serverRunning={false} onConfirm={() => {}} onClose={() => {}} />);

    expect(lastFrame()).toContain("Port must be 1-65535");
  });

  it("renders correctly when server is running", () => {
    const { lastFrame } = render(<PortInputModal currentPort={8080} serverRunning={true} onConfirm={() => {}} onClose={() => {}} />);

    expect(lastFrame()).toContain("Change Port");
    expect(lastFrame()).toContain("8080");
  });

  it("accepts onConfirm and onClose callbacks", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    const { lastFrame } = render(<PortInputModal currentPort={8080} serverRunning={false} onConfirm={onConfirm} onClose={onClose} />);

    // Component should render without calling callbacks initially
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(lastFrame()).toContain("Change Port");
  });
});
