/**
 * accounts remove command
 *
 * Remove accounts interactively with multi-select.
 */

import * as p from "@clack/prompts";

import { ACCOUNT_CONFIG_PATH, DEFAULT_PORT } from "../../constants.js";
import { loadAccounts, saveAccounts } from "../../account-manager/storage.js";
import { symbols, warn } from "../ui.js";
import { isServerRunning } from "../utils.js";

/**
 * Check if an account has any model that is currently rate-limited.
 *
 * @param modelRateLimits - Map of model ID to rate limit state
 * @returns True if any model is rate-limited
 */
function isAccountRateLimited(modelRateLimits: Record<string, { isRateLimited: boolean; resetTime: number | null }>): boolean {
  return Object.values(modelRateLimits).some((limit) => limit.isRateLimited);
}

/**
 * Execute the accounts remove command.
 *
 * @param _email - Optional email of account to remove (unused, kept for CLI signature)
 */
export async function accountsRemoveCommand(_email?: string): Promise<void> {
  p.intro("Remove Accounts");

  // Check if server is running
  const serverRunning = await isServerRunning(DEFAULT_PORT);
  if (serverRunning) {
    p.log.error(`${symbols.error} Server is running on port ${DEFAULT_PORT}. Stop the server before removing accounts.`);
    process.exit(1);
  }

  // Load existing accounts
  const { accounts, settings, activeIndex } = await loadAccounts(ACCOUNT_CONFIG_PATH);

  // Check if there are any accounts
  if (accounts.length === 0) {
    p.log.warn(`${symbols.warning} No accounts configured.`);
    p.outro("Nothing to remove.");
    return;
  }

  // Build options for multiselect
  const options = accounts.map((account) => {
    const isRateLimited = isAccountRateLimited(account.modelRateLimits);
    return {
      value: account.email,
      label: account.email,
      hint: isRateLimited ? warn("rate-limited") : undefined,
    };
  });

  // Multi-select prompt
  const selected = await p.multiselect({
    message: "Select accounts to remove:",
    options,
    required: false,
  });

  if (p.isCancel(selected)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  // Handle empty selection
  if (selected.length === 0) {
    p.outro("No accounts selected.");
    return;
  }

  // Confirmation prompt
  const confirmed = await p.confirm({
    message: `Remove ${selected.length} account(s)?`,
  });

  if (p.isCancel(confirmed)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  if (!confirmed) {
    p.outro("Removal cancelled.");
    return;
  }

  // Remove accounts with spinner
  const spinner = p.spinner();
  spinner.start("Removing accounts...");

  const selectedSet = new Set(selected);
  const remainingAccounts = accounts.filter((account) => !selectedSet.has(account.email));

  // Calculate new active index
  let newActiveIndex = activeIndex;
  if (newActiveIndex >= remainingAccounts.length) {
    newActiveIndex = Math.max(0, remainingAccounts.length - 1);
  }

  // Save updated accounts
  await saveAccounts(ACCOUNT_CONFIG_PATH, remainingAccounts, settings, newActiveIndex);

  spinner.stop(`${symbols.success} Removed ${selected.length} account(s)`);

  // Show success message for each removed account
  for (const email of selected) {
    p.log.success(`${symbols.success} Removed: ${email}`);
  }

  // Summary
  p.outro(`${remainingAccounts.length} account(s) remaining.`);
}
