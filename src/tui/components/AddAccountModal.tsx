/**
 * AddAccountModal Component
 *
 * Modal for adding new accounts via OAuth.
 */

import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import open from "open";
import { getAuthorizationUrl, startCallbackServer, completeOAuthFlow } from "../../auth/oauth.js";
import { loadAccounts, saveAccounts } from "../../account-manager/storage.js";
import { ACCOUNT_CONFIG_PATH } from "../../constants.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

interface AddAccountModalProps {
  onClose: () => void;
  onAccountAdded: () => void;
}

type FlowState = "choose-method" | "waiting-auth" | "exchanging" | "success" | "error";

export function AddAccountModal({ onClose, onAccountAdded }: AddAccountModalProps): React.ReactElement {
  const { width, height } = useTerminalSize();
  const [flowState, setFlowState] = useState<FlowState>("choose-method");
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [browserWarning, setBrowserWarning] = useState<string | null>(null);
  const isRunning = useRef(false);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (flowState === "choose-method") {
      if (input === "1" || input === "o") {
        void startOAuth(true);
      } else if (input === "2" || input === "n") {
        void startOAuth(false);
      }
    } else if (flowState === "success" || flowState === "error") {
      if (key.return || input === " ") {
        if (flowState === "success") {
          onAccountAdded();
        }
        onClose();
      }
    }
  });

  async function startOAuth(openBrowser: boolean) {
    if (isRunning.current) return;
    isRunning.current = true;
    setBrowserWarning(null);

    try {
      // Generate auth URL
      const { url, verifier, state } = getAuthorizationUrl();
      setAuthUrl(url);
      setFlowState("waiting-auth");

      // Open browser if requested
      if (openBrowser) {
        try {
          await open(url);
        } catch {
          // Browser open failed - show warning but continue
          setBrowserWarning("Could not open browser automatically. Please copy the URL below.");
        }
      }

      // Wait for callback
      const code = await startCallbackServer(state);

      setFlowState("exchanging");

      // Exchange code for tokens and get account info
      const accountInfo = await completeOAuthFlow(code, verifier);

      // Save the account
      const { accounts } = await loadAccounts(ACCOUNT_CONFIG_PATH);

      // Check if account already exists
      const existingIndex = accounts.findIndex((a) => a.email === accountInfo.email);
      if (existingIndex >= 0) {
        accounts[existingIndex] = {
          ...accounts[existingIndex],
          refreshToken: accountInfo.refreshToken,
        };
      } else {
        accounts.push({
          email: accountInfo.email,
          source: "oauth",
          refreshToken: accountInfo.refreshToken,
          addedAt: Date.now(),
          lastUsed: null,
          modelRateLimits: {},
        });
      }

      // Get current settings and activeIndex
      const config = await loadAccounts(ACCOUNT_CONFIG_PATH);
      await saveAccounts(ACCOUNT_CONFIG_PATH, accounts, config.settings, config.activeIndex);
      setSuccessEmail(accountInfo.email);
      setFlowState("success");
    } catch (err) {
      setError((err as Error).message);
      setFlowState("error");
    } finally {
      isRunning.current = false;
    }
  }

  // Cleanup hint
  useEffect(() => {
    return () => {
      isRunning.current = false;
    };
  }, []);

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" width={width} height={height - 1}>
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Add Account
          </Text>
        </Box>

        {flowState === "choose-method" && (
          <>
            <Text>Choose authentication method:</Text>
            <Text> </Text>
            <Box>
              <Text color="cyan">[1]</Text>
              <Text> OAuth with browser (recommended)</Text>
            </Box>
            <Box>
              <Text color="cyan">[2]</Text>
              <Text> OAuth without browser (copy URL manually)</Text>
            </Box>
            <Text> </Text>
            <Text dimColor>Press 1, 2, or ESC to cancel</Text>
          </>
        )}

        {flowState === "waiting-auth" && (
          <>
            <Box>
              <Text color="green">
                <Spinner type="dots" />
              </Text>
              <Text> Waiting for authorization...</Text>
            </Box>
            {browserWarning && (
              <>
                <Text> </Text>
                <Text color="yellow">{browserWarning}</Text>
              </>
            )}
            {authUrl && (
              <>
                <Text> </Text>
                <Text>Copy this URL to your browser:</Text>
                <Text> </Text>
                <Box flexDirection="column" width={Math.max(60, width - 10)}>
                  <Text color="cyan" wrap="wrap">
                    {authUrl}
                  </Text>
                </Box>
                <Text> </Text>
                <Text dimColor>Tip: If you see a "response_type" error, try copying this URL directly.</Text>
              </>
            )}
            <Text> </Text>
            <Text dimColor>Press ESC to cancel</Text>
          </>
        )}

        {flowState === "exchanging" && (
          <>
            <Box>
              <Text color="green">
                <Spinner type="dots" />
              </Text>
              <Text> Exchanging authorization code...</Text>
            </Box>
          </>
        )}

        {flowState === "success" && (
          <>
            <Box>
              <Text color="green">Success!</Text>
            </Box>
            <Text> </Text>
            <Text>
              Account <Text color="cyan">{successEmail}</Text> has been added.
            </Text>
            <Text> </Text>
            <Text dimColor>Press Enter to continue</Text>
          </>
        )}

        {flowState === "error" && (
          <>
            <Box>
              <Text color="red">Error</Text>
            </Box>
            <Text> </Text>
            <Text color="red">{error}</Text>
            <Text> </Text>
            <Text dimColor>Press Enter or ESC to close</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
