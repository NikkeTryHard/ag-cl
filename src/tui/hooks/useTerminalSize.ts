/**
 * useTerminalSize Hook
 *
 * Provides reactive terminal dimensions that update on resize.
 */

import { useState, useEffect } from "react";
import { useStdout } from "ink";

export interface TerminalSize {
  width: number;
  height: number;
}

/**
 * Hook to get terminal dimensions with resize support
 */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();

  const [size, setSize] = useState<TerminalSize>(() => ({
    width: stdout.columns ?? 80,
    height: stdout.rows ?? 24,
  }));

  useEffect(() => {
    const handleResize = (): void => {
      setSize({
        width: stdout.columns ?? 80,
        height: stdout.rows ?? 24,
      });
    };

    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  return size;
}
