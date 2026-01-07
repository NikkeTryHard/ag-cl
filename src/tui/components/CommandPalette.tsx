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

/** Maximum number of commands visible in the palette */
const MAX_VISIBLE = 10;

/** Permissive threshold for fuzzy matching - lower values = more lenient */
const FUZZY_THRESHOLD = -10000;

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
      threshold: FUZZY_THRESHOLD,
    });

    return results.map((r) => r.obj);
  }, [query, commands]);

  // Clamp selectedIndex to prevent out-of-bounds access during render/useEffect race
  const safeSelectedIndex = Math.min(selectedIndex, Math.max(0, filteredCommands.length - 1));

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
      setSelectedIndex((i) => Math.min(Math.min(filteredCommands.length, MAX_VISIBLE) - 1, i + 1));
      return;
    }

    if (key.return && filteredCommands.length > 0) {
      onSelect(filteredCommands[safeSelectedIndex]);
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

      {filteredCommands.slice(0, MAX_VISIBLE).map((cmd, index) => (
        <Box key={cmd.id}>
          <Text color={index === safeSelectedIndex ? "cyan" : undefined} inverse={index === safeSelectedIndex}>
            {index === safeSelectedIndex ? " > " : "   "}
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
