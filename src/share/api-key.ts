/**
 * API Key Management
 *
 * Generate, validate, and mask API keys for share mode.
 */

import { randomUUID } from "crypto";
import type { ShareConfig, FriendKey } from "./types.js";

/**
 * Generate a new API key (UUID v4)
 */
export function generateApiKey(): string {
  return randomUUID();
}

/**
 * Mask an API key for display (show first 3 chars + ***)
 */
export function maskApiKey(key: string): string {
  const prefix = key.slice(0, 3);
  return `${prefix}***`;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  nickname: string | null;
  keyMasked: string | null;
}

/**
 * Validate an API key against the share config
 */
export function validateApiKey(config: ShareConfig, key: string | null | undefined): ValidationResult {
  // Auth disabled = always valid
  if (!config.auth.enabled) {
    return { valid: true, nickname: null, keyMasked: null };
  }

  // No key provided
  if (!key) {
    return { valid: false, nickname: null, keyMasked: null };
  }

  // Single mode - check master key
  if (config.auth.mode === "single") {
    if (config.auth.masterKey === key) {
      return { valid: true, nickname: null, keyMasked: maskApiKey(key) };
    }
    return { valid: false, nickname: null, keyMasked: null };
  }

  // Per-friend mode - check friend keys
  const friendKey = config.auth.friendKeys.find((fk) => fk.key === key && !fk.revoked);
  if (friendKey) {
    return {
      valid: true,
      nickname: friendKey.nickname,
      keyMasked: maskApiKey(key),
    };
  }

  return { valid: false, nickname: null, keyMasked: null };
}

/**
 * Generate a new friend key entry
 */
export function generateFriendKey(nickname: string | null): FriendKey {
  return {
    key: generateApiKey(),
    nickname,
    revoked: false,
    createdAt: Date.now(),
  };
}
