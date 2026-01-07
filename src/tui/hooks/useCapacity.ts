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
import { fetchAccountCapacity, type AccountCapacity } from "../../cloudcode/quota-api.js";
import { initQuotaStorage, recordSnapshot } from "../../cloudcode/quota-storage.js";
import { calculateBurnRate, type BurnRateInfo } from "../../cloudcode/burn-rate.js";
import type { AggregatedCapacity, AccountCapacityInfo } from "../types.js";

/**
 * Calculate normalized percentage for a pool (average across models, capped at 100)
 */
function getNormalizedPercentage(aggregatedPercentage: number, modelCount: number): number {
  if (modelCount === 0) return 0;
  // Average percentage across models, capped at 100
  return Math.min(100, Math.round(aggregatedPercentage / modelCount));
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
 */
function getHoursToExhaustion(rates: BurnRateInfo[], totalPct: number): number | null {
  const burningRates = rates.filter((r) => r.status === "burning" && r.ratePerHour && r.ratePerHour > 0);
  if (burningRates.length === 0) return null;
  const totalRate = burningRates.reduce((sum, r) => sum + (r.ratePerHour ?? 0), 0);
  return totalPct / totalRate;
}

interface CapacityFetchResult {
  account: Account;
  capacity: AccountCapacity;
}

interface UseCapacityResult {
  loading: boolean;
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
};

export function useCapacity(): UseCapacityResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claudeCapacity, setClaudeCapacity] = useState<AggregatedCapacity>({ ...defaultCapacity, family: "claude" });
  const [geminiCapacity, setGeminiCapacity] = useState<AggregatedCapacity>({ ...defaultCapacity, family: "gemini" });
  const [accountCount, setAccountCount] = useState(0);
  const [accounts, setAccounts] = useState<AccountCapacityInfo[]>([]);
  const storageInitialized = useRef(false);

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
    setLoading(true);
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
        const { accessToken } = await refreshAccessToken(account.refreshToken!);
        const capacity = await fetchAccountCapacity(accessToken, account.email);
        return { account, capacity };
      });

      const results = await Promise.allSettled(fetchPromises);

      let totalClaude = 0;
      let totalGemini = 0;
      const claudeBurnRates: BurnRateInfo[] = [];
      const geminiBurnRates: BurnRateInfo[] = [];
      const accountInfos: AccountCapacityInfo[] = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const accountEmail = oauthAccounts[i].email;

        if (result.status === "fulfilled") {
          const { account, capacity } = result.value;

          totalClaude += capacity.claudePool.aggregatedPercentage;
          totalGemini += capacity.geminiPool.aggregatedPercentage;

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

          // Build per-account info with normalized percentages
          const claudeNormalized = getNormalizedPercentage(capacity.claudePool.aggregatedPercentage, capacity.claudePool.models.length);
          const geminiNormalized = getNormalizedPercentage(capacity.geminiPool.aggregatedPercentage, capacity.geminiPool.models.length);

          accountInfos.push({
            email: account.email,
            tier: capacity.tier,
            claudePercentage: claudeNormalized,
            claudeReset: capacity.claudePool.earliestReset,
            geminiPercentage: geminiNormalized,
            geminiReset: capacity.geminiPool.earliestReset,
            error: null,
          });
        } else {
          // Log failed account for debugging
          console.debug(`Failed to fetch capacity for ${accountEmail}:`, (result.reason as Error).message);
          // Add error entry for this account
          accountInfos.push({
            email: accountEmail,
            tier: "UNKNOWN",
            claudePercentage: 0,
            claudeReset: null,
            geminiPercentage: 0,
            geminiReset: null,
            error: (result.reason as Error).message,
          });
        }
      }

      setAccounts(accountInfos);

      setClaudeCapacity({
        family: "claude",
        totalPercentage: totalClaude,
        accountCount: oauthAccounts.length,
        status: getOverallStatus(claudeBurnRates, totalClaude),
        hoursToExhaustion: getHoursToExhaustion(claudeBurnRates, totalClaude),
      });

      setGeminiCapacity({
        family: "gemini",
        totalPercentage: totalGemini,
        accountCount: oauthAccounts.length,
        status: getOverallStatus(geminiBurnRates, totalGemini),
        hoursToExhaustion: getHoursToExhaustion(geminiBurnRates, totalGemini),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    loading,
    error,
    claudeCapacity,
    geminiCapacity,
    accountCount,
    accounts,
    refresh,
  };
}
