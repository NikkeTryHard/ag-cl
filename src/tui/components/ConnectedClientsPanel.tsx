/**
 * Connected Clients Panel Component
 *
 * Displays list of connected clients in host mode.
 */

import React from "react";
import { Box, Text } from "ink";
import type { ConnectedClient } from "../../share/types.js";
import { formatTimeAgo } from "../utils/formatTimeAgo.js";

export interface ConnectedClientsPanelProps {
  clients: ConnectedClient[];
  maxClients: number;
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
            <Text>{formatTimeAgo(client.connectedAt, true)}</Text>
            <Text dimColor> ago</Text>
            <Text dimColor> • </Text>
            <Text dimColor>{client.pollCount} polls</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
