/**
 * FriendKeyListModal Component
 *
 * Lists friend keys with options to add, copy, revoke, and delete.
 * Uses useMenuNavigation for list navigation.
 */

import React, { useMemo, useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { useMenuNavigation, type MenuItem } from "../hooks/useMenuNavigation.js";
import { maskApiKey } from "../../share/api-key.js";
import { formatTimeAgo } from "../utils/formatTimeAgo.js";
import type { FriendKey } from "../../share/types.js";

export interface FriendKeyListModalProps {
  friendKeys: FriendKey[];
  onClose: () => void;
  onAdd: (nickname: string | null) => void;
  onRevoke: (key: string) => void;
  onDelete: (key: string) => void;
  onCopy: (key: string) => void;
  copied?: boolean;
}

type ViewMode = "list" | "add";

export function FriendKeyListModal({ friendKeys, onClose, onAdd, onRevoke, onDelete, onCopy, copied = false }: FriendKeyListModalProps): React.ReactElement {
  const { width, height } = useTerminalSize();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [nickname, setNickname] = useState("");

  // Build menu items from friend keys
  const menuItems: MenuItem[] = useMemo(() => {
    if (friendKeys.length === 0) {
      return [];
    }

    return friendKeys.map((fk) => ({
      id: fk.key,
      type: "selectable" as const,
      label: fk.nickname ?? "(no nickname)",
      value: maskApiKey(fk.key),
      disabled: fk.revoked,
    }));
  }, [friendKeys]);

  const { selectedIndex, handleUp, handleDown } = useMenuNavigation({
    items: menuItems,
    // onSelect not needed - selection is handled via hotkey callbacks
  });

  const selectedKey = menuItems.length > 0 ? menuItems[selectedIndex]?.id : null;
  const selectedFriendKey = friendKeys.find((fk) => fk.key === selectedKey);

  const handleAddConfirm = useCallback(() => {
    onAdd(nickname.trim() || null);
    setNickname("");
    setViewMode("list");
  }, [nickname, onAdd]);

  useInput((input, key) => {
    if (key.escape) {
      if (viewMode === "add") {
        setViewMode("list");
        setNickname("");
      } else {
        onClose();
      }
      return;
    }

    if (viewMode === "add") {
      if (key.return) {
        handleAddConfirm();
      }
      return;
    }

    // List mode controls
    if (key.upArrow) {
      handleUp();
      return;
    }

    if (key.downArrow) {
      handleDown();
      return;
    }

    if (input === "a" || input === "A") {
      setViewMode("add");
      return;
    }

    if ((input === "y" || input === "Y") && selectedKey) {
      onCopy(selectedKey);
      return;
    }

    if ((input === "r" || input === "R") && selectedKey && selectedFriendKey && !selectedFriendKey.revoked) {
      onRevoke(selectedKey);
      return;
    }

    if ((input === "d" || input === "D") && selectedKey) {
      onDelete(selectedKey);
      return;
    }
  });

  // Add mode view
  if (viewMode === "add") {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" width={width} height={height - 1}>
        <Box flexDirection="column" borderStyle="round" padding={1}>
          <Box marginBottom={1}>
            <Text bold color="cyan">
              Add Friend Key
            </Text>
          </Box>

          <Box marginBottom={1}>
            <Text>Nickname (optional): </Text>
            <TextInput value={nickname} onChange={setNickname} />
          </Box>

          <Box>
            <Text color="cyan">Enter</Text>
            <Text dimColor> confirm | </Text>
            <Text color="cyan">ESC</Text>
            <Text dimColor> cancel</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // List mode view
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" width={width} height={height - 1}>
      <Box flexDirection="column" borderStyle="round" padding={1}>
        {/* Header */}
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Friend Keys
          </Text>
          <Text dimColor> ({friendKeys.length})</Text>
          {copied && <Text color="green"> - Copied!</Text>}
        </Box>

        {/* Empty state */}
        {friendKeys.length === 0 && (
          <Box marginBottom={1}>
            <Text dimColor>No friend keys - press A to add one</Text>
          </Box>
        )}

        {/* Key list */}
        {friendKeys.map((fk, index) => {
          const isSelected = index === selectedIndex;
          const prefix = isSelected ? " > " : "   ";

          return (
            <Box key={fk.key}>
              <Text color={isSelected ? "cyan" : undefined} inverse={isSelected}>
                {prefix}
              </Text>
              <Text color={isSelected ? "cyan" : undefined} strikethrough={fk.revoked}>
                {fk.nickname ?? "(no nickname)"}
              </Text>
              <Text dimColor> </Text>
              <Text dimColor>[{maskApiKey(fk.key)}]</Text>
              {fk.revoked && <Text color="red"> REVOKED</Text>}
              <Text dimColor> {formatTimeAgo(fk.createdAt)}</Text>
            </Box>
          );
        })}

        {/* Footer */}
        <Box marginTop={1}>
          <Text color="cyan">ESC</Text>
          <Text dimColor> close | </Text>
          <Text color="cyan">A</Text>
          <Text dimColor> add</Text>
          {selectedKey && (
            <>
              <Text dimColor> | </Text>
              <Text color="cyan">Y</Text>
              <Text dimColor> copy</Text>
              {selectedFriendKey && !selectedFriendKey.revoked && (
                <>
                  <Text dimColor> | </Text>
                  <Text color="cyan">R</Text>
                  <Text dimColor> revoke</Text>
                </>
              )}
              <Text dimColor> | </Text>
              <Text color="cyan">D</Text>
              <Text dimColor> delete</Text>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
