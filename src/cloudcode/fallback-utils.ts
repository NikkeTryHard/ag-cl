/**
 * Fallback Utilities for Cloud Code
 *
 * Shared utilities for handling 5xx error detection and fallback decisions.
 * Used by both message-handler and streaming-handler to reduce duplication.
 */

import { getFallbackModel } from "../fallback-config.js";
import { getLogger } from "../utils/logger.js";

/**
 * Result of a fallback decision
 */
export interface FallbackDecision {
  shouldFallback: boolean;
  fallbackModel: string | null;
}

/**
 * Determine if we should attempt fallback on retry exhaustion.
 *
 * @param model - The current model being used
 * @param all5xxErrors - Whether all failures were 5xx errors
 * @param fallbackEnabled - Whether fallback is enabled
 * @returns Decision object with shouldFallback flag and fallbackModel
 */
export function shouldAttemptFallback(model: string, all5xxErrors: boolean, fallbackEnabled: boolean): FallbackDecision {
  if (!all5xxErrors || !fallbackEnabled) {
    return { shouldFallback: false, fallbackModel: null };
  }

  const fallbackModel = getFallbackModel(model);
  if (!fallbackModel) {
    return { shouldFallback: false, fallbackModel: null };
  }

  getLogger().info(`[CloudCode] All retries exhausted for ${model} with 5xx errors. Attempting fallback to ${fallbackModel}`);

  return { shouldFallback: true, fallbackModel };
}

/**
 * Check if an error is a 5xx server error.
 *
 * @param err - The error to check
 * @returns True if the error indicates a 5xx server error
 */
export function is5xxError(err: Error): boolean {
  return err.message.includes("API error 5") || err.message.includes("500") || err.message.includes("503");
}
