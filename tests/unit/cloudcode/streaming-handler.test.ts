/**
 * Tests for src/cloudcode/streaming-handler.ts
 * Streaming message handling with multi-account support
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendMessageStream } from "../../../src/cloudcode/streaming-handler.js";
import type { AccountManagerInterface, Account } from "../../../src/cloudcode/message-handler.js";
import type { AnthropicRequest } from "../../../src/format/types.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock logger
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

// Mock helpers
vi.mock("../../../src/utils/helpers.js", () => ({
  formatDuration: vi.fn((ms: number) => `${ms}ms`),
  sleep: vi.fn(() => Promise.resolve()),
  isNetworkError: vi.fn((err: Error) => err.message.includes("network") || err.message.includes("ECONNREFUSED")),
}));

// Helper to create a mock ReadableStream from SSE data
function createMockSSEStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

// Create a mock account manager
function createMockAccountManager(overrides: Partial<AccountManagerInterface> = {}): AccountManagerInterface {
  const defaultAccount: Account = {
    email: "test@example.com",
    source: "test",
    credentials: { refresh_token: "test-refresh-token" },
  };

  return {
    getAccountCount: vi.fn(() => 1),
    pickStickyAccount: vi.fn(() => ({ account: defaultAccount, waitMs: 0 })),
    getCurrentStickyAccount: vi.fn(() => defaultAccount),
    isAllRateLimited: vi.fn(() => false),
    getMinWaitTimeMs: vi.fn(() => 0),
    clearExpiredLimits: vi.fn(() => 0),
    pickNext: vi.fn(() => defaultAccount),
    markRateLimited: vi.fn(),
    getTokenForAccount: vi.fn(() => Promise.resolve("mock-access-token")),
    getProjectForAccount: vi.fn(() => Promise.resolve("mock-project-id")),
    clearTokenCache: vi.fn(),
    clearProjectCache: vi.fn(),
    ...overrides,
  };
}

describe("cloudcode/streaming-handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("sendMessageStream", () => {
    const basicRequest: AnthropicRequest = {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [{ role: "user", content: "Hello" }],
      stream: true,
    };

    it("streams SSE events from the response", async () => {
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"}}]}\n\n', 'data: {"candidates":[{"content":{"parts":[{"text":" World"}],"role":"model"}}]}\n\n'];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(sseEvents),
      });

      const accountManager = createMockAccountManager();
      const events: unknown[] = [];

      for await (const event of sendMessageStream(basicRequest, accountManager)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
    });

    it("uses sticky account selection", async () => {
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Hi"}],"role":"model"}}]}\n\n'];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(sseEvents),
      });

      const accountManager = createMockAccountManager();

      for await (const _ of sendMessageStream(basicRequest, accountManager)) {
        // consume events
      }

      expect(accountManager.pickStickyAccount).toHaveBeenCalledWith(basicRequest.model);
    });

    it("handles 401 auth error by clearing caches and retrying", async () => {
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Success"}],"role":"model"}}]}\n\n'];

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve("Unauthorized"),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: createMockSSEStream(sseEvents),
        });

      const accountManager = createMockAccountManager();
      const events: unknown[] = [];

      for await (const event of sendMessageStream(basicRequest, accountManager)) {
        events.push(event);
      }

      expect(accountManager.clearTokenCache).toHaveBeenCalled();
      expect(accountManager.clearProjectCache).toHaveBeenCalled();
    });

    it("handles 429 rate limit with long wait time by throwing", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("RESOURCE_EXHAUSTED"),
      });

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 1),
        pickStickyAccount: vi.fn(() => ({ account: null, waitMs: 0 })),
        isAllRateLimited: vi.fn(() => true),
        getMinWaitTimeMs: vi.fn(() => 300000), // 5 minutes
      });

      await expect(async () => {
        for await (const _ of sendMessageStream(basicRequest, accountManager)) {
          // consume events
        }
      }).rejects.toThrow("RESOURCE_EXHAUSTED");
    });

    it("throws when no accounts available and fallback disabled", async () => {
      const accountManager = createMockAccountManager({
        pickStickyAccount: vi.fn(() => ({ account: null, waitMs: 0 })),
        isAllRateLimited: vi.fn(() => false),
        pickNext: vi.fn(() => null),
      });

      await expect(async () => {
        for await (const _ of sendMessageStream(basicRequest, accountManager, false)) {
          // consume events
        }
      }).rejects.toThrow("No accounts available");
    });

    it("streams when account is available", async () => {
      // Basic streaming test with account available
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Streaming"}],"role":"model"}}]}\n\n'];

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 2),
        pickStickyAccount: vi.fn(() => ({ account: { email: "test@example.com" }, waitMs: 0 })),
        isAllRateLimited: vi.fn(() => false),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(sseEvents),
      });

      const events: unknown[] = [];
      for await (const event of sendMessageStream(basicRequest, accountManager, true)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
    });

    it("builds correct streaming URL", async () => {
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Test"}],"role":"model"}}]}\n\n'];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(sseEvents),
      });

      const accountManager = createMockAccountManager();

      for await (const _ of sendMessageStream(basicRequest, accountManager)) {
        // consume events
      }

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain("v1internal:streamGenerateContent");
      expect(call[0]).toContain("alt=sse");
    });

    it("retries on null body across endpoints", async () => {
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Success"}],"role":"model"}}]}\n\n'];

      // First endpoint returns null body, second succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          body: null,
        })
        .mockResolvedValueOnce({
          ok: true,
          body: createMockSSEStream(sseEvents),
        });

      const accountManager = createMockAccountManager();
      const events: unknown[] = [];

      for await (const event of sendMessageStream(basicRequest, accountManager)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
    });

    it("recovers on 500 error and streams successfully", async () => {
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Recovered"}],"role":"model"}}]}\n\n'];

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 1),
        pickStickyAccount: vi.fn(() => ({ account: { email: "test@test.com" }, waitMs: 0 })),
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Internal Server Error"),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: createMockSSEStream(sseEvents),
        });

      const events: unknown[] = [];
      for await (const event of sendMessageStream(basicRequest, accountManager)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
    });

    it("handles 5xx errors with retry", async () => {
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Success"}],"role":"model"}}]}\n\n'];

      const accountManager = createMockAccountManager();

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () => Promise.resolve("Service Unavailable"),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: createMockSSEStream(sseEvents),
        });

      const events: unknown[] = [];
      for await (const event of sendMessageStream(basicRequest, accountManager)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
    });

    it("waits for sticky account when waitMs is provided", async () => {
      const account: Account = { email: "sticky@example.com" };
      let callCount = 0;

      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"After wait"}],"role":"model"}}]}\n\n'];

      const accountManager = createMockAccountManager({
        pickStickyAccount: vi.fn(() => {
          callCount++;
          if (callCount === 1) {
            return { account: null, waitMs: 1000 };
          }
          return { account, waitMs: 0 };
        }),
        getCurrentStickyAccount: vi.fn(() => account),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(sseEvents),
      });

      for await (const _ of sendMessageStream(basicRequest, accountManager)) {
        // consume events
      }

      expect(accountManager.clearExpiredLimits).toHaveBeenCalled();
    });

    it("handles network errors gracefully", async () => {
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Success"}],"role":"model"}}]}\n\n'];

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 2),
      });

      mockFetch.mockRejectedValueOnce(new Error("network connection failed")).mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(sseEvents),
      });

      const events: unknown[] = [];
      for await (const event of sendMessageStream(basicRequest, accountManager)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
    });

    it("waits and retries when all accounts are rate-limited with short wait time", async () => {
      const account: Account = { email: "recovered@test.com" };
      let callCount = 0;

      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"After wait"}],"role":"model"}}]}\n\n'];

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 1),
        pickStickyAccount: vi.fn(() => {
          callCount++;
          if (callCount === 1) return { account: null, waitMs: 0 };
          return { account, waitMs: 0 };
        }),
        isAllRateLimited: vi.fn(() => callCount === 1),
        getMinWaitTimeMs: vi.fn(() => 5000), // 5 seconds - short enough to wait
        pickNext: vi.fn(() => account),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(sseEvents),
      });

      const events: unknown[] = [];
      for await (const event of sendMessageStream(basicRequest, accountManager)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
    });

    it("handles 429 error from endpoint and marks account rate-limited", async () => {
      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 2),
      });

      // All endpoints return 429
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("RESOURCE_EXHAUSTED"),
      });

      await expect(async () => {
        for await (const _ of sendMessageStream(basicRequest, accountManager)) {
          // consume events
        }
      }).rejects.toThrow();

      expect(accountManager.markRateLimited).toHaveBeenCalled();
    });

    it("handles auth errors by clearing caches and continuing", async () => {
      let fetchCount = 0;
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Success"}],"role":"model"}}]}\n\n'];

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 3),
      });

      mockFetch.mockImplementation(() => {
        fetchCount++;
        if (fetchCount <= 2) {
          return Promise.resolve({
            ok: false,
            status: 401,
            text: () => Promise.resolve("Unauthorized"),
          });
        }
        return Promise.resolve({
          ok: true,
          body: createMockSSEStream(sseEvents),
        });
      });

      const events: unknown[] = [];
      for await (const event of sendMessageStream(basicRequest, accountManager)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(accountManager.clearTokenCache).toHaveBeenCalled();
    });

    it("handles 400 error from API and retries on next endpoint", async () => {
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Success"}],"role":"model"}}]}\n\n'];

      const accountManager = createMockAccountManager();

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve("Bad Request"),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: createMockSSEStream(sseEvents),
        });

      const events: unknown[] = [];
      for await (const event of sendMessageStream(basicRequest, accountManager)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
    });

    it("throws error when all endpoints return null body", async () => {
      // All endpoints return null body - triggers the null body error
      mockFetch.mockResolvedValue({
        ok: true,
        body: null,
      });

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 1),
      });

      await expect(async () => {
        for await (const _ of sendMessageStream(basicRequest, accountManager)) {
          // consume events
        }
      }).rejects.toThrow("Response body is null");
    });

    it("falls back to alternate model when primary model has no accounts and fallback enabled", async () => {
      let callCount = 0;
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Fallback"}],"role":"model"}}]}\n\n'];

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 2),
        pickStickyAccount: vi.fn(() => {
          callCount++;
          // First call for primary model returns no account
          if (callCount === 1) return { account: null, waitMs: 0 };
          // Fallback model call returns an account
          return { account: { email: "fallback@test.com" }, waitMs: 0 };
        }),
        isAllRateLimited: vi.fn(() => false),
        pickNext: vi.fn(() => {
          // Return null for primary to trigger fallback path
          if (callCount === 1) return null;
          return { email: "fallback@test.com" };
        }),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockSSEStream(sseEvents),
      });

      // Use gemini-3-pro-low which falls back to claude-sonnet-4-5 (a non-thinking model for simpler mock)
      const request: AnthropicRequest = {
        model: "gemini-3-pro-low",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      };

      const events: unknown[] = [];
      for await (const event of sendMessageStream(request, accountManager, true)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(accountManager.pickStickyAccount).toHaveBeenCalledTimes(2);
    });

    it("handles rate limit error thrown from endpoint catch block", async () => {
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Success"}],"role":"model"}}]}\n\n'];

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 2),
      });

      // First endpoint throws rate limit error
      const rateLimitError = new Error("Rate limited: RESOURCE_EXHAUSTED");
      mockFetch.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(sseEvents),
      });

      const events: unknown[] = [];
      for await (const event of sendMessageStream(basicRequest, accountManager)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
    });

    it("handles auth error in outer catch and continues to next account", async () => {
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Success"}],"role":"model"}}]}\n\n'];

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 2),
      });

      // Simulate auth error that triggers the isAuthError check in outer catch
      const authError = new Error("invalid_grant: Token has been expired or revoked");
      mockFetch.mockRejectedValueOnce(authError).mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(sseEvents),
      });

      const events: unknown[] = [];
      for await (const event of sendMessageStream(basicRequest, accountManager)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
    });

    it("handles 5xx error in outer catch and continues to next attempt", async () => {
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Success"}],"role":"model"}}]}\n\n'];

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 2),
      });

      // Simulate 5xx error that reaches the outer catch
      const serverError = new Error("API error 500: Internal Server Error");
      mockFetch.mockRejectedValueOnce(serverError).mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(sseEvents),
      });

      const events: unknown[] = [];
      for await (const event of sendMessageStream(basicRequest, accountManager)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws non-retryable error from lastError when all endpoints fail with 4xx", async () => {
      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 1),
      });

      // All endpoints return 400 (non-retryable 4xx)
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad Request: Invalid parameters"),
      });

      await expect(async () => {
        for await (const _ of sendMessageStream(basicRequest, accountManager)) {
          // consume events
        }
      }).rejects.toThrow("API error 400");
    });

    it("handles 429 and tracks minimum reset time across endpoints", async () => {
      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 1),
      });

      // First endpoint returns 429 with longer reset time
      // Second endpoint returns 429 with shorter reset time
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve("RESOURCE_EXHAUSTED - long wait"),
          headers: new Headers({ "retry-after": "120" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve("RESOURCE_EXHAUSTED - short wait"),
          headers: new Headers({ "retry-after": "30" }),
        });

      await expect(async () => {
        for await (const _ of sendMessageStream(basicRequest, accountManager)) {
          // consume events
        }
      }).rejects.toThrow();
      expect(accountManager.markRateLimited).toHaveBeenCalled();
    });

    it("throws error when all attempts fail with persistent error", async () => {
      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 1),
      });

      // All attempts fail with non-retryable error that gets caught in outer catch
      mockFetch.mockRejectedValue(new Error("Persistent error"));

      await expect(async () => {
        for await (const _ of sendMessageStream(basicRequest, accountManager)) {
          // consume events
        }
      }).rejects.toThrow("Persistent error");
    });

    it("handles 5xx error in outer catch and advances to next account for streaming", async () => {
      // Test lines 193-196: 5xx error handling in outer catch block (streaming)
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Success"}],"role":"model"}}]}\n\n'];

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 3),
        pickNext: vi.fn(),
      });

      // All endpoints fail with 503 for first account, success for second
      let attemptCount = 0;
      mockFetch.mockImplementation(() => {
        attemptCount++;
        // First two attempts (both endpoints for first account) fail with 503
        if (attemptCount <= 2) {
          return Promise.resolve({
            ok: false,
            status: 503,
            text: () => Promise.resolve("Service Unavailable"),
          });
        }
        // Third attempt succeeds (second account)
        return Promise.resolve({
          ok: true,
          body: createMockSSEStream(sseEvents),
        });
      });

      const events: unknown[] = [];
      for await (const event of sendMessageStream(basicRequest, accountManager)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(accountManager.pickNext).toHaveBeenCalled();
    });

    it("handles network error in outer catch and advances to next account for streaming", async () => {
      // Test lines 199-203: Network error handling in outer catch block (streaming)
      const sseEvents = ['data: {"candidates":[{"content":{"parts":[{"text":"Success"}],"role":"model"}}]}\n\n'];

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 3),
        pickNext: vi.fn(),
      });

      // First call throws network error, second succeeds
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("ECONNREFUSED: Connection refused"));
        }
        if (callCount === 2) {
          return Promise.reject(new Error("network error: timeout"));
        }
        return Promise.resolve({
          ok: true,
          body: createMockSSEStream(sseEvents),
        });
      });

      const events: unknown[] = [];
      for await (const event of sendMessageStream(basicRequest, accountManager)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(accountManager.pickNext).toHaveBeenCalled();
    });
  });
});
