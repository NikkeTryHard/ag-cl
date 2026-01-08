/**
 * ServerLogsModal Component
 *
 * Displays live server logs in a scrollable view.
 * Dynamically adjusts to terminal size.
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getLogBuffer, subscribeToLogs, type LogEntry } from "../hooks/useLogBuffer.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { MIN_VISIBLE_LOG_LINES } from "../constants.js";

interface ServerLogsModalProps {
  onClose: () => void;
}

function getLevelColor(level: string): string | undefined {
  switch (level) {
    case "error":
      return "red";
    case "warn":
      return "yellow";
    case "info":
      return "cyan";
    case "debug":
    case "trace":
      return "gray";
    default:
      return undefined;
  }
}

export function ServerLogsModal({ onClose }: ServerLogsModalProps): React.ReactElement {
  const { width, height } = useTerminalSize();
  const [logs, setLogs] = useState<LogEntry[]>(() => getLogBuffer());
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);

  // Calculate visible lines based on terminal height
  const maxVisibleLines = Math.max(MIN_VISIBLE_LOG_LINES, height - 10);

  // Subscribe to new logs
  useEffect(() => {
    const unsubscribe = subscribeToLogs((newLogs) => {
      setLogs([...newLogs]);
      if (autoScroll) {
        setScrollOffset(Math.max(0, newLogs.length - maxVisibleLines));
      }
    });
    return unsubscribe;
  }, [autoScroll, maxVisibleLines]);

  // Input handler - same pattern as AccountListModal (no options object)
  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (input === "b") {
      onClose();
      return;
    }

    if (key.upArrow) {
      setAutoScroll(false);
      setScrollOffset((o) => Math.max(0, o - 1));
      return;
    }

    if (key.downArrow) {
      setScrollOffset((o) => {
        const newOffset = Math.min(Math.max(0, logs.length - maxVisibleLines), o + 1);
        if (newOffset >= logs.length - maxVisibleLines) {
          setAutoScroll(true);
        }
        return newOffset;
      });
      return;
    }

    if (key.pageUp) {
      setAutoScroll(false);
      setScrollOffset((o) => Math.max(0, o - maxVisibleLines));
      return;
    }

    if (key.pageDown) {
      setScrollOffset((o) => {
        const newOffset = Math.min(Math.max(0, logs.length - maxVisibleLines), o + maxVisibleLines);
        if (newOffset >= logs.length - maxVisibleLines) {
          setAutoScroll(true);
        }
        return newOffset;
      });
      return;
    }
  });

  const visibleLogs = logs.slice(scrollOffset, scrollOffset + maxVisibleLines);

  // Clean minimal layout - no titles, footer at very bottom
  return (
    <Box flexDirection="column" width={width} height={height - 1}>
      {/* Main content area - grows to fill space */}
      <Box flexDirection="column" flexGrow={1} paddingX={2}>
        {logs.length > 0 ? (
          <>
            {/* Log lines */}
            <Box flexDirection="column">
              {visibleLogs.map((entry, index) => (
                <Box key={scrollOffset + index}>
                  <Text dimColor>[{entry.time.toLocaleTimeString()}] </Text>
                  <Text color={getLevelColor(entry.level)}>{entry.level.toUpperCase().padEnd(5)} </Text>
                  <Text wrap="truncate-end">{entry.message}</Text>
                </Box>
              ))}
            </Box>
          </>
        ) : (
          /* Empty state - centered message */
          <Box flexGrow={1} alignItems="center" justifyContent="center">
            <Text dimColor>No logs yet. Start the server to see logs here.</Text>
          </Box>
        )}
      </Box>

      {/* Footer - always at bottom */}
      <Box paddingX={2} justifyContent="space-between">
        <Text dimColor>ESC close{logs.length > 0 ? " | Up/Down scroll" : ""}</Text>
        {logs.length > maxVisibleLines && (
          <Text dimColor>
            {scrollOffset + 1}-{Math.min(scrollOffset + maxVisibleLines, logs.length)}/{logs.length}
            {autoScroll ? " (auto)" : ""}
          </Text>
        )}
        {logs.length > 0 && logs.length <= maxVisibleLines && <Text dimColor>{logs.length} entries</Text>}
      </Box>
    </Box>
  );
}
