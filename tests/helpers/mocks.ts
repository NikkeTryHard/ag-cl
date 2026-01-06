/**
 * Common Mock Utilities
 *
 * Factory functions for creating test mocks.
 */

import { vi } from "vitest";

/**
 * Create a mock Response object
 */
export function createMockResponse(headers: Record<string, string> = {}, body = "", status = 200): Response {
  const headersLower: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    headersLower[key.toLowerCase()] = value;
  }

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : status === 429 ? "Too Many Requests" : "Error",
    headers: {
      get: (name: string) => headersLower[name.toLowerCase()] ?? null,
      has: (name: string) => name.toLowerCase() in headersLower,
      forEach: (cb: (value: string, key: string) => void) => {
        for (const [key, value] of Object.entries(headersLower)) {
          cb(value, key);
        }
      },
    },
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body || "{}")),
    clone: function () {
      return createMockResponse(headers, body, status);
    },
  } as unknown as Response;
}

/**
 * Create a mock ReadableStream from chunks
 */
export function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

/**
 * Create a mock Response with a ReadableStream body
 */
export function createMockStreamResponse(chunks: string[], headers: Record<string, string> = {}, status = 200): Response {
  const headersLower: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    headersLower[key.toLowerCase()] = value;
  }

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: {
      get: (name: string) => headersLower[name.toLowerCase()] ?? null,
      has: (name: string) => name.toLowerCase() in headersLower,
    },
    body: createMockStream(chunks),
  } as unknown as Response;
}

/**
 * Create a mock logger (alternative to global mock)
 */
export function createMockLogger() {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    log: vi.fn(),
    header: vi.fn(),
    setDebug: vi.fn(),
    isDebugEnabled: false,
  };
}

/**
 * Create a mock fetch function
 */
export function createMockFetch(responses: Response[]): typeof fetch {
  let callIndex = 0;
  return vi.fn(() => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return Promise.resolve(response);
  }) as unknown as typeof fetch;
}

/**
 * Create a mock AccountManager interface
 * Provides all methods required by AccountManagerInterface
 */
export function createMockAccountManager(
  overrides: Partial<{
    getAccountCount: ReturnType<typeof vi.fn>;
    pickStickyAccount: ReturnType<typeof vi.fn>;
    getCurrentStickyAccount: ReturnType<typeof vi.fn>;
    isAllRateLimited: ReturnType<typeof vi.fn>;
    getMinWaitTimeMs: ReturnType<typeof vi.fn>;
    clearExpiredLimits: ReturnType<typeof vi.fn>;
    pickNext: ReturnType<typeof vi.fn>;
    markRateLimited: ReturnType<typeof vi.fn>;
    markInvalid: ReturnType<typeof vi.fn>;
    getTokenForAccount: ReturnType<typeof vi.fn>;
    getProjectForAccount: ReturnType<typeof vi.fn>;
    clearTokenCache: ReturnType<typeof vi.fn>;
    clearProjectCache: ReturnType<typeof vi.fn>;
    resetAllRateLimits: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const defaultAccount = { email: "test@example.com", source: "oauth" };

  return {
    getAccountCount: vi.fn(() => 1),
    pickStickyAccount: vi.fn(() => ({
      account: defaultAccount,
      waitMs: 0,
      switched: false,
    })),
    getCurrentStickyAccount: vi.fn(() => defaultAccount),
    isAllRateLimited: vi.fn(() => false),
    getMinWaitTimeMs: vi.fn(() => 0),
    clearExpiredLimits: vi.fn(() => 0),
    pickNext: vi.fn(() => defaultAccount),
    markRateLimited: vi.fn(),
    markInvalid: vi.fn(),
    getTokenForAccount: vi.fn(() => Promise.resolve("mock-token")),
    getProjectForAccount: vi.fn(() => Promise.resolve("mock-project")),
    clearTokenCache: vi.fn(),
    clearProjectCache: vi.fn(),
    resetAllRateLimits: vi.fn(),
    ...overrides,
  };
}
