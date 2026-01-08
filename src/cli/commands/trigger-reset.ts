/**
 * CLI Command: trigger-reset
 * Triggers quota reset for specified quota group(s)
 */

import pc from "picocolors";

import { AccountManager } from "../../account-manager/index.js";
import { getAllQuotaGroups, QUOTA_GROUPS, type QuotaGroupKey } from "../../cloudcode/quota-groups.js";
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

  console.log(`${symbols.info} Triggering quota reset...`);
  console.log();

  try {
    const accountManager = new AccountManager();
    await accountManager.initialize();

    const result = accountManager.triggerQuotaReset(group as QuotaGroupKey | "all");

    console.log(`${symbols.success} Quota reset triggered successfully!`);
    console.log();

    // Display group names with their models
    const groupsToShow = group === "all" ? getAllQuotaGroups() : [group as QuotaGroupKey];
    for (const groupKey of groupsToShow) {
      const quotaGroup = QUOTA_GROUPS[groupKey];
      console.log(`  ${pc.bold(quotaGroup.name)}`);
      console.log(`    Models: ${pc.dim(quotaGroup.models.join(", "))}`);
    }

    console.log();
    console.log(`  Accounts affected: ${pc.cyan(String(result.accountsAffected))}`);
    console.log(`  Rate limits cleared: ${pc.cyan(String(result.limitsCleared))}`);
    console.log();
  } catch (error) {
    console.error(`${symbols.error} ${pc.red((error as Error).message)}`);
    process.exit(1);
  }
}
