/**
 * Unit tests for credentials.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getTokenForAccount, getProjectForAccount, discoverProject, clearTokenCache, clearProjectCache } from "../../../src/account-manager/credentials.js";
import { createAccount } from "../../helpers/factories.js";
import { createMockResponse } from "../../helpers/mocks.js";
import type { Account, TokenCacheEntry } from "../../../src/account-manager/types.js";

// Mock the OAuth module
vi.mock("../../../src/auth/oauth.js", () => ({
  refreshAccessToken: vi.fn(),
}));

// Mock the database module
vi.mock("../../../src/auth/database.js", () => ({
  getAuthStatus: vi.fn(),
}));

describe("credentials", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getTokenForAccount", () => {
    it("returns cached token when valid", async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const account = createAccount({ email: "a@example.com", source: "oauth", refreshToken: "refresh-token" }) as Account;
      const tokenCache = new Map<string, TokenCacheEntry>();
      tokenCache.set("a@example.com", { token: "cached-token", extractedAt: now });

      const token = await getTokenForAccount(account, tokenCache, undefined, undefined);
      expect(token).toBe("cached-token");
    });

    it("refreshes token when cache is expired", async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // TOKEN_REFRESH_INTERVAL_MS is 5 * 60 * 1000 = 300000
      const expiredTime = now - 400000;

      const account = createAccount({ email: "a@example.com", source: "oauth", refreshToken: "refresh-token" }) as Account;
      const tokenCache = new Map<string, TokenCacheEntry>();
      tokenCache.set("a@example.com", { token: "old-token", extractedAt: expiredTime });

      const { refreshAccessToken } = await import("../../../src/auth/oauth.js");
      vi.mocked(refreshAccessToken).mockResolvedValue({ accessToken: "new-token", expiresIn: 3600 });

      const token = await getTokenForAccount(account, tokenCache, undefined, undefined);
      expect(token).toBe("new-token");
      expect(refreshAccessToken).toHaveBeenCalledWith("refresh-token");
    });

    it("refreshes token when cache is empty", async () => {
      const account = createAccount({ email: "a@example.com", source: "oauth", refreshToken: "refresh-token" }) as Account;
      const tokenCache = new Map<string, TokenCacheEntry>();

      const { refreshAccessToken } = await import("../../../src/auth/oauth.js");
      vi.mocked(refreshAccessToken).mockResolvedValue({ accessToken: "fresh-token", expiresIn: 3600 });

      const token = await getTokenForAccount(account, tokenCache, undefined, undefined);
      expect(token).toBe("fresh-token");
    });

    it("clears invalid flag on successful token refresh", async () => {
      const account = createAccount({
        email: "a@example.com",
        source: "oauth",
        refreshToken: "refresh-token",
        isInvalid: true,
        invalidReason: "Old error",
      }) as Account;
      const tokenCache = new Map<string, TokenCacheEntry>();
      const onSave = vi.fn();

      const { refreshAccessToken } = await import("../../../src/auth/oauth.js");
      vi.mocked(refreshAccessToken).mockResolvedValue({ accessToken: "new-token", expiresIn: 3600 });

      await getTokenForAccount(account, tokenCache, undefined, onSave);

      expect(account.isInvalid).toBe(false);
      expect(account.invalidReason).toBeNull();
      expect(onSave).toHaveBeenCalled();
    });

    it("marks account invalid on auth failure", async () => {
      const account = createAccount({ email: "a@example.com", source: "oauth", refreshToken: "bad-token" }) as Account;
      const tokenCache = new Map<string, TokenCacheEntry>();
      const onInvalid = vi.fn();

      const { refreshAccessToken } = await import("../../../src/auth/oauth.js");
      vi.mocked(refreshAccessToken).mockRejectedValue(new Error("Token expired"));

      await expect(getTokenForAccount(account, tokenCache, onInvalid, undefined)).rejects.toThrow("AUTH_INVALID");
      expect(onInvalid).toHaveBeenCalledWith("a@example.com", "Token expired");
    });

    it("throws network error without marking invalid", async () => {
      const account = createAccount({ email: "a@example.com", source: "oauth", refreshToken: "refresh-token" }) as Account;
      const tokenCache = new Map<string, TokenCacheEntry>();
      const onInvalid = vi.fn();

      const { refreshAccessToken } = await import("../../../src/auth/oauth.js");
      vi.mocked(refreshAccessToken).mockRejectedValue(new Error("fetch failed"));

      await expect(getTokenForAccount(account, tokenCache, onInvalid, undefined)).rejects.toThrow("AUTH_NETWORK_ERROR");
      expect(onInvalid).not.toHaveBeenCalled();
    });

    it("uses apiKey for manual accounts", async () => {
      const account = createAccount({ email: "a@example.com", source: "manual", apiKey: "manual-api-key" }) as Account;
      const tokenCache = new Map<string, TokenCacheEntry>();

      const token = await getTokenForAccount(account, tokenCache, undefined, undefined);
      expect(token).toBe("manual-api-key");
    });

    it("extracts token from database for database accounts", async () => {
      const account = createAccount({ email: "a@example.com", source: "database" }) as Account;
      const tokenCache = new Map<string, TokenCacheEntry>();

      const { getAuthStatus } = await import("../../../src/auth/database.js");
      vi.mocked(getAuthStatus).mockReturnValue({ apiKey: "db-token", email: "a@example.com" });

      const token = await getTokenForAccount(account, tokenCache, undefined, undefined);
      expect(token).toBe("db-token");
    });

    it("caches the token after retrieval", async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const account = createAccount({ email: "a@example.com", source: "oauth", refreshToken: "refresh-token" }) as Account;
      const tokenCache = new Map<string, TokenCacheEntry>();

      const { refreshAccessToken } = await import("../../../src/auth/oauth.js");
      vi.mocked(refreshAccessToken).mockResolvedValue({ accessToken: "new-token", expiresIn: 3600 });

      await getTokenForAccount(account, tokenCache, undefined, undefined);

      expect(tokenCache.get("a@example.com")).toEqual({
        token: "new-token",
        extractedAt: now,
      });
    });
  });

  describe("getProjectForAccount", () => {
    it("returns cached project when available", async () => {
      const account = createAccount({ email: "a@example.com" }) as Account;
      const projectCache = new Map<string, string>();
      projectCache.set("a@example.com", "cached-project");

      const project = await getProjectForAccount(account, "token", projectCache);
      expect(project).toBe("cached-project");
    });

    it("returns account projectId when specified", async () => {
      const account = createAccount({ email: "a@example.com", projectId: "account-project" }) as Account;
      const projectCache = new Map<string, string>();

      const project = await getProjectForAccount(account, "token", projectCache);
      expect(project).toBe("account-project");
      expect(projectCache.get("a@example.com")).toBe("account-project");
    });

    it("discovers project via API when not cached", async () => {
      const account = createAccount({ email: "a@example.com" }) as Account;
      const projectCache = new Map<string, string>();

      mockFetch.mockResolvedValue(createMockResponse({}, JSON.stringify({ cloudaicompanionProject: "discovered-project" }), 200));

      const project = await getProjectForAccount(account, "token", projectCache);
      expect(project).toBe("discovered-project");
      expect(projectCache.get("a@example.com")).toBe("discovered-project");
    });
  });

  describe("discoverProject", () => {
    it("returns project ID from string response", async () => {
      mockFetch.mockResolvedValue(createMockResponse({}, JSON.stringify({ cloudaicompanionProject: "project-123" }), 200));

      const project = await discoverProject("token");
      expect(project).toBe("project-123");
    });

    it("returns project ID from object response", async () => {
      mockFetch.mockResolvedValue(createMockResponse({}, JSON.stringify({ cloudaicompanionProject: { id: "project-456" } }), 200));

      const project = await discoverProject("token");
      expect(project).toBe("project-456");
    });

    it("falls back to next endpoint on error", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, "error", 500)).mockResolvedValueOnce(createMockResponse({}, JSON.stringify({ cloudaicompanionProject: "fallback-project" }), 200));

      const project = await discoverProject("token");
      expect(project).toBe("fallback-project");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("returns default project when all endpoints fail", async () => {
      mockFetch.mockResolvedValue(createMockResponse({}, "error", 500));

      const project = await discoverProject("token");
      // DEFAULT_PROJECT_ID from constants
      expect(project).toBe("rising-fact-p41fc");
    });

    it("handles fetch exceptions", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const project = await discoverProject("token");
      expect(project).toBe("rising-fact-p41fc");
    });
  });

  describe("clearProjectCache", () => {
    it("clears specific email from cache", () => {
      const projectCache = new Map<string, string>();
      projectCache.set("a@example.com", "project-a");
      projectCache.set("b@example.com", "project-b");

      clearProjectCache(projectCache, "a@example.com");

      expect(projectCache.has("a@example.com")).toBe(false);
      expect(projectCache.has("b@example.com")).toBe(true);
    });

    it("clears entire cache when email is null", () => {
      const projectCache = new Map<string, string>();
      projectCache.set("a@example.com", "project-a");
      projectCache.set("b@example.com", "project-b");

      clearProjectCache(projectCache, null);

      expect(projectCache.size).toBe(0);
    });
  });

  describe("clearTokenCache", () => {
    it("clears specific email from cache", () => {
      const tokenCache = new Map<string, TokenCacheEntry>();
      tokenCache.set("a@example.com", { token: "token-a", extractedAt: Date.now() });
      tokenCache.set("b@example.com", { token: "token-b", extractedAt: Date.now() });

      clearTokenCache(tokenCache, "a@example.com");

      expect(tokenCache.has("a@example.com")).toBe(false);
      expect(tokenCache.has("b@example.com")).toBe(true);
    });

    it("clears entire cache when email is null", () => {
      const tokenCache = new Map<string, TokenCacheEntry>();
      tokenCache.set("a@example.com", { token: "token-a", extractedAt: Date.now() });
      tokenCache.set("b@example.com", { token: "token-b", extractedAt: Date.now() });

      clearTokenCache(tokenCache, null);

      expect(tokenCache.size).toBe(0);
    });
  });
});
