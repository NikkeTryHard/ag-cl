// tests/unit/share/quota-filter.test.ts
import { describe, it, expect } from "vitest";
import { filterQuotaData } from "../../../src/share/quota-filter.js";
import type { ShareVisibility } from "../../../src/share/types.js";
import type { AccountCapacityInfo, AggregatedCapacity } from "../../../src/tui/types.js";

describe("Quota filter", () => {
  const mockAccounts: AccountCapacityInfo[] = [
    {
      email: "user@example.com",
      tier: "pro",
      claudeModels: [{ name: "sonnet", percentage: 80, resetTime: null }],
      geminiProModels: [],
      geminiFlashModels: [],
      claudeReset: null,
      geminiProReset: null,
      geminiFlashReset: null,
      error: null,
    },
  ];

  const mockClaude: AggregatedCapacity = {
    family: "claude",
    totalPercentage: 80,
    accountCount: 1,
    status: "stable",
    hoursToExhaustion: null,
    ratePerHour: null,
  };

  const mockGemini: AggregatedCapacity = {
    family: "gemini",
    totalPercentage: 60,
    accountCount: 1,
    status: "stable",
    hoursToExhaustion: null,
    ratePerHour: null,
  };

  it("should hide emails when showAccountEmails is false", () => {
    const visibility: ShareVisibility = {
      showAccountEmails: false,
      showIndividualAccounts: true,
      showModelBreakdown: true,
      showBurnRate: true,
    };

    const result = filterQuotaData(mockAccounts, mockClaude, mockGemini, visibility);

    expect(result.accounts?.[0].email).toBe("Account 1");
  });

  it("should hide individual accounts when showIndividualAccounts is false", () => {
    const visibility: ShareVisibility = {
      showAccountEmails: true,
      showIndividualAccounts: false,
      showModelBreakdown: true,
      showBurnRate: true,
    };

    const result = filterQuotaData(mockAccounts, mockClaude, mockGemini, visibility);

    expect(result.accounts).toBeUndefined();
  });

  it("should hide burn rate when showBurnRate is false", () => {
    const visibility: ShareVisibility = {
      showAccountEmails: true,
      showIndividualAccounts: true,
      showModelBreakdown: true,
      showBurnRate: false,
    };

    const result = filterQuotaData(mockAccounts, mockClaude, mockGemini, visibility);

    expect(result.claude.ratePerHour).toBeNull();
    expect(result.claude.hoursToExhaustion).toBeNull();
  });
});
