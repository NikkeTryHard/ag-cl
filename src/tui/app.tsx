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
import { PortInputModal } from "./components/PortInputModal.js";
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

  // Global keyboard shortcuts - only active when no modal is open
  useInput(
    (input) => {
      // : opens command palette (vim-style)
      if (input === ":") {
        modalControls.open("command-palette");
        return;
      }

      // q quits
      if (input === "q") {
        exit();
        return;
      }

      // Quick shortcuts
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
      } else if (input === "p") {
        setModal({ type: "change-port" });
      } else if (input === "?" || input === "h") {
        // ? or h opens command palette for help
        modalControls.open("command-palette");
      }
    },
    { isActive: modal.type === "none" },
  );

  // Loading state
  if (loading) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" width={terminalWidth} height={terminalHeight}>
        <Text>Loading...</Text>
      </Box>
    );
  }

  // Full-screen modal views (replace dashboard entirely)
  if (modal.type === "accounts") {
    return (
      <AccountListModal
        accounts={accounts}
        claudeCapacity={claudeCapacity}
        geminiCapacity={geminiCapacity}
        onClose={modalControls.close}
        onAddAccount={() => {
          setModal({ type: "add-account" });
        }}
        onRefresh={() => {
          void refresh();
        }}
      />
    );
  }

  if (modal.type === "logs") {
    return <ServerLogsModal onClose={modalControls.close} />;
  }

  if (modal.type === "add-account") {
    return (
      <AddAccountModal
        onClose={modalControls.close}
        onAccountAdded={() => {
          void refresh();
        }}
      />
    );
  }

  if (modal.type === "change-port") {
    return (
      <PortInputModal
        currentPort={serverState.port}
        serverRunning={serverState.running}
        onConfirm={(newPort, shouldRestart) => {
          serverState.setPort(newPort);
          if (shouldRestart) {
            void serverState.restart();
          }
          modalControls.close();
        }}
        onClose={modalControls.close}
      />
    );
  }

  if (modal.type === "command-palette") {
    return <CommandPalette commands={commands} onSelect={handleSelectCommand} onClose={modalControls.close} />;
  }

  // Dashboard view
  return <Dashboard version={VERSION} serverState={serverState} claudeCapacity={claudeCapacity} geminiCapacity={geminiCapacity} accountCount={accountCount} />;
}

export function startTUI(): void {
  render(<App />);
}
