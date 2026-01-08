/**
 * Dashboard Component Tests
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Dashboard } from "../../../../src/tui/components/Dashboard.js";

describe("Dashboard", () => {
  it("renders header with version", () => {
    const { lastFrame } = render(<Dashboard version="1.0.0" serverState={{ running: true, port: 8080 }} claudeCapacity={{ family: "claude", totalPercentage: 100, accountCount: 2, status: "stable", hoursToExhaustion: null, ratePerHour: null }} geminiCapacity={{ family: "gemini", totalPercentage: 100, accountCount: 2, status: "stable", hoursToExhaustion: null, ratePerHour: null }} accountCount={2} />);

    const output = lastFrame();
    expect(output).toContain("v1.0.0");
  });

  it("renders server status", () => {
    const { lastFrame } = render(<Dashboard version="1.0.0" serverState={{ running: true, port: 8080 }} claudeCapacity={{ family: "claude", totalPercentage: 100, accountCount: 2, status: "stable", hoursToExhaustion: null, ratePerHour: null }} geminiCapacity={{ family: "gemini", totalPercentage: 100, accountCount: 2, status: "stable", hoursToExhaustion: null, ratePerHour: null }} accountCount={2} />);

    const output = lastFrame();
    expect(output).toContain("8080");
  });

  it("renders both capacity bars", () => {
    const { lastFrame } = render(<Dashboard version="1.0.0" serverState={{ running: false, port: 8080 }} claudeCapacity={{ family: "claude", totalPercentage: 75, accountCount: 2, status: "burning", hoursToExhaustion: 5, ratePerHour: 15 }} geminiCapacity={{ family: "gemini", totalPercentage: 80, accountCount: 2, status: "stable", hoursToExhaustion: null, ratePerHour: null }} accountCount={2} />);

    const output = lastFrame();
    expect(output).toContain("Claude");
    expect(output).toContain("Gemini");
  });

  it("renders account count", () => {
    const { lastFrame } = render(<Dashboard version="1.0.0" serverState={{ running: true, port: 8080 }} claudeCapacity={{ family: "claude", totalPercentage: 100, accountCount: 5, status: "stable", hoursToExhaustion: null, ratePerHour: null }} geminiCapacity={{ family: "gemini", totalPercentage: 100, accountCount: 5, status: "stable", hoursToExhaustion: null, ratePerHour: null }} accountCount={5} />);

    const output = lastFrame();
    expect(output).toContain("5");
    expect(output).toContain("account");
  });

  it("renders hotkey hints including refresh and help", () => {
    const { lastFrame } = render(<Dashboard version="1.0.0" serverState={{ running: true, port: 8080 }} claudeCapacity={{ family: "claude", totalPercentage: 100, accountCount: 1, status: "stable", hoursToExhaustion: null, ratePerHour: null }} geminiCapacity={{ family: "gemini", totalPercentage: 100, accountCount: 1, status: "stable", hoursToExhaustion: null, ratePerHour: null }} accountCount={1} />);

    const output = lastFrame();
    expect(output).toContain("[a]");
    expect(output).toContain("[p]");
    expect(output).toContain("[r]");
    expect(output).toContain("[q]");
    expect(output).toContain("[?]");
  });

  it("shows first-run message when no accounts configured", () => {
    const { lastFrame } = render(<Dashboard version="1.0.0" serverState={{ running: false, port: 8080 }} claudeCapacity={{ family: "claude", totalPercentage: 0, accountCount: 0, status: "exhausted", hoursToExhaustion: null, ratePerHour: null }} geminiCapacity={{ family: "gemini", totalPercentage: 0, accountCount: 0, status: "exhausted", hoursToExhaustion: null, ratePerHour: null }} accountCount={0} />);

    const output = lastFrame();
    expect(output).toContain("No accounts configured");
    expect(output).toContain("[a]");
  });
});
