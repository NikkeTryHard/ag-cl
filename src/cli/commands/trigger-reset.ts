/**
 * CLI Command: trigger-reset
 *
 * Triggers quota reset for specified quota group(s) by sending minimal requests
 * to Google Cloud Code to start the 5-hour countdown timer.
 *
 * Based on upstream PR #44.
 */

import pc from "picocolors";

import { AccountManager } from "../../account-manager/index.js";
import { getAllQuotaGroups, QUOTA_GROUPS, type QuotaGroupKey } from "../../cloudcode/quota-groups.js";
import { triggerQuotaResetApi } from "../../cloudcode/quota-reset-trigger.js";
import { symbols, sectionHeader } from "../ui.js";

/**
 * Options for the trigger-reset command
 */
export interface TriggerResetOptions {
  /** Quota group to reset (claude, geminiPro, geminiFlash, all) */
  group: string;
}

/**
 * Execute the trigger-reset command.
 *
 * Sends minimal requests to Google to start the 5-hour quota reset countdown.
 * Cloud Code quotas reset 5 hours AFTER first usage, so this triggers the timer
 * to start counting down.
 *
 * @param options - Command options
 */
export async function triggerResetCommand(options: TriggerResetOptions): Promise<void> {
  const { group } = options;

  // Validate group
  const validGroups = [...getAllQuotaGroups(), "all"];
  if (!validGroups.includes(group)) {
    console.error(`${symbols.error} Invalid group: ${pc.red(group)}`);
    console.error(`Valid groups: ${validGroups.join(", ")}`);
    process.exit(1);
  }

  console.log();
  console.log(sectionHeader("Trigger Quota Reset"));
  console.log();

  console.log(`${symbols.info} Sending minimal requests to start 5-hour quota countdown...`);
  console.log();

  try {
    const accountManager = new AccountManager();
    await accountManager.initialize();

    // Get first available account
    const accounts = accountManager.getAllAccounts();
    const oauthAccount = accounts.find((a) => a.source === "oauth" && a.refreshToken);

    if (!oauthAccount) {
      console.error(`${symbols.error} No OAuth accounts available. Add an account first.`);
      process.exit(1);
    }

    // Get token and project for the account
    const token = await accountManager.getTokenForAccount(oauthAccount);
    const projectId = await accountManager.getProjectForAccount(oauthAccount, token);

    console.log(`${symbols.info} Using account: ${pc.cyan(oauthAccount.email)}`);
    console.log();

    // Send minimal requests to trigger quota timer
    const apiResult = await triggerQuotaResetApi(token, projectId, group as QuotaGroupKey | "all");

    // Also clear local rate limit flags
    const localResult = accountManager.triggerQuotaReset(group as QuotaGroupKey | "all");

    // Display results
    if (apiResult.successCount > 0) {
      console.log(`${symbols.success} Quota timer started for ${apiResult.successCount} group(s)!`);
    }
    if (apiResult.failureCount > 0) {
      console.log(`${symbols.warning} Failed to trigger ${apiResult.failureCount} group(s)`);
    }
    console.log();

    // Display group details
    for (const result of apiResult.groupsTriggered) {
      const quotaGroup = QUOTA_GROUPS[result.group];
      const statusIcon = result.success ? pc.green("✓") : pc.red("✗");
      console.log(`  ${statusIcon} ${pc.bold(quotaGroup.name)}`);
      console.log(`    Model used: ${pc.dim(result.model)}`);
      if (result.error) {
        console.log(`    Error: ${pc.red(result.error)}`);
      }
    }

    console.log();
    console.log(`  ${pc.dim("Local rate limits cleared:")} ${pc.cyan(String(localResult.limitsCleared))}`);
    console.log();

    if (apiResult.successCount > 0) {
      console.log(`${symbols.info} Quota reset timer started. Check accounts list for actual reset times.`);
      console.log(`  ${pc.dim("Note: Claude models use weekly reset, Gemini uses 5-hour reset.")}`);
      console.log();
    }
  } catch (error) {
    console.error(`${symbols.error} ${pc.red((error as Error).message)}`);
    process.exit(1);
  }
}
