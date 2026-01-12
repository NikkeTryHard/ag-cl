/**
 * Share Settings Modal Component
 *
 * UI for editing share configuration.
 */

import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import type { ShareConfig } from "../../share/types.js";

export interface ShareSettingsModalProps {
  config: ShareConfig;
  onUpdate: (config: Partial<ShareConfig>) => Promise<void>;
  onClose: () => void;
}

type SettingSection = "auth" | "visibility" | "limits";

export function ShareSettingsModal({ config, onUpdate, onClose }: ShareSettingsModalProps): React.ReactElement {
  const [activeSection, setActiveSection] = useState<SettingSection>("auth");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const sections: SettingSection[] = ["auth", "visibility", "limits"];

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.tab) {
      const currentIdx = sections.indexOf(activeSection);
      const nextIdx = (currentIdx + 1) % sections.length;
      setActiveSection(sections[nextIdx]);
      setSelectedIndex(0);
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => prev + 1);
    }

    if (key.return || input === " ") {
      void handleToggle();
    }
  });

  const handleToggle = useCallback(async () => {
    if (activeSection === "auth") {
      if (selectedIndex === 0) {
        await onUpdate({
          auth: { ...config.auth, enabled: !config.auth.enabled },
        });
      } else if (selectedIndex === 1) {
        const newMode = config.auth.mode === "single" ? "per-friend" : "single";
        await onUpdate({
          auth: { ...config.auth, mode: newMode },
        });
      }
    } else if (activeSection === "visibility") {
      const keys: (keyof typeof config.visibility)[] = ["showAccountEmails", "showIndividualAccounts", "showModelBreakdown", "showBurnRate"];
      const key = keys[selectedIndex];
      if (key) {
        await onUpdate({
          visibility: { ...config.visibility, [key]: !config.visibility[key] },
        });
      }
    }
  }, [activeSection, selectedIndex, config, onUpdate]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold inverse>
          {" "}
          Share Settings{" "}
        </Text>
      </Box>

      {/* Authentication Section */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={activeSection === "auth" ? "cyan" : undefined}>
          Authentication
        </Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text>
            {activeSection === "auth" && selectedIndex === 0 ? "> " : "  "}
            Enabled: {config.auth.enabled ? "Y" : "N"}
          </Text>
          <Text>
            {activeSection === "auth" && selectedIndex === 1 ? "> " : "  "}
            Mode: {config.auth.mode}
          </Text>
          <Text dimColor>
            {"  "}Master Key: {config.auth.masterKey ? "set" : "not set"}
          </Text>
          <Text dimColor>
            {"  "}Friend Keys: {config.auth.friendKeys.length}
          </Text>
        </Box>
      </Box>

      {/* Visibility Section */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={activeSection === "visibility" ? "cyan" : undefined}>
          Visibility
        </Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text>
            {activeSection === "visibility" && selectedIndex === 0 ? "> " : "  "}
            Show Emails: {config.visibility.showAccountEmails ? "Y" : "N"}
          </Text>
          <Text>
            {activeSection === "visibility" && selectedIndex === 1 ? "> " : "  "}
            Show Accounts: {config.visibility.showIndividualAccounts ? "Y" : "N"}
          </Text>
          <Text>
            {activeSection === "visibility" && selectedIndex === 2 ? "> " : "  "}
            Show Models: {config.visibility.showModelBreakdown ? "Y" : "N"}
          </Text>
          <Text>
            {activeSection === "visibility" && selectedIndex === 3 ? "> " : "  "}
            Show Burn Rate: {config.visibility.showBurnRate ? "Y" : "N"}
          </Text>
        </Box>
      </Box>

      {/* Limits Section */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={activeSection === "limits" ? "cyan" : undefined}>
          Limits
        </Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text>
            {activeSection === "limits" && selectedIndex === 0 ? "> " : "  "}
            Max Clients: {config.limits.maxClients}
          </Text>
          <Text>
            {activeSection === "limits" && selectedIndex === 1 ? "> " : "  "}
            Poll Interval: {config.limits.pollIntervalSeconds}s
          </Text>
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>Tab: switch section | Up/Down: select | Space: toggle | Esc: close</Text>
      </Box>
    </Box>
  );
}
