/**
 * useCapacity Hook
 *
 * Fetches and aggregates capacity data from all accounts.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { ACCOUNT_CONFIG_PATH } from "../../constants.js";
import { loadAccounts } from "../../account-manager/storage.js";
import type { Account } from "../../account-manager/types.js";
import { refreshAccessToken } from "../../auth/oauth.js";
import { fetchAccountCapacity, type AccountCapacity, type ModelQuotaInfo } from "../../cloudcode/quota-api.js";
import { initQuotaStorage, recordSnapshot } from "../../cloudcode/quota-storage.js";
import { calculateBurnRate, type BurnRateInfo } from "../../cloudcode/burn-rate.js";
import { isDemoMode } from "../demo.js";
import type { AggregatedCapacity, AccountCapacityInfo, ModelQuotaDisplay } from "../types.js";

/**
 * Shorten model name for display (e.g., "gemini-2.5-pro" -> "2.5-pro")
 */
function shortenModelName(name: string): string {
  // Remove common prefixes
  return name
    .replace(/^gemini-/, "")
    .replace(/^claude-/, "")
    .replace(/^models\//, "");
}

/**
 * Convert API model quota to display format
 */
function toModelQuotaDisplay(model: ModelQuotaInfo): ModelQuotaDisplay {
  return {
    name: shortenModelName(model.name),
    percentage: model.percentage,
    resetTime: model.resetTime,
  };
}

/**
 * Determine overall status from burn rates and total percentage.
 * Only "exhausted" if total percentage is 0 (all accounts exhausted).
 */
function getOverallStatus(rates: BurnRateInfo[], totalPct: number): AggregatedCapacity["status"] {
  // Only exhausted if we have no capacity left
  if (totalPct === 0) return "exhausted";
  // Check for burning (active consumption)
  if (rates.some((r) => r.status === "burning")) return "burning";
  // Check for recovering (quota reset)
  if (rates.some((r) => r.status === "recovering")) return "recovering";
  // All stable
  if (rates.every((r) => r.status === "stable")) return "stable";
  return "calculating";
}

/**
 * Calculate combined hours to exhaustion based on burning rates.
 * Uses average percentage and average burn rate for accurate estimate.
 */
function getHoursToExhaustion(rates: BurnRateInfo[], avgPct: number): number | null {
  const burningRates = rates.filter((r) => r.status === "burning" && r.ratePerHour && r.ratePerHour > 0);
  if (burningRates.length === 0) return null;
  // Average burn rate across burning accounts
  const avgRate = burningRates.reduce((sum, r) => sum + (r.ratePerHour ?? 0), 0) / burningRates.length;
  return avgPct / avgRate;
}

/**
 * Get average burn rate from all burning accounts
 */
function getAvgBurnRate(rates: BurnRateInfo[]): number | null {
  const burningRates = rates.filter((r) => r.status === "burning" && r.ratePerHour && r.ratePerHour > 0);
  if (burningRates.length === 0) return null;
  return burningRates.reduce((sum, r) => sum + (r.ratePerHour ?? 0), 0) / burningRates.length;
}

interface CapacityFetchResult {
  account: Account;
  capacity: AccountCapacity;
}

interface UseCapacityResult {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  claudeCapacity: AggregatedCapacity;
  geminiCapacity: AggregatedCapacity;
  accountCount: number;
  accounts: AccountCapacityInfo[];
  refresh: () => Promise<void>;
}

const defaultCapacity: AggregatedCapacity = {
  family: "claude",
  totalPercentage: 0,
  accountCount: 0,
  status: "calculating",
  hoursToExhaustion: null,
  ratePerHour: null,
};

export function useCapacity(): UseCapacityResult {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claudeCapacity, setClaudeCapacity] = useState<AggregatedCapacity>({ ...defaultCapacity, family: "claude" });
  const [geminiCapacity, setGeminiCapacity] = useState<AggregatedCapacity>({ ...defaultCapacity, family: "gemini" });
  const [accountCount, setAccountCount] = useState(0);
  const [accounts, setAccounts] = useState<AccountCapacityInfo[]>([]);
  const storageInitialized = useRef(false);
  const hasLoadedOnce = useRef(false);

  // Initialize quota storage once
  useEffect(() => {
    if (!storageInitialized.current) {
      try {
        initQuotaStorage();
        storageInitialized.current = true;
      } catch {
        // Storage init failed, burn rate calculation will return "calculating" status
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    // Skip in demo mode - demo data is provided externally
    if (isDemoMode()) {
      setLoading(false);
      return;
    }

    // Use refreshing state after initial load
    if (hasLoadedOnce.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const { accounts } = await loadAccounts(ACCOUNT_CONFIG_PATH);
      const oauthAccounts = accounts.filter((a) => a.source === "oauth" && a.refreshToken);

      setAccountCount(oauthAccounts.length);

      if (oauthAccounts.length === 0) {
        setClaudeCapacity({ ...defaultCapacity, family: "claude" });
        setGeminiCapacity({ ...defaultCapacity, family: "gemini" });
        setAccounts([]);
        setLoading(false);
        return;
      }

      // Fetch capacity for all accounts in parallel
      const fetchPromises = oauthAccounts.map(async (account): Promise<CapacityFetchResult> => {
        if (!account.refreshToken) {
          throw new Error("No refresh token available");
        }
        const { accessToken } = await refreshAccessToken(account.refreshToken);
        const capacity = await fetchAccountCapacity(accessToken, account.email);
        return { account, capacity };
      });

      const results = await Promise.allSettled(fetchPromises);

      let claudeSum = 0;
      let geminiSum = 0;
      let claudeAccountsWithData = 0;
      let geminiAccountsWithData = 0;
      const claudeBurnRates: BurnRateInfo[] = [];
      const geminiBurnRates: BurnRateInfo[] = [];
      const accountInfos: AccountCapacityInfo[] = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const accountEmail = oauthAccounts[i].email;

        if (result.status === "fulfilled") {
          const { account, capacity } = result.value;

          // Sum percentages for averaging later (each account's percentage is already 0-100)
          claudeSum += capacity.claudePool.aggregatedPercentage;
          geminiSum += capacity.geminiPool.aggregatedPercentage;
          if (capacity.claudePool.models.length > 0) claudeAccountsWithData++;
          if (capacity.geminiPool.models.length > 0) geminiAccountsWithData++;

          // Record snapshots for burn rate calculation
          try {
            recordSnapshot(account.email, "claude", capacity.claudePool.aggregatedPercentage);
            recordSnapshot(account.email, "gemini", capacity.geminiPool.aggregatedPercentage);
          } catch {
            // Ignore snapshot recording errors
          }

          const claudeBurn = calculateBurnRate(account.email, "claude", capacity.claudePool.aggregatedPercentage, capacity.claudePool.earliestReset);
          const geminiBurn = calculateBurnRate(account.email, "gemini", capacity.geminiPool.aggregatedPercentage, capacity.geminiPool.earliestReset);

          claudeBurnRates.push(claudeBurn);
          geminiBurnRates.push(geminiBurn);

          // Build per-account info with per-model quotas
          accountInfos.push({
            email: account.email,
            tier: capacity.tier,
            claudeModels: capacity.claudePool.models.map(toModelQuotaDisplay),
            geminiModels: capacity.geminiPool.models.map(toModelQuotaDisplay),
            claudeReset: capacity.claudePool.earliestReset,
            geminiReset: capacity.geminiPool.earliestReset,
            error: null,
          });
        } else {
          // Add error entry for this account
          accountInfos.push({
            email: accountEmail,
            tier: "UNKNOWN",
            claudeModels: [],
            geminiModels: [],
            claudeReset: null,
            geminiReset: null,
            error: (result.reason as Error).message,
          });
        }
      }

      setAccounts(accountInfos);

      // Calculate average percentage across accounts (0-100% range)
      const avgClaudePct = claudeAccountsWithData > 0 ? Math.round(claudeSum / claudeAccountsWithData) : 0;
      const avgGeminiPct = geminiAccountsWithData > 0 ? Math.round(geminiSum / geminiAccountsWithData) : 0;

      setClaudeCapacity({
        family: "claude",
        totalPercentage: avgClaudePct,
        accountCount: oauthAccounts.length,
        status: getOverallStatus(claudeBurnRates, avgClaudePct),
        hoursToExhaustion: getHoursToExhaustion(claudeBurnRates, avgClaudePct),
        ratePerHour: getAvgBurnRate(claudeBurnRates),
      });

      setGeminiCapacity({
        family: "gemini",
        totalPercentage: avgGeminiPct,
        accountCount: oauthAccounts.length,
        status: getOverallStatus(geminiBurnRates, avgGeminiPct),
        hoursToExhaustion: getHoursToExhaustion(geminiBurnRates, avgGeminiPct),
        ratePerHour: getAvgBurnRate(geminiBurnRates),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedOnce.current = true;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    loading,
    refreshing,
    error,
    claudeCapacity,
    geminiCapacity,
    accountCount,
    accounts,
    refresh,
  };
}
