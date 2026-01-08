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

interface ServerLogsModalProps {
  onClose: () => void;
}

// Reserve lines for: header(2) + footer hints(2) + scroll indicator(2) + borders/padding(4)
const RESERVED_LINES = 10;

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
  const maxVisibleLines = Math.max(5, height - RESERVED_LINES);

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

  useInput((input, key) => {
    if (key.escape) {
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

    if (input === "g" && key.shift) {
      // Shift+G = go to end
      setAutoScroll(true);
      setScrollOffset(Math.max(0, logs.length - maxVisibleLines));
      return;
    }

    if (input === "g") {
      // g = go to beginning
      setAutoScroll(false);
      setScrollOffset(0);
      return;
    }

    if (input === "c") {
      // Clear logs (just visual, not the actual buffer)
      setLogs([]);
      setScrollOffset(0);
      return;
    }
  });

  const visibleLogs = logs.slice(scrollOffset, scrollOffset + maxVisibleLines);

  // Minimal header when no logs, full header when logs exist
  const showFullHeader = logs.length > 0;

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" width={width} height={height - 1}>
      <Box flexDirection="column" padding={1} width={Math.min(width - 4, 120)}>
        {/* Header - minimal when empty */}
        <Box marginBottom={1} justifyContent="space-between">
          <Text bold color="cyan">
            Logs
          </Text>
          {showFullHeader && (
            <Text dimColor>
              {logs.length} entries {autoScroll ? "(auto)" : ""}
            </Text>
          )}
        </Box>

        {/* Log lines */}
        <Box flexDirection="column" height={maxVisibleLines}>
          {visibleLogs.map((entry, index) => (
            <Box key={scrollOffset + index}>
              <Text dimColor>[{entry.time.toLocaleTimeString()}] </Text>
              <Text color={getLevelColor(entry.level)}>{entry.level.toUpperCase().padEnd(5)} </Text>
              <Text wrap="truncate-end">{entry.message}</Text>
            </Box>
          ))}
          {visibleLogs.length === 0 && <Text dimColor>No logs yet</Text>}
        </Box>

        {/* Scroll indicator - only when needed */}
        {logs.length > maxVisibleLines && (
          <Box marginTop={1}>
            <Text dimColor>
              {scrollOffset + 1}-{Math.min(scrollOffset + maxVisibleLines, logs.length)}/{logs.length}
            </Text>
          </Box>
        )}

        {/* Footer hints - minimal */}
        <Box marginTop={1}>
          <Text dimColor>ESC close</Text>
          {logs.length > 0 && (
            <>
              <Text dimColor> | </Text>
              <Text dimColor>↑↓ scroll</Text>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
