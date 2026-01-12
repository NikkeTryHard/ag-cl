/**
 * Quota Data Filter
 *
 * Filters quota data based on visibility settings.
 */

import type { ShareVisibility } from "./types.js";
import type { AccountCapacityInfo, AggregatedCapacity } from "../tui/types.js";

/**
 * Filtered quota data for sharing
 */
export interface FilteredQuotaData {
  claude: {
    totalPercentage: number;
    accountCount: number;
    status: string;
    hoursToExhaustion: number | null;
    ratePerHour: number | null;
  };
  gemini: {
    totalPercentage: number;
    accountCount: number;
    status: string;
    hoursToExhaustion: number | null;
    ratePerHour: number | null;
  };
  accounts?: {
    email: string;
    tier: string;
    claudeModels?: { name: string; percentage: number }[];
    geminiModels?: { name: string; percentage: number }[];
  }[];
  timestamp: string;
}

/**
 * Filter quota data based on visibility settings
 */
export function filterQuotaData(accounts: AccountCapacityInfo[], claudeCapacity: AggregatedCapacity, geminiCapacity: AggregatedCapacity, visibility: ShareVisibility): FilteredQuotaData {
  const result: FilteredQuotaData = {
    claude: {
      totalPercentage: claudeCapacity.totalPercentage,
      accountCount: claudeCapacity.accountCount,
      status: claudeCapacity.status,
      hoursToExhaustion: visibility.showBurnRate ? claudeCapacity.hoursToExhaustion : null,
      ratePerHour: visibility.showBurnRate ? claudeCapacity.ratePerHour : null,
    },
    gemini: {
      totalPercentage: geminiCapacity.totalPercentage,
      accountCount: geminiCapacity.accountCount,
      status: geminiCapacity.status,
      hoursToExhaustion: visibility.showBurnRate ? geminiCapacity.hoursToExhaustion : null,
      ratePerHour: visibility.showBurnRate ? geminiCapacity.ratePerHour : null,
    },
    timestamp: new Date().toISOString(),
  };

  // Add individual accounts if enabled
  if (visibility.showIndividualAccounts) {
    result.accounts = accounts.map((acc, index) => {
      const filtered: NonNullable<FilteredQuotaData["accounts"]>[0] = {
        email: visibility.showAccountEmails ? acc.email : `Account ${index + 1}`,
        tier: acc.tier,
      };

      if (visibility.showModelBreakdown) {
        filtered.claudeModels = acc.claudeModels.map((m) => ({
          name: m.name,
          percentage: m.percentage,
        }));
        filtered.geminiModels = [...acc.geminiProModels.map((m) => ({ name: m.name, percentage: m.percentage })), ...acc.geminiFlashModels.map((m) => ({ name: m.name, percentage: m.percentage }))];
      }

      return filtered;
    });
  }

  return result;
}
