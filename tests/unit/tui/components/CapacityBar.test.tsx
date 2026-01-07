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
    expect(output).toMatch(/[█░]/);
  });

  // Status type tests
  it("shows exhausted status", () => {
    const { lastFrame } = render(<CapacityBar family="claude" percentage={0} status="exhausted" hoursToExhaustion={null} />);

    const output = lastFrame();
    expect(output).toContain("exhausted");
  });

  it("shows recovering status", () => {
    const { lastFrame } = render(<CapacityBar family="gemini" percentage={30} status="recovering" hoursToExhaustion={null} />);

    const output = lastFrame();
    expect(output).toContain("recovering");
  });

  it("shows calculating status", () => {
    const { lastFrame } = render(<CapacityBar family="claude" percentage={80} status="calculating" hoursToExhaustion={null} />);

    const output = lastFrame();
    expect(output).toContain("calculating");
  });

  // Edge case tests
  it("renders 0% capacity correctly", () => {
    const { lastFrame } = render(<CapacityBar family="claude" percentage={0} status="exhausted" hoursToExhaustion={null} />);

    const output = lastFrame();
    expect(output).toContain("0%");
    // Bar should be all empty
    expect(output).toContain("░░░░░░░░░░░░░░░░░░░░");
  });

  it("renders 100% capacity correctly", () => {
    const { lastFrame } = render(<CapacityBar family="gemini" percentage={100} status="stable" hoursToExhaustion={null} />);

    const output = lastFrame();
    expect(output).toContain("100%");
    // Bar should be all filled
    expect(output).toContain("████████████████████");
  });

  it("displays minutes-only format for time under 1 hour", () => {
    const { lastFrame } = render(<CapacityBar family="claude" percentage={10} status="burning" hoursToExhaustion={0.5} />);

    const output = lastFrame();
    expect(output).toContain("~30m");
    // Should not contain 'h' for hours
    expect(output).not.toMatch(/~\d+h/);
  });
});
