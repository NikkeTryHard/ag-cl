/**
 * AccountListModal Component
 *
 * Displays per-account capacity details with burn rates.
 * Dynamically adjusts to terminal size.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { AccountCapacityInfo } from "../types.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

interface AccountListModalProps {
  accounts: AccountCapacityInfo[];
  onClose: () => void;
  onAddAccount: () => void;
}

// Reserve lines for: header(2) + table header(1) + footer hints(2) + scroll indicator(2) + borders/padding(4)
const RESERVED_LINES = 11;

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

function getStatusColor(status: string, percentage: number): string {
  if (status === "exhausted" || percentage === 0) return "red";
  if (status === "burning" || percentage < 50) return "yellow";
  return "green";
}

function getStatusIndicator(status: string): string {
  switch (status) {
    case "burning":
      return "↓";
    case "recovering":
      return "↑";
    case "exhausted":
      return "✗";
    case "stable":
      return "•";
    default:
      return "?";
  }
}

export function AccountListModal({ accounts, onClose, onAddAccount }: AccountListModalProps): React.ReactElement {
  const { width, height } = useTerminalSize();
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Calculate max visible based on terminal height
  const maxVisible = Math.max(3, height - RESERVED_LINES);

  // Calculate column widths based on terminal width
  // Minimum layout: prefix(3) + email(20) + tier(8) + claude(10) + ttx(10) + gemini(10) + ttx(10) = 71
  const availableWidth = Math.max(80, width - 6); // Account for borders/padding
  const emailWidth = Math.min(35, Math.max(20, availableWidth - 60));
  const tierWidth = 8;
  const statWidth = 8;
  const ttxWidth = 10;

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
  });

  const visibleAccounts = accounts.slice(scrollOffset, scrollOffset + maxVisible);

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
        <Text dimColor>{"Claude".padEnd(statWidth)}</Text>
        <Text dimColor>{"TTX".padEnd(ttxWidth)}</Text>
        <Text dimColor>{"Gemini".padEnd(statWidth)}</Text>
        <Text dimColor>{"TTX"}</Text>
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

        const claudeColor = getStatusColor(account.claudeStatus, account.claudePercentage);
        const geminiColor = getStatusColor(account.geminiStatus, account.geminiPercentage);

        return (
          <Box key={account.email}>
            <Text color={isSelected ? "cyan" : undefined} inverse={isSelected}>
              {prefix}
            </Text>
            <Text color={isSelected ? "cyan" : undefined}>{truncatedEmail.padEnd(emailWidth)}</Text>
            <Text dimColor>{account.tier.substring(0, tierWidth - 1).padEnd(tierWidth)}</Text>
            <Text color={claudeColor}>
              {getStatusIndicator(account.claudeStatus)}
              {String(account.claudePercentage).padStart(4)}%{" "}
            </Text>
            <Text dimColor>{formatExhaustionTime(account.claudeHoursToExhaustion).padEnd(ttxWidth)}</Text>
            <Text color={geminiColor}>
              {getStatusIndicator(account.geminiStatus)}
              {String(account.geminiPercentage).padStart(4)}%{" "}
            </Text>
            <Text dimColor>{formatExhaustionTime(account.geminiHoursToExhaustion)}</Text>
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

      <Text> </Text>
      <Box>
        <Text dimColor>Up/Down navigate </Text>
        <Text color="cyan">[a]</Text>
        <Text dimColor>dd account </Text>
        <Text color="cyan">ESC</Text>
        <Text dimColor> close</Text>
      </Box>
    </Box>
  );
}
