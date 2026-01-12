/**
 * useShareState Hook Tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useShareState } from "../../../../src/tui/hooks/useShareState.js";

vi.mock("../../../../src/share/tunnel.js", () => ({
  TunnelManager: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getUrl: vi.fn(() => null),
    isRunning: vi.fn(() => false),
  })),
  checkCloudflaredInstalled: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../../../src/share/config-storage.js", () => ({
  loadShareConfig: vi.fn().mockResolvedValue({
    auth: { enabled: true, mode: "single", masterKey: "test", friendKeys: [] },
    visibility: { showAccountEmails: false, showIndividualAccounts: true, showModelBreakdown: true, showBurnRate: false },
    limits: { maxClients: 5, pollIntervalSeconds: 10 },
    persistence: { resumeOnRestart: false },
  }),
  saveShareConfig: vi.fn().mockResolvedValue(undefined),
  getDefaultShareConfig: vi.fn().mockReturnValue({
    auth: { enabled: true, mode: "single", masterKey: null, friendKeys: [] },
    visibility: { showAccountEmails: false, showIndividualAccounts: true, showModelBreakdown: true, showBurnRate: false },
    limits: { maxClients: 5, pollIntervalSeconds: 10 },
    persistence: { resumeOnRestart: false },
  }),
}));

describe("useShareState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize in normal mode", async () => {
    const { result } = renderHook(() => useShareState({ port: 8080 }));

    // Wait for initial load
    await vi.waitFor(() => {
      expect(result.current.mode).toBe("normal");
    });
  });

  it("should have startSharing function", async () => {
    const { result } = renderHook(() => useShareState({ port: 8080 }));

    await vi.waitFor(() => {
      expect(result.current.startSharing).toBeDefined();
    });
  });

  it("should have stopSharing function", async () => {
    const { result } = renderHook(() => useShareState({ port: 8080 }));

    await vi.waitFor(() => {
      expect(result.current.stopSharing).toBeDefined();
    });
  });
});
