/**
 * Tests for src/auth/token-extractor.ts
 * Token extraction from Antigravity's SQLite database
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the module
vi.mock("../../../src/auth/database.js", () => ({
  getAuthStatus: vi.fn(),
}));

vi.mock("../../../src/utils/logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  })),
  initLogger: vi.fn(),
  setLogLevel: vi.fn(),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import { getToken, forceRefresh } from "../../../src/auth/token-extractor.js";
import { getAuthStatus } from "../../../src/auth/database.js";
import { TOKEN_REFRESH_INTERVAL_MS, ANTIGRAVITY_AUTH_PORT } from "../../../src/constants.js";

describe("auth/token-extractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset module state by forcing a refresh on first call
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("getToken", () => {
    it("returns token from database when available", async () => {
      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "db-token-12345" });

      // Force refresh to clear any cached state
      const token = await forceRefresh();

      expect(token).toBe("db-token-12345");
      expect(getAuthStatus).toHaveBeenCalled();
    });

    it("caches token and returns cached value on subsequent calls", async () => {
      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "cached-token" });

      // First call - should fetch from DB
      await forceRefresh();
      vi.mocked(getAuthStatus).mockClear();

      // Second call within refresh interval - should use cache
      const token = await getToken();

      expect(token).toBe("cached-token");
      expect(getAuthStatus).not.toHaveBeenCalled();
    });

    it("refreshes token after TOKEN_REFRESH_INTERVAL_MS", async () => {
      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "initial-token" });

      // First call
      await forceRefresh();
      vi.mocked(getAuthStatus).mockClear();

      // Advance time past refresh interval
      vi.advanceTimersByTime(TOKEN_REFRESH_INTERVAL_MS + 1000);

      // Mock new token for refresh
      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "refreshed-token" });

      const token = await getToken();

      expect(token).toBe("refreshed-token");
      expect(getAuthStatus).toHaveBeenCalled();
    });

    it("falls back to HTML page when database fails", async () => {
      vi.mocked(getAuthStatus).mockImplementation(() => {
        throw new Error("Database not found");
      });

      // Mock HTML page response
      const base64Params = Buffer.from(JSON.stringify({ apiKey: "html-token" })).toString("base64");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(`<html>window.chatParams = '${base64Params}'</html>`),
      });

      const token = await forceRefresh();

      expect(token).toBe("html-token");
      expect(mockFetch).toHaveBeenCalledWith(`http://127.0.0.1:${ANTIGRAVITY_AUTH_PORT}/`);
    });

    it("throws when both database and HTML page fail", async () => {
      vi.mocked(getAuthStatus).mockImplementation(() => {
        throw new Error("Database error");
      });

      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      await expect(forceRefresh()).rejects.toThrow("Could not extract token from Antigravity");
    });

    it("throws with ECONNREFUSED message when Antigravity not running", async () => {
      vi.mocked(getAuthStatus).mockImplementation(() => {
        throw new Error("Database error");
      });

      const connError = new Error("Connection refused") as NodeJS.ErrnoException;
      connError.code = "ECONNREFUSED";
      mockFetch.mockRejectedValueOnce(connError);

      await expect(forceRefresh()).rejects.toThrow("Could not extract token from Antigravity");
    });

    it("handles missing chatParams in HTML", async () => {
      vi.mocked(getAuthStatus).mockImplementation(() => {
        throw new Error("Database error");
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("<html>No chatParams here</html>"),
      });

      await expect(forceRefresh()).rejects.toThrow("Could not extract token from Antigravity");
    });

    it("handles HTML page with missing apiKey", async () => {
      vi.mocked(getAuthStatus).mockImplementation(() => {
        throw new Error("Database error");
      });

      const base64Params = Buffer.from(JSON.stringify({ email: "test@test.com" })).toString("base64");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(`<html>window.chatParams = '${base64Params}'</html>`),
      });

      await expect(forceRefresh()).rejects.toThrow("Could not extract token from Antigravity");
    });
  });

  describe("forceRefresh", () => {
    it("clears cache and fetches fresh token", async () => {
      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "old-token" });

      // Get initial token
      await forceRefresh();

      // Update mock to return new token
      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "new-token" });

      // Force refresh should get new token even within refresh interval
      const token = await forceRefresh();

      expect(token).toBe("new-token");
    });

    it("resets both cachedToken and tokenExtractedAt", async () => {
      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "token-1" });

      await forceRefresh();
      vi.mocked(getAuthStatus).mockClear();

      // Force refresh
      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "token-2" });
      await forceRefresh();

      // Should have called getAuthStatus again
      expect(getAuthStatus).toHaveBeenCalled();
    });
  });

  describe("needsRefresh (internal logic)", () => {
    it("returns true when no cached token exists", async () => {
      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "fresh-token" });

      // Force clear cache
      await forceRefresh();
      vi.mocked(getAuthStatus).mockClear();

      // Clear cache again
      await forceRefresh();

      expect(getAuthStatus).toHaveBeenCalled();
    });

    it("returns false when token is fresh", async () => {
      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "cached-token" });

      await forceRefresh();
      vi.mocked(getAuthStatus).mockClear();

      // Advance time but stay within refresh interval
      vi.advanceTimersByTime(TOKEN_REFRESH_INTERVAL_MS - 1000);

      await getToken();

      // Should not call database again
      expect(getAuthStatus).not.toHaveBeenCalled();
    });

    it("returns true when token has expired", async () => {
      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "expired-token" });

      await forceRefresh();
      vi.mocked(getAuthStatus).mockClear();

      // Advance time past refresh interval
      vi.advanceTimersByTime(TOKEN_REFRESH_INTERVAL_MS + 1);

      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "new-token" });
      await getToken();

      expect(getAuthStatus).toHaveBeenCalled();
    });
  });

  describe("extractChatParams (internal via getToken fallback)", () => {
    beforeEach(() => {
      // Always fail database to trigger HTML fallback
      vi.mocked(getAuthStatus).mockImplementation(() => {
        throw new Error("Database not available");
      });
    });

    it("parses base64 encoded chatParams from HTML", async () => {
      const chatParams = { apiKey: "base64-token", email: "test@example.com" };
      const base64 = Buffer.from(JSON.stringify(chatParams)).toString("base64");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(`<html><script>window.chatParams = '${base64}'</script></html>`),
      });

      const token = await forceRefresh();

      expect(token).toBe("base64-token");
    });

    it("handles chatParams with special characters", async () => {
      const chatParams = { apiKey: "token-with-special-chars!@#$%^&*()" };
      const base64 = Buffer.from(JSON.stringify(chatParams)).toString("base64");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(`window.chatParams = '${base64}'`),
      });

      const token = await forceRefresh();

      expect(token).toBe("token-with-special-chars!@#$%^&*()");
    });

    it("handles connection refused error", async () => {
      const error = new Error("Connection refused") as NodeJS.ErrnoException;
      error.code = "ECONNREFUSED";

      mockFetch.mockRejectedValueOnce(error);

      await expect(forceRefresh()).rejects.toThrow("Could not extract token from Antigravity");
    });
  });
});
