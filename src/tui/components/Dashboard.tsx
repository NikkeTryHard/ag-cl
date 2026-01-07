/**
 * Dashboard Component
 *
 * Main TUI view showing server status, capacity bars, and hotkey hints.
 */

import React from "react";
import { Box, Text } from "ink";
import { CapacityBar } from "./CapacityBar.js";
import { StatusIndicator } from "./StatusIndicator.js";
import type { AggregatedCapacity } from "../types.js";
import type { UseServerStateResult } from "../hooks/useServerState.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

interface DashboardProps {
  version: string;
  serverState: UseServerStateResult;
  claudeCapacity: AggregatedCapacity;
  geminiCapacity: AggregatedCapacity;
  accountCount: number;
}

// ASCII banner letters from "Impossible" figlet font
// A, G = blue | Hyphen = white | C, L = orange

// Letter A (20 chars wide each line)
const A = ["         _          ", "        / /\\        ", "       / /  \\       ", "      / / /\\ \\      ", "     / / /\\ \\ \\     ", "    / / /  \\ \\ \\    ", "   / / /___/ /\\ \\   ", "  / / /_____/ /\\ \\  ", " / /_________/\\ \\ \\ ", "/ / /_       __\\ \\_\\", "\\_\\___\\     /____/_/"];

// Letter G (18 chars wide each line)
const G = ["         _        ", "        /\\ \\      ", "       /  \\ \\     ", "      / /\\ \\_\\    ", "     / / /\\/_/    ", "    / / / ______  ", "   / / / /\\_____\\ ", "  / / /  \\/____ / ", " / / /_____/ / /  ", "/ / /______\\/ /   ", "\\/___________/    "];

// Hyphen (9 chars wide each line)
const HYPHEN = ["         ", "         ", "         ", "         ", "  ____   ", "/\\____/\\ ", "\\/____\\/ ", "         ", "         ", "         ", "         "];

// Letter C (17 chars wide each line)
const C = ["          _      ", "        /\\ \\     ", "       /  \\ \\    ", "      / /\\ \\ \\   ", "     / / /\\ \\ \\  ", "    / / /  \\ \\_\\ ", "   / / /    \\/_/ ", "  / / /          ", " / / /________   ", "/ / /_________\\  ", "\\/____________/  "];

// Letter L (15 chars wide each line)
const L = ["         _     ", "        _\\ \\   ", "       /\\__ \\  ", "      / /_ \\_\\ ", "     / / /\\/_/ ", "    / / /      ", "   / / /       ", "  / / / ____   ", " / /_/_/ ___/\\ ", "/_______/\\__\\/ ", "\\_______\\/     "];

function Banner(): React.ReactElement {
  return (
    <Box flexDirection="column" alignItems="center">
      {A.map((_, i) => (
        <Box key={i}>
          <Text color="blue">
            {A[i]}
            {G[i]}
          </Text>
          <Text color="white">{HYPHEN[i]}</Text>
          <Text color="#FF6600">
            {C[i]}
            {L[i]}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

export function Dashboard({ version, serverState, claudeCapacity, geminiCapacity, accountCount }: DashboardProps): React.ReactElement {
  const { width, height } = useTerminalSize();
  const barWidth = Math.max(20, Math.min(50, width - 40));

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" width={width} height={height - 1}>
      {/* Banner */}
      <Banner />

      {/* Version and Status */}
      <Box marginTop={1} gap={2}>
        <Text dimColor>v{version}</Text>
        <StatusIndicator running={serverState.running} port={serverState.port} error={serverState.error} />
      </Box>

      {/* Capacity Bars */}
      <Box flexDirection="column" marginTop={2}>
        <CapacityBar family={claudeCapacity.family} percentage={claudeCapacity.totalPercentage} status={claudeCapacity.status} hoursToExhaustion={claudeCapacity.hoursToExhaustion} barWidth={barWidth} />
        <CapacityBar family={geminiCapacity.family} percentage={geminiCapacity.totalPercentage} status={geminiCapacity.status} hoursToExhaustion={geminiCapacity.hoursToExhaustion} barWidth={barWidth} />
      </Box>

      {/* Account count */}
      <Box marginTop={2}>
        <Text bold>{accountCount}</Text>
        <Text dimColor> account{accountCount !== 1 ? "s" : ""}</Text>
      </Box>

      {/* Hotkey hints */}
      <Box marginTop={2}>
        <Text color="cyan">[a]</Text>
        <Text dimColor>ccounts </Text>
        <Text color="cyan">[s]</Text>
        <Text dimColor>erver </Text>
        <Text color="cyan">[p]</Text>
        <Text dimColor>ort </Text>
        <Text color="cyan">[r]</Text>
        <Text dimColor>efresh </Text>
        <Text color="cyan">[l]</Text>
        <Text dimColor>ogs </Text>
        <Text color="cyan">[q]</Text>
        <Text dimColor>uit </Text>
        <Text color="cyan">[:]</Text>
        <Text dimColor> commands</Text>
      </Box>
    </Box>
  );
}
