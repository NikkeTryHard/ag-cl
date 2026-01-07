/**
 * AccountListModal Component
 *
 * Displays per-account capacity details with reset times.
 * Dynamically adjusts to terminal size.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { AccountCapacityInfo, AggregatedCapacity } from "../types.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

interface AccountListModalProps {
  accounts: AccountCapacityInfo[];
  claudeCapacity: AggregatedCapacity;
  geminiCapacity: AggregatedCapacity;
  onClose: () => void;
  onAddAccount: () => void;
  onRefresh: () => void;
}

// Reserve lines for: header(2) + table header(1) + totals(3) + footer hints(2) + scroll indicator(2) + borders/padding(4)
const RESERVED_LINES = 14;

/**
 * Format reset time as relative duration (e.g., "in 2h 15m")
 */
function formatResetTime(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "-";
  const resetDate = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = resetDate.getTime() - now.getTime();

  if (diffMs <= 0) return "now";

  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${String(diffMins)}m`;

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (mins > 0) return `${String(hours)}h ${String(mins)}m`;
  return `${String(hours)}h`;
}

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

function getPercentageColor(percentage: number): string {
  if (percentage === 0) return "red";
  if (percentage < 30) return "yellow";
  return "green";
}

export function AccountListModal({ accounts, claudeCapacity, geminiCapacity, onClose, onAddAccount, onRefresh }: AccountListModalProps): React.ReactElement {
  const { width, height } = useTerminalSize();
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Calculate max visible based on terminal height
  const maxVisible = Math.max(3, height - RESERVED_LINES);

  // Calculate column widths based on terminal width
  // Layout: prefix(3) + email(25) + tier(8) + claude(8) + reset(10) + gemini(8) + reset(10) = 72
  const availableWidth = Math.max(80, width - 6);
  const emailWidth = Math.min(30, Math.max(20, availableWidth - 55));
  const tierWidth = 8;
  const pctWidth = 8;
  const resetWidth = 10;

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

  // Calculate normalized total percentages (average per account, capped at 100)
  const claudeTotalPct = accounts.length > 0 ? Math.min(100, Math.round(claudeCapacity.totalPercentage / accounts.length)) : 0;
  const geminiTotalPct = accounts.length > 0 ? Math.min(100, Math.round(geminiCapacity.totalPercentage / accounts.length)) : 0;

  return (
    <Box flexDirection="column" borderStyle="round" padding={1} width={Math.min(availableWidth, width - 4)}>
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
        <Text dimColor>{"Claude".padEnd(pctWidth)}</Text>
        <Text dimColor>{"Reset".padEnd(resetWidth)}</Text>
        <Text dimColor>{"Gemini".padEnd(pctWidth)}</Text>
        <Text dimColor>{"Reset"}</Text>
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
              <Text color="red">Error: {account.error.substring(0, 30)}</Text>
            </Box>
          );
        }

        const claudeColor = getPercentageColor(account.claudePercentage);
        const geminiColor = getPercentageColor(account.geminiPercentage);

        return (
          <Box key={account.email}>
            <Text color={isSelected ? "cyan" : undefined} inverse={isSelected}>
              {prefix}
            </Text>
            <Text color={isSelected ? "cyan" : undefined}>{truncatedEmail.padEnd(emailWidth)}</Text>
            <Text dimColor>{account.tier.substring(0, tierWidth - 1).padEnd(tierWidth)}</Text>
            <Text color={claudeColor}>
              {String(account.claudePercentage).padStart(4)}%{"   "}
            </Text>
            <Text dimColor>{formatResetTime(account.claudeReset).padEnd(resetWidth)}</Text>
            <Text color={geminiColor}>
              {String(account.geminiPercentage).padStart(4)}%{"   "}
            </Text>
            <Text dimColor>{formatResetTime(account.geminiReset)}</Text>
          </Box>
        );
      })}

      {accounts.length === 0 && <Text dimColor>No accounts configured. Press [a] to add one.</Text>}

      {/* Scroll indicator */}
      {accounts.length > maxVisible && (
        <Box marginTop={1}>
          <Text dimColor>
            Showing {scrollOffset + 1}-{Math.min(scrollOffset + maxVisible, accounts.length)} of {accounts.length} (PgUp/PgDn to scroll)
          </Text>
        </Box>
      )}

      {/* Totals footer */}
      <Box marginTop={1} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingTop={1}>
        <Box flexDirection="column">
          <Box>
            <Text bold>Totals: </Text>
            <Text color={getPercentageColor(claudeTotalPct)}>Claude {claudeTotalPct}%</Text>
            {claudeCapacity.hoursToExhaustion !== null && <Text dimColor> ({formatExhaustionTime(claudeCapacity.hoursToExhaustion)} left)</Text>}
            <Text>{"  "}</Text>
            <Text color={getPercentageColor(geminiTotalPct)}>Gemini {geminiTotalPct}%</Text>
            {geminiCapacity.hoursToExhaustion !== null && <Text dimColor> ({formatExhaustionTime(geminiCapacity.hoursToExhaustion)} left)</Text>}
          </Box>
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
