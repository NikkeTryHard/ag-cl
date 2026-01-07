/**
 * TUI Type Definitions
 */

/** Server running state */
export interface ServerState {
  running: boolean;
  port: number;
}

/** Per-model quota info for display */
export interface ModelQuotaDisplay {
  name: string; // Short display name (e.g., "2.5-pro", "opus")
  percentage: number; // 0-100
  resetTime: string | null; // ISO timestamp
}

/** Per-account capacity info for display */
export interface AccountCapacityInfo {
  email: string;
  tier: string;
  claudeModels: ModelQuotaDisplay[]; // Per-model quotas
  geminiModels: ModelQuotaDisplay[]; // Per-model quotas
  claudeReset: string | null; // Earliest reset (for summary)
  geminiReset: string | null; // Earliest reset (for summary)
  error: string | null;
}

/** Aggregated capacity for a model family */
export interface AggregatedCapacity {
  family: "claude" | "gemini";
  totalPercentage: number; // Sum across all accounts (can exceed 100%)
  accountCount: number;
  status: "burning" | "stable" | "recovering" | "exhausted" | "calculating";
  hoursToExhaustion: number | null;
  ratePerHour: number | null; // Burn rate
}

/** UI modal state */
export interface ModalState {
  type: "none" | "command-palette" | "accounts" | "add-account" | "remove-account" | "logs" | "settings";
}

/** Command for command palette */
export interface Command {
  id: string;
  label: string;
  category: "server" | "accounts" | "view" | "settings";
  action: () => void | Promise<void>;
}
