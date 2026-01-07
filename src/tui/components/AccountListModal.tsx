/**
 * AccountListModal Component
 *
 * Displays per-account capacity details with burn rates.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { AccountCapacityInfo } from "../types.js";

interface AccountListModalProps {
  accounts: AccountCapacityInfo[];
  onClose: () => void;
  onAddAccount: () => void;
}

const MAX_VISIBLE = 8;

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
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

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
        if (newIndex >= scrollOffset + MAX_VISIBLE) {
          setScrollOffset(newIndex - MAX_VISIBLE + 1);
        }
        return newIndex;
      });
      return;
    }

    if (input === "a") {
      onAddAccount();
      return;
    }
  });

  const visibleAccounts = accounts.slice(scrollOffset, scrollOffset + MAX_VISIBLE);

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Accounts ({accounts.length})
        </Text>
      </Box>

      {/* Header row */}
      <Box>
        <Text dimColor>{"   "}</Text>
        <Text dimColor>{"Email".padEnd(30)}</Text>
        <Text dimColor>{"Tier".padEnd(10)}</Text>
        <Text dimColor>{"Claude".padEnd(12)}</Text>
        <Text dimColor>{"  TTX".padEnd(12)}</Text>
        <Text dimColor>{"Gemini".padEnd(12)}</Text>
        <Text dimColor>{"  TTX"}</Text>
      </Box>

      {/* Account rows */}
      {visibleAccounts.map((account, index) => {
        const actualIndex = scrollOffset + index;
        const isSelected = actualIndex === selectedIndex;
        const prefix = isSelected ? " > " : "   ";

        if (account.error) {
          return (
            <Box key={account.email}>
              <Text color={isSelected ? "cyan" : undefined} inverse={isSelected}>
                {prefix}
              </Text>
              <Text color={isSelected ? "cyan" : undefined}>{account.email.substring(0, 28).padEnd(30)}</Text>
              <Text color="red">Error: {account.error.substring(0, 40)}</Text>
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
            <Text color={isSelected ? "cyan" : undefined}>{account.email.substring(0, 28).padEnd(30)}</Text>
            <Text dimColor>{account.tier.padEnd(10)}</Text>
            <Text color={claudeColor}>
              {getStatusIndicator(account.claudeStatus)} {String(account.claudePercentage).padStart(3)}%{"  "}
            </Text>
            <Text dimColor>{formatExhaustionTime(account.claudeHoursToExhaustion).padEnd(12)}</Text>
            <Text color={geminiColor}>
              {getStatusIndicator(account.geminiStatus)} {String(account.geminiPercentage).padStart(3)}%{"  "}
            </Text>
            <Text dimColor>{formatExhaustionTime(account.geminiHoursToExhaustion)}</Text>
          </Box>
        );
      })}

      {accounts.length === 0 && <Text dimColor>No accounts configured. Press [a] to add one.</Text>}

      {/* Scroll indicator */}
      {accounts.length > MAX_VISIBLE && (
        <Box marginTop={1}>
          <Text dimColor>
            Showing {scrollOffset + 1}-{Math.min(scrollOffset + MAX_VISIBLE, accounts.length)} of {accounts.length}
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
