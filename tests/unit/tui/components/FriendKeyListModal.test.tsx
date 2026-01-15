/**
 * FriendKeyListModal Tests
 * @vitest-environment jsdom
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "ink-testing-library";
import { FriendKeyListModal } from "../../../../src/tui/components/FriendKeyListModal.js";
import type { FriendKey } from "../../../../src/share/types.js";

// Mock useTerminalSize
vi.mock("../../../../src/tui/hooks/useTerminalSize.js", () => ({
  useTerminalSize: () => ({ width: 80, height: 24 }),
}));

describe("FriendKeyListModal", () => {
  const mockOnClose = vi.fn();
  const mockOnAdd = vi.fn();
  const mockOnRevoke = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnCopy = vi.fn();

  const sampleKeys: FriendKey[] = [
    { key: "key-001", nickname: "Alice", revoked: false, createdAt: Date.now() - 86400000 },
    { key: "key-002", nickname: "Bob", revoked: true, createdAt: Date.now() - 172800000 },
    { key: "key-003", nickname: null, revoked: false, createdAt: Date.now() },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays header", () => {
    const { lastFrame } = render(<FriendKeyListModal friendKeys={[]} onClose={mockOnClose} onAdd={mockOnAdd} onRevoke={mockOnRevoke} onDelete={mockOnDelete} onCopy={mockOnCopy} />);

    expect(lastFrame()).toContain("Friend Keys");
  });

  it("shows empty state when no keys", () => {
    const { lastFrame } = render(<FriendKeyListModal friendKeys={[]} onClose={mockOnClose} onAdd={mockOnAdd} onRevoke={mockOnRevoke} onDelete={mockOnDelete} onCopy={mockOnCopy} />);

    expect(lastFrame()).toContain("No friend keys");
  });

  it("displays friend keys with nicknames", () => {
    const { lastFrame } = render(<FriendKeyListModal friendKeys={sampleKeys} onClose={mockOnClose} onAdd={mockOnAdd} onRevoke={mockOnRevoke} onDelete={mockOnDelete} onCopy={mockOnCopy} />);

    expect(lastFrame()).toContain("Alice");
    expect(lastFrame()).toContain("Bob");
    // Masked key should show
    expect(lastFrame()).toContain("key***");
  });

  it("shows revoked status", () => {
    const { lastFrame } = render(<FriendKeyListModal friendKeys={sampleKeys} onClose={mockOnClose} onAdd={mockOnAdd} onRevoke={mockOnRevoke} onDelete={mockOnDelete} onCopy={mockOnCopy} />);

    expect(lastFrame()).toContain("REVOKED");
  });

  it("shows hotkey hints", () => {
    const { lastFrame } = render(<FriendKeyListModal friendKeys={sampleKeys} onClose={mockOnClose} onAdd={mockOnAdd} onRevoke={mockOnRevoke} onDelete={mockOnDelete} onCopy={mockOnCopy} />);

    expect(lastFrame()).toMatch(/A.*add/i);
    expect(lastFrame()).toMatch(/Y.*copy/i);
    expect(lastFrame()).toMatch(/R.*revoke/i);
    expect(lastFrame()).toMatch(/D.*delete/i);
  });

  it("shows copied feedback", () => {
    const { lastFrame } = render(<FriendKeyListModal friendKeys={sampleKeys} onClose={mockOnClose} onAdd={mockOnAdd} onRevoke={mockOnRevoke} onDelete={mockOnDelete} onCopy={mockOnCopy} copied={true} />);

    expect(lastFrame()).toContain("Copied!");
  });

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("calls onClose when ESC is pressed", async () => {
    const { stdin } = render(<FriendKeyListModal friendKeys={sampleKeys} onClose={mockOnClose} onAdd={mockOnAdd} onRevoke={mockOnRevoke} onDelete={mockOnDelete} onCopy={mockOnCopy} />);

    await delay(10);
    stdin.write("\u001b"); // ESC
    await delay(50);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it("calls onCopy when 'y' is pressed with selection", async () => {
    const { stdin } = render(<FriendKeyListModal friendKeys={sampleKeys} onClose={mockOnClose} onAdd={mockOnAdd} onRevoke={mockOnRevoke} onDelete={mockOnDelete} onCopy={mockOnCopy} />);

    await delay(10);
    stdin.write("y");
    await delay(50);
    expect(mockOnCopy).toHaveBeenCalledWith("key-001");
  });

  it("calls onRevoke when 'r' is pressed on non-revoked key", async () => {
    const { stdin } = render(<FriendKeyListModal friendKeys={sampleKeys} onClose={mockOnClose} onAdd={mockOnAdd} onRevoke={mockOnRevoke} onDelete={mockOnDelete} onCopy={mockOnCopy} />);

    await delay(10);
    stdin.write("r");
    await delay(50);
    expect(mockOnRevoke).toHaveBeenCalledWith("key-001");
  });

  it("calls onDelete when 'd' is pressed with selection", async () => {
    const { stdin } = render(<FriendKeyListModal friendKeys={sampleKeys} onClose={mockOnClose} onAdd={mockOnAdd} onRevoke={mockOnRevoke} onDelete={mockOnDelete} onCopy={mockOnCopy} />);

    await delay(10);
    stdin.write("d");
    await delay(50);
    expect(mockOnDelete).toHaveBeenCalledWith("key-001");
  });

  it("enters add mode when 'a' is pressed", async () => {
    const { stdin, lastFrame } = render(
      <FriendKeyListModal
        friendKeys={sampleKeys}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        onRevoke={mockOnRevoke}
        onDelete={mockOnDelete}
        onCopy={mockOnCopy}
      />,
    );

    await delay(10);
    stdin.write("a");
    await delay(50);
    expect(lastFrame()).toContain("Add Friend Key");
    expect(lastFrame()).toContain("Nickname (optional)");
  });

  it("returns to list mode when ESC pressed in add mode", async () => {
    const { stdin, lastFrame } = render(
      <FriendKeyListModal
        friendKeys={sampleKeys}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        onRevoke={mockOnRevoke}
        onDelete={mockOnDelete}
        onCopy={mockOnCopy}
      />,
    );

    await delay(10);
    stdin.write("a"); // Enter add mode
    await delay(50);
    expect(lastFrame()).toContain("Add Friend Key");

    stdin.write("\u001b"); // ESC
    await delay(50);
    expect(lastFrame()).toContain("Friend Keys");
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("calls onAdd when Enter is pressed in add mode", async () => {
    const { stdin } = render(
      <FriendKeyListModal
        friendKeys={sampleKeys}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        onRevoke={mockOnRevoke}
        onDelete={mockOnDelete}
        onCopy={mockOnCopy}
      />,
    );

    await delay(10);
    stdin.write("a"); // Enter add mode
    await delay(50);
    stdin.write("\r"); // Enter to confirm
    await delay(50);
    expect(mockOnAdd).toHaveBeenCalledWith(null); // Empty nickname becomes null
  });
});
