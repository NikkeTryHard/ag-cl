/**
 * Tests for formatTimeAgo utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatTimeAgo } from "../../../../src/tui/utils/formatTimeAgo.js";

describe("formatTimeAgo", () => {
  const NOW = 1704067200000; // 2024-01-01 00:00:00 UTC

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty string for null", () => {
    expect(formatTimeAgo(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatTimeAgo(undefined)).toBe("");
  });

  it("returns empty string for 0", () => {
    expect(formatTimeAgo(0)).toBe("");
  });

  it('returns "just now" for less than 1 minute ago', () => {
    expect(formatTimeAgo(NOW - 30000)).toBe("just now"); // 30 seconds ago
    expect(formatTimeAgo(NOW - 59999)).toBe("just now"); // 59.999 seconds ago
  });

  it('returns "X min ago" for 1-59 minutes', () => {
    expect(formatTimeAgo(NOW - 60000)).toBe("1 min ago"); // 1 minute
    expect(formatTimeAgo(NOW - 300000)).toBe("5 min ago"); // 5 minutes
    expect(formatTimeAgo(NOW - 3540000)).toBe("59 min ago"); // 59 minutes
  });

  it('returns "Xh Ym ago" for hours with minutes', () => {
    expect(formatTimeAgo(NOW - 3660000)).toBe("1h 1m ago"); // 1 hour 1 minute
    expect(formatTimeAgo(NOW - 7200000 - 1800000)).toBe("2h 30m ago"); // 2 hours 30 minutes
  });

  it('returns "Xh ago" for exact hours', () => {
    expect(formatTimeAgo(NOW - 3600000)).toBe("1h ago"); // 1 hour
    expect(formatTimeAgo(NOW - 7200000)).toBe("2h ago"); // 2 hours
    expect(formatTimeAgo(NOW - 18000000)).toBe("5h ago"); // 5 hours
  });
});
