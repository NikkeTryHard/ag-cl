/**
 * Unit tests for CLI Capacity Renderer Module
 *
 * Tests the beautiful colored CLI output for account capacity information.
 * Uses noColor option to make assertions predictable.
 */

import { describe, it, expect } from "vitest";
import pc from "picocolors";
import { renderAccountCapacity, renderCapacitySummary, formatProgressBar, formatResetTime, formatTierBadge, formatBurnRate, type RenderOptions } from "../../../src/cli/capacity-renderer.js";
import type { AccountCapacity } from "../../../src/cloudcode/quota-api.js";
import type { BurnRateInfo } from "../../../src/cloudcode/burn-rate.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockCapacity(overrides: Partial<AccountCapacity> = {}): AccountCapacity {
  return {
    email: "test@example.com",
    tier: "PRO",
    claudePool: {
      models: [{ name: "claude-sonnet-4-5-thinking", percentage: 45, resetTime: new Date(Date.now() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString() }],
      aggregatedPercentage: 45,
      earliestReset: new Date(Date.now() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
    },
    geminiPool: {
      models: [
        { name: "gemini-3-pro-high", percentage: 85, resetTime: new Date(Date.now() + 4 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString() },
        { name: "gemini-3-flash", percentage: 100, resetTime: new Date(Date.now() + 4 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString() },
        { name: "gemini-3-pro-image", percentage: 60, resetTime: new Date(Date.now() + 4 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString() },
      ],
      aggregatedPercentage: 245,
      earliestReset: new Date(Date.now() + 4 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
    },
    projectId: "test-project",
    lastUpdated: Date.now(),
    isForbidden: false,
    ...overrides,
  };
}

function createMockBurnRates(claudeOverrides: Partial<BurnRateInfo> = {}, geminiOverrides: Partial<BurnRateInfo> = {}): { claude: BurnRateInfo; gemini: BurnRateInfo } {
  return {
    claude: {
      ratePerHour: 15,
      hoursToExhaustion: 3,
      status: "burning",
      ...claudeOverrides,
    },
    gemini: {
      ratePerHour: 5,
      hoursToExhaustion: 12,
      status: "burning",
      ...geminiOverrides,
    },
  };
}

// ============================================================================
// formatTierBadge Tests
// ============================================================================

describe("formatTierBadge", () => {
  describe("tier coloring", () => {
    it("returns magenta/purple for ULTRA tier", () => {
      const result = formatTierBadge("ULTRA");
      expect(result).toBe(pc.magenta("ULTRA"));
    });

    it("returns blue for PRO tier", () => {
      const result = formatTierBadge("PRO");
      expect(result).toBe(pc.blue("PRO"));
    });

    it("returns dim/gray for FREE tier", () => {
      const result = formatTierBadge("FREE");
      expect(result).toBe(pc.dim("FREE"));
    });

    it("returns dim/gray for UNKNOWN tier", () => {
      const result = formatTierBadge("UNKNOWN");
      expect(result).toBe(pc.dim("UNKNOWN"));
    });
  });

  describe("noColor option", () => {
    it("returns plain text when noColor is true", () => {
      const result = formatTierBadge("PRO", { noColor: true });
      expect(result).toBe("PRO");
    });
  });
});

// ============================================================================
// formatProgressBar Tests
// ============================================================================

describe("formatProgressBar", () => {
  describe("bar rendering", () => {
    it("creates a 21-character progress bar (20 + arrow)", () => {
      const result = formatProgressBar(50, { noColor: true });
      // 50% = 10 filled + arrow + 10 empty = 21 chars inside brackets
      expect(result).toBe("[==========>          ]");
    });

    it("shows 0% as empty bar", () => {
      const result = formatProgressBar(0, { noColor: true });
      // 0% = arrow + 20 empty = 21 chars inside brackets
      expect(result).toBe("[>                    ]");
    });

    it("shows 100% as full bar", () => {
      const result = formatProgressBar(100, { noColor: true });
      // 100% = 20 filled + arrow = 21 chars inside brackets
      expect(result).toBe("[====================>]");
    });

    it("handles percentages correctly", () => {
      const result25 = formatProgressBar(25, { noColor: true });
      // 25% = 5 filled + arrow + 15 empty
      expect(result25).toBe("[=====>               ]");

      const result75 = formatProgressBar(75, { noColor: true });
      // 75% = 15 filled + arrow + 5 empty
      expect(result75).toBe("[===============>     ]");
    });
  });

  describe("color coding based on percentage", () => {
    it("uses green for percentage >= 50%", () => {
      const result = formatProgressBar(50);
      expect(result).toContain(pc.green("="));
    });

    it("uses green for percentage at 100%", () => {
      const result = formatProgressBar(100);
      expect(result).toContain(pc.green("="));
    });

    it("uses yellow for percentage 20-49%", () => {
      const result = formatProgressBar(35);
      expect(result).toContain(pc.yellow("="));
    });

    it("uses yellow for percentage at 20%", () => {
      const result = formatProgressBar(20);
      expect(result).toContain(pc.yellow("="));
    });

    it("uses red for percentage < 20%", () => {
      const result = formatProgressBar(15);
      expect(result).toContain(pc.red("="));
    });

    it("uses red for percentage at 1%", () => {
      const result = formatProgressBar(1);
      expect(result).toContain(pc.red(">"));
    });
  });

  describe("edge cases", () => {
    it("clamps percentage above 100 to 100", () => {
      const result = formatProgressBar(150, { noColor: true });
      expect(result).toBe("[====================>]");
    });

    it("clamps negative percentage to 0", () => {
      const result = formatProgressBar(-10, { noColor: true });
      expect(result).toBe("[>                    ]");
    });
  });
});

// ============================================================================
// formatResetTime Tests
// ============================================================================

describe("formatResetTime", () => {
  describe("time formatting", () => {
    it("formats hours and minutes correctly", () => {
      const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString();
      const result = formatResetTime(twoHoursFromNow, { noColor: true });
      expect(result).toMatch(/2h 1[45]m/); // Allow for timing variance
    });

    it("shows only minutes when less than 1 hour", () => {
      const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const result = formatResetTime(thirtyMinutesFromNow, { noColor: true });
      expect(result).toMatch(/\d+m/);
      expect(result).not.toMatch(/h/);
    });

    it("returns null indicator for null reset time", () => {
      const result = formatResetTime(null, { noColor: true });
      expect(result).toBe("-");
    });
  });

  describe("color coding based on time remaining", () => {
    it("uses green for time < 1 hour (reset soon)", () => {
      const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const result = formatResetTime(thirtyMinutesFromNow);
      expect(result).toContain(pc.green(""));
    });

    it("uses yellow for time 1-6 hours", () => {
      const threeHoursFromNow = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
      const result = formatResetTime(threeHoursFromNow);
      expect(result).toContain(pc.yellow(""));
    });

    it("uses dim/gray for time > 6 hours", () => {
      const tenHoursFromNow = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
      const result = formatResetTime(tenHoursFromNow);
      expect(result).toContain(pc.dim(""));
    });
  });

  describe("edge cases", () => {
    it("handles past reset times gracefully", () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const result = formatResetTime(oneHourAgo, { noColor: true });
      expect(result).toBe("now");
    });
  });
});

// ============================================================================
// formatBurnRate Tests
// ============================================================================

describe("formatBurnRate", () => {
  describe("burn rate display", () => {
    it("shows burn rate and time to exhaustion for burning status", () => {
      const burnRate: BurnRateInfo = {
        ratePerHour: 15,
        hoursToExhaustion: 3,
        status: "burning",
      };
      const result = formatBurnRate(burnRate, null, { noColor: true });
      expect(result).toContain("Burn Rate: 15%/hr");
      expect(result).toMatch(/Exhausted in: ~3h/);
    });

    it("shows stable indicator for stable status", () => {
      const burnRate: BurnRateInfo = {
        ratePerHour: 0,
        hoursToExhaustion: null,
        status: "stable",
      };
      const result = formatBurnRate(burnRate, null, { noColor: true });
      expect(result).toContain("Stable");
    });

    it("shows recovering indicator for recovering status", () => {
      const burnRate: BurnRateInfo = {
        ratePerHour: -10,
        hoursToExhaustion: null,
        status: "recovering",
      };
      const result = formatBurnRate(burnRate, null, { noColor: true });
      expect(result).toContain("Recovering");
    });

    it("shows exhausted indicator for exhausted status", () => {
      const burnRate: BurnRateInfo = {
        ratePerHour: null,
        hoursToExhaustion: null,
        status: "exhausted",
      };
      const result = formatBurnRate(burnRate, null, { noColor: true });
      expect(result).toContain("EXHAUSTED");
    });

    it("shows calculating indicator when no data", () => {
      const burnRate: BurnRateInfo = {
        ratePerHour: null,
        hoursToExhaustion: null,
        status: "calculating",
      };
      const result = formatBurnRate(burnRate, null, { noColor: true });
      expect(result).toContain("Calculating");
    });
  });

  describe("burn warning", () => {
    it("shows BEFORE RESET warning when exhaustion is before reset", () => {
      const burnRate: BurnRateInfo = {
        ratePerHour: 20,
        hoursToExhaustion: 2, // 2 hours to exhaustion
        status: "burning",
      };
      const resetTime = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4 hours to reset
      const result = formatBurnRate(burnRate, resetTime);
      expect(result).toContain(pc.red("BEFORE RESET"));
    });

    it("does not show warning when reset is before exhaustion", () => {
      const burnRate: BurnRateInfo = {
        ratePerHour: 5,
        hoursToExhaustion: 10, // 10 hours to exhaustion
        status: "burning",
      };
      const resetTime = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4 hours to reset
      const result = formatBurnRate(burnRate, resetTime, { noColor: true });
      expect(result).not.toContain("BEFORE RESET");
    });
  });
});

// ============================================================================
// renderAccountCapacity Tests
// ============================================================================

describe("renderAccountCapacity", () => {
  describe("account header", () => {
    it("displays account email", () => {
      const capacity = createMockCapacity();
      const burnRates = createMockBurnRates();
      const result = renderAccountCapacity(capacity, burnRates, { noColor: true });
      expect(result).toContain("test@example.com");
    });

    it("displays tier badge", () => {
      const capacity = createMockCapacity({ tier: "PRO" });
      const burnRates = createMockBurnRates();
      const result = renderAccountCapacity(capacity, burnRates, { noColor: true });
      expect(result).toContain("Tier: PRO");
    });

    it("displays colored tier badge when colors enabled", () => {
      const capacity = createMockCapacity({ tier: "ULTRA" });
      const burnRates = createMockBurnRates();
      const result = renderAccountCapacity(capacity, burnRates);
      expect(result).toContain(pc.magenta("ULTRA"));
    });
  });

  describe("Claude pool section", () => {
    it("displays Claude Pool header", () => {
      const capacity = createMockCapacity();
      const burnRates = createMockBurnRates();
      const result = renderAccountCapacity(capacity, burnRates, { noColor: true });
      expect(result).toContain("Claude Pool");
    });

    it("displays model names with progress bars", () => {
      const capacity = createMockCapacity();
      const burnRates = createMockBurnRates();
      const result = renderAccountCapacity(capacity, burnRates, { noColor: true });
      expect(result).toContain("claude-sonnet-4-5-thinking");
      expect(result).toContain("45%");
      expect(result).toMatch(/\[.*\]/); // Has progress bar
    });

    it("displays reset time for models", () => {
      const capacity = createMockCapacity();
      const burnRates = createMockBurnRates();
      const result = renderAccountCapacity(capacity, burnRates, { noColor: true });
      expect(result).toMatch(/Resets?:?\s*\d+h\s*\d*m?/);
    });

    it("displays burn rate info", () => {
      const capacity = createMockCapacity();
      const burnRates = createMockBurnRates();
      const result = renderAccountCapacity(capacity, burnRates, { noColor: true });
      expect(result).toContain("Burn Rate:");
      expect(result).toContain("15%/hr");
    });

    it("hides Claude pool section when no models", () => {
      const capacity = createMockCapacity({
        claudePool: { models: [], aggregatedPercentage: 0, earliestReset: null },
      });
      const burnRates = createMockBurnRates();
      const result = renderAccountCapacity(capacity, burnRates, { noColor: true });
      expect(result).not.toContain("Claude Pool");
    });
  });

  describe("Gemini pool section", () => {
    it("displays Gemini Pool header", () => {
      const capacity = createMockCapacity();
      const burnRates = createMockBurnRates();
      const result = renderAccountCapacity(capacity, burnRates, { noColor: true });
      expect(result).toContain("Gemini Pool");
    });

    it("displays all Gemini models", () => {
      const capacity = createMockCapacity();
      const burnRates = createMockBurnRates();
      const result = renderAccountCapacity(capacity, burnRates, { noColor: true });
      expect(result).toContain("gemini-3-pro-high");
      expect(result).toContain("gemini-3-flash");
      expect(result).toContain("gemini-3-pro-image");
    });

    it("displays Gemini burn rate info", () => {
      const capacity = createMockCapacity();
      const burnRates = createMockBurnRates();
      const result = renderAccountCapacity(capacity, burnRates, { noColor: true });
      expect(result).toContain("5%/hr");
    });
  });

  describe("forbidden account", () => {
    it("displays forbidden warning for forbidden accounts", () => {
      const capacity = createMockCapacity({ isForbidden: true });
      const burnRates = createMockBurnRates();
      const result = renderAccountCapacity(capacity, burnRates, { noColor: true });
      expect(result).toMatch(/FORBIDDEN|forbidden|access denied/i);
    });
  });

  describe("noColor option", () => {
    it("produces plain text output when noColor is true", () => {
      const capacity = createMockCapacity();
      const burnRates = createMockBurnRates();
      const result = renderAccountCapacity(capacity, burnRates, { noColor: true });
      // Should not contain ANSI escape codes
      // eslint-disable-next-line no-control-regex
      expect(result).not.toMatch(/\x1b\[/);
    });
  });
});

// ============================================================================
// renderCapacitySummary Tests
// ============================================================================

describe("renderCapacitySummary", () => {
  describe("summary header", () => {
    it("displays summary title", () => {
      const capacities = [createMockCapacity()];
      const result = renderCapacitySummary(capacities, { noColor: true });
      expect(result).toMatch(/Summary/i);
    });
  });

  describe("account counts", () => {
    it("displays total account count", () => {
      const capacities = [createMockCapacity({ email: "user1@example.com", tier: "PRO" }), createMockCapacity({ email: "user2@example.com", tier: "FREE" })];
      const result = renderCapacitySummary(capacities, { noColor: true });
      expect(result).toContain("Total Accounts: 2");
    });

    it("displays tier breakdown", () => {
      const capacities = [createMockCapacity({ email: "user1@example.com", tier: "PRO" }), createMockCapacity({ email: "user2@example.com", tier: "PRO" }), createMockCapacity({ email: "user3@example.com", tier: "FREE" }), createMockCapacity({ email: "user4@example.com", tier: "ULTRA" })];
      const result = renderCapacitySummary(capacities, { noColor: true });
      expect(result).toContain("2 PRO");
      expect(result).toContain("1 FREE");
      expect(result).toContain("1 ULTRA");
    });
  });

  describe("combined capacity", () => {
    it("displays combined Claude capacity", () => {
      const capacities = [createMockCapacity({ email: "user1@example.com", claudePool: { models: [], aggregatedPercentage: 100, earliestReset: null } }), createMockCapacity({ email: "user2@example.com", claudePool: { models: [], aggregatedPercentage: 145, earliestReset: null } })];
      const result = renderCapacitySummary(capacities, { noColor: true });
      expect(result).toContain("Combined Claude Capacity: 245%");
    });

    it("displays combined Gemini capacity", () => {
      const capacities = [createMockCapacity({ email: "user1@example.com", geminiPool: { models: [], aggregatedPercentage: 200, earliestReset: null } }), createMockCapacity({ email: "user2@example.com", geminiPool: { models: [], aggregatedPercentage: 180, earliestReset: null } })];
      const result = renderCapacitySummary(capacities, { noColor: true });
      expect(result).toContain("Combined Gemini Capacity: 380%");
    });
  });

  describe("soonest reset", () => {
    it("displays soonest reset time with account email and pool", () => {
      const soonReset = new Date(Date.now() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString();
      const laterReset = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
      const capacities = [
        createMockCapacity({
          email: "soon@example.com",
          claudePool: { models: [{ name: "claude", percentage: 50, resetTime: soonReset }], aggregatedPercentage: 50, earliestReset: soonReset },
        }),
        createMockCapacity({
          email: "later@example.com",
          claudePool: { models: [{ name: "claude", percentage: 50, resetTime: laterReset }], aggregatedPercentage: 50, earliestReset: laterReset },
        }),
      ];
      const result = renderCapacitySummary(capacities, { noColor: true });
      expect(result).toMatch(/Soonest Reset:.*2h.*soon@example.com/i);
    });
  });

  describe("empty state", () => {
    it("handles empty capacities array", () => {
      const result = renderCapacitySummary([], { noColor: true });
      expect(result).toContain("No accounts");
    });
  });

  describe("noColor option", () => {
    it("produces plain text output when noColor is true", () => {
      const capacities = [createMockCapacity()];
      const result = renderCapacitySummary(capacities, { noColor: true });
      // Should not contain ANSI escape codes
      // eslint-disable-next-line no-control-regex
      expect(result).not.toMatch(/\x1b\[/);
    });
  });
});
