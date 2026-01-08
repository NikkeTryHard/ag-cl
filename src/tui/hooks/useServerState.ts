/**
 * useServerState Hook
 *
 * Manages the proxy server lifecycle from within the TUI.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { Server } from "http";
import net from "net";
import type { ServerState } from "../types.js";

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

export function useServerState(initialPort: number): UseServerStateResult {
  const [running, setRunning] = useState(false);
  const [port, setPortState] = useState(initialPort);
  const [error, setError] = useState<string | null>(null);
  const serverRef = useRef<Server | null>(null);
  const startingRef = useRef(false);

  const start = useCallback(async () => {
    if (running || startingRef.current) return;
    startingRef.current = true;
    setError(null);

    try {
      // Check if port is available first
      const available = await checkPortAvailable(port);
      if (!available) {
        setError(`Port ${port} is already in use`);
        startingRef.current = false;
        return;
      }

      // Dynamically import to avoid circular deps
      const { default: app } = await import("../../server.js");
      const server = app.listen(port);
      serverRef.current = server;
      setRunning(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      startingRef.current = false;
    }
  }, [running, port]);

  const stop = useCallback(async () => {
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
  }, [running]);

  // Cleanup on unmount
  useEffect(() => {
    return (): void => {
      if (serverRef.current) {
        serverRef.current.close();
      }
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
