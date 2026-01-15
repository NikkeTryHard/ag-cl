/**
 * UnifiedOptionsModal Component
 *
 * Combines all settings from SettingsModal (general) and ShareSettingsModal (share)
 * into a single modal with proper navigation using useMenuNavigation hook.
 *
 * Sections:
 * - General Settings: Identity Mode, Default Port, Log Level, Model Fallback, Auto Refresh, Scheduling Mode
 * - Share Authentication: Enabled, Mode, Master Key (disabled), Friend Keys (disabled)
 * - Share Visibility: Show Emails, Show Accounts, Show Models, Show Burn Rate
 * - Share Limits: Max Clients, Poll Interval
 */

import React, { useState, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { useMenuNavigation, type MenuItem } from "../hooks/useMenuNavigation.js";
import { validatePort } from "../utils/portValidation.js";
import { DEFAULTS } from "../../settings/defaults.js";
import type { AccountSettings, IdentityMode, LogLevel, SchedulingMode } from "../../account-manager/types.js";
import type { ShareConfig } from "../../share/types.js";

export interface UnifiedOptionsModalProps {
  settings: AccountSettings;
  shareConfig: ShareConfig;
  onUpdateSettings: (partial: Partial<AccountSettings>) => Promise<void>;
  onUpdateShareConfig: (partial: Partial<ShareConfig>) => Promise<void>;
  onClose: () => void;
  onOpenMasterKey?: () => void;
  onOpenFriendKeys?: () => void;
}

// Menu item IDs for each setting
type SettingId =
  // General Settings
  | "header-general"
  | "identityMode"
  | "defaultPort"
  | "logLevel"
  | "fallbackEnabled"
  | "autoRefreshEnabled"
  | "schedulingMode"
  // Share Authentication
  | "header-auth"
  | "authEnabled"
  | "authMode"
  | "masterKey"
  | "friendKeys"
  // Share Visibility
  | "header-visibility"
  | "showAccountEmails"
  | "showIndividualAccounts"
  | "showModelBreakdown"
  | "showBurnRate"
  // Share Limits
  | "header-limits"
  | "maxClients"
  | "pollIntervalSeconds";

const IDENTITY_MODES: IdentityMode[] = ["full", "short", "none"];
const LOG_LEVELS: LogLevel[] = ["silent", "error", "warn", "info", "debug", "trace"];
const SCHEDULING_MODES: SchedulingMode[] = ["sticky", "refresh-priority", "drain-highest", "round-robin"];
const MAX_CLIENTS_OPTIONS = [1, 3, 5, 10];
const POLL_INTERVAL_OPTIONS = [5, 10, 30, 60];

const SCHEDULING_MODE_DESCRIPTIONS: Record<SchedulingMode, string> = {
  sticky: "Stay on current account until rate-limited",
  "refresh-priority": "Pick account with soonest reset time",
  "drain-highest": "Pick account with highest quota % (100% first)",
  "round-robin": "Simple rotation through available accounts",
};

/**
 * Cycle to next value for enum settings
 */
function getNextEnumValue<T>(current: T, values: readonly T[]): T {
  const currentIndex = values.indexOf(current);
  const nextIndex = (currentIndex + 1) % values.length;
  return values[nextIndex];
}

/**
 * Get next value in array, cycling back to first
 */
function cycleValue<T>(current: T, options: readonly T[]): T {
  const idx = options.indexOf(current);
  return options[(idx + 1) % options.length];
}

export function UnifiedOptionsModal({ settings, shareConfig, onUpdateSettings, onUpdateShareConfig, onClose, onOpenMasterKey, onOpenFriendKeys }: UnifiedOptionsModalProps): React.ReactElement {
  const { width, height } = useTerminalSize();
  const [editingPort, setEditingPort] = useState(false);
  const [portValue, setPortValue] = useState(String(settings.defaultPort ?? DEFAULTS.defaultPort));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const portValidationError = editingPort ? validatePort(portValue) : null;

  // Build menu items with current values
  const menuItems: MenuItem[] = useMemo(() => {
    const identityModeValue = settings.identityMode ?? DEFAULTS.identityMode;
    const defaultPortValue = settings.defaultPort ?? DEFAULTS.defaultPort;
    const logLevelValue = settings.logLevel ?? DEFAULTS.logLevel;
    const fallbackEnabledValue = settings.fallbackEnabled ?? DEFAULTS.fallbackEnabled;
    const autoRefreshEnabledValue = settings.autoRefreshEnabled ?? DEFAULTS.autoRefreshEnabled;
    const schedulingModeValue = settings.schedulingMode ?? DEFAULTS.schedulingMode;

    return [
      // General Settings
      { id: "header-general", type: "header", label: "General Settings" },
      { id: "identityMode", type: "selectable", label: "Identity Mode", value: identityModeValue },
      { id: "defaultPort", type: "selectable", label: "Default Port", value: String(defaultPortValue) },
      { id: "logLevel", type: "selectable", label: "Log Level", value: logLevelValue },
      { id: "fallbackEnabled", type: "selectable", label: "Model Fallback", value: fallbackEnabledValue ? "on" : "off" },
      { id: "autoRefreshEnabled", type: "selectable", label: "Auto Refresh", value: autoRefreshEnabledValue ? "on" : "off" },
      { id: "schedulingMode", type: "selectable", label: "Scheduling Mode", value: schedulingModeValue, description: SCHEDULING_MODE_DESCRIPTIONS[schedulingModeValue] },

      // Share Authentication
      { id: "header-auth", type: "header", label: "Share Authentication" },
      { id: "authEnabled", type: "selectable", label: "Enabled", value: shareConfig.auth.enabled ? "Y" : "N" },
      { id: "authMode", type: "selectable", label: "Mode", value: shareConfig.auth.mode },
      { id: "masterKey", type: "selectable", label: "Master Key", value: shareConfig.auth.masterKey ? "set" : "not set" },
      { id: "friendKeys", type: "selectable", label: "Friend Keys", value: String(shareConfig.auth.friendKeys.length) },

      // Share Visibility
      { id: "header-visibility", type: "header", label: "Share Visibility" },
      { id: "showAccountEmails", type: "selectable", label: "Show Emails", value: shareConfig.visibility.showAccountEmails ? "Y" : "N" },
      { id: "showIndividualAccounts", type: "selectable", label: "Show Accounts", value: shareConfig.visibility.showIndividualAccounts ? "Y" : "N" },
      { id: "showModelBreakdown", type: "selectable", label: "Show Models", value: shareConfig.visibility.showModelBreakdown ? "Y" : "N" },
      { id: "showBurnRate", type: "selectable", label: "Show Burn Rate", value: shareConfig.visibility.showBurnRate ? "Y" : "N" },

      // Share Limits
      { id: "header-limits", type: "header", label: "Share Limits" },
      { id: "maxClients", type: "selectable", label: "Max Clients", value: String(shareConfig.limits.maxClients) },
      { id: "pollIntervalSeconds", type: "selectable", label: "Poll Interval", value: `${String(shareConfig.limits.pollIntervalSeconds)}s` },
    ];
  }, [settings, shareConfig]);

  /**
   * Handle saving a setting update
   */
  const handleSave = useCallback(
    async (partial: Partial<AccountSettings>): Promise<void> => {
      setSaving(true);
      setError(null);
      try {
        await onUpdateSettings(partial);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [onUpdateSettings],
  );

  /**
   * Handle saving a share config update
   */
  const handleShareSave = useCallback(
    async (partial: Partial<ShareConfig>): Promise<void> => {
      setSaving(true);
      setError(null);
      try {
        await onUpdateShareConfig(partial);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [onUpdateShareConfig],
  );

  /**
   * Handle selection (toggle/edit) of a menu item
   */
  const handleSelect = useCallback(
    async (item: MenuItem) => {
      const id = item.id as SettingId;

      switch (id) {
        // General Settings
        case "identityMode": {
          const current = settings.identityMode ?? DEFAULTS.identityMode;
          const next = getNextEnumValue(current, IDENTITY_MODES);
          await handleSave({ identityMode: next });
          break;
        }
        case "defaultPort": {
          setEditingPort(true);
          setPortValue(String(settings.defaultPort ?? DEFAULTS.defaultPort));
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
        case "schedulingMode": {
          const current = settings.schedulingMode ?? DEFAULTS.schedulingMode;
          const next = getNextEnumValue(current, SCHEDULING_MODES);
          await handleSave({ schedulingMode: next });
          break;
        }

        // Share Authentication
        case "authEnabled": {
          await handleShareSave({
            auth: { ...shareConfig.auth, enabled: !shareConfig.auth.enabled },
          });
          break;
        }
        case "authMode": {
          const newMode = shareConfig.auth.mode === "single" ? "per-friend" : "single";
          await handleShareSave({
            auth: { ...shareConfig.auth, mode: newMode },
          });
          break;
        }
        case "masterKey": {
          if (onOpenMasterKey) {
            onOpenMasterKey();
          }
          break;
        }
        case "friendKeys": {
          if (onOpenFriendKeys) {
            onOpenFriendKeys();
          }
          break;
        }

        // Share Visibility
        case "showAccountEmails": {
          await handleShareSave({
            visibility: { ...shareConfig.visibility, showAccountEmails: !shareConfig.visibility.showAccountEmails },
          });
          break;
        }
        case "showIndividualAccounts": {
          await handleShareSave({
            visibility: { ...shareConfig.visibility, showIndividualAccounts: !shareConfig.visibility.showIndividualAccounts },
          });
          break;
        }
        case "showModelBreakdown": {
          await handleShareSave({
            visibility: { ...shareConfig.visibility, showModelBreakdown: !shareConfig.visibility.showModelBreakdown },
          });
          break;
        }
        case "showBurnRate": {
          await handleShareSave({
            visibility: { ...shareConfig.visibility, showBurnRate: !shareConfig.visibility.showBurnRate },
          });
          break;
        }

        // Share Limits
        case "maxClients": {
          const next = cycleValue(shareConfig.limits.maxClients, MAX_CLIENTS_OPTIONS);
          await handleShareSave({
            limits: { ...shareConfig.limits, maxClients: next },
          });
          break;
        }
        case "pollIntervalSeconds": {
          const next = cycleValue(shareConfig.limits.pollIntervalSeconds, POLL_INTERVAL_OPTIONS);
          await handleShareSave({
            limits: { ...shareConfig.limits, pollIntervalSeconds: next },
          });
          break;
        }
      }
    },
    [settings, shareConfig, handleSave, handleShareSave],
  );

  const {
    selectedIndex,
    selectedItem,
    handleUp,
    handleDown,
    handleSelect: triggerSelect,
  } = useMenuNavigation({
    items: menuItems,
    onSelect: (item) => void handleSelect(item),
  });

  /**
   * Confirm port change
   */
  const handlePortConfirm = useCallback(async (): Promise<void> => {
    if (portValidationError) return;

    const newPort = parseInt(portValue, 10);
    const currentPort = settings.defaultPort ?? DEFAULTS.defaultPort;

    if (newPort !== currentPort) {
      await handleSave({ defaultPort: newPort });
    }
    setEditingPort(false);
  }, [portValue, portValidationError, settings.defaultPort, handleSave]);

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
      handleUp();
      return;
    }

    if (key.downArrow) {
      handleDown();
      return;
    }

    // Enter to toggle/edit
    if (key.return) {
      triggerSelect();
      return;
    }
  });

  // Calculate label width for alignment
  const maxLabelWidth = Math.max(...menuItems.filter((i) => i.type !== "header").map((i) => i.label.length));

  // Check if current selection is the scheduling mode (for showing description)
  const showSchedulingDescription = selectedItem?.id === "schedulingMode";
  const currentSchedulingMode = settings.schedulingMode ?? DEFAULTS.schedulingMode;

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" width={width} height={height - 1}>
      <Box flexDirection="column" borderStyle="round" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Options
          </Text>
          {saving && <Text dimColor> - Saving...</Text>}
        </Box>

        {/* Menu items */}
        {menuItems.map((item, index) => {
          const isSelected = index === selectedIndex;

          // Header rendering
          if (item.type === "header") {
            return (
              <Box key={item.id} marginTop={index === 0 ? 0 : 1}>
                <Text bold dimColor>
                  {item.label}
                </Text>
              </Box>
            );
          }

          // Disabled item rendering
          if (item.type === "disabled") {
            return (
              <Box key={item.id}>
                <Text dimColor>
                  {"   "}
                  {item.label.padEnd(maxLabelWidth)} [{item.value}]
                </Text>
              </Box>
            );
          }

          const prefix = isSelected ? " > " : "   ";

          // Special handling for port when editing
          if (item.id === "defaultPort" && editingPort && isSelected) {
            return (
              <Box key={item.id}>
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

          // Normal selectable item
          return (
            <Box key={item.id}>
              <Text color={isSelected ? "cyan" : undefined} inverse={isSelected}>
                {prefix}
              </Text>
              <Text color={isSelected ? "cyan" : undefined}>{item.label.padEnd(maxLabelWidth)}</Text>
              <Text> </Text>
              <Text dimColor>[</Text>
              <Text>{item.value}</Text>
              <Text dimColor>]</Text>
            </Box>
          );
        })}

        {/* Scheduling mode description */}
        {showSchedulingDescription && (
          <Box marginTop={1}>
            <Text dimColor>{SCHEDULING_MODE_DESCRIPTIONS[currentSchedulingMode]}</Text>
          </Box>
        )}

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
