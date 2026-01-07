/**
 * TUI Type Definitions
 */

/** Server running state */
export interface ServerState {
  running: boolean;
  port: number;
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
  type: "none" | "command-palette" | "add-account" | "remove-account" | "logs" | "settings";
}

/** Command for command palette */
export interface Command {
  id: string;
  label: string;
  category: "server" | "accounts" | "view" | "settings";
  action: () => void | Promise<void>;
}
