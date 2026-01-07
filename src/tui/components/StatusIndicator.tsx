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
}

export function StatusIndicator({ running, port }: StatusIndicatorProps): React.ReactElement {
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
