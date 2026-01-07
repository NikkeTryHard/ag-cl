/**
 * TUI App Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";

// Mock hooks
vi.mock("../../../src/tui/hooks/useCapacity.js", () => ({
  useCapacity: () => ({
    loading: false,
    error: null,
    claudeCapacity: { family: "claude", totalPercentage: 100, accountCount: 1, status: "stable", hoursToExhaustion: null },
    geminiCapacity: { family: "gemini", totalPercentage: 100, accountCount: 1, status: "stable", hoursToExhaustion: null },
    accountCount: 1,
    refresh: vi.fn(),
  }),
}));

vi.mock("../../../src/tui/hooks/useServerState.js", () => ({
  useServerState: () => ({
    running: false,
    port: 8080,
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
  }),
}));

describe("TUI App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders text with ink-testing-library", () => {
    const { lastFrame } = render(<Text>Test</Text>);
    expect(lastFrame()).toContain("Test");
  });
});
