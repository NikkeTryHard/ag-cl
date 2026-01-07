/**
 * Dashboard Component
 *
 * Main TUI view showing server status, capacity bars, and hotkey hints.
 */

import React from "react";
import { Box, Text } from "ink";
import { CapacityBar } from "./CapacityBar.js";
import { StatusIndicator } from "./StatusIndicator.js";
import type { ServerState, AggregatedCapacity } from "../types.js";

interface DashboardProps {
  version: string;
  serverState: ServerState;
  claudeCapacity: AggregatedCapacity;
  geminiCapacity: AggregatedCapacity;
  accountCount: number;
}

export function Dashboard({ version, serverState, claudeCapacity, geminiCapacity, accountCount }: DashboardProps): React.ReactElement {
  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold>ag-cl v{version}</Text>
        <StatusIndicator running={serverState.running} port={serverState.port} />
      </Box>

      {/* Spacer */}
      <Text> </Text>

      {/* Capacity Bars */}
      <CapacityBar family={claudeCapacity.family} percentage={claudeCapacity.totalPercentage} status={claudeCapacity.status} hoursToExhaustion={claudeCapacity.hoursToExhaustion} />
      <CapacityBar family={geminiCapacity.family} percentage={geminiCapacity.totalPercentage} status={geminiCapacity.status} hoursToExhaustion={geminiCapacity.hoursToExhaustion} />

      {/* Spacer */}
      <Text> </Text>

      {/* Account count */}
      <Text dimColor>
        {"  "}
        {accountCount} account{accountCount !== 1 ? "s" : ""}
      </Text>

      {/* Spacer */}
      <Text> </Text>

      {/* Hotkey hints */}
      <Box>
        <Text dimColor> [a]ccounts [s]erver [l]ogs [q]uit</Text>
      </Box>
    </Box>
  );
}
