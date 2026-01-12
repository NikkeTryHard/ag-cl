/**
 * useShareClient Hook
 *
 * Manages client-side connection to a remote share host.
 * Handles polling, reconnection, and quota data fetching.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { FilteredQuotaData } from "../../share/quota-filter.js";

export interface UseShareClientResult {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  clientId: string | null;
  quotaData: FilteredQuotaData | null;
  error: string | null;
  lastPollAt: number | null;

  connect: (url: string, apiKey: string, nickname?: string) => Promise<void>;
  disconnect: () => void;
}

export function useShareClient(): UseShareClientResult {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [quotaData, setQuotaData] = useState<FilteredQuotaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPollAt, setLastPollAt] = useState<number | null>(null);

  const urlRef = useRef<string | null>(null);
  const apiKeyRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<number>(10);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Fetch quota data from remote
  const fetchQuota = useCallback(async (): Promise<void> => {
    if (!urlRef.current || !clientId) return;

    try {
      const response = await fetch(`${urlRef.current}/share/quota`, {
        headers: {
          "x-api-key": apiKeyRef.current ?? "",
          "x-client-id": clientId,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as FilteredQuotaData;
      setQuotaData(data);
      setLastPollAt(Date.now());
      setError(null);
      setReconnecting(false);
      reconnectAttemptsRef.current = 0;
    } catch (err) {
      setError((err as Error).message);

      // Attempt reconnect
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        setReconnecting(true);
      } else {
        // Max attempts reached, disconnect
        setConnected(false);
        setClientId(null);
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    }
  }, [clientId]);

  // Start polling
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

    pollTimerRef.current = setInterval(() => {
      void fetchQuota();
    }, pollIntervalRef.current * 1000);
  }, [fetchQuota]);

  // Connect to remote host
  const connect = useCallback(
    async (url: string, apiKey: string, nickname?: string): Promise<void> => {
      setConnecting(true);
      setError(null);
      urlRef.current = url;
      apiKeyRef.current = apiKey;

      try {
        // Register with the host
        const regResponse = await fetch(`${url}/share/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({ nickname }),
        });

        if (!regResponse.ok) {
          const errData = await regResponse.json().catch(() => ({}));
          throw new Error((errData as { error?: string }).error ?? `HTTP ${regResponse.status}`);
        }

        const regData = (await regResponse.json()) as { clientId: string; pollInterval: number };
        setClientId(regData.clientId);
        pollIntervalRef.current = regData.pollInterval;

        // Fetch initial quota data
        const quotaResponse = await fetch(`${url}/share/quota`, {
          headers: {
            "x-api-key": apiKey,
            "x-client-id": regData.clientId,
          },
        });

        if (quotaResponse.ok) {
          const data = (await quotaResponse.json()) as FilteredQuotaData;
          setQuotaData(data);
          setLastPollAt(Date.now());
        }

        setConnected(true);
        setConnecting(false);
        reconnectAttemptsRef.current = 0;

        // Start polling
        startPolling();
      } catch (err) {
        setError((err as Error).message);
        setConnecting(false);
        setConnected(false);
      }
    },
    [startPolling],
  );

  // Disconnect from remote host
  const disconnect = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    // Notify host of disconnect (fire and forget)
    if (urlRef.current && clientId) {
      void fetch(`${urlRef.current}/share/disconnect`, {
        method: "POST",
        headers: {
          "x-api-key": apiKeyRef.current ?? "",
          "x-client-id": clientId,
        },
      }).catch(() => {});
    }

    setConnected(false);
    setClientId(null);
    setQuotaData(null);
    setError(null);
    setLastPollAt(null);
    setReconnecting(false);
    urlRef.current = null;
    apiKeyRef.current = null;
    reconnectAttemptsRef.current = 0;
  }, [clientId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  return {
    connected,
    connecting,
    reconnecting,
    clientId,
    quotaData,
    error,
    lastPollAt,
    connect,
    disconnect,
  };
}
