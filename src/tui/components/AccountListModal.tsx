/**
 * AccountListModal Component
 *
 * Displays per-account capacity details.
 * Claude: Single percentage (all models have same quota)
 * Gemini: Shows only models below 100%
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { AccountCapacityInfo, AggregatedCapacity, ModelQuotaDisplay } from "../types.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { ACCOUNT_LIST_RESERVED_LINES, MIN_VISIBLE_ITEMS } from "../constants.js";

interface AccountListModalProps {
  accounts: AccountCapacityInfo[];
  claudeCapacity: AggregatedCapacity;
  geminiCapacity: AggregatedCapacity;
  onClose: () => void;
  onAddAccount: () => void;
  onRefresh: () => void;
}

/**
 * Format reset time as relative duration
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
 * Get Claude percentage (all models are the same, just take first or average)
 */
function getClaudePercentage(models: ModelQuotaDisplay[]): number {
  if (models.length === 0) return 0;
  // All Claude models have the same quota, just return first
  return models[0].percentage;
}

/**
 * Format Gemini models - only show those below 100%
 */
function formatGeminiModels(models: ModelQuotaDisplay[], maxWidth: number): { text: string; hiddenCount: number } {
  if (models.length === 0) return { text: "-", hiddenCount: 0 };

  // Filter to models below 100%
  const belowFull = models.filter((m) => m.percentage < 100);
  const hiddenCount = models.length - belowFull.length;

  if (belowFull.length === 0) {
    return { text: "all 100%", hiddenCount: 0 };
  }

  // Sort by percentage ascending (lowest first)
  belowFull.sort((a, b) => a.percentage - b.percentage);

  // Format: "model:pct%"
  const parts = belowFull.map((m) => `${m.name}:${String(m.percentage)}%`);
  const full = parts.join(" ");

  if (full.length <= maxWidth) return { text: full, hiddenCount };

  // Truncate if too long
  let result = "";
  for (const part of parts) {
    if (result.length + part.length + 1 > maxWidth - 3) {
      return { text: result + "...", hiddenCount };
    }
    result += (result ? " " : "") + part;
  }
  return { text: result, hiddenCount };
}

export function AccountListModal({ accounts, claudeCapacity, geminiCapacity, onClose, onAddAccount, onRefresh }: AccountListModalProps): React.ReactElement {
  const { width, height } = useTerminalSize();
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Calculate max visible based on terminal height
  const maxVisible = Math.max(MIN_VISIBLE_ITEMS, height - ACCOUNT_LIST_RESERVED_LINES);

  // Calculate content width - cap at 120 chars for readability
  const contentWidth = Math.min(120, width - 10);
  const emailWidth = Math.min(28, Math.max(18, Math.floor(contentWidth * 0.22)));
  const tierWidth = 6;
  const claudeWidth = 10; // Just "XX%" for Claude
  const resetWidth = 12; // Reset time column
  const geminiWidth = contentWidth - emailWidth - tierWidth - claudeWidth - resetWidth - 10;

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
    <Box flexDirection="column" alignItems="center" justifyContent="center" width={width} height={height - 1}>
      <Box flexDirection="column" borderStyle="round" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Accounts ({accounts.length})
          </Text>
        </Box>

        {/* Header row */}
        <Box>
          <Text dimColor>{"   "}</Text>
          <Text dimColor>{"Email".padEnd(emailWidth)}</Text>
          <Text dimColor>{"Tier".padEnd(tierWidth)}</Text>
          <Text dimColor>{"Claude".padEnd(claudeWidth)}</Text>
          <Text dimColor>{"Reset".padEnd(resetWidth)}</Text>
          <Text dimColor>{"Gemini (models below 100%)"}</Text>
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

          const claudePct = getClaudePercentage(account.claudeModels);
          const { text: geminiText } = formatGeminiModels(account.geminiModels, geminiWidth);

          // Get lowest Gemini percentage for color
          const geminiBelow100 = account.geminiModels.filter((m) => m.percentage < 100);
          const geminiLowest = geminiBelow100.length > 0 ? Math.min(...geminiBelow100.map((m) => m.percentage)) : 100;

          // Get earliest reset time for this account
          const resetTime = account.claudeReset ?? account.geminiReset;

          return (
            <Box key={account.email}>
              <Text color={isSelected ? "cyan" : undefined} inverse={isSelected}>
                {prefix}
              </Text>
              <Text color={isSelected ? "cyan" : undefined}>{truncatedEmail.padEnd(emailWidth)}</Text>
              <Text dimColor>{account.tier.substring(0, tierWidth - 1).padEnd(tierWidth)}</Text>
              <Text color={getPercentageColor(claudePct)}>{`${String(claudePct)}%`.padEnd(claudeWidth)}</Text>
              <Text dimColor>{formatResetTime(resetTime).padEnd(resetWidth)}</Text>
              <Text color={getPercentageColor(geminiLowest)}>{geminiText}</Text>
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
        <Box marginTop={1} paddingTop={1} flexDirection="column">
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
    </Box>
  );
}
