/**
 * TUI Type Definitions
 */

import type { BurnRateStatus } from "../cloudcode/burn-rate.js";

/** Server running state */
export interface ServerState {
  running: boolean;
  port: number;
}

/** Per-account capacity info for display */
export interface AccountCapacityInfo {
  email: string;
  tier: string;
  claudePercentage: number;
  claudeStatus: BurnRateStatus;
  claudeHoursToExhaustion: number | null;
  geminiPercentage: number;
  geminiStatus: BurnRateStatus;
  geminiHoursToExhaustion: number | null;
  error: string | null;
}

/** Aggregated capacity for a model family */
export interface AggregatedCapacity {
  family: "claude" | "gemini";
  totalPercentage: number;
  accountCount: number;
  status: "burning" | "stable" | "recovering" | "exhausted" | "calculating";
  hoursToExhaustion: number | null;
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
