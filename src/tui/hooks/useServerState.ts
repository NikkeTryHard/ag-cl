/**
 * useServerState Hook
 *
 * Manages the proxy server lifecycle from within the TUI.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { Server } from "http";
import net from "net";
import type { ServerState } from "../types.js";
import type { AccountSettings } from "../../account-manager/types.js";
import { getDefaultPort, getLogLevel, getFallbackEnabled, getIdentityMode, getAutoRefreshEnabled } from "../../settings/defaults.js";

export interface UseServerStateResult extends ServerState {
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  setPort: (port: number) => void;
}

/**
 * Check if a port is available
 */
function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

/**
 * Options for useServerState hook
 */
export interface UseServerStateOptions {
  /** Account settings for server configuration */
  settings?: AccountSettings;
  /** Demo mode skips actual server startup */
  demoMode?: boolean;
}

export function useServerState(options: UseServerStateOptions = {}): UseServerStateResult {
  const { settings, demoMode = false } = options;

  // Get initial port from settings, falling back to defaults
  const initialPort = getDefaultPort(settings);

  const [running, setRunning] = useState(false);
  const [port, setPortState] = useState(initialPort);
  const [error, setError] = useState<string | null>(null);
  const serverRef = useRef<Server | null>(null);
  const startingRef = useRef(false);

  const start = useCallback(async () => {
    if (running || startingRef.current) return;
    startingRef.current = true;
    setError(null);

    // Demo mode: fake server start
    if (demoMode) {
      setRunning(true);
      startingRef.current = false;
      return;
    }

    try {
      // Check if port is available first
      const available = await checkPortAvailable(port);
      if (!available) {
        setError(`Port ${port} is already in use`);
        startingRef.current = false;
        return;
      }

      // Set environment variables for server configuration before import
      // The server module reads FALLBACK from process.env at load time
      const fallbackEnabled = getFallbackEnabled(settings);
      if (fallbackEnabled) {
        process.env.FALLBACK = "true";
      } else {
        delete process.env.FALLBACK;
      }

      // Set log level for server logging
      const logLevel = getLogLevel(settings);
      process.env.LOG_LEVEL = logLevel;

      // Set identity mode for request-builder
      const identityMode = getIdentityMode(settings);
      process.env.AG_INJECT_IDENTITY = identityMode;

      // Dynamically import to avoid circular deps
      const { default: app } = await import("../../server.js");
      const server = app.listen(port);
      serverRef.current = server;
      setRunning(true);

      // Start auto-refresh scheduler if enabled
      const autoRefreshEnabled = getAutoRefreshEnabled(settings);
      if (autoRefreshEnabled) {
        const { startAutoRefresh } = await import("../../cloudcode/auto-refresh-scheduler.js");
        void startAutoRefresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      startingRef.current = false;
    }
  }, [running, port, demoMode, settings]);

  const stop = useCallback(async () => {
    // Stop auto-refresh scheduler
    const { stopAutoRefresh, isAutoRefreshRunning } = await import("../../cloudcode/auto-refresh-scheduler.js");
    if (isAutoRefreshRunning()) {
      stopAutoRefresh();
    }

    // Demo mode: fake server stop
    if (demoMode) {
      setRunning(false);
      return;
    }

    const server = serverRef.current;
    if (!running || !server) return;
    setError(null);

    return new Promise<void>((resolve) => {
      server.close((err) => {
        if (err) {
          setError(err.message);
        }
        serverRef.current = null;
        setRunning(false);
        resolve();
      });
    });
  }, [running, demoMode]);

  // Cleanup on unmount
  useEffect(() => {
    return (): void => {
      if (serverRef.current) {
        serverRef.current.close();
      }
      // Stop auto-refresh on unmount
      void import("../../cloudcode/auto-refresh-scheduler.js").then(({ stopAutoRefresh, isAutoRefreshRunning }) => {
        if (isAutoRefreshRunning()) {
          stopAutoRefresh();
        }
      });
    };
  }, []);

  const restart = useCallback(async () => {
    await stop();
    await start();
  }, [stop, start]);

  const setPort = useCallback((newPort: number) => {
    setPortState(newPort);
  }, []);

  return {
    running,
    port,
    error,
    start,
    stop,
    restart,
    setPort,
  };
}
