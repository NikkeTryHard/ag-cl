/**
 * useCapacity Hook Tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCapacity } from "../../../../src/tui/hooks/useCapacity.js";

// Mock the dependencies
vi.mock("../../../../src/account-manager/storage.js", () => ({
  loadAccounts: vi.fn().mockResolvedValue({
    accounts: [{ email: "test@example.com", source: "oauth", refreshToken: "token" }],
    settings: {},
    activeIndex: 0,
  }),
}));

vi.mock("../../../../src/auth/oauth.js", () => ({
  refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: "access", expiresIn: 3600 }),
}));

vi.mock("../../../../src/cloudcode/quota-api.js", () => ({
  fetchAccountCapacity: vi.fn().mockResolvedValue({
    email: "test@example.com",
    tier: "PRO",
    claudePool: { models: [], aggregatedPercentage: 75, earliestReset: null },
    geminiPool: { models: [], aggregatedPercentage: 100, earliestReset: null },
    projectId: null,
    lastUpdated: Date.now(),
    isForbidden: false,
  }),
}));

vi.mock("../../../../src/cloudcode/burn-rate.js", () => ({
  calculateBurnRate: vi.fn().mockReturnValue({
    ratePerHour: null,
    hoursToExhaustion: null,
    status: "stable",
  }),
}));

describe("useCapacity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading state initially", () => {
    const { result } = renderHook(() => useCapacity());
    expect(result.current.loading).toBe(true);
  });

  it("returns aggregated capacity after loading", async () => {
    const { result } = renderHook(() => useCapacity());

    // Wait for async loading
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.claudeCapacity.totalPercentage).toBe(75);
    expect(result.current.geminiCapacity.totalPercentage).toBe(100);
    expect(result.current.accountCount).toBe(1);
  });

  it("provides refresh function", async () => {
    const { result } = renderHook(() => useCapacity());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.refresh).toBe("function");
  });
});
