/**
 * Share Status Bar Component
 *
 * Displays share mode status in the TUI header/footer.
 */

import React from "react";
import { Box, Text } from "ink";
import type { ShareMode } from "../../share/types.js";

export interface ShareStatusBarProps {
  mode: ShareMode;
  tunnelUrl?: string | null;
  clientCount?: number;
  remoteUrl?: string | null;
  hostNickname?: string | null;
  reconnecting?: boolean;
}

export function ShareStatusBar({ mode, tunnelUrl, clientCount = 0, remoteUrl, hostNickname, reconnecting = false }: ShareStatusBarProps): React.ReactElement | null {
  if (mode === "normal") {
    return null;
  }

  if (mode === "host") {
    const shortUrl = tunnelUrl?.replace("https://", "") ?? "Starting...";

    return (
      <Box>
        <Text bold color="green">
          {" SHARING "}
        </Text>
        <Text dimColor> | </Text>
        <Text color="cyan">{shortUrl}</Text>
        <Text dimColor> | </Text>
        <Text>
          {clientCount} client{clientCount !== 1 ? "s" : ""}
        </Text>
        <Text dimColor> | </Text>
        <Text dimColor>[Y] Copy</Text>
      </Box>
    );
  }

  if (mode === "client") {
    const displayName = hostNickname ?? remoteUrl?.replace("https://", "") ?? "remote";

    return (
      <Box>
        <Text bold color="blue">
          {reconnecting ? " RECONNECTING " : " CONNECTED "}
        </Text>
        <Text dimColor> | </Text>
        <Text>viewing {displayName}'s quotas</Text>
        {reconnecting && (
          <>
            <Text dimColor> | </Text>
            <Text color="yellow">*</Text>
          </>
        )}
        {!reconnecting && (
          <>
            <Text dimColor> | </Text>
            <Text color="green">* Live</Text>
          </>
        )}
      </Box>
    );
  }

  return null;
}
