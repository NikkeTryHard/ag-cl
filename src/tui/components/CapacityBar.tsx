/**
 * CapacityBar Component
 *
 * Displays a progress bar for model family capacity.
 */

import React from "react";
import { Box, Text } from "ink";
import type { BurnRateStatus } from "../../cloudcode/burn-rate.js";

interface CapacityBarProps {
  family: "claude" | "gemini";
  percentage: number;
  status: BurnRateStatus;
  hoursToExhaustion: number | null;
}

const BAR_WIDTH = 20;

function formatExhaustionTime(hours: number): string {
  if (hours >= 1) {
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    if (minutes > 0) {
      return `~${String(wholeHours)}h ${String(minutes)}m`;
    }
    return `~${String(wholeHours)}h`;
  }
  return `~${String(Math.round(hours * 60))}m`;
}

function getStatusText(status: BurnRateStatus, hoursToExhaustion: number | null): string {
  if (status === "burning" && hoursToExhaustion !== null) {
    return formatExhaustionTime(hoursToExhaustion);
  }
  return status;
}

function getStatusColor(status: BurnRateStatus, percentage: number): string {
  if (status === "exhausted" || percentage < 20) return "red";
  if (status === "burning" || percentage < 50) return "yellow";
  return "green";
}

export function CapacityBar({ family, percentage, status, hoursToExhaustion }: CapacityBarProps): React.ReactElement {
  const filledCount = Math.round((percentage / 100) * BAR_WIDTH);
  const emptyCount = BAR_WIDTH - filledCount;

  const filled = "█".repeat(Math.min(filledCount, BAR_WIDTH));
  const empty = "░".repeat(Math.max(0, emptyCount));

  const familyName = family.charAt(0).toUpperCase() + family.slice(1);
  const statusText = getStatusText(status, hoursToExhaustion);
  const color = getStatusColor(status, percentage);

  return (
    <Box>
      <Text> </Text>
      <Text>{familyName.padEnd(8)}</Text>
      <Text color={color}>
        [{filled}
        {empty}]
      </Text>
      <Text> </Text>
      <Text>{String(percentage).padStart(3)}%</Text>
      <Text> </Text>
      <Text dimColor>{statusText}</Text>
    </Box>
  );
}
