/**
 * Share Config Storage
 *
 * Loads and persists share mode configuration.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { randomUUID } from "crypto";
import type { ShareConfig } from "./types.js";

/**
 * Default share configuration
 */
export function getDefaultShareConfig(): ShareConfig {
  return {
    auth: {
      enabled: true,
      mode: "single",
      masterKey: null,
      friendKeys: [],
    },
    visibility: {
      showAccountEmails: false,
      showIndividualAccounts: true,
      showModelBreakdown: true,
      showBurnRate: false,
    },
    limits: {
      maxClients: 5,
      pollIntervalSeconds: 10,
    },
    persistence: {
      resumeOnRestart: false,
    },
  };
}

/**
 * Load share config from disk
 */
export async function loadShareConfig(path: string): Promise<ShareConfig> {
  try {
    const content = await readFile(path, "utf-8");
    const parsed = JSON.parse(content) as Partial<ShareConfig>;

    // Merge with defaults to ensure all fields exist
    const defaults = getDefaultShareConfig();
    return {
      auth: { ...defaults.auth, ...parsed.auth },
      visibility: { ...defaults.visibility, ...parsed.visibility },
      limits: { ...defaults.limits, ...parsed.limits },
      persistence: { ...defaults.persistence, ...parsed.persistence },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return getDefaultShareConfig();
    }
    throw error;
  }
}

/**
 * Save share config to disk
 */
export async function saveShareConfig(path: string, config: ShareConfig): Promise<void> {
  // Generate masterKey if null and mode is single
  if (config.auth.mode === "single" && config.auth.masterKey === null) {
    config.auth.masterKey = randomUUID();
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2), "utf-8");
}
