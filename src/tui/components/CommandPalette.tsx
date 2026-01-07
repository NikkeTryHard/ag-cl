/**
 * CommandPalette Component
 *
 * Fuzzy-searchable command list overlay.
 */

import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import fuzzysort from "fuzzysort";
import type { Command } from "../types.js";

interface CommandPaletteProps {
  commands: Command[];
  onSelect: (command: Command) => void;
  onClose: () => void;
}

export function CommandPalette({ commands, onSelect, onClose }: CommandPaletteProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    const results = fuzzysort.go(query, commands, {
      key: "label",
      threshold: -10000,
    });

    return results.map((r) => r.obj);
  }, [query, commands]);

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(filteredCommands.length - 1, i + 1));
      return;
    }

    if (key.return && filteredCommands.length > 0) {
      onSelect(filteredCommands[selectedIndex]);
      return;
    }
  });

  // Reset selection when filter changes
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Box>
        <Text color="cyan">&gt; </Text>
        <TextInput value={query} onChange={setQuery} placeholder="Search commands..." />
      </Box>

      <Text> </Text>

      {filteredCommands.slice(0, 10).map((cmd, index) => (
        <Box key={cmd.id}>
          <Text color={index === selectedIndex ? "cyan" : undefined} inverse={index === selectedIndex}>
            {index === selectedIndex ? " > " : "   "}
            {cmd.label}
          </Text>
          <Text dimColor> ({cmd.category})</Text>
        </Box>
      ))}

      {filteredCommands.length === 0 && <Text dimColor>No matching commands</Text>}

      <Text> </Text>
      <Text dimColor>Up/Down navigate Enter select ESC close</Text>
    </Box>
  );
}
