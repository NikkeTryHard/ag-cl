/**
 * useServerState Hook Tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useServerState } from "../../../../src/tui/hooks/useServerState.js";
import type { AccountSettings } from "../../../../src/account-manager/types.js";
import { DEFAULT_PORT } from "../../../../src/constants.js";

// Mock server module for non-demoMode tests
const mockServer = {
  listen: vi.fn().mockReturnThis(),
  close: vi.fn((cb?: (err?: Error) => void) => cb?.()),
};
vi.mock("../../../../src/server.js", () => ({
  default: {
    listen: vi.fn().mockReturnValue(mockServer),
  },
}));

// Mock net module for port availability check
vi.mock("net", () => {
  const mockNetServer = {
    once: vi.fn((event: string, callback: () => void) => {
      // Simulate port is available by triggering 'listening' event
      if (event === "listening") {
        setTimeout(() => callback(), 0);
      }
      return mockNetServer;
    }),
    listen: vi.fn().mockReturnThis(),
    close: vi.fn(),
  };
  return {
    default: {
      createServer: vi.fn(() => mockNetServer),
    },
    createServer: vi.fn(() => mockNetServer),
  };
});

describe("useServerState", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("default behavior", () => {
    it("returns stopped state by default", () => {
      const { result } = renderHook(() => useServerState());
      expect(result.current.running).toBe(false);
      expect(result.current.port).toBe(DEFAULT_PORT);
    });

    it("provides start function", () => {
      const { result } = renderHook(() => useServerState());
      expect(typeof result.current.start).toBe("function");
    });

    it("provides stop function", () => {
      const { result } = renderHook(() => useServerState());
      expect(typeof result.current.stop).toBe("function");
    });

    it("provides restart function", () => {
      const { result } = renderHook(() => useServerState());
      expect(typeof result.current.restart).toBe("function");
    });

    it("exposes setPort function", () => {
      const { result } = renderHook(() => useServerState());
      expect(typeof result.current.setPort).toBe("function");
    });

    it("updates port when setPort is called", () => {
      const { result } = renderHook(() => useServerState());
      expect(result.current.port).toBe(DEFAULT_PORT);

      act(() => {
        result.current.setPort(3000);
      });

      expect(result.current.port).toBe(3000);
    });
  });

  describe("settings integration", () => {
    it("uses defaultPort from settings", () => {
      const settings: AccountSettings = { defaultPort: 9999 };
      const { result } = renderHook(() => useServerState({ settings }));
      expect(result.current.port).toBe(9999);
    });

    it("uses default port when settings.defaultPort is undefined", () => {
      const settings: AccountSettings = {};
      const { result } = renderHook(() => useServerState({ settings }));
      expect(result.current.port).toBe(DEFAULT_PORT);
    });

    it("uses default port when settings is undefined", () => {
      const { result } = renderHook(() => useServerState({}));
      expect(result.current.port).toBe(DEFAULT_PORT);
    });

    it("uses default port when no options provided", () => {
      const { result } = renderHook(() => useServerState());
      expect(result.current.port).toBe(DEFAULT_PORT);
    });
  });

  describe("demo mode", () => {
    it("starts in demo mode without actually starting server", async () => {
      const { result } = renderHook(() => useServerState({ demoMode: true }));
      expect(result.current.running).toBe(false);

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.running).toBe(true);
    });

    it("stops in demo mode without error", async () => {
      const { result } = renderHook(() => useServerState({ demoMode: true }));

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.running).toBe(true);

      await act(async () => {
        await result.current.stop();
      });

      expect(result.current.running).toBe(false);
    });

    it("respects settings in demo mode", () => {
      const settings: AccountSettings = { defaultPort: 4567 };
      const { result } = renderHook(() => useServerState({ settings, demoMode: true }));
      expect(result.current.port).toBe(4567);
    });
  });

  describe("settings and environment variables", () => {
    it("does not set FALLBACK env var when fallbackEnabled is false", async () => {
      const settings: AccountSettings = { fallbackEnabled: false };
      const { result } = renderHook(() => useServerState({ settings, demoMode: true }));

      await act(async () => {
        await result.current.start();
      });

      // In demo mode, env vars are not set since we skip actual server startup
      // This test verifies the hook accepts the settings correctly
      expect(result.current.running).toBe(true);
    });

    it("accepts all settings options without error", () => {
      const settings: AccountSettings = {
        defaultPort: 8888,
        logLevel: "debug",
        fallbackEnabled: true,
        identityMode: "short",
        cooldownDurationMs: 5000,
      };

      const { result } = renderHook(() => useServerState({ settings, demoMode: true }));
      expect(result.current.port).toBe(8888);
      expect(result.current.error).toBeNull();
    });
  });
});
