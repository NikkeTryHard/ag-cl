/**
 * ServerLogsModal Component Tests
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "ink-testing-library";
import { ServerLogsModal } from "../../../../src/tui/components/ServerLogsModal.js";
import { addLogEntry, clearLogBuffer } from "../../../../src/tui/hooks/useLogBuffer.js";

// Mock useTerminalSize
vi.mock("../../../../src/tui/hooks/useTerminalSize.js", () => ({
  useTerminalSize: () => ({ width: 80, height: 24 }),
}));

describe("ServerLogsModal", () => {
  beforeEach(() => {
    clearLogBuffer();
  });

  afterEach(() => {
    clearLogBuffer();
  });

  it("renders with no logs message when empty", () => {
    const { lastFrame } = render(<ServerLogsModal onClose={() => {}} />);

    expect(lastFrame()).toContain("No logs yet");
    expect(lastFrame()).toContain("ESC close");
  });

  it("shows ESC close hint", () => {
    const { lastFrame } = render(<ServerLogsModal onClose={() => {}} />);

    expect(lastFrame()).toContain("ESC close");
  });

  it("displays log entries when present", () => {
    // Add a log entry before rendering
    addLogEntry("info", "Test log message");

    const { lastFrame } = render(<ServerLogsModal onClose={() => {}} />);

    expect(lastFrame()).toContain("INFO");
    expect(lastFrame()).toContain("Test log message");
    expect(lastFrame()).not.toContain("No logs yet");
  });

  it("shows entry count when logs exist", () => {
    addLogEntry("info", "Test log");

    const { lastFrame } = render(<ServerLogsModal onClose={() => {}} />);

    expect(lastFrame()).toContain("1 entries");
  });

  it("displays different log levels with correct labels", () => {
    addLogEntry("error", "Error message");
    addLogEntry("warn", "Warning message");
    addLogEntry("debug", "Debug message");

    const { lastFrame } = render(<ServerLogsModal onClose={() => {}} />);

    expect(lastFrame()).toContain("ERROR");
    expect(lastFrame()).toContain("WARN");
    expect(lastFrame()).toContain("DEBUG");
  });

  it("accepts onClose callback", () => {
    const onClose = vi.fn();

    const { lastFrame } = render(<ServerLogsModal onClose={onClose} />);

    // Component should render without calling callback initially
    expect(onClose).not.toHaveBeenCalled();
    expect(lastFrame()).toContain("ESC close");
  });
});
