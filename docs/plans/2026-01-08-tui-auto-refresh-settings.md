# TUI Auto-Refresh Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add auto-refresh toggle to TUI settings (? -> Settings) so users can enable automatic quota refresh every 5 hours when the server is running.

**Architecture:** Add `autoRefreshEnabled` setting to the existing settings infrastructure, integrate with `useServerState` hook to call `startAutoRefresh()`/`stopAutoRefresh()` when server starts/stops.

**Tech Stack:** TypeScript, React/Ink, Vitest

---

## Task 1: Add autoRefreshEnabled to AccountSettings Type

**Files:**

- Modify: `src/account-manager/types.ts:59-72`

**Step 1: Add the property to AccountSettings interface**

In `src/account-manager/types.ts`, add `autoRefreshEnabled` to the `AccountSettings` interface:

```typescript
/**
 * Account settings stored in config
 */
export interface AccountSettings {
  /** Cooldown duration in milliseconds between account switches */
  cooldownDurationMs?: number | undefined;
  /** Identity injection mode for account display in responses */
  identityMode?: IdentityMode | undefined;
  /** Default server port */
  defaultPort?: number | undefined;
  /** Server log level */
  logLevel?: LogLevel | undefined;
  /** Enable model fallback on quota exhaustion */
  fallbackEnabled?: boolean | undefined;
  /** Enable auto-refresh of quota every 5 hours */
  autoRefreshEnabled?: boolean | undefined;
  /** Allow additional unknown settings for extensibility */
  [key: string]: unknown;
}
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/account-manager/types.ts
git commit -m "feat(types): add autoRefreshEnabled to AccountSettings"
```

---

## Task 2: Add Default Value and Getter Function

**Files:**

- Modify: `src/settings/defaults.ts`

**Step 1: Add to DEFAULTS object**

Add `autoRefreshEnabled` to the `DEFAULTS` object (after line 23):

```typescript
export const DEFAULTS = {
  /** Default identity injection mode */
  identityMode: "full" as IdentityMode,
  /** Default server port - imported from constants.ts */
  defaultPort: DEFAULT_PORT,
  /** Default log level */
  logLevel: "info" as LogLevel,
  /** Default fallback enabled state */
  fallbackEnabled: false,
  /** Default auto-refresh enabled state */
  autoRefreshEnabled: false,
  /** Default cooldown duration - imported from constants.ts */
  cooldownDurationMs: DEFAULT_COOLDOWN_MS,
} as const;
```

**Step 2: Add getter function**

Add after `getFallbackEnabled` function (after line 119):

```typescript
/**
 * Get whether auto-refresh is enabled.
 *
 * Priority:
 * 1. settings.autoRefreshEnabled (if provided)
 * 2. AUTO_REFRESH environment variable
 * 3. Default: false
 *
 * @param settings - Optional account settings object
 * @returns Whether auto-refresh is enabled
 */
export function getAutoRefreshEnabled(settings?: AccountSettings): boolean {
  // Check settings object first
  if (settings?.autoRefreshEnabled !== undefined) {
    return settings.autoRefreshEnabled;
  }

  // Fall back to environment variable
  if (process.env.AUTO_REFRESH === "true") {
    return true;
  }

  // Fall back to default
  return DEFAULTS.autoRefreshEnabled;
}
```

**Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/settings/defaults.ts
git commit -m "feat(settings): add autoRefreshEnabled default and getter"
```

---

## Task 3: Add Auto Refresh Toggle to SettingsModal

**Files:**

- Modify: `src/tui/components/SettingsModal.tsx`

**Step 1: Add to SettingKey type**

Update the `SettingKey` type (line 25):

```typescript
type SettingKey = "identityMode" | "defaultPort" | "logLevel" | "fallbackEnabled" | "autoRefreshEnabled";
```

**Step 2: Add to SETTINGS_LIST**

Add to `SETTINGS_LIST` array (after line 36):

```typescript
const SETTINGS_LIST: SettingItem[] = [
  { key: "identityMode", label: "Identity Mode" },
  { key: "defaultPort", label: "Default Port" },
  { key: "logLevel", label: "Log Level" },
  { key: "fallbackEnabled", label: "Model Fallback" },
  { key: "autoRefreshEnabled", label: "Auto Refresh" },
];
```

**Step 3: Add case to getDisplayValue function**

Add case in `getDisplayValue` function (after line 54):

```typescript
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
  }
}
```

**Step 4: Add case to handleToggle function**

Add case in `handleToggle` function (after line 114, before `case "defaultPort"`):

```typescript
case "autoRefreshEnabled": {
  const current = settings.autoRefreshEnabled ?? DEFAULTS.autoRefreshEnabled;
  await handleSave({ autoRefreshEnabled: !current });
  break;
}
```

**Step 5: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/tui/components/SettingsModal.tsx
git commit -m "feat(tui): add Auto Refresh toggle to settings modal"
```

---

## Task 4: Integrate Auto-Refresh into useServerState Hook

**Files:**

- Modify: `src/tui/hooks/useServerState.ts`

**Step 1: Import auto-refresh functions and getter**

Add imports at top of file:

```typescript
import { getAutoRefreshEnabled } from "../../settings/defaults.js";
```

**Step 2: Update start function to call startAutoRefresh**

In the `start` callback, after `setRunning(true)` (around line 103), add:

