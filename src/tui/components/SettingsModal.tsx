/**
 * SettingsModal Component
 *
 * Modal for editing application settings with arrow key navigation.
 * - Identity Mode: cycles through "full" | "short" | "none"
 * - Default Port: inline number input
 * - Log Level: cycles through "silent" | "error" | "warn" | "info" | "debug" | "trace"
 * - Fallback Enabled: toggles on/off
 * - Auto Refresh: toggles on/off
 * - Scheduling Mode: cycles through "sticky" | "refresh-priority" | "drain-highest" | "round-robin"
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { validatePort } from "../utils/portValidation.js";
import { DEFAULTS } from "../../settings/defaults.js";
import type { AccountSettings, IdentityMode, LogLevel, SchedulingMode } from "../../account-manager/types.js";

interface SettingsModalProps {
  settings: AccountSettings;
  onUpdateSettings: (partial: Partial<AccountSettings>) => Promise<void>;
  onClose: () => void;
}

type SettingKey = "identityMode" | "defaultPort" | "logLevel" | "fallbackEnabled" | "autoRefreshEnabled" | "schedulingMode";

interface SettingItem {
  key: SettingKey;
  label: string;
}

const SETTINGS_LIST: SettingItem[] = [
  { key: "identityMode", label: "Identity Mode" },
  { key: "defaultPort", label: "Default Port" },
  { key: "logLevel", label: "Log Level" },
  { key: "fallbackEnabled", label: "Model Fallback" },
  { key: "autoRefreshEnabled", label: "Auto Refresh" },
  { key: "schedulingMode", label: "Scheduling Mode" },
];

const IDENTITY_MODES: IdentityMode[] = ["full", "short", "none"];
const LOG_LEVELS: LogLevel[] = ["silent", "error", "warn", "info", "debug", "trace"];
const SCHEDULING_MODES: SchedulingMode[] = ["sticky", "refresh-priority", "drain-highest", "round-robin"];

/**
 * Get display value for a setting
 */
function getDisplayValue(key: SettingKey, settings: AccountSettings): string {
  switch (key) {
    case "identityMode":
      return settings.identityMode ?? DEFAULTS.identityMode;
    case "defaultPort":
      return String(settings.defaultPort ?? DEFAULTS.defaultPort);
    case "logLevel":
      return settings.logLevel ?? DEFAULTS.logLevel;
    case "fallbackEnabled":
      return (settings.fallbackEnabled ?? DEFAULTS.fallbackEnabled) ? "on" : "off";
    case "autoRefreshEnabled":
      return (settings.autoRefreshEnabled ?? DEFAULTS.autoRefreshEnabled) ? "on" : "off";
    case "schedulingMode":
      return settings.schedulingMode ?? DEFAULTS.schedulingMode;
  }
}

/**
 * Cycle to next value for enum settings
 */
function getNextEnumValue<T>(current: T, values: readonly T[]): T {
  const currentIndex = values.indexOf(current);
  const nextIndex = (currentIndex + 1) % values.length;
  return values[nextIndex];
}

