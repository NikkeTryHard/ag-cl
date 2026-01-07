/**
 * TUI App Tests
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";

// We'll test the App component once it's more complete
// For now, verify ink-testing-library works
describe("TUI App", () => {
  it("renders text with ink-testing-library", () => {
    const { lastFrame } = render(<Text>Test</Text>);
    expect(lastFrame()).toContain("Test");
  });
});
