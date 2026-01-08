/**
 * AddAccountModal Component Tests
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "ink-testing-library";
import { AddAccountModal } from "../../../../src/tui/components/AddAccountModal.js";

// Mock useTerminalSize
vi.mock("../../../../src/tui/hooks/useTerminalSize.js", () => ({
  useTerminalSize: () => ({ width: 80, height: 24 }),
}));

// Mock OAuth functions
vi.mock("../../../../src/auth/oauth.js", () => ({
  getAuthorizationUrl: vi.fn(() => ({
    url: "https://accounts.google.com/oauth/test",
    verifier: "test-verifier",
    state: "test-state",
  })),
  startCallbackServer: vi.fn(() => Promise.resolve("test-code")),
  completeOAuthFlow: vi.fn(() =>
    Promise.resolve({
      email: "test@example.com",
      refreshToken: "test-refresh-token",
    }),
  ),
}));

// Mock account storage
vi.mock("../../../../src/account-manager/storage.js", () => ({
  loadAccounts: vi.fn(() =>
    Promise.resolve({
      accounts: [],
      settings: {},
      activeIndex: 0,
    }),
  ),
  saveAccounts: vi.fn(() => Promise.resolve()),
}));

// Mock open (browser opener)
vi.mock("open", () => ({
  default: vi.fn(() => Promise.resolve()),
}));

describe("AddAccountModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders choose method screen initially", () => {
    const { lastFrame } = render(<AddAccountModal onClose={() => {}} onAccountAdded={() => {}} />);

    expect(lastFrame()).toContain("Add Account");
    expect(lastFrame()).toContain("Choose authentication method");
    expect(lastFrame()).toContain("[1]");
    expect(lastFrame()).toContain("OAuth with browser");
    expect(lastFrame()).toContain("[2]");
    expect(lastFrame()).toContain("OAuth without browser");
  });

  it("shows escape hint", () => {
    const { lastFrame } = render(<AddAccountModal onClose={() => {}} onAccountAdded={() => {}} />);

    expect(lastFrame()).toContain("ESC to cancel");
  });

  it("accepts onClose and onAccountAdded callbacks", () => {
    const onClose = vi.fn();
    const onAccountAdded = vi.fn();

    const { lastFrame } = render(<AddAccountModal onClose={onClose} onAccountAdded={onAccountAdded} />);

    // Component should render without calling callbacks initially
    expect(onClose).not.toHaveBeenCalled();
    expect(onAccountAdded).not.toHaveBeenCalled();
    expect(lastFrame()).toContain("Add Account");
  });
});
