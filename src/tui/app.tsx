/**
 * TUI Application Entry Point
 */

import React, { useState, useCallback, useMemo } from "react";
import { render, useApp, useInput, Box, Text, useStdout } from "ink";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { Dashboard } from "./components/Dashboard.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { AccountListModal } from "./components/AccountListModal.js";
import { AddAccountModal } from "./components/AddAccountModal.js";
import { ServerLogsModal } from "./components/ServerLogsModal.js";
import { useCapacity } from "./hooks/useCapacity.js";
import { useServerState } from "./hooks/useServerState.js";
import { useCommands } from "./hooks/useCommands.js";
import type { ModalState, Command } from "./types.js";
import { DEFAULT_PORT } from "../constants.js";

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, "..", "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version: string };
const VERSION = packageJson.version;

function App(): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [modal, setModal] = useState<ModalState>({ type: "none" });

  // Get terminal dimensions
  const terminalHeight = stdout.rows;
  const terminalWidth = stdout.columns;

  // Hooks
  const serverState = useServerState(DEFAULT_PORT);
  const { loading, claudeCapacity, geminiCapacity, accountCount, accounts, refresh } = useCapacity();

  // Modal controls
  const modalControls = useMemo(
    () => ({
      open: (type: ModalState["type"]) => {
        setModal({ type });
      },
      close: () => {
        setModal({ type: "none" });
      },
    }),
    [],
  );

  // Commands
  const commands = useCommands({
    serverControls: {
      start: serverState.start,
      stop: serverState.stop,
      restart: serverState.restart,
    },
    modalControls,
    refreshCapacity: refresh,
  });

  // Handle command selection
  const handleSelectCommand = useCallback(
    (command: Command) => {
      modalControls.close();
      void command.action();
    },
    [modalControls],
  );

  // Global keyboard shortcuts
  useInput((input, key) => {
    // Ctrl+P opens command palette
    if (input === "p" && key.ctrl) {
      modalControls.open("command-palette");
      return;
    }

    // ESC closes placeholder modals (CommandPalette handles its own ESC)
    if (key.escape && modal.type !== "none" && modal.type !== "command-palette") {
      modalControls.close();
      return;
    }

    // q quits (when no modal open)
    if (input === "q" && modal.type === "none") {
      exit();
      return;
    }

    // Quick shortcuts when no modal open
    if (modal.type === "none") {
      if (input === "a") {
        setModal({ type: "accounts" });
      } else if (input === "s") {
        if (serverState.running) {
          void serverState.stop();
        } else {
          void serverState.start();
        }
      } else if (input === "l") {
        setModal({ type: "logs" });
      } else if (input === "r") {
        void refresh();
      }
    }
  });

  // Loading state
  if (loading) {
    return (
      <Box padding={1}>
        <Text>Loading...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={terminalHeight} width={terminalWidth}>
      {/* Dashboard is always visible */}
      <Dashboard version={VERSION} serverState={serverState} claudeCapacity={claudeCapacity} geminiCapacity={geminiCapacity} accountCount={accountCount} />

      {/* Command palette overlay */}
      {modal.type === "command-palette" && (
        <Box position="absolute" marginTop={1} marginLeft={1}>
          <CommandPalette commands={commands} onSelect={handleSelectCommand} onClose={modalControls.close} />
        </Box>
      )}

      {/* Account list modal - fullscreen overlay */}
      {modal.type === "accounts" && (
        <Box position="absolute" marginTop={0} marginLeft={0}>
          <AccountListModal
            accounts={accounts}
            onClose={modalControls.close}
            onAddAccount={() => {
              setModal({ type: "add-account" });
            }}
          />
        </Box>
      )}

      {/* Add account modal */}
      {modal.type === "add-account" && (
        <Box position="absolute" marginTop={2} marginLeft={2}>
          <AddAccountModal
            onClose={modalControls.close}
            onAccountAdded={() => {
              void refresh();
            }}
          />
        </Box>
      )}

      {/* Server logs modal - fullscreen overlay */}
      {modal.type === "logs" && (
        <Box position="absolute" marginTop={0} marginLeft={0}>
          <ServerLogsModal onClose={modalControls.close} />
        </Box>
      )}
    </Box>
  );
}

export function startTUI(): void {
  render(<App />);
}
