/**
 * CommandPalette Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { CommandPalette } from "../../../../src/tui/components/CommandPalette.js";
import type { Command } from "../../../../src/tui/types.js";

describe("CommandPalette", () => {
  const mockCommands: Command[] = [
    { id: "start", label: "Start Server", category: "server", action: vi.fn() },
    { id: "add-oauth", label: "Add Account (OAuth)", category: "accounts", action: vi.fn() },
    { id: "logs", label: "Server Logs", category: "view", action: vi.fn() },
  ];

  it("renders command list", () => {
    const { lastFrame } = render(<CommandPalette commands={mockCommands} onSelect={vi.fn()} onClose={vi.fn()} />);

    const output = lastFrame();
    expect(output).toContain("Start Server");
    expect(output).toContain("Add Account");
  });

  it("shows search input", () => {
    const { lastFrame } = render(<CommandPalette commands={mockCommands} onSelect={vi.fn()} onClose={vi.fn()} />);

    const output = lastFrame();
    // Should have a search/filter area
    expect(output).toContain(">");
  });
});