export function SettingsModal({ settings, onUpdateSettings, onClose }: SettingsModalProps): React.ReactElement {
  const { width, height } = useTerminalSize();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingPort, setEditingPort] = useState(false);
  const [portValue, setPortValue] = useState(String(settings.defaultPort ?? DEFAULTS.defaultPort));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSetting = SETTINGS_LIST[selectedIndex];
  const portValidationError = editingPort ? validatePort(portValue) : null;

  /**
   * Handle saving a setting update
   */
  const handleSave = async (partial: Partial<AccountSettings>): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await onUpdateSettings(partial);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Toggle or cycle the current setting value
   */
  const handleToggle = async (): Promise<void> => {
    switch (currentSetting.key) {
      case "identityMode": {
        const current = settings.identityMode ?? DEFAULTS.identityMode;
        const next = getNextEnumValue(current, IDENTITY_MODES);
        await handleSave({ identityMode: next });
        break;
      }
      case "logLevel": {
        const current = settings.logLevel ?? DEFAULTS.logLevel;
        const next = getNextEnumValue(current, LOG_LEVELS);
        await handleSave({ logLevel: next });
        break;
      }
      case "fallbackEnabled": {
        const current = settings.fallbackEnabled ?? DEFAULTS.fallbackEnabled;
        await handleSave({ fallbackEnabled: !current });
        break;
      }
      case "autoRefreshEnabled": {
        const current = settings.autoRefreshEnabled ?? DEFAULTS.autoRefreshEnabled;
        await handleSave({ autoRefreshEnabled: !current });
        break;
      }
      case "defaultPort": {
        // Enter edit mode for port
        setEditingPort(true);
        setPortValue(String(settings.defaultPort ?? DEFAULTS.defaultPort));
        break;
      }
      case "schedulingMode": {
        const current = settings.schedulingMode ?? DEFAULTS.schedulingMode;
        const next = getNextEnumValue(current, SCHEDULING_MODES);
        await handleSave({ schedulingMode: next });
        break;
      }
    }
  };

  /**
   * Confirm port change
   */
  const handlePortConfirm = async (): Promise<void> => {
    if (portValidationError) return;

    const newPort = parseInt(portValue, 10);
    const currentPort = settings.defaultPort ?? DEFAULTS.defaultPort;

    if (newPort !== currentPort) {
      await handleSave({ defaultPort: newPort });
    }
    setEditingPort(false);
  };

  useInput((_input, key) => {
    // ESC always closes (or exits port editing)
    if (key.escape) {
      if (editingPort) {
        setEditingPort(false);
        setPortValue(String(settings.defaultPort ?? DEFAULTS.defaultPort));
      } else {
        onClose();
      }
      return;
    }

    // When editing port, only handle Enter
    if (editingPort) {
      if (key.return) {
        void handlePortConfirm();
      }
      return;
    }

    // Navigation
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(SETTINGS_LIST.length - 1, i + 1));
      return;
    }

    // Enter to toggle/edit
    if (key.return) {
      void handleToggle();
      return;
    }
  });

  // Calculate label width for alignment
  const maxLabelWidth = Math.max(...SETTINGS_LIST.map((s) => s.label.length));

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" width={width} height={height - 1}>
      <Box flexDirection="column" borderStyle="round" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Settings
          </Text>
          {saving && <Text dimColor> - Saving...</Text>}
        </Box>

        {/* Settings list */}
        {SETTINGS_LIST.map((item, index) => {
          const isSelected = index === selectedIndex;
          const prefix = isSelected ? " > " : "   ";
          const value = getDisplayValue(item.key, settings);

          // Special handling for port when editing
          if (item.key === "defaultPort" && editingPort && isSelected) {
            return (
              <Box key={item.key}>
                <Text color="cyan" inverse>
                  {prefix}
                </Text>
                <Text color="cyan">{item.label.padEnd(maxLabelWidth)}</Text>
                <Text> [</Text>
                <TextInput value={portValue} onChange={setPortValue} />
                <Text>]</Text>
              </Box>
            );
          }

          return (
            <Box key={item.key}>
              <Text color={isSelected ? "cyan" : undefined} inverse={isSelected}>
                {prefix}
              </Text>
              <Text color={isSelected ? "cyan" : undefined}>{item.label.padEnd(maxLabelWidth)}</Text>
              <Text> </Text>
              <Text dimColor>[</Text>
              <Text>{value}</Text>
              <Text dimColor>]</Text>
            </Box>
          );
        })}

        {/* Validation error for port */}
        {editingPort && portValidationError && (
          <Box marginTop={1}>
            <Text color="red">{portValidationError}</Text>
          </Box>
        )}

        {/* Error message */}
        {error && (
          <Box marginTop={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}

        {/* Restart notice */}
        <Box marginTop={1}>
          <Text dimColor>Changes take effect after server restart</Text>
        </Box>

        {/* Footer */}
        <Box marginTop={1}>
          {editingPort ? (
            <Text dimColor>Enter confirm | ESC cancel</Text>
          ) : (
            <>
              <Text color="cyan">ESC</Text>
              <Text dimColor> close | </Text>
              <Text color="cyan">Enter</Text>
              <Text dimColor> edit | </Text>
              <Text color="cyan">Up/Down</Text>
              <Text dimColor> navigate</Text>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
