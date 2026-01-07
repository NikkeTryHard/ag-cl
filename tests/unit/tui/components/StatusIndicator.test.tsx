/**
 * StatusIndicator Component Tests
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { StatusIndicator } from "../../../../src/tui/components/StatusIndicator.js";

describe("StatusIndicator", () => {
  it("shows running state with port", () => {
    const { lastFrame } = render(<StatusIndicator running={true} port={8080} />);

    const output = lastFrame();
    expect(output).toContain("8080");
    expect(output).toContain("●");
  });

  it("shows stopped state", () => {
    const { lastFrame } = render(<StatusIndicator running={false} port={8080} />);

    const output = lastFrame();
    expect(output).toContain("stopped");
  });
});
