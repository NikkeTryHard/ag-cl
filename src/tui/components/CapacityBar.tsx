/**
 * CapacityBar Component
 *
 * Displays a progress bar for model family capacity.
 * Claude = orange (#FF6600), Gemini = blue
 */

import React from "react";
import { Box, Text } from "ink";
import type { BurnRateStatus } from "../../cloudcode/burn-rate.js";

interface CapacityBarProps {
  family: "claude" | "gemini";
  percentage: number;
  status: BurnRateStatus;
  hoursToExhaustion: number | null;
  barWidth?: number;
}

const DEFAULT_BAR_WIDTH = 20;

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

/**
 * Get the family-specific color (Claude = orange, Gemini = blue)
 */
function getFamilyColor(family: "claude" | "gemini"): string {
  return family === "claude" ? "#FF6600" : "blue";
}

/**
 * Get dimmed version based on percentage (for low capacity warning)
 */
function getBarColor(family: "claude" | "gemini", percentage: number, status: BurnRateStatus): string {
  // If exhausted or very low, show red regardless of family
  if (status === "exhausted" || percentage === 0) return "red";
  if (percentage < 20) return "yellow";
  // Otherwise use family color
  return getFamilyColor(family);
}

export function CapacityBar({ family, percentage, status, hoursToExhaustion, barWidth = DEFAULT_BAR_WIDTH }: CapacityBarProps): React.ReactElement {
  const filledCount = Math.round((percentage / 100) * barWidth);
  const emptyCount = barWidth - filledCount;

  const filled = "█".repeat(Math.min(filledCount, barWidth));
  const empty = "░".repeat(Math.max(0, emptyCount));

  const familyName = family.charAt(0).toUpperCase() + family.slice(1);
  const statusText = getStatusText(status, hoursToExhaustion);
  const familyColor = getFamilyColor(family);
  const barColor = getBarColor(family, percentage, status);

  return (
    <Box>
      <Text> </Text>
      <Text color={familyColor}>{familyName.padEnd(8)}</Text>
      <Text color={barColor}>
        [{filled}
        {empty}]
      </Text>
      <Text> </Text>
      <Text color={familyColor}>{String(percentage).padStart(3)}%</Text>
      <Text> </Text>
      <Text dimColor>{statusText}</Text>
    </Box>
  );
}
