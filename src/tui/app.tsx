/**
 * TUI Application Entry Point
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
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
import { UnifiedOptionsModal } from "./components/UnifiedOptionsModal.js";
import { ShareStatusBar } from "./components/ShareStatusBar.js";
import { ConnectModal } from "./components/ConnectModal.js";
import { ConnectedClientsPanel } from "./components/ConnectedClientsPanel.js";
import { useCapacity } from "./hooks/useCapacity.js";
import { useServerState } from "./hooks/useServerState.js";
import { useCommands } from "./hooks/useCommands.js";
import { useSettings } from "./hooks/useSettings.js";
import { useAutoRefresh } from "./hooks/useAutoRefresh.js";
import { useShareState } from "./hooks/useShareState.js";
import { createLogBufferDestination } from "./hooks/useLogBuffer.js";
import { isDemoMode, getDemoAccounts, getDemoClaudeCapacity, getDemoGeminiCapacity, initDemoLogs } from "./demo.js";
import { initLogger } from "../utils/logger.js";
import type { ModalState, Command } from "./types.js";

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
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [shareStarting, setShareStarting] = useState(false);

  // Use a ref to track modal state for the input handler
  // This ensures the handler always sees the latest modal state
  const modalRef = useRef(modal);
  useEffect(() => {
    modalRef.current = modal;
  }, [modal]);

  // Check demo mode
  const demoMode = isDemoMode();

  // Get terminal dimensions
  const terminalHeight = stdout.rows;
  const terminalWidth = stdout.columns;

  // Hooks
  const { settings, updateSettings, loading: settingsLoading } = useSettings();
  const serverState = useServerState({ settings, demoMode });

  // Auto-refresh scheduler (tied to app lifecycle, not server)
  const autoRefreshState = useAutoRefresh({ settings, demoMode });

  // Share mode state
  const shareState = useShareState({ port: serverState.port });

  // Clear shareStarting when tunnel URL arrives
  useEffect(() => {
    if (shareState.hostState.tunnelUrl) {
      setShareStarting(false);
    }
  }, [shareState.hostState.tunnelUrl]);

  // Clear shareStarting when mode returns to normal (e.g., error or stop)
  useEffect(() => {
    if (shareState.mode === "normal") {
      setShareStarting(false);
    }
  }, [shareState.mode]);

  // Clear shareStarting on error
  useEffect(() => {
    if (shareState.error) {
      setShareStarting(false);
    }
  }, [shareState.error]);

  const realCapacity = useCapacity();

  // Use demo data if in demo mode
  const loading = demoMode ? false : realCapacity.loading || settingsLoading;
  const refreshing = demoMode ? false : realCapacity.refreshing;
  const claudeCapacity = demoMode ? getDemoClaudeCapacity() : realCapacity.claudeCapacity;

  // For display purposes, combine Gemini Pro and Flash into a single aggregate
  const geminiCapacity = useMemo(() => {
    if (demoMode) {
      return getDemoGeminiCapacity();
    }
    return {
      family: "gemini" as const,
      totalPercentage: Math.round((realCapacity.geminiProCapacity.totalPercentage + realCapacity.geminiFlashCapacity.totalPercentage) / 2),
      accountCount: realCapacity.geminiProCapacity.accountCount,
      status: realCapacity.geminiProCapacity.status === "exhausted" || realCapacity.geminiFlashCapacity.status === "exhausted" ? ("exhausted" as const) : realCapacity.geminiProCapacity.status,
      hoursToExhaustion: realCapacity.geminiProCapacity.hoursToExhaustion ?? realCapacity.geminiFlashCapacity.hoursToExhaustion,
      ratePerHour: realCapacity.geminiProCapacity.ratePerHour !== null && realCapacity.geminiFlashCapacity.ratePerHour !== null ? (realCapacity.geminiProCapacity.ratePerHour + realCapacity.geminiFlashCapacity.ratePerHour) / 2 : (realCapacity.geminiProCapacity.ratePerHour ?? realCapacity.geminiFlashCapacity.ratePerHour),
    };
  }, [demoMode, realCapacity.geminiProCapacity, realCapacity.geminiFlashCapacity]);

  const accounts = demoMode ? getDemoAccounts() : realCapacity.accounts;
  const accountCount = demoMode ? 3 : realCapacity.accountCount;
  const refresh = realCapacity.refresh;

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
  useInput((input) => {
    // Check modal state via ref to ensure we have latest value
    if (modalRef.current.type !== "none") {
      return; // Don't handle input when modal is open
    }

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

    // Share mode shortcuts (uppercase = shift held)
    if (input === "S") {
      // Toggle sharing
      if (shareState.mode === "host") {
        shareState.stopSharing();
      } else if (shareState.mode === "normal" && serverState.running) {
        setShareStarting(true);
        shareState.startSharing();
      }
      return;
    }

    if (input === "C") {
      // Open connect modal (only in normal mode)
      if (shareState.mode === "normal") {
        setModal({ type: "connect" });
      }
      return;
    }

    if (input === "D") {
      // Disconnect
      if (shareState.mode === "client") {
        shareState.disconnect();
      } else if (shareState.mode === "host") {
        shareState.stopSharing();
      }
      return;
    }

    if (input === "Y" || input === "y") {
      // Copy URL (only in host mode with valid URL)
      if (shareState.mode === "host" && shareState.hostState.tunnelUrl) {
        shareState.copyUrl();
        setCopiedFeedback(true);
        setTimeout(() => {
          setCopiedFeedback(false);
        }, 2000);
      }
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
    } else if (input === "o" || input === "?") {
      setModal({ type: "settings" });
    } else if (input === "h") {
      // h opens command palette for help
      modalControls.open("command-palette");
    }
  });

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
        refreshing={refreshing}
        onClose={modalControls.close}
        onAddAccount={() => {
          setModal({ type: "add-account" });
        }}
        onRefresh={() => {
          void refresh();
        }}
        autoRefreshRunning={autoRefreshState.isRunning}
        lastAutoRefresh={autoRefreshState.lastRefreshTime}
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

  if (modal.type === "settings") {
    return <UnifiedOptionsModal settings={settings} shareConfig={shareState.config} onUpdateSettings={updateSettings} onUpdateShareConfig={shareState.updateConfig} onClose={modalControls.close} />;
  }

  if (modal.type === "command-palette") {
    return <CommandPalette commands={commands} onSelect={handleSelectCommand} onClose={modalControls.close} />;
  }

  if (modal.type === "connect") {
    return (
      <ConnectModal
        onConnect={(url, apiKey, nickname) => {
          shareState.connectTo(url, apiKey, nickname);
          modalControls.close();
        }}
        onClose={modalControls.close}
        error={shareState.error}
        connecting={shareState.clientState.reconnecting}
      />
    );
  }

  // Dashboard view with share status
  return (
    <Box flexDirection="column">
      {shareState.mode !== "normal" && <ShareStatusBar mode={shareState.mode} tunnelUrl={shareState.hostState.tunnelUrl} clientCount={shareState.hostState.connectedClients.length} remoteUrl={shareState.clientState.remoteUrl} hostNickname={shareState.clientState.hostNickname} reconnecting={shareState.clientState.reconnecting} copied={copiedFeedback} />}
      <Dashboard version={VERSION} serverState={serverState} claudeCapacity={claudeCapacity} geminiCapacity={geminiCapacity} accountCount={accountCount} refreshing={refreshing} autoRefreshRunning={autoRefreshState.isRunning} lastAutoRefresh={autoRefreshState.lastRefreshTime} shareMode={shareState.mode} shareStarting={shareStarting} shareError={shareState.error} />
      {shareState.mode === "host" && <ConnectedClientsPanel clients={shareState.hostState.connectedClients} maxClients={shareState.config.limits.maxClients} />}
    </Box>
  );
}

export function startTUI(): void {
  // Initialize logger in TUI mode - writes to buffer instead of stdout
  initLogger({
    level: "info",
    tuiMode: true,
    tuiDestination: createLogBufferDestination(),
  });

  // Initialize demo logs if in demo mode
  if (isDemoMode()) {
    initDemoLogs();
  }

  render(<App />);
}
