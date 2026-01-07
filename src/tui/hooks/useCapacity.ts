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
import type { AggregatedCapacity } from "../types.js";

/**
 * Determine overall status from burn rates.
 */
function getOverallStatus(rates: BurnRateInfo[]): AggregatedCapacity["status"] {
  if (rates.some((r) => r.status === "exhausted")) return "exhausted";
  if (rates.some((r) => r.status === "burning")) return "burning";
  if (rates.some((r) => r.status === "recovering")) return "recovering";
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

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
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

          claudeBurnRates.push(calculateBurnRate(account.email, "claude", capacity.claudePool.aggregatedPercentage, capacity.claudePool.earliestReset));
          geminiBurnRates.push(calculateBurnRate(account.email, "gemini", capacity.geminiPool.aggregatedPercentage, capacity.geminiPool.earliestReset));
        } else {
          // Log failed account for debugging
          const failedAccount = oauthAccounts[i];
          console.debug(`Failed to fetch capacity for ${failedAccount.email}:`, (result.reason as Error).message);
        }
      }

      setClaudeCapacity({
        family: "claude",
        totalPercentage: totalClaude,
        accountCount: oauthAccounts.length,
        status: getOverallStatus(claudeBurnRates),
        hoursToExhaustion: getHoursToExhaustion(claudeBurnRates, totalClaude),
      });

      setGeminiCapacity({
        family: "gemini",
        totalPercentage: totalGemini,
        accountCount: oauthAccounts.length,
        status: getOverallStatus(geminiBurnRates),
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
    refresh,
  };
}
