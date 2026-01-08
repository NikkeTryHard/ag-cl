/**
 * useSettings Hook Tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useSettings } from "../../../../src/tui/hooks/useSettings.js";

// Mock the storage module
const mockLoadAccounts = vi.fn();
const mockSaveAccounts = vi.fn();

vi.mock("../../../../src/account-manager/storage.js", () => ({
  loadAccounts: (...args: unknown[]) => mockLoadAccounts(...args),
  saveAccounts: (...args: unknown[]) => mockSaveAccounts(...args),
}));

// Mock demo mode to be off by default
vi.mock("../../../../src/tui/demo.js", () => ({
  isDemoMode: vi.fn().mockReturnValue(false),
}));

describe("useSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadAccounts.mockResolvedValue({
      accounts: [{ email: "test@example.com", source: "oauth", refreshToken: "token" }],
      settings: {
        cooldownDurationMs: 5000,
        identityMode: "short",
        defaultPort: 8080,
      },
      activeIndex: 0,
    });
    mockSaveAccounts.mockResolvedValue(undefined);
  });

  it("returns loading state initially", () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.loading).toBe(true);
  });

  it("loads settings from disk on mount", async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockLoadAccounts).toHaveBeenCalled();
    expect(result.current.settings).toEqual({
      cooldownDurationMs: 5000,
      identityMode: "short",
      defaultPort: 8080,
    });
  });

  it("returns empty settings when no settings exist", async () => {
    mockLoadAccounts.mockResolvedValue({
      accounts: [],
      settings: {},
      activeIndex: 0,
    });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.settings).toEqual({});
  });

  it("provides updateSettings function", async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.updateSettings).toBe("function");
  });

  it("updates settings and saves to disk", async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateSettings({ defaultPort: 3000 });
    });

    // Should have called saveAccounts with merged settings
    expect(mockSaveAccounts).toHaveBeenCalledWith(
      expect.any(String), // config path
      expect.any(Array), // accounts
      {
        cooldownDurationMs: 5000,
        identityMode: "short",
        defaultPort: 3000, // Updated
      },
      expect.any(Number), // activeIndex
    );

    // Local state should be updated
    expect(result.current.settings.defaultPort).toBe(3000);
  });

  it("merges partial settings with existing settings", async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateSettings({ fallbackEnabled: true });
    });

    expect(result.current.settings).toEqual({
      cooldownDurationMs: 5000,
      identityMode: "short",
      defaultPort: 8080,
      fallbackEnabled: true, // New property
    });
  });

  it("provides reload function", async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.reload).toBe("function");
  });

  it("reloads settings from disk", async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Clear mocks and set new values
    mockLoadAccounts.mockClear();
    mockLoadAccounts.mockResolvedValue({
      accounts: [],
      settings: { defaultPort: 9999 },
      activeIndex: 0,
    });

    await act(async () => {
      await result.current.reload();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockLoadAccounts).toHaveBeenCalled();
    expect(result.current.settings.defaultPort).toBe(9999);
  });

  it("handles loading errors", async () => {
    mockLoadAccounts.mockRejectedValue(new Error("Config file corrupted"));

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Config file corrupted");
  });

  it("handles save errors by rethrowing", async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockSaveAccounts.mockRejectedValue(new Error("Permission denied"));

    // Should throw the error when save fails
    await expect(result.current.updateSettings({ defaultPort: 3000 })).rejects.toThrow("Permission denied");

    // Original settings should remain unchanged since save failed
    expect(result.current.settings.defaultPort).toBe(8080);
  });
});
