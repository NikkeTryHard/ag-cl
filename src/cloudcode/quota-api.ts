/**
 * Quota and Tier API for Cloud Code
 *
 * Handles tier detection and comprehensive quota retrieval.
 * Based on Antigravity-Manager implementation.
 */

import { ANTIGRAVITY_ENDPOINT_FALLBACKS, ANTIGRAVITY_HEADERS, getModelFamily } from "../constants.js";
import { getLogger } from "../utils/logger.js";

/**
 * Account tier types
 */
export type AccountTier = "FREE" | "PRO" | "ULTRA" | "UNKNOWN";

/**
 * Tier information from loadCodeAssist
 */
interface TierInfo {
  id?: string;
  quotaTier?: string;
  name?: string;
  slug?: string;
}

/**
 * Response from loadCodeAssist API
 */
interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string;
  currentTier?: TierInfo;
  paidTier?: TierInfo;
}

/**
 * Model quota information
 */
export interface ModelQuotaInfo {
  name: string;
  percentage: number; // 0-100
  resetTime: string | null;
}

/**
 * Model pool information (Claude or Gemini)
 */
export interface ModelPoolInfo {
  models: ModelQuotaInfo[];
  aggregatedPercentage: number;
  earliestReset: string | null;
}

/**
 * Full account capacity information
 */
export interface AccountCapacity {
  email: string;
  tier: AccountTier;
  claudePool: ModelPoolInfo;
  geminiPool: ModelPoolInfo;
  projectId: string | null;
  lastUpdated: number;
  isForbidden: boolean;
}

/**
 * Normalize a tier ID string to a standard AccountTier type.
 *
 * Handles various tier ID formats from the API (e.g., "tier_pro", "PRO_TIER")
 * by checking for keywords and mapping to standardized tier names.
 *
 * @param tierId - Raw tier ID string from the API, may be null/undefined
 * @returns Normalized AccountTier: "ULTRA", "PRO", "FREE", or "UNKNOWN"
 */
function normalizeTier(tierId: string | null | undefined): AccountTier {
  if (!tierId) return "UNKNOWN";
  const upper = tierId.toUpperCase();
  if (upper.includes("ULTRA")) return "ULTRA";
  if (upper.includes("PRO")) return "PRO";
  if (upper.includes("FREE")) return "FREE";
  return "UNKNOWN";
}

/**
 * Fetch account tier using loadCodeAssist endpoint.
 * This endpoint does NOT consume quota.
 *
 * @param token - OAuth access token
 * @returns Tier and project ID
 */
export async function fetchAccountTier(token: string): Promise<{ tier: AccountTier; projectId: string | null }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...ANTIGRAVITY_HEADERS,
  };

  const payload = { metadata: { ideType: "ANTIGRAVITY" } };

  for (const endpoint of ANTIGRAVITY_ENDPOINT_FALLBACKS) {
    try {
      const url = `${endpoint}/v1internal:loadCodeAssist`;
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        getLogger().debug(`[QuotaAPI] loadCodeAssist error at ${endpoint}: ${response.status}`);
        continue;
      }

      const data = (await response.json()) as LoadCodeAssistResponse;

      // Priority: paidTier > currentTier (paidTier reflects actual subscription)
      const tierId = data.paidTier?.id ?? data.currentTier?.id ?? null;
      const tier = normalizeTier(tierId);
      const projectId = data.cloudaicompanionProject ?? null;

      getLogger().debug(`[QuotaAPI] Tier detected: ${tier}, Project: ${projectId}`);

      return { tier, projectId };
    } catch (error) {
      const err = error as Error;
      getLogger().debug({ endpoint, error: err.message }, "[QuotaAPI] loadCodeAssist failed");
    }
  }

  return { tier: "UNKNOWN", projectId: null };
}

/**
 * Quota info from fetchAvailableModels
 */
interface RawQuotaInfo {
  remainingFraction?: number;
  resetTime?: string;
}

interface RawModelData {
  displayName?: string;
  quotaInfo?: RawQuotaInfo;
}

