/**
 * Quota Reset Trigger
 *
 * Sends minimal requests to Google Cloud Code to start the 5-hour quota reset timer.
 * Based on upstream PR #44.
 *
 * How it works:
 * - Cloud Code quotas reset 5 hours AFTER first usage
 * - By sending a minimal request (just "Hi" with 1 max output token), we start the countdown
 * - This consumes virtually no quota
 * - Each quota group (Claude, Gemini Pro, Gemini Flash) has independent timers
 */

import { ANTIGRAVITY_ENDPOINT_FALLBACKS, ANTIGRAVITY_HEADERS } from "../constants.js";
import { QUOTA_GROUPS, getAllQuotaGroups, type QuotaGroupKey } from "./quota-groups.js";
import { getLogger } from "../utils/logger.js";

/**
 * Models to use for triggering quota reset timers.
 *
 * Any model in a quota group starts the timer for all models in that group,
 * so we choose specific models for trigger requests:
 *
 * - Claude: Use Opus instead of Sonnet. Opus has lower rate limits but higher
 *   per-request quota cost, making it less likely to be actively used when
 *   we want to trigger. Using a less-frequently-used model reduces the chance
 *   of quota contention during trigger.
 *
 * - Gemini Pro/Flash: Use the primary variants (gemini-3-*) which are already
 *   the first models in their respective groups.
 */
const TRIGGER_MODELS: Record<QuotaGroupKey, string> = {
  claude: "claude-opus-4-5-thinking",
  geminiPro: "gemini-3-pro-high",
  geminiFlash: "gemini-3-flash",
};

/**
 * Result of triggering quota reset for a single group
 */
export interface GroupTriggerResult {
  group: QuotaGroupKey;
  model: string;
  success: boolean;
  error?: string;
}

/**
 * Result of triggering quota reset for all requested groups
 */
export interface QuotaTriggerResult {
  groupsTriggered: GroupTriggerResult[];
  successCount: number;
  failureCount: number;
}

/**
 * Minimal request payload to start quota timer
 * Uses just "Hi" with 1 max output token to consume virtually no quota
 */
interface MinimalRequest {
  project: string;
  model: string;
  request: {
    contents: {
      role: string;
      parts: { text: string }[];
    }[];
    generationConfig: {
      maxOutputTokens: number;
    };
  };
  userAgent: string;
  requestId: string;
  requestType: string;
}

/**
 * Build a minimal request payload for triggering quota timer
 *
 * @param projectId - The project ID
 * @param modelId - The model ID to use
 * @returns Minimal request payload
 */
function buildMinimalRequest(projectId: string, modelId: string): MinimalRequest {
  return {
    project: projectId,
    model: modelId,
    request: {
      contents: [
        {
          role: "user",
          parts: [{ text: "Hi" }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1,
      },
    },
    userAgent: "antigravity",
    requestId: `trigger-reset-${Date.now()}`,
    requestType: "agent",
  };
}

/**
 * Send a minimal request to start the quota timer for a model
 *
 * @param token - OAuth access token
 * @param projectId - Project ID
 * @param modelId - Model ID to trigger
 * @returns True if successful
 */
async function sendMinimalRequest(token: string, projectId: string, modelId: string): Promise<boolean> {
  const payload = buildMinimalRequest(projectId, modelId);

  for (const endpoint of ANTIGRAVITY_ENDPOINT_FALLBACKS) {
    try {
      const url = `${endpoint}/v1internal:generateContent`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...ANTIGRAVITY_HEADERS,
        },
        body: JSON.stringify(payload),
      });

      // Any response means the request reached Google and quota timer has started
      // Even errors like 429 mean the timer is already running
      if (response.ok || response.status === 429) {
        getLogger().debug(`[QuotaTrigger] Request sent to ${modelId}: ${response.status}`);
        return true;
      }

      // Auth errors mean we should try next endpoint
      if (response.status === 401 || response.status === 403) {
        getLogger().debug(`[QuotaTrigger] Auth error for ${modelId} at ${endpoint}: ${response.status}`);
        continue;
      }

      // Other errors, try next endpoint
      getLogger().debug(`[QuotaTrigger] Error for ${modelId} at ${endpoint}: ${response.status}`);
    } catch (error) {
      const err = error as Error;
      getLogger().debug(`[QuotaTrigger] Network error for ${modelId} at ${endpoint}: ${err.message}`);
    }
  }

  return false;
}

/**
 * Trigger quota reset for specified quota groups by sending minimal requests.
 *
 * This starts the 5-hour countdown timer for each quota group by sending
 * a minimal request (just "Hi") to one model from each group.
 *
 * @param token - OAuth access token
 * @param projectId - Project ID
 * @param group - Quota group key or "all" for all groups
 * @returns Result with success/failure counts for each group
 */
export async function triggerQuotaResetApi(token: string, projectId: string, group: QuotaGroupKey | "all"): Promise<QuotaTriggerResult> {
  const groupsToTrigger = group === "all" ? getAllQuotaGroups() : [group];
  const results: GroupTriggerResult[] = [];

  for (const groupKey of groupsToTrigger) {
    const quotaGroup = QUOTA_GROUPS[groupKey];
    if (!quotaGroup || quotaGroup.models.length === 0) {
      results.push({
        group: groupKey,
        model: "",
        success: false,
        error: "No models in group",
      });
      continue;
    }

    // Use the designated trigger model for this group
    const modelId = TRIGGER_MODELS[groupKey];

    getLogger().info(`[QuotaTrigger] Triggering ${quotaGroup.name} with model: ${modelId}`);

    const success = await sendMinimalRequest(token, projectId, modelId);

    results.push({
      group: groupKey,
      model: modelId,
      success,
      error: success ? undefined : "Failed to send request to all endpoints",
    });

    if (success) {
      getLogger().info(`[QuotaTrigger] ${quotaGroup.name} quota timer started`);
    } else {
      getLogger().warn(`[QuotaTrigger] Failed to trigger ${quotaGroup.name} quota timer`);
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  return {
    groupsTriggered: results,
    successCount,
    failureCount,
  };
}
