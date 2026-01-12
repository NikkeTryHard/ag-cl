/**
 * Share Mode CLI Flags
 *
 * Parse and handle share-related command line flags.
 */

/**
 * Share CLI flag values
 */
export interface ShareFlags {
  /** Enable share mode (host) */
  share: boolean;
  /** Connect to remote share URL */
  connect: string | null;
  /** API key for authentication */
  apiKey: string | null;
  /** Nickname for client identification */
  nickname: string | null;
  /** Disable authentication (public access) */
  noAuth: boolean;
}

/**
 * Validation result for share flags
 */
export interface ShareFlagsValidation {
  valid: boolean;
  error?: string;
}

/**
 * Parse share-related flags from argv
 *
 * @param argv - Command line arguments array
 * @returns Parsed share flags
 */
export function parseShareFlags(argv: string[]): ShareFlags {
  const flags: ShareFlags = {
    share: false,
    connect: null,
    apiKey: null,
    nickname: null,
    noAuth: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--share") {
      flags.share = true;
    } else if (arg === "--connect" && argv[i + 1]) {
      flags.connect = argv[i + 1];
      i++;
    } else if (arg === "--api-key" && argv[i + 1]) {
      flags.apiKey = argv[i + 1];
      i++;
    } else if (arg === "--nickname" && argv[i + 1]) {
      flags.nickname = argv[i + 1];
      i++;
    } else if (arg === "--no-auth") {
      flags.noAuth = true;
    }
  }

  return flags;
}

/**
 * Validate share flags combination
 *
 * Ensures flags are used in valid combinations.
 *
 * @param flags - Parsed share flags
 * @returns Validation result with error message if invalid
 */
export function validateShareFlags(flags: ShareFlags): ShareFlagsValidation {
  // Can't use both --share and --connect
  if (flags.share && flags.connect) {
    return { valid: false, error: "Cannot use --share and --connect together" };
  }

  // --api-key requires --connect or --share
  if (flags.apiKey && !flags.connect && !flags.share) {
    return { valid: false, error: "--api-key requires --connect or --share" };
  }

  // --nickname only makes sense with --connect
  if (flags.nickname && !flags.connect) {
    return { valid: false, error: "--nickname requires --connect" };
  }

  return { valid: true };
}

/**
 * Get share flags from current process
 *
 * Convenience function that parses process.argv
 *
 * @returns Parsed share flags from process.argv
 */
export function getShareFlags(): ShareFlags {
  return parseShareFlags(process.argv);
}
