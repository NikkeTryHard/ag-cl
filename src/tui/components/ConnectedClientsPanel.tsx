/**
 * Connected Clients Panel Component
 *
 * Displays list of connected clients in host mode.
 */

import React from "react";
import { Box, Text } from "ink";
import type { ConnectedClient } from "../../share/types.js";

export interface ConnectedClientsPanelProps {
  clients: ConnectedClient[];
  maxClients: number;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  return `${String(hours)}h`;
}

export function ConnectedClientsPanel({ clients, maxClients }: ConnectedClientsPanelProps): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>Connected Clients </Text>
        <Text dimColor>
          ({clients.length}/{maxClients})
        </Text>
      </Box>

      {clients.length === 0 ? (
        <Text dimColor>No clients connected</Text>
      ) : (
        clients.map((client) => (
          <Box key={client.id} marginBottom={0}>
            <Text color="cyan">{client.nickname ?? client.key}</Text>
            <Text dimColor> — connected </Text>
            <Text>{formatTimeAgo(client.connectedAt)}</Text>
            <Text dimColor> ago</Text>
            <Text dimColor> • </Text>
            <Text dimColor>{client.pollCount} polls</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
