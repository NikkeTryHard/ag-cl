/**
 * TUI Application Entry Point
 */

import React, { useState, useCallback } from "react";
import { render, useApp, useInput, Box, Text } from "ink";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { Dashboard } from "./components/Dashboard.js";
import { CommandPalette } from "./components/CommandPalette.js";
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
  const [modal, setModal] = useState<ModalState>({ type: "none" });

  // Hooks
  const serverState = useServerState(DEFAULT_PORT);
  const { loading, claudeCapacity, geminiCapacity, accountCount, refresh } = useCapacity();

  // Modal controls
  const modalControls = {
    open: useCallback((type: ModalState["type"]) => { setModal({ type }); }, []),
    close: useCallback(() => { setModal({ type: "none" }); }, []),
  };

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
      command.action();
    },
    [modalControls],
  );

  // Global keyboard shortcuts
  useInput((input, key) => {
    // Ctrl+P opens command palette
    if (input === "p" && key.ctrl) {
      setModal({ type: "command-palette" });
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
        setModal({ type: "add-account" });
      } else if (input === "s") {
        if (serverState.running) {
          serverState.stop();
        } else {
          serverState.start();
        }
      } else if (input === "l") {
        setModal({ type: "logs" });
      } else if (input === "r") {
        refresh();
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
    <Box flexDirection="column">
      {/* Dashboard is always visible */}
      <Dashboard version={VERSION} serverState={serverState} claudeCapacity={claudeCapacity} geminiCapacity={geminiCapacity} accountCount={accountCount} />

      {/* Command palette overlay */}
      {modal.type === "command-palette" && (
        <Box position="absolute" marginTop={2} marginLeft={2}>
          <CommandPalette commands={commands} onSelect={handleSelectCommand} onClose={modalControls.close} />
        </Box>
      )}

      {/* Placeholder for other modals */}
      {modal.type === "add-account" && (
        <Box borderStyle="round" padding={1}>
          <Text>Add Account modal (TODO)</Text>
          <Text dimColor> Press ESC to close</Text>
        </Box>
      )}

      {modal.type === "logs" && (
        <Box borderStyle="round" padding={1}>
          <Text>Server Logs modal (TODO)</Text>
          <Text dimColor> Press ESC to close</Text>
        </Box>
      )}
    </Box>
  );
}

export function startTUI(): void {
  render(<App />);
}
