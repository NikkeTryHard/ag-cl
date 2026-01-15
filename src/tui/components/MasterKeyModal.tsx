/**
 * MasterKeyModal Component
 *
 * Displays the full master key with options to copy or regenerate.
 */

import React from "react";
import { Box, Text, useInput } from "ink";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

export interface MasterKeyModalProps {
  masterKey: string | null;
  onClose: () => void;
  onRegenerate: () => void;
  onCopy: () => void;
  copied?: boolean;
  regenerating?: boolean;
}

export function MasterKeyModal({ masterKey, onClose, onRegenerate, onCopy, copied = false, regenerating = false }: MasterKeyModalProps): React.ReactElement {
  const { width, height } = useTerminalSize();

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if ((input === "y" || input === "Y") && masterKey) {
      onCopy();
      return;
    }

    if (input === "r" || input === "R") {
      onRegenerate();
      return;
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" width={width} height={height - 1}>
      <Box flexDirection="column" borderStyle="round" padding={1}>
        {/* Header */}
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Master Key
          </Text>
          {regenerating && <Text dimColor> - Regenerating...</Text>}
          {copied && <Text color="green"> - Copied!</Text>}
        </Box>

        {/* Key display */}
        <Box marginBottom={1}>{masterKey ? <Text color="yellow">{masterKey}</Text> : <Text dimColor>Not generated - press R to generate</Text>}</Box>

        {/* Info */}
        <Box marginBottom={1}>
          <Text dimColor>{masterKey ? "Share this key with anyone who needs access (single auth mode)" : "Generate a key to enable authentication"}</Text>
        </Box>

        {/* Footer */}
        <Box>
          <Text color="cyan">ESC</Text>
          <Text dimColor> close</Text>
          {masterKey && (
            <>
              <Text dimColor> | </Text>
              <Text color="cyan">Y</Text>
              <Text dimColor> copy</Text>
            </>
          )}
          <Text dimColor> | </Text>
          <Text color="cyan">R</Text>
          <Text dimColor> {masterKey ? "regenerate" : "generate"}</Text>
        </Box>
      </Box>
    </Box>
  );
}
