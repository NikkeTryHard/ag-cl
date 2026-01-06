/**
 * Signature Cache
 * In-memory cache for Gemini thoughtSignatures
 *
 * Gemini models require thoughtSignature on tool calls, but Claude Code
 * strips non-standard fields. This cache stores signatures by tool_use_id
 * so they can be restored in subsequent requests.
 *
 * Also caches thinking block signatures with model family for cross-model
 * compatibility checking.
 */

import { GEMINI_SIGNATURE_CACHE_TTL_MS, MIN_SIGNATURE_LENGTH, type ModelFamily } from "../constants.js";

interface SignatureCacheEntry {
  signature: string;
  timestamp: number;
}

interface ThinkingSignatureCacheEntry {
  modelFamily: ModelFamily;
  timestamp: number;
}

const signatureCache = new Map<string, SignatureCacheEntry>();
const thinkingSignatureCache = new Map<string, ThinkingSignatureCacheEntry>();

/**
 * Store a signature for a tool_use_id
 * @param toolUseId - The tool use ID
 * @param signature - The thoughtSignature to cache
 */
export function cacheSignature(toolUseId: string, signature: string): void {
  if (!toolUseId || !signature) return;
  signatureCache.set(toolUseId, {
    signature,
    timestamp: Date.now(),
  });
}

/**
 * Get a cached signature for a tool_use_id
 * @param toolUseId - The tool use ID
 * @returns The cached signature or null if not found/expired
 */
export function getCachedSignature(toolUseId: string): string | null {
  if (!toolUseId) return null;
  const entry = signatureCache.get(toolUseId);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.timestamp > GEMINI_SIGNATURE_CACHE_TTL_MS) {
    signatureCache.delete(toolUseId);
    return null;
  }

  return entry.signature;
}

/**
 * Clear expired entries from the cache
 * Can be called periodically to prevent memory buildup
 */
export function cleanupCache(): void {
  const now = Date.now();
  for (const [key, entry] of signatureCache) {
    if (now - entry.timestamp > GEMINI_SIGNATURE_CACHE_TTL_MS) {
      signatureCache.delete(key);
    }
  }
  for (const [key, entry] of thinkingSignatureCache) {
    if (now - entry.timestamp > GEMINI_SIGNATURE_CACHE_TTL_MS) {
      thinkingSignatureCache.delete(key);
    }
  }
}

/**
 * Get the current cache size (for debugging)
 * @returns Number of entries in the cache
 */
export function getCacheSize(): number {
  return signatureCache.size;
}

/**
 * Cache a thinking block signature with its model family
 * @param signature - The thinking signature to cache
 * @param modelFamily - The model family ('claude' or 'gemini')
 */
export function cacheThinkingSignature(signature: string, modelFamily: ModelFamily): void {
  if (!signature || signature.length < MIN_SIGNATURE_LENGTH) return;
  thinkingSignatureCache.set(signature, {
    modelFamily,
    timestamp: Date.now(),
  });
}

/**
 * Get the cached model family for a thinking signature
 * @param signature - The signature to look up
 * @returns 'claude', 'gemini', or null if not found/expired
 */
export function getCachedSignatureFamily(signature: string): ModelFamily | null {
  if (!signature) return null;
  const entry = thinkingSignatureCache.get(signature);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.timestamp > GEMINI_SIGNATURE_CACHE_TTL_MS) {
    thinkingSignatureCache.delete(signature);
    return null;
  }

  return entry.modelFamily;
}

/**
 * Get the current thinking signature cache size (for debugging)
 * @returns Number of entries in the thinking signature cache
 */
export function getThinkingCacheSize(): number {
  return thinkingSignatureCache.size;
}

/**
 * Reset all caches - FOR TESTING ONLY
 * @internal
 */
export function _resetCacheForTesting(): void {
  signatureCache.clear();
  thinkingSignatureCache.clear();
}
