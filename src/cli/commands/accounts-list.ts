/**
 * accounts list command
 *
 * List all configured accounts with capacity information.
 * Displays tier, quota usage, burn rates, and reset times.
 */

import * as p from "@clack/prompts";
import pc from "picocolors";

import { ACCOUNT_CONFIG_PATH } from "../../constants.js";
import { loadAccounts } from "../../account-manager/storage.js";
import { refreshAccessToken } from "../../auth/oauth.js";
import { fetchAccountCapacity, type AccountCapacity } from "../../cloudcode/quota-api.js";
import { initQuotaStorage, recordSnapshot, closeQuotaStorage } from "../../cloudcode/quota-storage.js";
import { calculateBurnRate } from "../../cloudcode/burn-rate.js";
import { renderAccountCapacity, renderCapacitySummary, type PoolBurnRates } from "../capacity-renderer.js";
import { symbols } from "../ui.js";

/**
 * Options for the accounts list command
 */
export interface AccountsListOptions {
  /** Output as JSON for scripting */
  json?: boolean;
}

/**
 * Result of fetching capacity for a single account
 */
interface AccountCapacityResult {
  email: string;
  capacity: AccountCapacity | null;
  burnRates: PoolBurnRates | null;
  error: string | null;
}

/**
 * JSON output structure for --json flag
 */
interface JsonOutput {
  accounts: AccountCapacityResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    combinedClaudeCapacity: number;
    combinedGeminiCapacity: number;
  };
}

/**
 * Execute the accounts list command.
 *
 * @param options - Command options
 */
export async function accountsListCommand(options: AccountsListOptions = {}): Promise<void> {
  const isJson = options.json ?? false;

  // Don't use prompts/spinners in JSON mode
  if (!isJson) {
    p.intro("Account Capacity");
  }

  // Initialize quota storage for snapshot recording and burn rate calculation
  try {
    initQuotaStorage();
  } catch (error) {
    const err = error as Error;
    if (!isJson) {
      p.log.error(`${symbols.error} Failed to initialize quota storage: ${err.message}`);
    }
    // Continue anyway - we just won't be able to calculate burn rates
  }

  // Load accounts
  const { accounts } = await loadAccounts(ACCOUNT_CONFIG_PATH);

  if (accounts.length === 0) {
    if (isJson) {
      console.log(
        JSON.stringify({
          accounts: [],
          summary: {
            total: 0,
            successful: 0,
            failed: 0,
            combinedClaudeCapacity: 0,
            combinedGeminiCapacity: 0,
          },
        } satisfies JsonOutput),
      );
    } else {
      p.log.warn(`${symbols.warning} No accounts configured. Run 'accounts add' to add an account.`);
      p.outro("Nothing to display");
    }
    closeQuotaStorage();
    return;
  }

  if (!isJson) {
    p.log.info(`Found ${accounts.length} account(s)`);
  }

  const results: AccountCapacityResult[] = [];
  const capacities: AccountCapacity[] = [];
  const spinner = isJson ? null : p.spinner();

  // Process each account
  for (const account of accounts) {
    // Skip non-OAuth accounts (they don't have refresh tokens for API access)
    if (account.source !== "oauth" || !account.refreshToken) {
      results.push({
        email: account.email,
        capacity: null,
        burnRates: null,
        error: "Non-OAuth account (no API access)",
      });
      continue;
    }

    if (spinner) {
      spinner.start(`Fetching capacity for ${account.email}...`);
    }

    try {
      // Refresh the access token
      const { accessToken } = await refreshAccessToken(account.refreshToken);

      // Fetch account capacity
      const capacity = await fetchAccountCapacity(accessToken, account.email);

      // Record snapshots for burn rate tracking
      try {
        recordSnapshot(account.email, "claude", capacity.claudePool.aggregatedPercentage);
        recordSnapshot(account.email, "gemini", capacity.geminiPool.aggregatedPercentage);
      } catch {
        // Ignore snapshot errors - burn rate just won't be available
      }

      // Calculate burn rates
      const claudeBurnRate = calculateBurnRate(account.email, "claude", capacity.claudePool.aggregatedPercentage, capacity.claudePool.earliestReset);
      const geminiBurnRate = calculateBurnRate(account.email, "gemini", capacity.geminiPool.aggregatedPercentage, capacity.geminiPool.earliestReset);

      const burnRates: PoolBurnRates = {
        claude: claudeBurnRate,
        gemini: geminiBurnRate,
      };

      results.push({
        email: account.email,
        capacity,
        burnRates,
        error: null,
      });
      capacities.push(capacity);

      if (spinner) {
        spinner.stop(`${symbols.success} ${account.email}`);
      }
    } catch (error) {
      const err = error as Error;
      let errorMessage = err.message;

      // Check for specific error types
      if (errorMessage.includes("invalid_grant")) {
        errorMessage = "Token expired or revoked";
      }

      results.push({
        email: account.email,
        capacity: null,
        burnRates: null,
        error: errorMessage,
      });

      if (spinner) {
        spinner.stop(`${symbols.error} ${account.email} - ${errorMessage}`);
      }
    }
  }

  // Output results
  if (isJson) {
    // JSON output for scripting
    const jsonOutput: JsonOutput = {
      accounts: results,
      summary: {
        total: accounts.length,
        successful: capacities.length,
        failed: results.filter((r) => r.error !== null).length,
        combinedClaudeCapacity: capacities.reduce((sum, cap) => sum + cap.claudePool.aggregatedPercentage, 0),
        combinedGeminiCapacity: capacities.reduce((sum, cap) => sum + cap.geminiPool.aggregatedPercentage, 0),
      },
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    // Human-readable output
    console.log();

    // Render each account's capacity
    for (const result of results) {
      if (result.capacity && result.burnRates) {
        const rendered = renderAccountCapacity(result.capacity, result.burnRates);
        console.log(rendered);
        console.log();
      } else if (result.error) {
        console.log(pc.bold(result.email));
        console.log(`    ${pc.red(result.error)}`);
        console.log();
      }
    }

    // Render summary
    const summary = renderCapacitySummary(capacities);
    console.log(summary);
    console.log();

    // Count results
    const successCount = capacities.length;
    const errorCount = results.filter((r) => r.error !== null).length;

    if (errorCount > 0) {
      p.log.warn(`${symbols.warning} ${errorCount} account(s) had errors. Run 'accounts verify' to check token status.`);
    }

    p.outro(`${successCount}/${accounts.length} accounts fetched successfully`);
  }

  // Clean up
  closeQuotaStorage();
}
