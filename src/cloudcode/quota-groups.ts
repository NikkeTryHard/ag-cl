/**
 * Quota Groups
 *
 * Defines model groupings that share the same 5-hour quota reset timer.
 * Based on upstream PR #44.
 */

export interface QuotaGroup {
  name: string;
  models: string[];
}

export type QuotaGroupKey = "claude" | "geminiPro" | "geminiFlash";

/**
 * Quota groups with their associated models
 */
export const QUOTA_GROUPS: Record<QuotaGroupKey, QuotaGroup> = {
  claude: {
    name: "Claude",
    models: ["claude-sonnet-4-5", "claude-sonnet-4-5-thinking", "claude-opus-4-5", "claude-opus-4-5-thinking", "gpt-oss-120b"],
  },
  geminiPro: {
    name: "Gemini Pro",
    models: ["gemini-3-pro-high", "gemini-3-pro-low", "gemini-2.5-pro"],
  },
  geminiFlash: {
    name: "Gemini Flash",
    models: ["gemini-3-flash", "gemini-2.5-flash"],
  },
};

/**
 * Get the quota group key for a model
 * @param modelId - Model ID to look up
 * @returns Quota group key or null if not found
 */
export function getQuotaGroup(modelId: string): QuotaGroupKey | null {
  for (const [key, group] of Object.entries(QUOTA_GROUPS)) {
    if (group.models.includes(modelId)) {
      return key as QuotaGroupKey;
    }
  }
  return null;
}

/**
 * Get all quota group keys
 * @returns Array of quota group keys
 */
export function getAllQuotaGroups(): QuotaGroupKey[] {
  return Object.keys(QUOTA_GROUPS) as QuotaGroupKey[];
}