```typescript
// Start auto-refresh scheduler if enabled
const autoRefreshEnabled = getAutoRefreshEnabled(settings);
if (autoRefreshEnabled) {
  const { startAutoRefresh } = await import("../../cloudcode/auto-refresh-scheduler.js");
  void startAutoRefresh();
}
```

**Step 3: Update stop function to call stopAutoRefresh**

In the `stop` callback, before closing the server (around line 119), add:

```typescript
// Stop auto-refresh scheduler
const { stopAutoRefresh, isAutoRefreshRunning } = await import("../../cloudcode/auto-refresh-scheduler.js");
if (isAutoRefreshRunning()) {
  stopAutoRefresh();
}
```

**Step 4: Update cleanup effect**

In the cleanup effect (around line 136), add:

```typescript
// Cleanup on unmount
useEffect(() => {
  return (): void => {
    if (serverRef.current) {
      serverRef.current.close();
    }
    // Stop auto-refresh on unmount
    void import("../../cloudcode/auto-refresh-scheduler.js").then(({ stopAutoRefresh, isAutoRefreshRunning }) => {
      if (isAutoRefreshRunning()) {
        stopAutoRefresh();
      }
    });
  };
}, []);
```

**Step 5: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/tui/hooks/useServerState.ts
git commit -m "feat(tui): integrate auto-refresh scheduler with server lifecycle"
```

---

## Task 5: Add Tests for Auto-Refresh Integration

**Files:**

- Modify: `tests/unit/tui/hooks/useServerState.test.ts`

**Step 1: Add mock for auto-refresh-scheduler**

Add mock at top of test file with other mocks:

```typescript
// Mock auto-refresh-scheduler
vi.mock("../../../../src/cloudcode/auto-refresh-scheduler.js", () => ({
  startAutoRefresh: vi.fn().mockResolvedValue(undefined),
  stopAutoRefresh: vi.fn(),
  isAutoRefreshRunning: vi.fn().mockReturnValue(false),
}));
```

**Step 2: Add test for auto-refresh starting when enabled**

Add test case:

```typescript
describe("auto-refresh integration", () => {
  it("starts auto-refresh when server starts and autoRefreshEnabled is true", async () => {
    const { startAutoRefresh } = await import("../../../../src/cloudcode/auto-refresh-scheduler.js");

    const settingsWithAutoRefresh = { autoRefreshEnabled: true };
    const { result } = renderHook(() => useServerState({ settings: settingsWithAutoRefresh }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.running).toBe(true);
    expect(startAutoRefresh).toHaveBeenCalled();
  });

  it("does not start auto-refresh when autoRefreshEnabled is false", async () => {
    const { startAutoRefresh } = await import("../../../../src/cloudcode/auto-refresh-scheduler.js");
    vi.mocked(startAutoRefresh).mockClear();

    const settingsWithoutAutoRefresh = { autoRefreshEnabled: false };
    const { result } = renderHook(() => useServerState({ settings: settingsWithoutAutoRefresh }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.running).toBe(true);
    expect(startAutoRefresh).not.toHaveBeenCalled();
  });

  it("stops auto-refresh when server stops", async () => {
    const { stopAutoRefresh, isAutoRefreshRunning } = await import("../../../../src/cloudcode/auto-refresh-scheduler.js");
    vi.mocked(isAutoRefreshRunning).mockReturnValue(true);

    const settingsWithAutoRefresh = { autoRefreshEnabled: true };
    const { result } = renderHook(() => useServerState({ settings: settingsWithAutoRefresh }));

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.running).toBe(false);
    expect(stopAutoRefresh).toHaveBeenCalled();
  });
});
```

**Step 3: Run tests**

Run: `npm test -- tests/unit/tui/hooks/useServerState.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add tests/unit/tui/hooks/useServerState.test.ts
git commit -m "test(tui): add auto-refresh integration tests for useServerState"
```

---

## Task 6: Manual Verification

**Step 1: Build and start TUI**

```bash
npm run build
npm run tui
```

**Step 2: Open settings**

Press `?` or `h` to open command palette, then select Settings (or press `o`)

**Step 3: Verify Auto Refresh setting exists**

Expected: See "Auto Refresh" in the settings list with value `[off]`

**Step 4: Toggle Auto Refresh on**

Navigate to "Auto Refresh" and press Enter to toggle to `[on]`

**Step 5: Start the server**

Press `s` to start the server

**Step 6: Verify auto-refresh is running**

Check logs for `[AutoRefresh] Starting auto-refresh scheduler` message

**Step 7: Stop server and verify cleanup**

Press `s` to stop, verify `[AutoRefresh] Scheduler stopped` message

---

## Summary

| Task | Description                                    | Files                                         |
| ---- | ---------------------------------------------- | --------------------------------------------- |
| 1    | Add autoRefreshEnabled to AccountSettings type | `src/account-manager/types.ts`                |
| 2    | Add default value and getter function          | `src/settings/defaults.ts`                    |
| 3    | Add Auto Refresh toggle to SettingsModal       | `src/tui/components/SettingsModal.tsx`        |
| 4    | Integrate auto-refresh into useServerState     | `src/tui/hooks/useServerState.ts`             |
| 5    | Add tests for auto-refresh integration         | `tests/unit/tui/hooks/useServerState.test.ts` |
| 6    | Manual verification                            | N/A                                           |

**Estimated commits:** 5
