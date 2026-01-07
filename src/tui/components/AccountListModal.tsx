/**
 * AccountListModal Component
 *
 * Displays per-account capacity details with per-model quotas.
 * Dynamically adjusts to terminal size.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { AccountCapacityInfo, AggregatedCapacity, ModelQuotaDisplay } from "../types.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

interface AccountListModalProps {
  accounts: AccountCapacityInfo[];
  claudeCapacity: AggregatedCapacity;
  geminiCapacity: AggregatedCapacity;
  onClose: () => void;
  onAddAccount: () => void;
  onRefresh: () => void;
}

// Reserve lines for: header(2) + totals(4) + footer hints(2) + scroll indicator(2) + borders/padding(4)
const RESERVED_LINES = 14;

/**
 * Format hours to exhaustion
 */
function formatExhaustionTime(hours: number | null): string {
  if (hours === null) return "-";
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

/**
 * Format burn rate
 */
function formatBurnRate(ratePerHour: number | null): string {
  if (ratePerHour === null) return "";
  return `-${ratePerHour.toFixed(1)}%/h`;
}

function getPercentageColor(percentage: number): string {
  if (percentage === 0) return "red";
  if (percentage < 30) return "yellow";
  return "green";
}

/**
 * Format models as compact string (e.g., "opus:85% sonnet:92%")
 */
function formatModels(models: ModelQuotaDisplay[], maxWidth: number): string {
  if (models.length === 0) return "-";

  // For each model, create "name:pct%"
  const parts = models.map((m) => `${m.name}:${m.percentage}%`);
  const full = parts.join(" ");

  if (full.length <= maxWidth) return full;

  // Truncate if too long
  let result = "";
  for (const part of parts) {
    if (result.length + part.length + 1 > maxWidth - 3) {
      return result + "...";
    }
    result += (result ? " " : "") + part;
  }
  return result;
}

/**
 * Get average percentage from models
 */
function getAveragePercentage(models: ModelQuotaDisplay[]): number {
  if (models.length === 0) return 0;
  const sum = models.reduce((acc, m) => acc + m.percentage, 0);
  return Math.round(sum / models.length);
}

export function AccountListModal({ accounts, claudeCapacity, geminiCapacity, onClose, onAddAccount, onRefresh }: AccountListModalProps): React.ReactElement {
  const { width, height } = useTerminalSize();
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Calculate max visible based on terminal height
  const maxVisible = Math.max(3, height - RESERVED_LINES);

  // Calculate column widths based on terminal width
  const availableWidth = Math.max(100, width - 6);
  const emailWidth = Math.min(25, Math.max(15, Math.floor(availableWidth * 0.2)));
  const tierWidth = 6;
  const modelColWidth = Math.floor((availableWidth - emailWidth - tierWidth - 6) / 2);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((i) => {
        const newIndex = Math.max(0, i - 1);
        if (newIndex < scrollOffset) {
          setScrollOffset(newIndex);
        }
        return newIndex;
      });
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((i) => {
        const newIndex = Math.min(accounts.length - 1, i + 1);
        if (newIndex >= scrollOffset + maxVisible) {
          setScrollOffset(newIndex - maxVisible + 1);
        }
        return newIndex;
      });
      return;
    }

    if (key.pageUp) {
      setSelectedIndex((i) => {
        const newIndex = Math.max(0, i - maxVisible);
        setScrollOffset(Math.max(0, scrollOffset - maxVisible));
        return newIndex;
      });
      return;
    }

    if (key.pageDown) {
      setSelectedIndex((i) => {
        const newIndex = Math.min(accounts.length - 1, i + maxVisible);
        setScrollOffset(Math.min(Math.max(0, accounts.length - maxVisible), scrollOffset + maxVisible));
        return newIndex;
      });
      return;
    }

    if (input === "a") {
      onAddAccount();
      return;
    }

    if (input === "r") {
      onRefresh();
      return;
    }
  });

  const visibleAccounts = accounts.slice(scrollOffset, scrollOffset + maxVisible);

  return (
    <Box flexDirection="column" borderStyle="round" padding={1} width={Math.min(availableWidth, width - 4)} height={height - 2}>
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">
          Accounts ({accounts.length})
        </Text>
        <Text dimColor>
          {height}x{width}
        </Text>
      </Box>

      {/* Header row */}
      <Box>
        <Text dimColor>{"   "}</Text>
        <Text dimColor>{"Email".padEnd(emailWidth)}</Text>
        <Text dimColor>{"Tier".padEnd(tierWidth)}</Text>
        <Text dimColor>{"Claude Models".padEnd(modelColWidth)}</Text>
        <Text dimColor>{"Gemini Models"}</Text>
      </Box>

      {/* Account rows */}
      {visibleAccounts.map((account, index) => {
        const actualIndex = scrollOffset + index;
        const isSelected = actualIndex === selectedIndex;
        const prefix = isSelected ? " > " : "   ";
        const truncatedEmail = account.email.length > emailWidth - 2 ? account.email.substring(0, emailWidth - 3) + "..." : account.email;

        if (account.error) {
          return (
            <Box key={account.email}>
              <Text color={isSelected ? "cyan" : undefined} inverse={isSelected}>
                {prefix}
              </Text>
              <Text color={isSelected ? "cyan" : undefined}>{truncatedEmail.padEnd(emailWidth)}</Text>
              <Text color="red">Error: {account.error.substring(0, 40)}</Text>
            </Box>
          );
        }

        const claudeAvg = getAveragePercentage(account.claudeModels);
        const geminiAvg = getAveragePercentage(account.geminiModels);

        return (
          <Box key={account.email}>
            <Text color={isSelected ? "cyan" : undefined} inverse={isSelected}>
              {prefix}
            </Text>
            <Text color={isSelected ? "cyan" : undefined}>{truncatedEmail.padEnd(emailWidth)}</Text>
            <Text dimColor>{account.tier.substring(0, tierWidth - 1).padEnd(tierWidth)}</Text>
            <Text color={getPercentageColor(claudeAvg)}>{formatModels(account.claudeModels, modelColWidth - 1).padEnd(modelColWidth)}</Text>
            <Text color={getPercentageColor(geminiAvg)}>{formatModels(account.geminiModels, modelColWidth)}</Text>
          </Box>
        );
      })}

      {accounts.length === 0 && <Text dimColor>No accounts configured. Press [a] to add one.</Text>}

      {/* Scroll indicator */}
      {accounts.length > maxVisible && (
        <Box marginTop={1}>
          <Text dimColor>
            Showing {scrollOffset + 1}-{Math.min(scrollOffset + maxVisible, accounts.length)} of {accounts.length} (PgUp/PgDn)
          </Text>
        </Box>
      )}

      {/* Totals footer */}
      <Box marginTop={1} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingTop={1} flexDirection="column">
        <Box>
          <Text bold>Totals: </Text>
          <Text color={getPercentageColor(claudeCapacity.totalPercentage > 0 ? 100 : 0)}>Claude {claudeCapacity.totalPercentage}%</Text>
          {claudeCapacity.ratePerHour !== null && <Text dimColor> {formatBurnRate(claudeCapacity.ratePerHour)}</Text>}
          {claudeCapacity.hoursToExhaustion !== null && <Text dimColor> ({formatExhaustionTime(claudeCapacity.hoursToExhaustion)} left)</Text>}
        </Box>
        <Box>
          <Text>{"        "}</Text>
          <Text color={getPercentageColor(geminiCapacity.totalPercentage > 0 ? 100 : 0)}>Gemini {geminiCapacity.totalPercentage}%</Text>
          {geminiCapacity.ratePerHour !== null && <Text dimColor> {formatBurnRate(geminiCapacity.ratePerHour)}</Text>}
          {geminiCapacity.hoursToExhaustion !== null && <Text dimColor> ({formatExhaustionTime(geminiCapacity.hoursToExhaustion)} left)</Text>}
        </Box>
      </Box>

      <Text> </Text>
      <Box>
        <Text dimColor>Up/Down navigate </Text>
        <Text color="cyan">[a]</Text>
        <Text dimColor>dd </Text>
        <Text color="cyan">[r]</Text>
        <Text dimColor>efresh </Text>
        <Text color="cyan">ESC</Text>
        <Text dimColor> close</Text>
      </Box>
    </Box>
  );
}
