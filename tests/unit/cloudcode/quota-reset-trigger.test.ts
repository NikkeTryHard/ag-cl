/**
 * Tests for quota-reset-trigger module
 *
 * Tests the API that sends minimal requests to start the 5-hour quota reset timer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("cloudcode/quota-reset-trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("triggerQuotaResetApi", () => {
    it("triggers all groups when group is 'all'", async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const { triggerQuotaResetApi } = await import("../../../src/cloudcode/quota-reset-trigger.js");
      const result = await triggerQuotaResetApi("token", "project-123", "all");

      expect(result.successCount).toBe(3); // claude, geminiPro, geminiFlash
      expect(result.failureCount).toBe(0);
      expect(result.groupsTriggered).toHaveLength(3);
    });

    it("triggers single group when specified", async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const { triggerQuotaResetApi } = await import("../../../src/cloudcode/quota-reset-trigger.js");
      const result = await triggerQuotaResetApi("token", "project-123", "claude");

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
      expect(result.groupsTriggered).toHaveLength(1);
      expect(result.groupsTriggered[0].group).toBe("claude");
    });

    it("treats 429 response as success (quota timer already running)", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 429 });

      const { triggerQuotaResetApi } = await import("../../../src/cloudcode/quota-reset-trigger.js");
      const result = await triggerQuotaResetApi("token", "project-123", "claude");

      expect(result.successCount).toBe(1);
      expect(result.groupsTriggered[0].success).toBe(true);
    });

    it("tries fallback endpoints on auth errors", async () => {
      // First endpoint returns 401, second succeeds
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 }).mockResolvedValueOnce({ ok: true, status: 200 });

      const { triggerQuotaResetApi } = await import("../../../src/cloudcode/quota-reset-trigger.js");
      const result = await triggerQuotaResetApi("token", "project-123", "claude");

      expect(result.successCount).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("tries fallback endpoints on 403 errors", async () => {
      // First endpoint returns 403, second succeeds
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 }).mockResolvedValueOnce({ ok: true, status: 200 });

      const { triggerQuotaResetApi } = await import("../../../src/cloudcode/quota-reset-trigger.js");
      const result = await triggerQuotaResetApi("token", "project-123", "claude");

      expect(result.successCount).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("fails when all endpoints fail", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const { triggerQuotaResetApi } = await import("../../../src/cloudcode/quota-reset-trigger.js");
      const result = await triggerQuotaResetApi("token", "project-123", "claude");

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(1);
      expect(result.groupsTriggered[0].error).toBe("Failed to send request to all endpoints");
    });

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const { triggerQuotaResetApi } = await import("../../../src/cloudcode/quota-reset-trigger.js");
      const result = await triggerQuotaResetApi("token", "project-123", "claude");

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(1);
    });

    it("sends correct payload structure", async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const { triggerQuotaResetApi } = await import("../../../src/cloudcode/quota-reset-trigger.js");
      await triggerQuotaResetApi("test-token", "test-project", "claude");

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body as string);

      expect(body.project).toBe("test-project");
      expect(body.request.contents[0].parts[0].text).toBe("Hi");
      expect(body.request.generationConfig.maxOutputTokens).toBe(1);
      expect(call[1].headers.Authorization).toBe("Bearer test-token");
    });

    it("uses designated trigger models for each group", async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const { triggerQuotaResetApi } = await import("../../../src/cloudcode/quota-reset-trigger.js");
      const result = await triggerQuotaResetApi("token", "project", "all");

      // Each group should use its designated trigger model (not necessarily the first)
      const claudeResult = result.groupsTriggered.find((r) => r.group === "claude");
      const geminiProResult = result.groupsTriggered.find((r) => r.group === "geminiPro");
      const geminiFlashResult = result.groupsTriggered.find((r) => r.group === "geminiFlash");

      // Claude uses Opus for triggers (user preference - less contention)
      expect(claudeResult?.model).toBe("claude-opus-4-5-thinking");
      expect(geminiProResult?.model).toBe("gemini-3-pro-high");
      expect(geminiFlashResult?.model).toBe("gemini-3-flash");
    });

    it("uses the generateContent endpoint", async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const { triggerQuotaResetApi } = await import("../../../src/cloudcode/quota-reset-trigger.js");
      await triggerQuotaResetApi("token", "project-123", "claude");

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain("/v1internal:generateContent");
    });

    it("includes required antigravity headers", async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const { triggerQuotaResetApi } = await import("../../../src/cloudcode/quota-reset-trigger.js");
      await triggerQuotaResetApi("token", "project", "claude");

      const call = mockFetch.mock.calls[0];
      const headers = call[1].headers;

      expect(headers).toHaveProperty("Content-Type", "application/json");
      expect(headers).toHaveProperty("User-Agent");
      expect(headers).toHaveProperty("X-Goog-Api-Client");
    });

    it("sets proper request metadata", async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const { triggerQuotaResetApi } = await import("../../../src/cloudcode/quota-reset-trigger.js");
      await triggerQuotaResetApi("token", "project", "claude");

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body as string);

      expect(body.userAgent).toBe("antigravity");
      expect(body.requestId).toMatch(/^trigger-reset-\d+$/);
      expect(body.requestType).toBe("agent");
    });

    it("processes each group sequentially", async () => {
      let callOrder = 0;
      const callTimes: number[] = [];

      mockFetch.mockImplementation(() => {
        callTimes.push(callOrder++);
        return Promise.resolve({ ok: true, status: 200 });
      });

      const { triggerQuotaResetApi } = await import("../../../src/cloudcode/quota-reset-trigger.js");
      await triggerQuotaResetApi("token", "project", "all");

      // Should be called 3 times (one for each group)
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(callTimes).toEqual([0, 1, 2]);
    });

    it("continues processing other groups if one fails", async () => {
      // First group fails, second and third succeed
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 }) // claude - fail (endpoint 1)
        .mockResolvedValueOnce({ ok: false, status: 500 }) // claude - fail (endpoint 2)
        .mockResolvedValueOnce({ ok: true, status: 200 }) // geminiPro - success
        .mockResolvedValueOnce({ ok: true, status: 200 }); // geminiFlash - success

      const { triggerQuotaResetApi } = await import("../../../src/cloudcode/quota-reset-trigger.js");
      const result = await triggerQuotaResetApi("token", "project", "all");

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);

      const claudeResult = result.groupsTriggered.find((r) => r.group === "claude");
      expect(claudeResult?.success).toBe(false);
    });
  });
});
