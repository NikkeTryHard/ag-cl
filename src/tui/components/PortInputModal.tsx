/**
 * PortInputModal Component
 *
 * Modal for changing the server port with real-time validation.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { validatePort } from "../utils/portValidation.js";

interface PortInputModalProps {
  currentPort: number;
  serverRunning: boolean;
  onConfirm: (port: number, shouldRestart: boolean) => void;
  onClose: () => void;
}

type ModalState = "input" | "confirm-restart";

export function PortInputModal({ currentPort, serverRunning, onConfirm, onClose }: PortInputModalProps): React.ReactElement {
  const { width, height } = useTerminalSize();
  const [portValue, setPortValue] = useState(String(currentPort));
  const [modalState, setModalState] = useState<ModalState>("input");

  const validationError = validatePort(portValue);
  const newPort = parseInt(portValue, 10);
  const portChanged = !validationError && newPort !== currentPort;

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (modalState === "input") {
      if (key.return && !validationError) {
        if (portChanged && serverRunning) {
          setModalState("confirm-restart");
        } else if (portChanged) {
          onConfirm(newPort, false);
        } else {
          onClose();
        }
      }
    } else if (modalState === "confirm-restart") {
      if (input === "y" || input === "Y") {
        onConfirm(newPort, true);
      } else if (input === "n" || input === "N") {
        onConfirm(newPort, false);
      }
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" width={width} height={height - 1}>
      <Box flexDirection="column" borderStyle="round" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Change Port
          </Text>
        </Box>

        {modalState === "input" && (
          <>
            <Box>
              <Text>Port: </Text>
              <TextInput value={portValue} onChange={setPortValue} />
            </Box>

            {validationError && (
              <Box marginTop={1}>
                <Text color="red">{validationError}</Text>
              </Box>
            )}

            <Box marginTop={1}>
              <Text dimColor>Enter to confirm, ESC to cancel</Text>
            </Box>
          </>
        )}

        {modalState === "confirm-restart" && (
          <>
            <Text>
              Port changed to <Text color="cyan">{newPort}</Text>.
            </Text>
            <Text>Server is running. Restart now?</Text>
            <Box marginTop={1}>
              <Text color="cyan">[y]</Text>
              <Text>es </Text>
              <Text color="cyan">[n]</Text>
              <Text>o</Text>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
