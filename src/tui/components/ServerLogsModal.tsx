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

  return (
    <Box flexDirection="column" borderStyle="round" padding={1} width={Math.min(width - 4, 120)}>
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">
          Server Logs
        </Text>
        <Text dimColor>
          {logs.length} entries {autoScroll ? "(auto-scroll)" : ""} | {height}x{width}
        </Text>
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
        {visibleLogs.length === 0 && <Text dimColor>No logs yet. Start the server to see activity.</Text>}
        {/* Pad empty lines */}
        {Array.from({ length: maxVisibleLines - visibleLogs.length }).map((_, i) => (
          <Text key={`empty-${String(i)}`}> </Text>
        ))}
      </Box>

      {/* Scroll indicator */}
      {logs.length > maxVisibleLines && (
        <Box marginTop={1}>
          <Text dimColor>
            Lines {scrollOffset + 1}-{Math.min(scrollOffset + maxVisibleLines, logs.length)} of {logs.length} (PgUp/PgDn)
          </Text>
        </Box>
      )}

      <Text> </Text>
      <Box>
        <Text dimColor>Up/Down scroll </Text>
        <Text color="cyan">g</Text>
        <Text dimColor>/</Text>
        <Text color="cyan">G</Text>
        <Text dimColor> top/bottom </Text>
        <Text color="cyan">c</Text>
        <Text dimColor>lear </Text>
        <Text color="cyan">ESC</Text>
        <Text dimColor> close</Text>
      </Box>
    </Box>
  );
}
