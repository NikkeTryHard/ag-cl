/**
 * Unit tests for rate-limit-parser
 *
 * Tests parsing of reset times from HTTP headers and error messages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseResetTime } from "../../../src/cloudcode/rate-limit-parser.js";
import { createMockResponse } from "../../helpers/mocks.js";

describe("parseResetTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Set a fixed current time for predictable timestamp calculations
    vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("header parsing", () => {
    describe("retry-after header", () => {
      it("parses retry-after header with seconds", () => {
        const response = createMockResponse({ "retry-after": "60" });

        const resetMs = parseResetTime(response);

        expect(resetMs).toBe(60000);
      });

      it("parses retry-after header with HTTP date", () => {
        // 5 minutes in the future
        const futureDate = new Date("2025-01-01T12:05:00Z");
        const response = createMockResponse({
          "retry-after": futureDate.toUTCString(),
        });

        const resetMs = parseResetTime(response);

        // Should be approximately 5 minutes (300000ms)
        expect(resetMs).toBeCloseTo(300000, -2);
      });

      it("returns null for past HTTP date in retry-after", () => {
        const pastDate = new Date("2025-01-01T11:00:00Z");
        const response = createMockResponse({
          "retry-after": pastDate.toUTCString(),
        });

        const resetMs = parseResetTime(response);

        expect(resetMs).toBeNull();
      });

      it("ignores invalid retry-after values", () => {
        const response = createMockResponse({ "retry-after": "invalid" });

        const resetMs = parseResetTime(response);

        expect(resetMs).toBeNull();
      });
    });

    describe("x-ratelimit-reset header", () => {
      it("parses x-ratelimit-reset Unix timestamp", () => {
        // 10 minutes in the future
        const futureTimestamp = Math.floor(Date.now() / 1000) + 600;
        const response = createMockResponse({
          "x-ratelimit-reset": String(futureTimestamp),
        });

        const resetMs = parseResetTime(response);

        expect(resetMs).toBeCloseTo(600000, -2);
      });

      it("returns null for past x-ratelimit-reset timestamp", () => {
        // 10 minutes in the past
        const pastTimestamp = Math.floor(Date.now() / 1000) - 600;
        const response = createMockResponse({
          "x-ratelimit-reset": String(pastTimestamp),
        });

        const resetMs = parseResetTime(response);

        expect(resetMs).toBeNull();
      });
    });

    describe("x-ratelimit-reset-after header", () => {
      it("parses x-ratelimit-reset-after seconds", () => {
        const response = createMockResponse({
          "x-ratelimit-reset-after": "120",
        });

        const resetMs = parseResetTime(response);

        expect(resetMs).toBe(120000);
      });

      it("ignores zero value", () => {
        const response = createMockResponse({
          "x-ratelimit-reset-after": "0",
        });

        const resetMs = parseResetTime(response);

        expect(resetMs).toBeNull();
      });

      it("ignores negative value", () => {
        const response = createMockResponse({
          "x-ratelimit-reset-after": "-10",
        });

        const resetMs = parseResetTime(response);

        expect(resetMs).toBeNull();
      });
    });

    describe("header priority", () => {
      it("prefers retry-after over x-ratelimit-reset", () => {
        const futureTimestamp = Math.floor(Date.now() / 1000) + 600;
        const response = createMockResponse({
          "retry-after": "30",
          "x-ratelimit-reset": String(futureTimestamp),
        });

        const resetMs = parseResetTime(response);

        expect(resetMs).toBe(30000);
      });

      it("falls back to x-ratelimit-reset when retry-after is invalid", () => {
        const futureTimestamp = Math.floor(Date.now() / 1000) + 300;
        const response = createMockResponse({
          "retry-after": "invalid",
          "x-ratelimit-reset": String(futureTimestamp),
        });

        const resetMs = parseResetTime(response);

        expect(resetMs).toBeCloseTo(300000, -2);
      });
    });
  });

  describe("body parsing", () => {
    describe("quotaResetDelay", () => {
      it("parses quotaResetDelay in milliseconds", () => {
        // The regex matches quotaResetDelay followed by digits and unit
        const error = new Error("Rate limited: quotaResetDelay: 754.431528ms");

        const resetMs = parseResetTime(error);

        // 755ms is < 1000ms so bumped to 2000ms
        expect(resetMs).toBe(2000);
      });

      it("parses quotaResetDelay in seconds", () => {
        const error = new Error("Rate limited: quotaResetDelay: 1.5s");

        const resetMs = parseResetTime(error);

        expect(resetMs).toBe(1500);
      });

      it("handles integer milliseconds", () => {
        const error = new Error("quotaResetDelay: 5000ms");

        const resetMs = parseResetTime(error);

        expect(resetMs).toBe(5000);
      });
    });

    describe("quotaResetTimeStamp", () => {
      it("parses ISO timestamp", () => {
        const futureTime = new Date("2025-01-01T12:05:00Z");
        const error = new Error(`quotaResetTimeStamp: "${futureTime.toISOString()}"`);

        const resetMs = parseResetTime(error);

        // Should be 5 minutes (300000ms)
        expect(resetMs).toBeCloseTo(300000, -2);
      });

      it("handles past timestamp gracefully", () => {
        const pastTime = new Date("2025-01-01T11:00:00Z");
        const error = new Error(`quotaResetTimeStamp: "${pastTime.toISOString()}"`);

        const resetMs = parseResetTime(error);

        // Negative, but function should still return it (it will be bumped to 2000 later)
        expect(resetMs).not.toBeNull();
      });
    });

    describe("duration strings", () => {
      it("parses 1h23m45s format", () => {
        const resetMs = parseResetTime(null, "Rate limited for 1h23m45s");

        // 1*3600 + 23*60 + 45 = 3600 + 1380 + 45 = 5025 seconds
        expect(resetMs).toBe(5025000);
      });

      it("parses 23m45s format", () => {
        const resetMs = parseResetTime(null, "Retry in 23m45s");

        // 23*60 + 45 = 1380 + 45 = 1425 seconds
        expect(resetMs).toBe(1425000);
      });

      it("parses 45s format", () => {
        const resetMs = parseResetTime(null, "Wait 45s");

        expect(resetMs).toBe(45000);
      });

      it("parses retry after N seconds format", () => {
        const resetMs = parseResetTime(null, "Please retry after 60 seconds");

        expect(resetMs).toBe(60000);
      });
    });

    describe("ISO timestamp in body", () => {
      it("parses reset ISO timestamp from body", () => {
        const futureTime = new Date("2025-01-01T12:10:00Z");
        const resetMs = parseResetTime(null, `reset: ${futureTime.toISOString()}`);

        // 10 minutes
        expect(resetMs).toBeCloseTo(600000, -2);
      });

      it("returns null for past ISO timestamp in body", () => {
        const pastTime = new Date("2025-01-01T11:00:00Z");
        const resetMs = parseResetTime(null, `reset: ${pastTime.toISOString()}`);

        expect(resetMs).toBeNull();
      });
    });
  });

  describe("minimum enforcement", () => {
    it("bumps reset time < 1000ms to 2000ms", () => {
      const error = new Error("quotaResetDelay: 500ms");

      const resetMs = parseResetTime(error);

      // 500ms should be bumped to 2000ms
      expect(resetMs).toBe(2000);
    });

    it("bumps very small reset time to 2000ms", () => {
      const error = new Error("quotaResetDelay: 10ms");

      const resetMs = parseResetTime(error);

      expect(resetMs).toBe(2000);
    });

    it("does not bump reset time >= 1000ms", () => {
      const error = new Error("quotaResetDelay: 1000ms");

      const resetMs = parseResetTime(error);

      expect(resetMs).toBe(1000);
    });

    it("does not bump larger reset times", () => {
      const error = new Error("quotaResetDelay: 5000ms");

      const resetMs = parseResetTime(error);

      expect(resetMs).toBe(5000);
    });
  });

  describe("null/undefined input", () => {
    it("returns null for null input", () => {
      const resetMs = parseResetTime(null);

      expect(resetMs).toBeNull();
    });

    it("returns null for undefined input", () => {
      const resetMs = parseResetTime(undefined);

      expect(resetMs).toBeNull();
    });

    it("returns null for null input with empty error text", () => {
      const resetMs = parseResetTime(null, "");

      expect(resetMs).toBeNull();
    });
  });

  describe("combined header and body parsing", () => {
    it("prefers header over body when available", () => {
      const response = createMockResponse({ "retry-after": "30" }, 'quotaResetDelay: "60000ms"');

      const resetMs = parseResetTime(response);

      expect(resetMs).toBe(30000);
    });

    it("falls back to body when no header found", () => {
      const response = createMockResponse({}, "");

      const resetMs = parseResetTime(response, 'quotaResetDelay: "5000ms"');

      expect(resetMs).toBe(5000);
    });
  });

  describe("error object parsing", () => {
    it("extracts from Error.message", () => {
      const error = new Error("Rate limit exceeded. quotaResetDelay: 30s");

      const resetMs = parseResetTime(error);

      expect(resetMs).toBe(30000);
    });

    it("handles Error with no rate limit info", () => {
      const error = new Error("Some other error");

      const resetMs = parseResetTime(error);

      expect(resetMs).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles response without headers object", () => {
      const response = {} as Response;

      const resetMs = parseResetTime(response);

      expect(resetMs).toBeNull();
    });

    it("handles mixed case header names", () => {
      const response = createMockResponse({ "Retry-After": "45" });

      const resetMs = parseResetTime(response);

      expect(resetMs).toBe(45000);
    });
  });
});
