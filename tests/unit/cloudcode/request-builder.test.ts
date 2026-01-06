/**
 * Unit tests for request-builder
 *
 * Tests building Cloud Code API request payloads and headers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildCloudCodeRequest, buildHeaders } from "../../../src/cloudcode/request-builder.js";
import type { AnthropicRequest } from "../../../src/format/types.js";
import { createAnthropicRequest } from "../../helpers/factories.js";

// Mock crypto.randomUUID for predictable request IDs
vi.mock("crypto", async () => {
  const actual = await vi.importActual<typeof import("crypto")>("crypto");
  return {
    ...actual,
    randomUUID: vi.fn(() => "mocked-uuid-12345678"),
  };
});

describe("buildCloudCodeRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("request structure", () => {
    it("builds request with required fields", () => {
      const anthropicRequest = createAnthropicRequest({
        model: "claude-sonnet-4-5-thinking",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 1024,
      });

      const result = buildCloudCodeRequest(anthropicRequest, "test-project-id");

      expect(result).toHaveProperty("project", "test-project-id");
      expect(result).toHaveProperty("model", "claude-sonnet-4-5-thinking");
      expect(result).toHaveProperty("request");
      expect(result).toHaveProperty("userAgent", "antigravity");
      expect(result).toHaveProperty("requestId");
    });

    it("includes request ID with agent prefix", () => {
      const anthropicRequest = createAnthropicRequest();

      const result = buildCloudCodeRequest(anthropicRequest, "project-123");

      expect(result.requestId).toMatch(/^agent-/);
    });

    it("converts Anthropic request to Google format", () => {
      const anthropicRequest = createAnthropicRequest({
        model: "gemini-3-flash",
        messages: [{ role: "user", content: "Test message" }],
        max_tokens: 2048,
      });

      const result = buildCloudCodeRequest(anthropicRequest, "project-123");

      // Google format should have contents array
      expect(result.request).toHaveProperty("contents");
      expect(Array.isArray(result.request.contents)).toBe(true);
      expect(result.request).toHaveProperty("generationConfig");
    });
  });

  describe("session ID", () => {
    it("includes session ID in request", () => {
      const anthropicRequest = createAnthropicRequest({
        messages: [{ role: "user", content: "Unique message for session" }],
      });

      const result = buildCloudCodeRequest(anthropicRequest, "project-123");

      expect(result.request).toHaveProperty("sessionId");
      expect(typeof result.request.sessionId).toBe("string");
      expect(result.request.sessionId!.length).toBeGreaterThan(0);
    });

    it("derives consistent session ID from same content", () => {
      const anthropicRequest1 = createAnthropicRequest({
        messages: [{ role: "user", content: "Same message" }],
      });
      const anthropicRequest2 = createAnthropicRequest({
        messages: [{ role: "user", content: "Same message" }],
      });

      const result1 = buildCloudCodeRequest(anthropicRequest1, "project-123");
      const result2 = buildCloudCodeRequest(anthropicRequest2, "project-123");

      expect(result1.request.sessionId).toBe(result2.request.sessionId);
    });

    it("derives different session ID from different content", () => {
      const anthropicRequest1 = createAnthropicRequest({
        messages: [{ role: "user", content: "Message A" }],
      });
      const anthropicRequest2 = createAnthropicRequest({
        messages: [{ role: "user", content: "Message B" }],
      });

      const result1 = buildCloudCodeRequest(anthropicRequest1, "project-123");
      const result2 = buildCloudCodeRequest(anthropicRequest2, "project-123");

      expect(result1.request.sessionId).not.toBe(result2.request.sessionId);
    });
  });

  describe("model passthrough", () => {
    it("passes Claude model name through", () => {
      const anthropicRequest = createAnthropicRequest({
        model: "claude-opus-4-5-thinking",
      });

      const result = buildCloudCodeRequest(anthropicRequest, "project-123");

      expect(result.model).toBe("claude-opus-4-5-thinking");
    });

    it("passes Gemini model name through", () => {
      const anthropicRequest = createAnthropicRequest({
        model: "gemini-3-pro-high",
      });

      const result = buildCloudCodeRequest(anthropicRequest, "project-123");

      expect(result.model).toBe("gemini-3-pro-high");
    });
  });

  describe("project ID", () => {
    it("includes provided project ID", () => {
      const anthropicRequest = createAnthropicRequest();

      const result = buildCloudCodeRequest(anthropicRequest, "my-custom-project");

      expect(result.project).toBe("my-custom-project");
    });
  });
});

describe("buildHeaders", () => {
  describe("basic headers", () => {
    it("includes Authorization header with bearer token", () => {
      const headers = buildHeaders("test-token-abc123", "claude-sonnet-4-5-thinking");

      expect(headers.Authorization).toBe("Bearer test-token-abc123");
    });

    it("includes Content-Type header", () => {
      const headers = buildHeaders("token", "claude-sonnet-4-5-thinking");

      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("includes User-Agent header from ANTIGRAVITY_HEADERS", () => {
      const headers = buildHeaders("token", "claude-sonnet-4-5-thinking");

      expect(headers["User-Agent"]).toBeDefined();
      expect(headers["User-Agent"]).toContain("antigravity");
    });

    it("includes X-Goog-Api-Client header", () => {
      const headers = buildHeaders("token", "claude-sonnet-4-5-thinking");

      expect(headers["X-Goog-Api-Client"]).toBeDefined();
    });

    it("includes Client-Metadata header", () => {
      const headers = buildHeaders("token", "claude-sonnet-4-5-thinking");

      expect(headers["Client-Metadata"]).toBeDefined();
    });
  });

  describe("anthropic-beta header for thinking models", () => {
    it("includes anthropic-beta header for Claude thinking model", () => {
      const headers = buildHeaders("token", "claude-sonnet-4-5-thinking");

      expect(headers["anthropic-beta"]).toBe("interleaved-thinking-2025-05-14");
    });

    it("includes anthropic-beta header for Claude opus thinking model", () => {
      const headers = buildHeaders("token", "claude-opus-4-5-thinking");

      expect(headers["anthropic-beta"]).toBe("interleaved-thinking-2025-05-14");
    });

    it("does not include anthropic-beta for non-thinking Claude models", () => {
      const headers = buildHeaders("token", "claude-sonnet-4-5");

      expect(headers["anthropic-beta"]).toBeUndefined();
    });

    it("does not include anthropic-beta for Gemini models", () => {
      const headers = buildHeaders("token", "gemini-3-flash");

      expect(headers["anthropic-beta"]).toBeUndefined();
    });

    it("does not include anthropic-beta for Gemini thinking models", () => {
      // Gemini uses different thinking signature mechanism
      const headers = buildHeaders("token", "gemini-3-pro-high");

      expect(headers["anthropic-beta"]).toBeUndefined();
    });
  });

  describe("Accept header", () => {
    it("does not include Accept header by default (application/json)", () => {
      const headers = buildHeaders("token", "claude-sonnet-4-5-thinking");

      expect(headers.Accept).toBeUndefined();
    });

    it("does not include Accept header when explicitly set to application/json", () => {
      const headers = buildHeaders("token", "claude-sonnet-4-5-thinking", "application/json");

      expect(headers.Accept).toBeUndefined();
    });

    it("includes Accept header when set to different value", () => {
      const headers = buildHeaders("token", "claude-sonnet-4-5-thinking", "text/event-stream");

      expect(headers.Accept).toBe("text/event-stream");
    });

    it("includes Accept header for SSE streaming", () => {
      const headers = buildHeaders("token", "gemini-3-flash", "text/event-stream");

      expect(headers.Accept).toBe("text/event-stream");
    });
  });

  describe("token handling", () => {
    it("handles empty token", () => {
      const headers = buildHeaders("", "claude-sonnet-4-5-thinking");

      expect(headers.Authorization).toBe("Bearer ");
    });

    it("handles token with special characters", () => {
      const specialToken = "ya29.abc+def/ghi=jkl";
      const headers = buildHeaders(specialToken, "claude-sonnet-4-5-thinking");

      expect(headers.Authorization).toBe(`Bearer ${specialToken}`);
    });
  });
});
