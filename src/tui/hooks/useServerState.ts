/**
 * useServerState Hook
 *
 * Manages the proxy server lifecycle from within the TUI.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { Server } from "http";
import type { ServerState } from "../types.js";

interface UseServerStateResult extends ServerState {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
}

export function useServerState(initialPort: number): UseServerStateResult {
  const [running, setRunning] = useState(false);
  const [port] = useState(initialPort);
  const serverRef = useRef<Server | null>(null);
  const startingRef = useRef(false);

  const start = useCallback(async () => {
    if (running || startingRef.current) return;
    startingRef.current = true;

    try {
      // Dynamically import to avoid circular deps
      const { default: app } = await import("../../server.js");
      const server = app.listen(port);
      serverRef.current = server;
      setRunning(true);
    } catch (err) {
      console.error("Failed to start server:", err instanceof Error ? err.message : String(err));
    } finally {
      startingRef.current = false;
    }
  }, [running, port]);

  const stop = useCallback(async () => {
    if (!running || !serverRef.current) return;

    return new Promise<void>((resolve) => {
      serverRef.current!.close((err) => {
        if (err) {
          console.error("Failed to stop server:", err.message);
        }
        serverRef.current = null;
        setRunning(false);
        resolve();
      });
    });
  }, [running]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (serverRef.current) {
        serverRef.current.close();
      }
    };
  }, []);

  const restart = useCallback(async () => {
    await stop();
    await start();
  }, [stop, start]);

  return {
    running,
    port,
    start,
    stop,
    restart,
  };
}
