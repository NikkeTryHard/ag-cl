/**
 * StatusIndicator Component
 *
 * Shows server running status with colored indicator.
 */

import React from "react";
import { Text } from "ink";

interface StatusIndicatorProps {
  running: boolean;
  port: number;
  error?: string | null;
}

export function StatusIndicator({ running, port, error }: StatusIndicatorProps): React.ReactElement {
  if (error) {
    return (
      <Text color="red">
        <Text color="red">●</Text>
        <Text color="red"> error: {error}</Text>
      </Text>
    );
  }

  if (running) {
    return (
      <Text>
        <Text color="green">●</Text>
        <Text> :{port}</Text>
      </Text>
    );
  }

  return <Text dimColor>stopped</Text>;
}
