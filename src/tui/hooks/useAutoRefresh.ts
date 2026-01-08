/**
 * useAutoRefresh Hook
 *
 * Manages the auto-refresh scheduler lifecycle based on settings.
 * Starts/stops the scheduler when the setting changes or on mount/unmount.
 */

import { useEffect, useState, useCallback } from "react";
import { getAutoRefreshEnabled } from "../../settings/defaults.js";
import type { AccountSettings } from "../../account-manager/types.js";

export interface UseAutoRefreshOptions {
  /** Current settings object */
  settings: AccountSettings;
  /** Whether running in demo mode (skip actual scheduler) */
  demoMode?: boolean;
}

export interface UseAutoRefreshResult {
  /** Whether auto-refresh is currently running */
  isRunning: boolean;
  /** Manually start auto-refresh */
  start: () => Promise<void>;
  /** Manually stop auto-refresh */
  stop: () => void;
}

export function useAutoRefresh(options: UseAutoRefreshOptions): UseAutoRefreshResult {
  const { settings, demoMode = false } = options;
  const [isRunning, setIsRunning] = useState(false);

  const start = useCallback(async () => {
    if (demoMode || isRunning) return;

    const { startAutoRefresh, isAutoRefreshRunning } = await import("../../cloudcode/auto-refresh-scheduler.js");

    if (!isAutoRefreshRunning()) {
      await startAutoRefresh();
      setIsRunning(true);
    }
  }, [demoMode, isRunning]);

  const stop = useCallback(() => {
    if (demoMode) return;

    void import("../../cloudcode/auto-refresh-scheduler.js")
      .then(({ stopAutoRefresh, isAutoRefreshRunning }) => {
        if (isAutoRefreshRunning()) {
          stopAutoRefresh();
          setIsRunning(false);
        }
      })
      .catch(() => {
        /* Import or stop failed */
      });
  }, [demoMode]);

  // Start/stop based on setting changes
  useEffect(() => {
    const enabled = getAutoRefreshEnabled(settings);

    if (enabled) {
      void start();
    } else {
      stop();
    }

    // Cleanup on unmount
    return (): void => {
      stop();
    };
  }, [settings.autoRefreshEnabled, start, stop]);

  return {
    isRunning,
    start,
    stop,
  };
}
