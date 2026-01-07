/**
 * Tests for src/cloudcode/burn-rate.ts
 * Burn rate calculation module for quota consumption prediction
 *
 * Uses an in-memory database for testing to avoid file system dependencies.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initQuotaStorage, recordSnapshot, closeQuotaStorage } from "../../../src/cloudcode/quota-storage.js";
import { calculateBurnRate, type BurnRateInfo, type BurnRateStatus } from "../../../src/cloudcode/burn-rate.js";

describe("cloudcode/burn-rate", () => {
  beforeEach(() => {
    // Initialize with in-memory database for testing
    initQuotaStorage(":memory:");
  });

  afterEach(() => {
    // Clean up after each test
    closeQuotaStorage();
  });

  describe("calculateBurnRate", () => {
    describe("insufficient data (calculating status)", () => {
      it("returns calculating status when no snapshots exist", () => {
        const result = calculateBurnRate("account-1", "claude", 80, null);

        expect(result.status).toBe("calculating");
        expect(result.ratePerHour).toBeNull();
        expect(result.hoursToExhaustion).toBeNull();
      });

      it("returns calculating status when snapshot is too recent", () => {
        recordSnapshot("account-1", "claude", 90);

        const result = calculateBurnRate("account-1", "claude", 80, null);

        expect(result.status).toBe("calculating");
        expect(result.ratePerHour).toBeNull();
        expect(result.hoursToExhaustion).toBeNull();
      });
    });

    describe("active burning (burning status)", () => {
      it("calculates burn rate from two snapshots", () => {
        // Snapshot 2 hours ago at 100%, now at 80%
        // Burn rate: (100 - 80) / 2 = 10% per hour
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 100, twoHoursAgo);
        recordSnapshot("account-1", "claude", 90, twoHoursAgo + 60 * 60 * 1000);

        const result = calculateBurnRate("account-1", "claude", 80, null);

        expect(result.status).toBe("burning");
        expect(result.ratePerHour).toBeCloseTo(10, 0); // 10% per hour
        expect(result.hoursToExhaustion).toBeCloseTo(8, 0); // 80% / 10 = 8 hours
      });

      it("calculates burn rate from multiple snapshots using oldest", () => {
        // 3 hours ago: 100%, 2 hours ago: 90%, 1 hour ago: 85%, now: 70%
        // Burn rate should use oldest: (100 - 70) / 3 = 10% per hour
        const now = Date.now();
        recordSnapshot("account-1", "claude", 100, now - 3 * 60 * 60 * 1000);
        recordSnapshot("account-1", "claude", 90, now - 2 * 60 * 60 * 1000);
        recordSnapshot("account-1", "claude", 85, now - 60 * 60 * 1000);

        const result = calculateBurnRate("account-1", "claude", 70, null);

        expect(result.status).toBe("burning");
        expect(result.ratePerHour).toBeCloseTo(10, 0);
        expect(result.hoursToExhaustion).toBeCloseTo(7, 0); // 70% / 10 = 7 hours
      });

      it("uses snapshots from the correct model family", () => {
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 100, twoHoursAgo);
        recordSnapshot("account-1", "gemini", 50, twoHoursAgo); // Different family

        const claudeResult = calculateBurnRate("account-1", "claude", 80, null);
        const geminiResult = calculateBurnRate("account-1", "gemini", 30, null);

        expect(claudeResult.status).toBe("burning");
        expect(claudeResult.ratePerHour).toBeCloseTo(10, 0); // (100 - 80) / 2

        expect(geminiResult.status).toBe("burning");
        expect(geminiResult.ratePerHour).toBeCloseTo(10, 0); // (50 - 30) / 2
      });

      it("uses snapshots from the correct account", () => {
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 100, twoHoursAgo);
        recordSnapshot("account-2", "claude", 60, twoHoursAgo); // Different account

        const result1 = calculateBurnRate("account-1", "claude", 80, null);
        const result2 = calculateBurnRate("account-2", "claude", 40, null);

        expect(result1.ratePerHour).toBeCloseTo(10, 0); // (100 - 80) / 2
        expect(result2.ratePerHour).toBeCloseTo(10, 0); // (60 - 40) / 2
      });

      it("handles very fast burn rate", () => {
        // 30 minutes ago at 100%, now at 0%
        // Burn rate: 100% / 0.5 hours = 200% per hour
        const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
        recordSnapshot("account-1", "claude", 100, thirtyMinutesAgo);

        const result = calculateBurnRate("account-1", "claude", 0, null);

        expect(result.status).toBe("exhausted"); // 0% is exhausted
        expect(result.ratePerHour).toBeCloseTo(200, 0);
        expect(result.hoursToExhaustion).toBeNull(); // Already exhausted
      });

      it("handles very slow burn rate", () => {
        // 10 hours ago at 100%, now at 99%
        // Burn rate: 1% / 10 hours = 0.1% per hour
        const tenHoursAgo = Date.now() - 10 * 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 100, tenHoursAgo);

        const result = calculateBurnRate("account-1", "claude", 99, null);

        expect(result.status).toBe("burning");
        expect(result.ratePerHour).toBeCloseTo(0.1, 1);
        expect(result.hoursToExhaustion).toBeCloseTo(990, 0); // 99% / 0.1 = 990 hours
      });
    });

    describe("stable usage (stable status)", () => {
      it("returns stable status when burn rate is zero", () => {
        // 2 hours ago at 80%, now still at 80%
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 80, twoHoursAgo);

        const result = calculateBurnRate("account-1", "claude", 80, null);

        expect(result.status).toBe("stable");
        expect(result.ratePerHour).toBe(0);
        expect(result.hoursToExhaustion).toBeNull(); // Infinite at zero burn rate
      });

      it("treats very small burn rate as burning with long exhaustion time", () => {
        // 23 hours ago at 100%, now at 99.9%
        // Burn rate: 0.1% / 23 hours = 0.00435% per hour (negligible)
        // Use 23 hours to stay within the 24h default window
        const twentyThreeHoursAgo = Date.now() - 23 * 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 100, twentyThreeHoursAgo);

        const result = calculateBurnRate("account-1", "claude", 99.9, null);

        // Very small burn rate is still classified as burning with very long exhaustion time
        expect(result.status).toBe("burning");
        expect(result.ratePerHour).toBeCloseTo(0.00435, 3);
      });
    });

    describe("recovering usage (recovering status)", () => {
      it("returns recovering status when percentage increased (negative burn rate)", () => {
        // 2 hours ago at 50%, now at 70% (quota reset or recovered)
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 50, twoHoursAgo);

        const result = calculateBurnRate("account-1", "claude", 70, null);

        expect(result.status).toBe("recovering");
        expect(result.ratePerHour).toBeCloseTo(-10, 0); // Negative rate (gaining)
        expect(result.hoursToExhaustion).toBeNull(); // Not approaching exhaustion
      });

      it("returns recovering status when quota fully reset", () => {
        // 1 hour ago at 10%, now at 100% (full reset)
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 10, oneHourAgo);

        const result = calculateBurnRate("account-1", "claude", 100, null);

        expect(result.status).toBe("recovering");
        expect(result.ratePerHour).toBeCloseTo(-90, 0);
        expect(result.hoursToExhaustion).toBeNull();
      });
    });

    describe("exhausted quota (exhausted status)", () => {
      it("returns exhausted status when current percentage is 0", () => {
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 50, twoHoursAgo);

        const resetTime = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
        const result = calculateBurnRate("account-1", "claude", 0, resetTime);

        expect(result.status).toBe("exhausted");
        expect(result.ratePerHour).toBeCloseTo(25, 0); // (50 - 0) / 2
        expect(result.hoursToExhaustion).toBeNull(); // Already exhausted
      });

      it("returns exhausted with null reset time if not provided", () => {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 20, oneHourAgo);

        const result = calculateBurnRate("account-1", "claude", 0, null);

        expect(result.status).toBe("exhausted");
        expect(result.hoursToExhaustion).toBeNull();
      });

      it("returns exhausted even with no history if current is 0", () => {
        const result = calculateBurnRate("account-1", "claude", 0, null);

        expect(result.status).toBe("exhausted");
        expect(result.ratePerHour).toBeNull(); // No history to calculate
        expect(result.hoursToExhaustion).toBeNull();
      });
    });

    describe("reset window handling", () => {
      it("only uses snapshots within the reset window", () => {
        // Simulate snapshots from before and after a reset window
        // Snapshots older than 24 hours should be ignored by default
        const now = Date.now();
        const oldSnapshot = now - 25 * 60 * 60 * 1000; // 25 hours ago (outside window)
        const recentSnapshot = now - 2 * 60 * 60 * 1000; // 2 hours ago (inside window)

        recordSnapshot("account-1", "claude", 10, oldSnapshot); // Should be ignored
        recordSnapshot("account-1", "claude", 100, recentSnapshot); // Should be used

        const result = calculateBurnRate("account-1", "claude", 80, null);

        // Should calculate based on recent snapshot only
        expect(result.status).toBe("burning");
        expect(result.ratePerHour).toBeCloseTo(10, 0); // (100 - 80) / 2
      });

      it("respects custom reset window from reset time", () => {
        // Reset time determines window - only look back as far as time until reset
        // because snapshots from previous cycles aren't useful
        const now = Date.now();
        const tenHoursAgo = now - 10 * 60 * 60 * 1000;
        const fiveHoursAgo = now - 5 * 60 * 60 * 1000;

        recordSnapshot("account-1", "claude", 100, tenHoursAgo); // Inside 12h window
        recordSnapshot("account-1", "claude", 90, fiveHoursAgo); // Inside 12h window

        // Reset in 12 hours means we look back 12 hours (current cycle only)
        const resetTime = new Date(now + 12 * 60 * 60 * 1000).toISOString();
        const result = calculateBurnRate("account-1", "claude", 70, resetTime);

        expect(result.status).toBe("burning");
        // Should use oldest snapshot in window (10h ago)
        expect(result.ratePerHour).toBeCloseTo(3, 1); // (100 - 70) / 10
      });

      it("excludes snapshots outside reset window when reset time is close", () => {
        // Reset in 6 hours means we only look back 6 hours
        const now = Date.now();
        const tenHoursAgo = now - 10 * 60 * 60 * 1000; // Outside 6h window
        const threeHoursAgo = now - 3 * 60 * 60 * 1000; // Inside 6h window

        recordSnapshot("account-1", "claude", 100, tenHoursAgo); // Should be excluded
        recordSnapshot("account-1", "claude", 90, threeHoursAgo); // Should be used

        const resetTime = new Date(now + 6 * 60 * 60 * 1000).toISOString();
        const result = calculateBurnRate("account-1", "claude", 70, resetTime);

        expect(result.status).toBe("burning");
        // Should use 3h-old snapshot (not 10h-old), so rate = (90 - 70) / 3 = 6.67
        expect(result.ratePerHour).toBeCloseTo(6.67, 1);
      });

      it("uses default 24h window when reset time is in the past", () => {
        const now = Date.now();
        const twentyHoursAgo = now - 20 * 60 * 60 * 1000;

        recordSnapshot("account-1", "claude", 100, twentyHoursAgo);

        // Reset time is 1 hour in the past
        const resetTime = new Date(now - 60 * 60 * 1000).toISOString();
        const result = calculateBurnRate("account-1", "claude", 60, resetTime);

        expect(result.status).toBe("burning");
        // Should use default 24h window, so 20h-old snapshot is included
        expect(result.ratePerHour).toBeCloseTo(2, 0); // (100 - 60) / 20
      });

      it("uses default 24h window when reset time is more than 24h away", () => {
        const now = Date.now();
        const twentyHoursAgo = now - 20 * 60 * 60 * 1000;

        recordSnapshot("account-1", "claude", 100, twentyHoursAgo);

        // Reset time is 30 hours away (more than 24h)
        const resetTime = new Date(now + 30 * 60 * 60 * 1000).toISOString();
        const result = calculateBurnRate("account-1", "claude", 60, resetTime);

        expect(result.status).toBe("burning");
        // Should use default 24h window, so 20h-old snapshot is included
        expect(result.ratePerHour).toBeCloseTo(2, 0); // (100 - 60) / 20
      });
    });

    describe("BurnRateInfo structure", () => {
      it("returns correct BurnRateInfo structure for burning status", () => {
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 100, twoHoursAgo);

        const result = calculateBurnRate("account-1", "claude", 80, null);

        expect(result).toEqual({
          ratePerHour: expect.any(Number),
          hoursToExhaustion: expect.any(Number),
          status: "burning",
        });
        expect(result.ratePerHour).toBeGreaterThan(0);
        expect(result.hoursToExhaustion).toBeGreaterThan(0);
      });

      it("returns correct BurnRateInfo structure for exhausted status", () => {
        const result = calculateBurnRate("account-1", "claude", 0, null);

        expect(result).toEqual({
          ratePerHour: null,
          hoursToExhaustion: null,
          status: "exhausted",
        });
      });

      it("returns correct BurnRateInfo structure for stable status", () => {
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 80, twoHoursAgo);

        const result = calculateBurnRate("account-1", "claude", 80, null);

        expect(result).toEqual({
          ratePerHour: 0,
          hoursToExhaustion: null,
          status: "stable",
        });
      });

      it("returns correct BurnRateInfo structure for recovering status", () => {
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 50, twoHoursAgo);

        const result = calculateBurnRate("account-1", "claude", 70, null);

        expect(result).toEqual({
          ratePerHour: expect.any(Number),
          hoursToExhaustion: null,
          status: "recovering",
        });
        expect(result.ratePerHour).toBeLessThan(0);
      });

      it("returns correct BurnRateInfo structure for calculating status", () => {
        const result = calculateBurnRate("account-1", "claude", 80, null);

        expect(result).toEqual({
          ratePerHour: null,
          hoursToExhaustion: null,
          status: "calculating",
        });
      });
    });

    describe("edge cases", () => {
      it("handles percentage at 100%", () => {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 100, oneHourAgo);

        const result = calculateBurnRate("account-1", "claude", 100, null);

        expect(result.status).toBe("stable");
        expect(result.ratePerHour).toBe(0);
      });

      it("handles percentage at 1%", () => {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        recordSnapshot("account-1", "claude", 10, oneHourAgo);

        const result = calculateBurnRate("account-1", "claude", 1, null);

        expect(result.status).toBe("burning");
        expect(result.ratePerHour).toBeCloseTo(9, 0);
        expect(result.hoursToExhaustion).toBeCloseTo(0.111, 2); // 1% / 9 ~= 0.111 hours
      });

      it("handles very short time periods", () => {
        // 1 minute ago at 100%, now at 99%
        const oneMinuteAgo = Date.now() - 60 * 1000;
        recordSnapshot("account-1", "claude", 100, oneMinuteAgo);

        const result = calculateBurnRate("account-1", "claude", 99, null);

        expect(result.status).toBe("burning");
        // 1% / (1/60) hours = 60% per hour
        expect(result.ratePerHour).toBeCloseTo(60, 0);
      });

      it("handles email-style account IDs", () => {
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        recordSnapshot("user@example.com", "claude", 100, twoHoursAgo);

        const result = calculateBurnRate("user@example.com", "claude", 80, null);

        expect(result.status).toBe("burning");
        expect(result.ratePerHour).toBeCloseTo(10, 0);
      });
    });
  });
});
