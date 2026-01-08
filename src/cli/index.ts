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
    .option("--max-empty-retries <number>", "maximum retries for empty API responses (default: 2)");

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
