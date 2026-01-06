/**
 * Fuzz Tests for Rate Limit Parser
 *
 * Property-based testing using fast-check to ensure parseResetTime
 * handles arbitrary input without throwing and always returns valid output.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { parseResetTime } from "../../src/cloudcode/rate-limit-parser.js";
import { createMockResponse } from "../helpers/mocks.js";

// ============================================================================
// Property-Based Tests
// ============================================================================

describe("parseResetTime Fuzz Tests", () => {
  describe("never throws with arbitrary input", () => {
    it("handles random string error messages", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const error = new Error(input);
          const result = parseResetTime(error);
          return result === null || typeof result === "number";
        }),
        { numRuns: 1000 },
      );
    });

    it("handles random errorText parameter", () => {
      fc.assert(
        fc.property(fc.string(), (errorText) => {
          const result = parseResetTime(null, errorText);
          return result === null || typeof result === "number";
        }),
        { numRuns: 1000 },
      );
    });

    it("handles null and undefined inputs", () => {
      expect(() => parseResetTime(null)).not.toThrow();
      expect(() => parseResetTime(undefined)).not.toThrow();
      expect(() => parseResetTime(null, "")).not.toThrow();
      expect(() => parseResetTime(undefined, "test")).not.toThrow();

      expect(parseResetTime(null)).toBeNull();
      expect(parseResetTime(undefined)).toBeNull();
    });

    it("handles random objects as input", () => {
      fc.assert(
        fc.property(fc.object(), (obj) => {
          const result = parseResetTime(obj as never);
          return result === null || typeof result === "number";
        }),
        { numRuns: 500 },
      );
    });
  });

  describe("always returns number or null", () => {
    it("returns valid type for binary/unicode strings", () => {
      // In fast-check v4, use fc.string({ unit: 'binary' }) for full unicode
      fc.assert(
        fc.property(fc.string({ unit: "binary", maxLength: 100 }), (input) => {
          const result = parseResetTime(new Error(input));
          return result === null || (typeof result === "number" && !isNaN(result));
        }),
        { numRuns: 500 },
      );
    });

    it("returns valid type for mixed alphanumeric", () => {
      // In fast-check v4, use fc.string({ unit: arbitrary }) for custom character sets
      const charArb = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789.-:TZ _\"'".split(""));
      fc.assert(
        fc.property(fc.string({ unit: charArb, maxLength: 100 }), (input) => {
          const result = parseResetTime(new Error(input));
          return result === null || (typeof result === "number" && !isNaN(result));
        }),
        { numRuns: 500 },
      );
    });
  });

  describe("handles random header values", () => {
    it("handles random Retry-After header values", () => {
      fc.assert(
        fc.property(fc.string(), (headerValue) => {
          const mockResponse = createMockResponse({ "Retry-After": headerValue });
          const result = parseResetTime(mockResponse);
          return result === null || typeof result === "number";
        }),
        { numRuns: 500 },
      );
    });

    it("handles random x-ratelimit-reset header values", () => {
      fc.assert(
        fc.property(fc.string(), (headerValue) => {
          const mockResponse = createMockResponse({ "x-ratelimit-reset": headerValue });
          const result = parseResetTime(mockResponse);
          return result === null || typeof result === "number";
        }),
        { numRuns: 500 },
      );
    });

    it("handles random x-ratelimit-reset-after header values", () => {
      fc.assert(
        fc.property(fc.string(), (headerValue) => {
          const mockResponse = createMockResponse({ "x-ratelimit-reset-after": headerValue });
          const result = parseResetTime(mockResponse);
          return result === null || typeof result === "number";
        }),
        { numRuns: 500 },
      );
    });

    it("handles multiple random headers simultaneously", () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), fc.string(), (v1, v2, v3) => {
          const mockResponse = createMockResponse({
            "Retry-After": v1,
            "x-ratelimit-reset": v2,
            "x-ratelimit-reset-after": v3,
          });
          const result = parseResetTime(mockResponse);
          return result === null || typeof result === "number";
        }),
        { numRuns: 300 },
      );
    });
  });

  describe("handles malformed duration strings", () => {
    it("handles random duration-like patterns", () => {
      // Generate strings that look like durations
      const durationArb = fc.tuple(fc.integer({ min: 0, max: 999 }), fc.constantFrom("h", "m", "s", "ms", ""), fc.integer({ min: 0, max: 999 }), fc.constantFrom("h", "m", "s", "ms", "")).map(([n1, u1, n2, u2]) => `${n1}${u1}${n2}${u2}`);

      fc.assert(
        fc.property(durationArb, (duration) => {
          const result = parseResetTime(new Error(`retry after ${duration}`));
          return result === null || typeof result === "number";
        }),
        { numRuns: 500 },
      );
    });

    it("handles malformed quotaResetDelay patterns", () => {
      fc.assert(
        fc.property(fc.integer({ min: -1000000, max: 1000000 }), fc.boolean(), fc.constantFrom("ms", "s", "", "m", "h"), (value, useFloat, unit) => {
          const numStr = useFloat ? `${value}.${Math.abs(value % 1000)}` : `${value}`;
          const message = `quotaResetDelay: ${numStr}${unit}`;
          const result = parseResetTime(new Error(message));
          return result === null || typeof result === "number";
        }),
        { numRuns: 500 },
      );
    });

    it("handles malformed quotaResetTimeStamp patterns", () => {
      // Filter out invalid dates (NaN values)
      const validDateArb = fc.date({ min: new Date(0), max: new Date(2100, 0, 1) }).filter((d) => !isNaN(d.getTime()));
      fc.assert(
        fc.property(validDateArb, (date) => {
          // Create various malformed ISO strings
          const isoString = date.toISOString();
          const message = `quotaResetTimeStamp: ${isoString}`;
          const result = parseResetTime(new Error(message));
          return result === null || typeof result === "number";
        }),
        { numRuns: 500 },
      );
    });

    it("handles completely malformed timestamp strings", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 30 }), (timestamp) => {
          const message = `quotaResetTimeStamp: ${timestamp}`;
          const result = parseResetTime(new Error(message));
          return result === null || typeof result === "number";
        }),
        { numRuns: 500 },
      );
    });
  });

  describe("edge cases with numbers", () => {
    it("handles very large numbers", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (num) => {
          const result = parseResetTime(new Error(`retry after ${num} seconds`));
          return result === null || typeof result === "number";
        }),
        { numRuns: 300 },
      );
    });

    it("handles negative numbers", () => {
      fc.assert(
        fc.property(fc.integer({ min: -1000000, max: -1 }), (num) => {
          const result = parseResetTime(new Error(`retry after ${num} seconds`));
          return result === null || typeof result === "number";
        }),
        { numRuns: 300 },
      );
    });

    it("handles floating point numbers", () => {
      fc.assert(
        fc.property(fc.double({ min: -1e10, max: 1e10, noNaN: true }), (num) => {
          const result = parseResetTime(new Error(`quotaResetDelay: ${num}ms`));
          return result === null || typeof result === "number";
        }),
        { numRuns: 300 },
      );
    });

    it("handles Infinity and NaN in strings", () => {
      expect(() => parseResetTime(new Error("retry after Infinity seconds"))).not.toThrow();
      expect(() => parseResetTime(new Error("retry after NaN seconds"))).not.toThrow();
      expect(() => parseResetTime(new Error("retry after -Infinity seconds"))).not.toThrow();

      // Results should be null or valid numbers (not Infinity/NaN)
      const infinityResult = parseResetTime(new Error("retry after Infinity seconds"));
      const nanResult = parseResetTime(new Error("retry after NaN seconds"));

      if (infinityResult !== null) {
        expect(isFinite(infinityResult)).toBe(true);
      }
      if (nanResult !== null) {
        expect(!isNaN(nanResult)).toBe(true);
      }
    });
  });

  describe("output constraints", () => {
    it("returns null or a positive number", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = parseResetTime(new Error(input));
          // Result is either null or a positive number
          return result === null || (typeof result === "number" && result > 0);
        }),
        { numRuns: 1000 },
      );
    });

    it("returns null for empty strings", () => {
      const result = parseResetTime(new Error(""));
      expect(result).toBeNull();
    });

    it("returns null for whitespace-only strings", () => {
      const whitespaceChars = fc.constantFrom(" ", "\t", "\n", "\r");
      fc.assert(
        fc.property(fc.string({ unit: whitespaceChars, minLength: 0, maxLength: 20 }), (whitespace) => {
          const result = parseResetTime(new Error(whitespace));
          return result === null;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("real-world pattern fuzzing", () => {
    it("handles variations of Google error messages", () => {
      const errorPatterns = [fc.constant("quotaResetDelay"), fc.constant("quotaResetTimeStamp"), fc.constant("retryDelay"), fc.constant("retry-after-ms"), fc.constant("retry_after_ms"), fc.constant("Retry-After"), fc.constant("reset")];

      const separators = [fc.constant(": "), fc.constant("="), fc.constant(" "), fc.constant('"')];

      // Use valid date range and filter out NaN dates to avoid Invalid Date errors
      const validDateArb = fc
        .date({ min: new Date(0), max: new Date(2100, 0, 1) })
        .filter((d) => !isNaN(d.getTime()))
        .map((d) => d.toISOString());
      const values = [fc.integer({ min: 0, max: 100000 }).map(String), fc.double({ min: 0, max: 100000, noNaN: true }).map((n) => n.toFixed(3)), validDateArb];

      fc.assert(
        fc.property(fc.oneof(...errorPatterns), fc.oneof(...separators), fc.oneof(...values), (pattern, sep, value) => {
          const message = `${pattern}${sep}${value}`;
          const result = parseResetTime(new Error(message));
          return result === null || (typeof result === "number" && !isNaN(result) && isFinite(result));
        }),
        { numRuns: 500 },
      );
    });

    it("handles JSON-like error responses", () => {
      fc.assert(
        fc.property(
          fc.record({
            error: fc.string(),
            quotaResetDelay: fc.option(fc.string(), { nil: undefined }),
            quotaResetTimeStamp: fc.option(fc.string(), { nil: undefined }),
            retryDelay: fc.option(fc.integer(), { nil: undefined }),
          }),
          (errorObj) => {
            const message = JSON.stringify(errorObj);
            const result = parseResetTime(new Error(message));
            return result === null || (typeof result === "number" && !isNaN(result));
          },
        ),
        { numRuns: 300 },
      );
    });
  });
});
