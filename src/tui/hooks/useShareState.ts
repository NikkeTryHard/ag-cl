/**
 * useShareState Hook
 *
 * Manages share mode state for the TUI.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { TunnelManager, checkCloudflaredInstalled } from "../../share/tunnel.js";
import { loadShareConfig, saveShareConfig, getDefaultShareConfig } from "../../share/config-storage.js";
import { SHARE_CONFIG_PATH } from "../../constants.js";
import type { ShareMode, ShareConfig, ShareHostState, ShareClientState } from "../../share/types.js";

export interface UseShareStateOptions {
  port: number;
}

export interface UseShareStateResult {
  mode: ShareMode;
  config: ShareConfig;
  hostState: ShareHostState;
  clientState: ShareClientState;
  cloudflaredInstalled: boolean | null;

  // Host actions
  startSharing: () => void;
  stopSharing: () => void;
  copyUrl: () => void;

  // Client actions
  connectTo: (url: string, apiKey: string, nickname?: string) => void;
  disconnect: () => void;

  // Config actions
  updateConfig: (partial: Partial<ShareConfig>) => Promise<void>;

  // Loading states
  loading: boolean;
  error: string | null;
}

export function useShareState(options: UseShareStateOptions): UseShareStateResult {
  const { port } = options;

  const [mode, setMode] = useState<ShareMode>("normal");
  const [config, setConfig] = useState<ShareConfig>(getDefaultShareConfig());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cloudflaredInstalled, setCloudflaredInstalled] = useState<boolean | null>(null);

  const [hostState, setHostState] = useState<ShareHostState>({
    active: false,
    tunnelUrl: null,
    connectedClients: [],
    error: null,
  });

  const [clientState, setClientState] = useState<ShareClientState>({
    connected: false,
    remoteUrl: null,
    hostNickname: null,
    error: null,
    reconnecting: false,
    lastPollAt: null,
  });

  const tunnelRef = useRef<TunnelManager | null>(null);

  // Load config on mount
  useEffect(() => {
    const init = async () => {
      try {
        const [cfg, installed] = await Promise.all([loadShareConfig(SHARE_CONFIG_PATH), checkCloudflaredInstalled()]);
        setConfig(cfg);
        setCloudflaredInstalled(installed);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  // Start sharing (host mode)
  const startSharing = useCallback(() => {
    if (!cloudflaredInstalled) {
      setError("cloudflared is not installed");
      return;
    }

    setMode("host");
    setHostState((prev) => ({ ...prev, active: true, error: null }));

    const tunnel = new TunnelManager(port);
    tunnelRef.current = tunnel;

    tunnel.on("url", (url: string) => {
      setHostState((prev) => ({ ...prev, tunnelUrl: url }));
    });

    tunnel.on("error", (err: Error) => {
      setHostState((prev) => ({ ...prev, error: err.message }));
    });

    tunnel.on("reconnecting", () => {
      setHostState((prev) => ({ ...prev, error: "Reconnecting..." }));
    });

    tunnel.start();
  }, [port, cloudflaredInstalled]);

  // Stop sharing
  const stopSharing = useCallback(() => {
    tunnelRef.current?.stop();
    tunnelRef.current = null;
    setMode("normal");
    setHostState({
      active: false,
      tunnelUrl: null,
      connectedClients: [],
      error: null,
    });
  }, []);

  // Copy URL to clipboard
  const copyUrl = useCallback(() => {
    if (hostState.tunnelUrl) {
      // In Node.js environment, we'll emit an event for the TUI to handle
      // The actual clipboard copy happens in the component
    }
  }, [hostState.tunnelUrl]);

  // Connect to remote (client mode)
  // Note: This sets initial state. Use useShareClient hook for actual HTTP polling.
  const connectTo = useCallback((url: string, _apiKey: string, _nickname?: string) => {
    setMode("client");
    setClientState((prev) => ({
      ...prev,
      connected: true,
      remoteUrl: url,
      error: null,
    }));
  }, []);

  // Disconnect from remote
  const disconnect = useCallback(() => {
    setMode("normal");
    setClientState({
      connected: false,
      remoteUrl: null,
      hostNickname: null,
      error: null,
      reconnecting: false,
      lastPollAt: null,
    });
  }, []);

  // Note: For full client mode functionality (polling, reconnection),
  // integrate useShareClient hook at the component level (e.g., in app.tsx)

  // Update config
  const updateConfig = useCallback(
    async (partial: Partial<ShareConfig>) => {
      const newConfig = {
        ...config,
        ...partial,
        auth: { ...config.auth, ...(partial.auth ?? {}) },
        visibility: { ...config.visibility, ...(partial.visibility ?? {}) },
        limits: { ...config.limits, ...(partial.limits ?? {}) },
        persistence: { ...config.persistence, ...(partial.persistence ?? {}) },
      };

      await saveShareConfig(SHARE_CONFIG_PATH, newConfig);
      setConfig(newConfig);
    },
    [config],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      tunnelRef.current?.stop();
    };
  }, []);

  return {
    mode,
    config,
    hostState,
    clientState,
    cloudflaredInstalled,
    startSharing,
    stopSharing,
    copyUrl,
    connectTo,
    disconnect,
    updateConfig,
    loading,
    error,
  };
}
