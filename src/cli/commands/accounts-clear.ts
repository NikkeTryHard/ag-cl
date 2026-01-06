/**
 * accounts clear command
 *
 * Remove all accounts with double confirmation.
 */

import * as p from "@clack/prompts";
import pc from "picocolors";

import { ACCOUNT_CONFIG_PATH, DEFAULT_PORT } from "../../constants.js";
import { loadAccounts, saveAccounts } from "../../account-manager/storage.js";
import { symbols } from "../ui.js";
import { isServerRunning } from "../utils.js";

/**
 * Execute the accounts clear command.
 */
export async function accountsClearCommand(): Promise<void> {
  p.intro("Clear All Accounts");

  // Check if server is running
  const serverRunning = await isServerRunning(DEFAULT_PORT);
  if (serverRunning) {
    p.log.error(`${symbols.error} Server is running on port ${DEFAULT_PORT}. Stop the server before clearing accounts.`);
    process.exit(1);
  }

  // Load existing accounts
  const { accounts, settings } = await loadAccounts(ACCOUNT_CONFIG_PATH);

  // Check if there are any accounts
  if (accounts.length === 0) {
    p.log.warn(`${symbols.warning} No accounts configured.`);
    p.outro("Nothing to clear.");
    return;
  }

  // Warning display
  p.log.warn(pc.red(`This will remove ${accounts.length} account(s):`));
  for (const account of accounts) {
    p.log.message(`${symbols.bullet} ${account.email}`);
  }

  // First confirmation
  const confirmed = await p.confirm({
    message: "Are you sure you want to remove ALL accounts?",
    initialValue: false,
  });

  if (p.isCancel(confirmed)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  if (!confirmed) {
    p.outro("Clear cancelled.");
    return;
  }

  // Double confirmation - type DELETE
  const deleteConfirm = await p.text({
    message: `Type ${pc.red("DELETE")} to confirm:`,
    validate(value) {
      if (value !== "DELETE") {
        return 'You must type exactly "DELETE" to confirm.';
      }
    },
  });

  if (p.isCancel(deleteConfirm)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  // Clear with spinner
  const spinner = p.spinner();
  spinner.start("Clearing all accounts...");

  const clearedCount = accounts.length;

  // Save empty accounts array
  await saveAccounts(ACCOUNT_CONFIG_PATH, [], settings, 0);

  spinner.stop(`${symbols.success} Cleared ${clearedCount} account(s)`);

  p.outro("All accounts have been removed.");
}
