/**
 * Session History Panel Component
 *
 * Displays past client sessions from the session log.
 */

import React from "react";
import { Box, Text } from "ink";
import type { SessionLogEntry } from "../../share/types.js";
import { formatTimeAgo } from "../utils/formatTimeAgo.js";

export interface SessionHistoryPanelProps {
  sessions: SessionLogEntry[];
  maxDisplay?: number;
}

function formatDuration(start: number, end: number | null): string {
  const duration = (end ?? Date.now()) - start;
  const seconds = Math.floor(duration / 1000);
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${String(hours)}h ${String(remainingMinutes)}m` : `${String(hours)}h`;
}

export function SessionHistoryPanel({ sessions, maxDisplay = 10 }: SessionHistoryPanelProps): React.ReactElement {
  // Sort by disconnectedAt descending (most recent first)
  const sortedSessions = [...sessions].sort((a, b) => (b.disconnectedAt ?? 0) - (a.disconnectedAt ?? 0)).slice(0, maxDisplay);

  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>Session History </Text>
        <Text dimColor>({sessions.length} total)</Text>
      </Box>

      {sortedSessions.length === 0 ? (
        <Text dimColor>No session history</Text>
      ) : (
        sortedSessions.map((session, index) => (
          <Box key={`${session.clientId}-${String(index)}`} marginBottom={0}>
            <Text color="cyan">{session.nickname ?? session.keyMasked}</Text>
            <Text dimColor> — </Text>
            <Text>{formatDuration(session.connectedAt, session.disconnectedAt)}</Text>
            <Text dimColor> • </Text>
            <Text dimColor>{session.pollCount} polls</Text>
            <Text dimColor> • </Text>
            <Text dimColor>{formatTimeAgo(session.disconnectedAt ?? Date.now())}</Text>
          </Box>
        ))
      )}

      {sessions.length > maxDisplay && (
        <Box marginTop={1}>
          <Text dimColor>... and {sessions.length - maxDisplay} more</Text>
        </Box>
      )}
    </Box>
  );
}
