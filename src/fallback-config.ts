/**
 * Model Fallback Configuration
 *
 * Defines fallback mappings for when a model's quota is exhausted across all accounts.
 * Enables graceful degradation to alternative models with similar capabilities.
 */

import { MODEL_FALLBACK_MAP } from "./constants.js";

// Re-export for convenience
export { MODEL_FALLBACK_MAP };

/**
 * Get fallback model for a given model ID
 * @param model - Primary model ID
 * @returns Fallback model ID or null if no fallback exists
 */
export function getFallbackModel(model: string): string | null {
  return MODEL_FALLBACK_MAP[model] ?? null;
}

/**
 * Check if a model has a fallback configured
 * @param model - Model ID to check
 * @returns True if fallback exists
 */
export function hasFallback(model: string): boolean {
  return model in MODEL_FALLBACK_MAP;
}
