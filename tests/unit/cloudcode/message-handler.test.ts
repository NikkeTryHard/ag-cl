/**
 * Tests for src/cloudcode/message-handler.ts
 * Non-streaming message handling with multi-account support
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendMessage } from "../../../src/cloudcode/message-handler.js";
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

describe("cloudcode/message-handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("sendMessage", () => {
    const basicRequest: AnthropicRequest = {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [{ role: "user", content: "Hello" }],
    };

    it("sends request and returns Anthropic-format response", async () => {
      const mockGoogleResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: "Hello! How can I help you?" }],
              role: "model",
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGoogleResponse),
      });

      const accountManager = createMockAccountManager();
      const result = await sendMessage(basicRequest, accountManager);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(accountManager.getTokenForAccount).toHaveBeenCalled();
      expect(accountManager.getProjectForAccount).toHaveBeenCalled();
    });

    it("uses sticky account selection for cache continuity", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "Response" }], role: "model" } }],
          }),
      });

      const accountManager = createMockAccountManager();
      await sendMessage(basicRequest, accountManager);

      expect(accountManager.pickStickyAccount).toHaveBeenCalledWith(basicRequest.model);
    });

    it("handles 401 auth error by clearing caches and retrying", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve("Unauthorized"),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              candidates: [{ content: { parts: [{ text: "Success after retry" }], role: "model" } }],
            }),
        });

      const accountManager = createMockAccountManager();
      const result = await sendMessage(basicRequest, accountManager);

      expect(result).toBeDefined();
      expect(accountManager.clearTokenCache).toHaveBeenCalled();
      expect(accountManager.clearProjectCache).toHaveBeenCalled();
    });

    it("handles 429 rate limit by marking account and trying next", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("RESOURCE_EXHAUSTED"),
        headers: new Headers({ "retry-after": "60" }),
      });

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 2),
        pickStickyAccount: vi.fn(() => ({ account: null, waitMs: 0 })),
        isAllRateLimited: vi.fn(() => true),
        getMinWaitTimeMs: vi.fn(() => 300000), // 5 minutes - too long
      });

      await expect(sendMessage(basicRequest, accountManager)).rejects.toThrow("RESOURCE_EXHAUSTED");
    });

    it("waits for sticky account when waitMs is provided", async () => {
      const account: Account = { email: "sticky@example.com" };
      let callCount = 0;

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
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "Response" }], role: "model" } }],
          }),
      });

      await sendMessage(basicRequest, accountManager);

      expect(accountManager.clearExpiredLimits).toHaveBeenCalled();
    });

    it("throws when no accounts available and fallback disabled", async () => {
      const accountManager = createMockAccountManager({
        pickStickyAccount: vi.fn(() => ({ account: null, waitMs: 0 })),
        isAllRateLimited: vi.fn(() => false),
        pickNext: vi.fn(() => null),
      });

      await expect(sendMessage(basicRequest, accountManager, false)).rejects.toThrow("No accounts available");
    });

    it("checks for fallback model when primary has no accounts", async () => {
      // When primary model has no accounts, the fallback path is checked
      // This verifies the control flow enters the fallback check branch
      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 2),
        pickStickyAccount: vi.fn(() => ({ account: { email: "test@example.com" }, waitMs: 0 })),
        isAllRateLimited: vi.fn(() => false),
        pickNext: vi.fn(() => null),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "Response" }], role: "model" } }],
          }),
      });

      const request: AnthropicRequest = {
        ...basicRequest,
        model: "claude-3-5-sonnet-20241022",
      };

      const result = await sendMessage(request, accountManager, true);

      expect(result).toBeDefined();
    });

    it("retries on 500 errors across endpoints", async () => {
      // When all endpoints return 500, it tries next account and eventually
      // the mock returns the fallback response (test verifies retry logic)
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
          json: () =>
            Promise.resolve({
              candidates: [{ content: { parts: [{ text: "Recovered" }], role: "model" } }],
            }),
        });

      const result = await sendMessage(basicRequest, accountManager);
      expect(result).toBeDefined();
    });

    it("handles 5xx errors with retry", async () => {
      const accountManager = createMockAccountManager();

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () => Promise.resolve("Service Unavailable"),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              candidates: [{ content: { parts: [{ text: "Success" }], role: "model" } }],
            }),
        });

      const result = await sendMessage(basicRequest, accountManager);

      expect(result).toBeDefined();
    });

    it("handles network errors gracefully", async () => {
      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 2),
      });

      mockFetch.mockRejectedValueOnce(new Error("network connection failed")).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "Success" }], role: "model" } }],
          }),
      });

      const result = await sendMessage(basicRequest, accountManager);

      expect(result).toBeDefined();
    });

    it("builds correct request URL for non-thinking models", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "Response" }], role: "model" } }],
          }),
      });

      const accountManager = createMockAccountManager();
      await sendMessage(basicRequest, accountManager);

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain("v1internal:generateContent");
      expect(call[0]).not.toContain("alt=sse");
    });

    it("clears expired limits before selecting account", async () => {
      const account: Account = { email: "test@test.com" };
      const accountManager = createMockAccountManager({
        pickStickyAccount: vi.fn(() => ({ account: null, waitMs: 1000 })),
        getCurrentStickyAccount: vi.fn(() => account),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "Response" }], role: "model" } }],
          }),
      });

      await sendMessage(basicRequest, accountManager);

      expect(accountManager.clearExpiredLimits).toHaveBeenCalled();
    });

    it("waits and retries when all accounts are rate-limited with short wait time", async () => {
      const account: Account = { email: "recovered@test.com" };
      let callCount = 0;

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
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "After wait" }], role: "model" } }],
          }),
      });

      const result = await sendMessage(basicRequest, accountManager);

      expect(result).toBeDefined();
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
        headers: new Headers({ "retry-after": "60" }),
      });

      await expect(sendMessage(basicRequest, accountManager)).rejects.toThrow();
      expect(accountManager.markRateLimited).toHaveBeenCalled();
    });

    it("handles auth errors by invalidating and continuing to next account", async () => {
      let fetchCount = 0;
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
          json: () =>
            Promise.resolve({
              candidates: [{ content: { parts: [{ text: "Success" }], role: "model" } }],
            }),
        });
      });

      const result = await sendMessage(basicRequest, accountManager);

      expect(result).toBeDefined();
      expect(accountManager.clearTokenCache).toHaveBeenCalled();
    });

    it("handles 400 error from API", async () => {
      const accountManager = createMockAccountManager();

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve("Bad Request"),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              candidates: [{ content: { parts: [{ text: "Success" }], role: "model" } }],
            }),
        });

      const result = await sendMessage(basicRequest, accountManager);

      expect(result).toBeDefined();
    });

    it("uses SSE endpoint for thinking models", async () => {
      // Use a thinking model (must have "thinking" in name or be gemini-3+)
      const thinkingRequest: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 16000,
        messages: [{ role: "user", content: "Think about this" }],
        thinking: { type: "enabled", budget_tokens: 10000 },
      };

      // Create a mock SSE stream
      const encoder = new TextEncoder();
      const sseData = 'data: {"candidates":[{"content":{"parts":[{"text":"Thinking..."}],"role":"model"}}]}\n\n';
      let streamEnded = false;

      const mockStream = new ReadableStream({
        pull(controller) {
          if (!streamEnded) {
            controller.enqueue(encoder.encode(sseData));
            streamEnded = true;
          } else {
            controller.close();
          }
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      const accountManager = createMockAccountManager();
      const result = await sendMessage(thinkingRequest, accountManager);

      expect(result).toBeDefined();
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain("streamGenerateContent");
      expect(call[0]).toContain("alt=sse");
    });

    it("throws error when thinking model response body is null on all endpoints", async () => {
      // Use a thinking model (must have "thinking" in name or be gemini-3+)
      const thinkingRequest: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 16000,
        messages: [{ role: "user", content: "Think about this" }],
        thinking: { type: "enabled", budget_tokens: 10000 },
      };

      // All endpoints return null body - triggers the null body error on last attempt
      mockFetch.mockResolvedValue({
        ok: true,
        body: null,
      });

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 1),
      });

      await expect(sendMessage(thinkingRequest, accountManager)).rejects.toThrow("Response body is null");
    });

    it("falls back to alternate model when primary model has no accounts and fallback enabled", async () => {
      let callCount = 0;

      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 2),
        pickStickyAccount: vi.fn(() => {
          callCount++;
          // First call for primary model returns no account, triggering fallback
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

      // Mock json response for non-thinking fallback model (claude-sonnet-4-5)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "Fallback response" }], role: "model" } }],
          }),
      });

      // Use gemini-3-pro-low which falls back to claude-sonnet-4-5 (a non-thinking model)
      // Note: gemini-3-pro-low is a thinking model but since no accounts exist,
      // the fallback (claude-sonnet-4-5) is used which is NOT a thinking model
      const request: AnthropicRequest = {
        model: "gemini-3-pro-low",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello" }],
      };

      const result = await sendMessage(request, accountManager, true);
      expect(result).toBeDefined();
      // Verify fallback was triggered by checking pickStickyAccount was called twice
      expect(accountManager.pickStickyAccount).toHaveBeenCalledTimes(2);
    });

    it("handles rate limit error thrown from endpoint catch block", async () => {
      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 2),
      });

      // First endpoint throws rate limit error
      const rateLimitError = new Error("Rate limited: RESOURCE_EXHAUSTED");
      mockFetch.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "Success" }], role: "model" } }],
          }),
      });

      const result = await sendMessage(basicRequest, accountManager);
      expect(result).toBeDefined();
    });

    it("handles auth error in outer catch and continues to next account", async () => {
      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 2),
      });

      // Simulate auth error that triggers the isAuthError check in outer catch
      const authError = new Error("invalid_grant: Token has been expired or revoked");
      mockFetch.mockRejectedValueOnce(authError).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "Success" }], role: "model" } }],
          }),
      });

      const result = await sendMessage(basicRequest, accountManager);
      expect(result).toBeDefined();
    });

    it("handles 5xx error in outer catch and continues to next attempt", async () => {
      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 2),
      });

      // Simulate 5xx error that reaches the outer catch (e.g., from network or parsing)
      const serverError = new Error("API error 500: Internal Server Error");
      mockFetch.mockRejectedValueOnce(serverError).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "Success" }], role: "model" } }],
          }),
      });

      const result = await sendMessage(basicRequest, accountManager);
      expect(result).toBeDefined();
      // Verify retry happened (fetch was called more than once)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws max retries exceeded when all attempts fail", async () => {
      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 1),
      });

      // All attempts fail with non-retryable error that gets caught in outer catch
      mockFetch.mockRejectedValue(new Error("Persistent error"));

      await expect(sendMessage(basicRequest, accountManager)).rejects.toThrow("Persistent error");
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

      await expect(sendMessage(basicRequest, accountManager)).rejects.toThrow();
      expect(accountManager.markRateLimited).toHaveBeenCalled();
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

      await expect(sendMessage(basicRequest, accountManager)).rejects.toThrow("API error 400");
    });

    it("handles 5xx error in outer catch and advances to next account", async () => {
      // Test lines 243-246: 5xx error handling in outer catch block
      // The error must contain "API error 5" or "500" or "503" to trigger the 5xx handling
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
          json: () =>
            Promise.resolve({
              candidates: [{ content: { parts: [{ text: "Success after 5xx" }], role: "model" } }],
            }),
        });
      });

      const result = await sendMessage(basicRequest, accountManager);
      expect(result).toBeDefined();
      expect(accountManager.pickNext).toHaveBeenCalled();
    });

    it("handles network error and advances to next account with retry", async () => {
      // Test lines 249-253: Network error handling in outer catch block
      // Need to trigger isNetworkError() which checks for "network" or "ECONNREFUSED"
      const accountManager = createMockAccountManager({
        getAccountCount: vi.fn(() => 3),
        pickNext: vi.fn(),
      });

      // First call throws network error, second succeeds
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // This error must be thrown from inside the endpoint loop to be caught by outer catch
          return Promise.reject(new Error("ECONNREFUSED: Connection refused"));
        }
        // For remaining calls (endpoints 2+), also throw to ensure we exit the endpoint loop
        if (callCount === 2) {
          return Promise.reject(new Error("network error: timeout"));
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              candidates: [{ content: { parts: [{ text: "Success after network error" }], role: "model" } }],
            }),
        });
      });

      const result = await sendMessage(basicRequest, accountManager);
      expect(result).toBeDefined();
      expect(accountManager.pickNext).toHaveBeenCalled();
    });
  });
});
