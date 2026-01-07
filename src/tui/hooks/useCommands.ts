/**
 * useCommands Hook
 *
 * Returns the list of commands available in the command palette.
 */

import { useMemo } from "react";
import type { Command, ModalState } from "../types.js";

interface UseCommandsOptions {
  serverControls: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    restart: () => Promise<void>;
  };
  modalControls: {
    open: (type: ModalState["type"]) => void;
    close: () => void;
  };
  refreshCapacity: () => Promise<void>;
}

export function useCommands({ serverControls, modalControls, refreshCapacity }: UseCommandsOptions): Command[] {
  return useMemo(
    () => [
      // Server commands
      {
        id: "start-server",
        label: "Start Server",
        category: "server",
        action: serverControls.start,
      },
      {
        id: "stop-server",
        label: "Stop Server",
        category: "server",
        action: serverControls.stop,
      },
      {
        id: "restart-server",
        label: "Restart Server",
        category: "server",
        action: serverControls.restart,
      },

      // Account commands
      {
        id: "add-account-oauth",
        label: "Add Account (OAuth)",
        category: "accounts",
        action: () => {
          modalControls.open("add-account");
        },
      },
      {
        id: "remove-account",
        label: "Remove Account",
        category: "accounts",
        action: () => {
          modalControls.open("remove-account");
        },
      },
      {
        id: "refresh-capacity",
        label: "Refresh Capacity",
        category: "accounts",
        action: refreshCapacity,
      },

      // View commands
      {
        id: "view-logs",
        label: "Server Logs",
        category: "view",
        action: () => {
          modalControls.open("logs");
        },
      },

      // Settings commands
      {
        id: "settings",
        label: "Settings",
        category: "settings",
        action: () => {
          modalControls.open("settings");
        },
      },
    ],
    [serverControls, modalControls, refreshCapacity],
  );
}
