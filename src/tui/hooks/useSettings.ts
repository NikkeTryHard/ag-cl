/**
 * useSettings Hook
 *
 * Loads and persists application settings from disk.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { ACCOUNT_CONFIG_PATH } from "../../constants.js";
import { loadAccounts, saveAccounts } from "../../account-manager/storage.js";
import type { AccountSettings, Account } from "../../account-manager/types.js";
import { isDemoMode } from "../demo.js";

/**
 * Default settings when none are stored
 */
const defaultSettings: AccountSettings = {};

export interface UseSettingsResult {
  /** Current settings object */
  settings: AccountSettings;
  /** Whether settings are currently loading from disk */
  loading: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Update settings (merges with existing and saves to disk) */
  updateSettings: (partial: Partial<AccountSettings>) => Promise<void>;
  /** Reload settings from disk */
  reload: () => Promise<void>;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<AccountSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep track of accounts and activeIndex for saving
  const accountsRef = useRef<Account[]>([]);
  const activeIndexRef = useRef(0);

  const loadSettingsFromDisk = useCallback(async () => {
    // Skip in demo mode
    if (isDemoMode()) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { accounts, settings: loadedSettings, activeIndex } = await loadAccounts(ACCOUNT_CONFIG_PATH);

      // Store accounts and activeIndex for later saves
      accountsRef.current = accounts;
      activeIndexRef.current = activeIndex;

      setSettings(loadedSettings);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(
    async (partial: Partial<AccountSettings>): Promise<void> => {
      // In demo mode, only update local state
      if (isDemoMode()) {
        setSettings((prev) => ({ ...prev, ...partial }));
        return;
      }

      setError(null);

      try {
        // Merge with current settings
        const newSettings = { ...settings, ...partial };

        // Save to disk
        await saveAccounts(ACCOUNT_CONFIG_PATH, accountsRef.current, newSettings, activeIndexRef.current);

        // Update local state
        setSettings(newSettings);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      }
    },
    [settings],
  );

  // Load settings on mount
  useEffect(() => {
    void loadSettingsFromDisk();
  }, [loadSettingsFromDisk]);

  return {
    settings,
    loading,
    error,
    updateSettings,
    reload: loadSettingsFromDisk,
  };
}
