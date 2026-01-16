/**
 * useShareClient Hook Tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useShareClient } from "../../../../src/tui/hooks/useShareClient.js";

// Mock fetch globally - use a function that can be replaced per-test
const mockFetch = vi.fn();

describe("useShareClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    // Default to returning a resolved promise to prevent undefined.catch errors
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should initialize in disconnected state", () => {
    const { result } = renderHook(() => useShareClient());

    expect(result.current.connected).toBe(false);
    expect(result.current.quotaData).toBeNull();
    expect(result.current.clientId).toBeNull();
    expect(result.current.connecting).toBe(false);
    expect(result.current.reconnecting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastPollAt).toBeNull();
  });

  it("should connect to remote host", async () => {
    // Mock registration response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ clientId: "test-client-id", pollInterval: 10 }),
    });

    // Mock quota response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        claude: { totalPercentage: 80, accountCount: 1, status: "stable" },
        gemini: { totalPercentage: 60, accountCount: 1, status: "stable" },
        timestamp: new Date().toISOString(),
      }),
    });

    const { result } = renderHook(() => useShareClient());

    await act(async () => {
      await result.current.connect("https://test.trycloudflare.com", "api-key", "testuser");
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.clientId).toBe("test-client-id");
    expect(result.current.connecting).toBe(false);
  });

  it("should disconnect from remote host", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ clientId: "test-client-id", pollInterval: 10 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ claude: {}, gemini: {}, timestamp: "" }),
    });

    const { result } = renderHook(() => useShareClient());

    await act(async () => {
      await result.current.connect("https://test.trycloudflare.com", "api-key");
    });

    expect(result.current.connected).toBe(true);

    await act(async () => {
      result.current.disconnect();
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.quotaData).toBeNull();
    expect(result.current.clientId).toBeNull();
  });

  it("should handle connection error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useShareClient());

    await act(async () => {
      await result.current.connect("https://test.trycloudflare.com", "api-key");
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.error).toContain("Network error");
    expect(result.current.connecting).toBe(false);
  });

  it("should store quota data after connection", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ clientId: "test-client-id", pollInterval: 10 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        claude: {
          totalPercentage: 75,
          accountCount: 2,
          status: "stable",
          hoursToExhaustion: 5,
          ratePerHour: 2,
        },
        gemini: {
          totalPercentage: 50,
          accountCount: 1,
          status: "stable",
          hoursToExhaustion: null,
          ratePerHour: null,
        },
        timestamp: "2024-01-01T00:00:00.000Z",
      }),
    });

    const { result } = renderHook(() => useShareClient());

    await act(async () => {
      await result.current.connect("https://test.trycloudflare.com", "api-key");
    });

    expect(result.current.quotaData).not.toBeNull();
    expect(result.current.quotaData?.claude.totalPercentage).toBe(75);
    expect(result.current.quotaData?.gemini.accountCount).toBe(1);
  });

  it("should update lastPollAt after connection", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ clientId: "test-client-id", pollInterval: 10 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        claude: { totalPercentage: 80, accountCount: 1, status: "stable" },
        gemini: { totalPercentage: 60, accountCount: 1, status: "stable" },
        timestamp: new Date().toISOString(),
      }),
    });

    const { result } = renderHook(() => useShareClient());

    expect(result.current.lastPollAt).toBeNull();

    await act(async () => {
      await result.current.connect("https://test.trycloudflare.com", "api-key");
    });

    expect(result.current.lastPollAt).not.toBeNull();
    expect(typeof result.current.lastPollAt).toBe("number");
  });

  it("should handle HTTP error on registration", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid API key" }),
    });

    const { result } = renderHook(() => useShareClient());

    await act(async () => {
      await result.current.connect("https://test.trycloudflare.com", "bad-api-key");
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBe("Invalid API key");
  });

  it("should clear state on disconnect", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ clientId: "test-client-id", pollInterval: 10 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        claude: { totalPercentage: 80, accountCount: 1, status: "stable" },
        gemini: { totalPercentage: 60, accountCount: 1, status: "stable" },
        timestamp: new Date().toISOString(),
      }),
    });

    const { result } = renderHook(() => useShareClient());

    await act(async () => {
      await result.current.connect("https://test.trycloudflare.com", "api-key");
    });

    expect(result.current.clientId).toBe("test-client-id");
    expect(result.current.quotaData).not.toBeNull();
    expect(result.current.lastPollAt).not.toBeNull();

    await act(async () => {
      result.current.disconnect();
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.clientId).toBeNull();
    expect(result.current.quotaData).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.lastPollAt).toBeNull();
  });

  it("should handle HTTP error without JSON body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("No JSON");
      },
    });

    const { result } = renderHook(() => useShareClient());

    await act(async () => {
      await result.current.connect("https://test.trycloudflare.com", "api-key");
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBe("HTTP 500");
  });

  it("should expose connect and disconnect functions", () => {
    const { result } = renderHook(() => useShareClient());

    expect(typeof result.current.connect).toBe("function");
    expect(typeof result.current.disconnect).toBe("function");
  });

  describe("polling with interval 0", () => {
    it("should not start polling when pollInterval is 0", async () => {
      // pollInterval of 0 means no enforced minimum - client polls once on connect
      // but does not set up recurring interval
      const setIntervalSpy = vi.spyOn(global, "setInterval");

      // Simulate registration response with pollInterval: 0
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ clientId: "test-123", pollInterval: 0 }),
      });

      // Simulate quota fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ claude: {}, gemini: {}, timestamp: "" }),
      });

      const { result } = renderHook(() => useShareClient());
      await act(async () => {
        await result.current.connect("http://test", "key123");
      });

      // setInterval should not be called when pollInterval is 0
      expect(setIntervalSpy).not.toHaveBeenCalled();
      setIntervalSpy.mockRestore();
    });

    it("should start polling when pollInterval is greater than 0", async () => {
      const setIntervalSpy = vi.spyOn(global, "setInterval");

      // Simulate registration response with pollInterval: 10
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ clientId: "test-123", pollInterval: 10 }),
      });

      // Simulate quota fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ claude: {}, gemini: {}, timestamp: "" }),
      });

      const { result } = renderHook(() => useShareClient());
      await act(async () => {
        await result.current.connect("http://test", "key123");
      });

      // setInterval should be called when pollInterval > 0
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10000);
      setIntervalSpy.mockRestore();
    });
  });
});