interface FetchAvailableModelsResponse {
  models?: Record<string, RawModelData>;
}

/**
 * Fetch model quotas from fetchAvailableModels endpoint
 *
 * @param token - OAuth access token
 * @param projectId - Optional project ID
 * @returns Map of model quotas
 */
async function fetchModelQuotas(token: string, projectId?: string | null): Promise<{ quotas: ModelQuotaInfo[]; isForbidden: boolean }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...ANTIGRAVITY_HEADERS,
  };

  const payload = projectId ? { project: projectId } : {};

  for (const endpoint of ANTIGRAVITY_ENDPOINT_FALLBACKS) {
    try {
      const url = `${endpoint}/v1internal:fetchAvailableModels`;
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (response.status === 403) {
        getLogger().debug(`[QuotaAPI] Account forbidden (403)`);
        return { quotas: [], isForbidden: true };
      }

      if (!response.ok) {
        getLogger().debug(`[QuotaAPI] fetchAvailableModels error at ${endpoint}: ${response.status}`);
        continue;
      }

      const data = (await response.json()) as FetchAvailableModelsResponse;
      const quotas: ModelQuotaInfo[] = [];

      if (data.models) {
        for (const [name, info] of Object.entries(data.models)) {
          // Only include Claude and Gemini models
          const family = getModelFamily(name);
          if (family !== "claude" && family !== "gemini") continue;

          if (info.quotaInfo) {
            const percentage = info.quotaInfo.remainingFraction != null ? Math.round(info.quotaInfo.remainingFraction * 100) : 0;

            quotas.push({
              name,
              percentage,
              resetTime: info.quotaInfo.resetTime ?? null,
            });
          }
        }
      }

      return { quotas, isForbidden: false };
    } catch (error) {
      const err = error as Error;
      getLogger().debug({ endpoint, error: err.message }, "[QuotaAPI] fetchAvailableModels failed");
    }
  }

  return { quotas: [], isForbidden: false };
}

/**
 * Create pool info from models
 */
function createPoolInfo(models: ModelQuotaInfo[]): ModelPoolInfo {
  // Sum percentages (each model can contribute 0-100%)
  const aggregatedPercentage = models.reduce((sum, m) => sum + m.percentage, 0);

  // Find earliest reset time
  let earliestReset: string | null = null;
  for (const model of models) {
    if (model.resetTime) {
      if (!earliestReset || new Date(model.resetTime) < new Date(earliestReset)) {
        earliestReset = model.resetTime;
      }
    }
  }

  return {
    models,
    aggregatedPercentage,
    earliestReset,
  };
}

/**
 * Group quotas by model family into pools
 */
function groupByPool(quotas: ModelQuotaInfo[]): { claudePool: ModelPoolInfo; geminiPool: ModelPoolInfo } {
  const claudeModels: ModelQuotaInfo[] = [];
  const geminiModels: ModelQuotaInfo[] = [];

  for (const quota of quotas) {
    const family = getModelFamily(quota.name);
    if (family === "claude") {
      claudeModels.push(quota);
    } else if (family === "gemini") {
      geminiModels.push(quota);
    }
  }

  return {
    claudePool: createPoolInfo(claudeModels),
    geminiPool: createPoolInfo(geminiModels),
  };
}

/**
 * Fetch full account capacity information.
 * Combines tier detection and quota fetching.
 *
 * @param token - OAuth access token
 * @param email - Account email for identification
 * @returns Full account capacity
 */
export async function fetchAccountCapacity(token: string, email: string): Promise<AccountCapacity> {
  // 1. Fetch tier (does not consume quota)
  const { tier, projectId } = await fetchAccountTier(token);

  // 2. Fetch model quotas
  const { quotas, isForbidden } = await fetchModelQuotas(token, projectId);

  // 3. Group by pools
  const { claudePool, geminiPool } = groupByPool(quotas);

  return {
    email,
    tier,
    claudePool,
    geminiPool,
    projectId,
    lastUpdated: Date.now(),
    isForbidden,
  };
}
