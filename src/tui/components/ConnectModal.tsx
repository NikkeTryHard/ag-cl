/**
 * Connect Modal Component
 *
 * UI for entering connection details to a remote share host.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface ConnectModalProps {
  onConnect: (url: string, apiKey: string, nickname?: string) => Promise<void>;
  onClose: () => void;
  error?: string | null;
  connecting?: boolean;
}

type InputField = "url" | "apiKey" | "nickname";

export function ConnectModal({ onConnect, onClose, error, connecting = false }: ConnectModalProps): React.ReactElement {
  const [activeField, setActiveField] = useState<InputField>("url");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [nickname, setNickname] = useState("");

  const fields: InputField[] = ["url", "apiKey", "nickname"];

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.tab || key.downArrow) {
      const currentIdx = fields.indexOf(activeField);
      const nextIdx = (currentIdx + 1) % fields.length;
      setActiveField(fields[nextIdx]);
      return;
    }

    if (key.upArrow) {
      const currentIdx = fields.indexOf(activeField);
      const prevIdx = currentIdx === 0 ? fields.length - 1 : currentIdx - 1;
      setActiveField(fields[prevIdx]);
      return;
    }

    if (key.return) {
      if (url && apiKey) {
        void onConnect(url, apiKey, nickname || undefined);
      }
      return;
    }

    if (key.backspace || key.delete) {
      switch (activeField) {
        case "url":
          setUrl((prev) => prev.slice(0, -1));
          break;
        case "apiKey":
          setApiKey((prev) => prev.slice(0, -1));
          break;
        case "nickname":
          setNickname((prev) => prev.slice(0, -1));
          break;
      }
      return;
    }

    // Regular character input
    if (input && !key.ctrl && !key.meta) {
      switch (activeField) {
        case "url":
          setUrl((prev) => prev + input);
          break;
        case "apiKey":
          setApiKey((prev) => prev + input);
          break;
        case "nickname":
          setNickname((prev) => prev + input);
          break;
      }
    }
  });

  const renderField = (field: InputField, label: string, value: string, masked = false) => {
    const isActive = activeField === field;
    const displayValue = masked && value ? "\u2022".repeat(value.length) : value;

    return (
      <Box marginBottom={1}>
        <Text bold={isActive} color={isActive ? "cyan" : undefined}>
          {isActive ? "> " : "  "}
          {label}:{" "}
        </Text>
        <Text>
          {displayValue}
          {isActive ? "\u2588" : ""}
        </Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1} borderStyle="single">
      <Box marginBottom={1}>
        <Text bold inverse>
          {" "}
          Connect to Remote{" "}
        </Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {connecting && (
        <Box marginBottom={1}>
          <Text color="yellow">Connecting...</Text>
        </Box>
      )}

      {renderField("url", "URL", url)}
      {renderField("apiKey", "API Key", apiKey, true)}
      {renderField("nickname", "Nickname", nickname)}

      <Box marginTop={1}>
        <Text dimColor>Tab/Arrow: switch field | Enter: connect | Esc: cancel</Text>
      </Box>
    </Box>
  );
}
