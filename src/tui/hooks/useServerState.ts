/**
 * useServerState Hook
 *
 * Manages the proxy server lifecycle from within the TUI.
 */

import { useState, useCallback, useRef } from "react";
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

  const start = useCallback(async () => {
    if (running) return;

    try {
      // Dynamically import to avoid circular deps
      const { default: app } = await import("../../server.js");
      const server = app.listen(port);
      serverRef.current = server;
      setRunning(true);
    } catch (err) {
      console.error("Failed to start server:", (err as Error).message);
    }
  }, [running, port]);

  const stop = useCallback(async () => {
    if (!running || !serverRef.current) return;

    return new Promise<void>((resolve) => {
      serverRef.current!.close(() => {
        serverRef.current = null;
        setRunning(false);
        resolve();
      });
    });
  }, [running]);

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
