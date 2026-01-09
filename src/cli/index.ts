/**
 * Main CLI Entry Point
 *
 * Provides the command-line interface for antigravity-claude-proxy using Commander.
 */

import { Command, Option } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { DEFAULT_PORT } from "../constants.js";
import { initLogger, setLogLevel, type LogLevel } from "../utils/logger.js";
import type { SchedulingMode } from "../account-manager/types.js";

// Resolve package.json path for version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, "..", "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version: string };
const VERSION: string = packageJson.version;

/**
 * CLI options shared across commands.
 */
export interface GlobalOptions {
  port?: number;
  fallback?: boolean;
  debug?: boolean;
  logLevel?: LogLevel;
  logFile?: string;
  jsonLogs?: boolean;
  silent?: boolean;
  maxEmptyRetries?: string;
  triggerReset?: boolean;
  autoRefresh?: boolean;
  scheduling?: SchedulingMode;
}

/**
 * Create and configure the Commander program.
 */
function createProgram(): Command {
  const program = new Command();

  program.name("antigravity-claude-proxy").description("Anthropic-compatible API proxy backed by Antigravity Cloud Code").version(VERSION);

  // Global options
  program
    .option("-p, --port <number>", "server port", String(DEFAULT_PORT))
    .option("--fallback", "enable model fallback when quota exhausted")
    .option("--debug", "enable debug logging")
    .addOption(new Option("--log-level <level>", "log level").choices(["silent", "error", "warn", "info", "debug", "trace"]).default("info"))
    .option("--log-file <path>", "write logs to file")
    .option("--json-logs", "output logs as JSON")
    .option("--silent", "suppress all output except errors")
    .option("--max-empty-retries <number>", "maximum retries for empty API responses (default: 2)")
    .option("--trigger-reset", "trigger quota reset on startup")
    .option("--auto-refresh", "automatically refresh quota every 5 hours")
    .addOption(new Option("--scheduling <mode>", "account selection scheduling mode").choices(["sticky", "refresh-priority", "drain-highest", "round-robin"]));

  // preAction hook to initialize logger based on options
  program.hook("preAction", (thisCommand) => {
    const opts: GlobalOptions = thisCommand.opts<GlobalOptions>();

    // Determine log level
    let logLevel: LogLevel = "info";
    if (opts.silent) {
      logLevel = "silent";
    } else if (opts.debug) {
      logLevel = "debug";
    } else if (opts.logLevel) {
      logLevel = opts.logLevel;
    }

    // Initialize logger
    initLogger({ level: logLevel });
    setLogLevel(logLevel);
  });

  // TUI command (default) - launches interactive dashboard
  program
    .command("tui", { isDefault: true })
    .description("Launch interactive TUI dashboard")
    .action(async () => {
      const { startTUI } = await import("../tui/app.js");
      startTUI();
    });

  // Start command - headless server mode
  program
    .command("start")
    .description("Start the proxy server (headless mode)")
    .action(async () => {
      const opts: GlobalOptions = program.opts<GlobalOptions>();

      // Set max empty retries environment variable if provided
      if (opts.maxEmptyRetries !== undefined) {
        const retries = parseInt(opts.maxEmptyRetries, 10);
        if (!isNaN(retries) && retries >= 0) {
          process.env.MAX_EMPTY_RETRIES = String(retries);
        }
      }

      // Set scheduling mode from CLI flag (takes priority over SCHEDULING_MODE env var)
      if (opts.scheduling !== undefined) {
        process.env.CLI_SCHEDULING_MODE = opts.scheduling;
      }

      // Trigger quota reset on startup if requested (processes ALL OAuth accounts)
      if (opts.triggerReset || process.env.TRIGGER_RESET === "true") {
        const { default: chalk } = await import("chalk");
        const { AccountManager } = await import("../account-manager/index.js");
        const { triggerQuotaResetApi } = await import("../cloudcode/quota-reset-trigger.js");

        try {
          const accountManager = new AccountManager();
          await accountManager.initialize();

          // Get ALL OAuth accounts
          const accounts = accountManager.getAllAccounts();
          const oauthAccounts = accounts.filter((a: { source: string; refreshToken?: string }) => a.source === "oauth" && a.refreshToken);

          if (oauthAccounts.length === 0) {
            console.log(chalk.yellow("No OAuth accounts found for quota reset"));
          } else {
            console.log(chalk.blue(`Triggering quota reset for ${oauthAccounts.length} account(s)...`));

            let successCount = 0;
            let failCount = 0;

            for (const account of oauthAccounts) {
              try {
                const token = await accountManager.getTokenForAccount(account);
                const projectId = await accountManager.getProjectForAccount(account, token);
                const apiResult = await triggerQuotaResetApi(token, projectId, "all");

                if (apiResult.successCount > 0) {
                  successCount++;
                  console.log(chalk.green(`  ${account.email}: ${apiResult.successCount} group(s) triggered`));
                } else {
                  failCount++;
                  console.log(chalk.yellow(`  ${account.email}: failed to trigger`));
                }
              } catch (err) {
                failCount++;
                console.log(chalk.red(`  ${account.email}: ${(err as Error).message}`));
              }
            }

            // Clear local flags for all accounts
            const localResult = accountManager.triggerQuotaReset("all");

            console.log(chalk.green(`Startup quota reset: ${successCount} succeeded, ${failCount} failed, ${localResult.limitsCleared} local limit(s) cleared`));
          }
        } catch (error) {
          console.log(chalk.yellow(`Startup quota reset failed: ${(error as Error).message}`));
        }
      }

      // Start auto-refresh scheduler if requested
      if (opts.autoRefresh || process.env.AUTO_REFRESH === "true") {
        const { startAutoRefresh } = await import("../cloudcode/auto-refresh-scheduler.js");
        await startAutoRefresh();
      }

      const { startCommand } = await import("./commands/start.js");
      startCommand({
        port: opts.port,
        fallback: opts.fallback,
        debug: opts.debug,
      });
    });

  // Accounts subcommand group
  const accountsCmd = program.command("accounts").description("Manage Google accounts");

  accountsCmd
    .command("add")
    .description("Add a new Google account via OAuth")
    .option("--no-browser", "headless mode - display code for manual entry")
    .option("--refresh-token", "use refresh token directly")
    .action(async (options: { noBrowser?: boolean; refreshToken?: boolean }) => {
      const { accountsAddCommand } = await import("./commands/accounts-add.js");
      await accountsAddCommand(options);
    });

  accountsCmd
    .command("list")
    .alias("ls")
    .description("List all configured accounts with capacity information")
    .option("--json", "output as JSON for scripting")
    .action(async (options: { json?: boolean }) => {
      const { accountsListCommand } = await import("./commands/accounts-list.js");
      await accountsListCommand(options);
    });

  accountsCmd
    .command("remove [email]")
    .alias("rm")
    .description("Remove accounts interactively")
    .action(async (email?: string) => {
      const { accountsRemoveCommand } = await import("./commands/accounts-remove.js");
      await accountsRemoveCommand(email);
    });

  accountsCmd
    .command("verify")
    .description("Verify account tokens are valid")
    .action(async () => {
      const { accountsVerifyCommand } = await import("./commands/accounts-verify.js");
      await accountsVerifyCommand();
    });

  accountsCmd
    .command("clear")
    .description("Remove all accounts")
    .action(async () => {
      const { accountsClearCommand } = await import("./commands/accounts-clear.js");
      await accountsClearCommand();
    });

  // Init command
  program
    .command("init")
    .description("Setup wizard for initial configuration")
    .action(async () => {
      const { initCommand } = await import("./commands/init.js");
      await initCommand();
    });

  // Trigger quota reset command
  program
    .command("trigger-reset")
    .description("Trigger quota reset for all accounts")
    .option("-g, --group <group>", "Quota group to reset (claude, geminiPro, geminiFlash, all)", "all")
    .action(async (options: { group: string }) => {
      const { triggerResetCommand } = await import("./commands/trigger-reset.js");
      await triggerResetCommand(options);
    });

  return program;
}

/**
 * The main Commander program instance.
 */
export const program = createProgram();

/**
 * Run the CLI with the given arguments.
 *
 * @param argv - Optional argument array (defaults to process.argv)
 */
export async function run(argv?: string[]): Promise<void> {
  await program.parseAsync(argv ?? process.argv);
}

// Auto-execute when run directly
run().catch((error: unknown) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
