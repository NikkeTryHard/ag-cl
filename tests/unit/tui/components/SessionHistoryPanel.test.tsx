// tests/unit/tui/components/SessionHistoryPanel.test.tsx
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { SessionHistoryPanel } from "../../../../src/tui/components/SessionHistoryPanel.js";
import type { SessionLogEntry } from "../../../../src/share/types.js";

describe("SessionHistoryPanel", () => {
  const mockSessions: SessionLogEntry[] = [
    {
      clientId: "client-1",
      keyMasked: "abc***",
      nickname: "bob",
      connectedAt: Date.now() - 3600000, // 1 hour ago
      disconnectedAt: Date.now() - 3000000, // 50 min ago
      pollCount: 60,
    },
    {
      clientId: "client-2",
      keyMasked: "def***",
      nickname: null,
      connectedAt: Date.now() - 7200000, // 2 hours ago
      disconnectedAt: Date.now() - 6600000, // 1h50m ago
      pollCount: 30,
    },
  ];

  it("should show empty message when no sessions", () => {
    const { lastFrame } = render(<SessionHistoryPanel sessions={[]} />);

    expect(lastFrame()).toContain("No session history");
  });

  it("should show panel title", () => {
    const { lastFrame } = render(<SessionHistoryPanel sessions={mockSessions} />);

    expect(lastFrame()).toContain("Session History");
  });

  it("should display session nickname", () => {
    const { lastFrame } = render(<SessionHistoryPanel sessions={mockSessions} />);

    expect(lastFrame()).toContain("bob");
  });

  it("should display masked key for sessions without nickname", () => {
    const { lastFrame } = render(<SessionHistoryPanel sessions={mockSessions} />);

    expect(lastFrame()).toContain("def***");
  });

  it("should show session count", () => {
    const { lastFrame } = render(<SessionHistoryPanel sessions={mockSessions} />);

    expect(lastFrame()).toContain("2");
  });
});
