import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { ConnectedClientsPanel } from "../../../../src/tui/components/ConnectedClientsPanel.js";
import type { ConnectedClient } from "../../../../src/share/types.js";

describe("ConnectedClientsPanel", () => {
  const mockClients: ConnectedClient[] = [
    {
      id: "client-1",
      key: "abc***",
      nickname: "bob",
      connectedAt: Date.now() - 300000, // 5 min ago
      lastPollAt: Date.now() - 10000,
      pollCount: 30,
    },
    {
      id: "client-2",
      key: "def***",
      nickname: null,
      connectedAt: Date.now() - 120000, // 2 min ago
      lastPollAt: Date.now() - 5000,
      pollCount: 12,
    },
  ];

  it("should show empty message when no clients", () => {
    const { lastFrame } = render(<ConnectedClientsPanel clients={[]} maxClients={5} />);

    expect(lastFrame()).toContain("No clients connected");
  });

  it("should show client count header", () => {
    const { lastFrame } = render(<ConnectedClientsPanel clients={mockClients} maxClients={5} />);

    expect(lastFrame()).toContain("Connected Clients");
    expect(lastFrame()).toContain("2/5");
  });

  it("should display client nickname", () => {
    const { lastFrame } = render(<ConnectedClientsPanel clients={mockClients} maxClients={5} />);

    expect(lastFrame()).toContain("bob");
  });

  it("should display masked key for clients without nickname", () => {
    const { lastFrame } = render(<ConnectedClientsPanel clients={mockClients} maxClients={5} />);

    expect(lastFrame()).toContain("def***");
  });

  it("should show connection time", () => {
    const { lastFrame } = render(<ConnectedClientsPanel clients={mockClients} maxClients={5} />);

    expect(lastFrame()).toContain("5m");
  });
});
