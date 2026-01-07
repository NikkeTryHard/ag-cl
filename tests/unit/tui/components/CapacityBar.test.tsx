/**
 * CapacityBar Component Tests
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { CapacityBar } from "../../../../src/tui/components/CapacityBar.js";

describe("CapacityBar", () => {
  it("renders family name and percentage", () => {
    const { lastFrame } = render(<CapacityBar family="claude" percentage={75} status="stable" hoursToExhaustion={null} />);

    const output = lastFrame();
    expect(output).toContain("Claude");
    expect(output).toContain("75%");
  });

  it("shows time to exhaustion when burning", () => {
    const { lastFrame } = render(<CapacityBar family="claude" percentage={50} status="burning" hoursToExhaustion={4.5} />);

    const output = lastFrame();
    expect(output).toContain("~4h 30m");
  });

  it("shows stable when not burning", () => {
    const { lastFrame } = render(<CapacityBar family="gemini" percentage={100} status="stable" hoursToExhaustion={null} />);

    const output = lastFrame();
    expect(output).toContain("stable");
  });

  it("renders progress bar characters", () => {
    const { lastFrame } = render(<CapacityBar family="claude" percentage={50} status="stable" hoursToExhaustion={null} />);

    const output = lastFrame();
    // Should contain filled and empty bar characters
    expect(output).toMatch(/[█▓░]/);
  });
});
